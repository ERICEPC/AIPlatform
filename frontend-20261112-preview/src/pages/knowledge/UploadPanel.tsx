import type { KbProcessing, KbUploadDraft } from '@/api/knowledge'
import { RiCheckboxCircleLine, RiCloseLine, RiErrorWarningLine, RiRefreshLine, RiUploadCloud2Line } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { API_MODE, mockId } from '@/api/http'
import { cancelUpload, confirmUpload, createUpload, getUploadOptions, getUploadProcessing, retryUploadProcessing, saveUploadForm } from '@/api/knowledge'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { Field, Select } from '@/components/ui/form'
import { Progress, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { FileGlyph, fmtSize, formatOfName } from './shared'

const MAX_BATCH = 20
const MAX_BYTES = 128 * 1024 * 1024
const MAX_PPT = 32 * 1024 * 1024
const SCOPES = ['待确认', '仅内部', '仅总代', '可对伙伴', '可对客', '可公开']
const POLL_MS = API_MODE === 'mock' ? 1000 : 5000

type Phase = 'uploading' | 'saving' | 'confirming' | 'processing' | 'error'
type Row = { key: string, file: File, target: string, scope: string, idemKey: string, phase: Phase, draft?: KbUploadDraft, processing?: KbProcessing, error?: string, busy?: boolean }

const STATE_LABEL: Record<KbProcessing['state'], string> = { WAIT_PARSE: '等待解析', PARSING: '正在解析', WAIT_INDEX: '等待建立索引', INDEXING: '正在建立索引', READY: '已可用于问答', FAILED: '处理未完成', REPLACED: '已有更新版本' }
const STATE_PROGRESS: Record<KbProcessing['state'], number> = { WAIT_PARSE: 28, PARSING: 48, WAIT_INDEX: 62, INDEXING: 82, READY: 100, FAILED: 100, REPLACED: 100 }
const PHASE_LABEL = { uploading: '正在上传', saving: '保存材料信息', confirming: '确认入库' }
const PHASE_PROGRESS = { uploading: 8, saving: 14, confirming: 20 }
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : mockId('key'))

/** 上传材料：选目标知识库和使用范围 → 拖入文件 → 逐个上传、确认入库 → 跟踪解析/索引进度 */
export function UploadPanel({ open, onClose, targetLibrary, onChanged, onOpenMaterial }: {
  open: boolean
  onClose: () => void
  targetLibrary?: string
  onChanged: () => void
  onOpenMaterial: (documentId: string) => void
}) {
  const toast = useToast()
  const options = useQuery(getUploadOptions, [open], { enabled: open })
  const [target, setTarget] = useState('')
  const [scope, setScope] = useState('待确认')
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const changed = useRef(onChanged)
  changed.current = onChanged

  // 默认放进当前浏览的知识库（如果可以上传到那里）
  useEffect(() => {
    const t = options.data?.targets
    if (!t?.length)
      return
    setTarget(cur => (t.some(x => x.id === cur) ? cur : t.find(x => x.id === targetLibrary)?.id ?? t[0].id))
  }, [options.data, targetLibrary])

  const patch = (key: string, p: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...p } : r)))

  const run = useCallback(async (key: string) => {
    const r = rowsRef.current.find(x => x.key === key)
    if (!r)
      return
    try {
      let draft = r.draft
      if (!draft) {
        patch(key, { phase: 'uploading', error: undefined })
        draft = await createUpload(r.file, uuid())
        patch(key, { draft })
      }
      if (draft.state === 'DRAFT') {
        patch(key, { phase: 'saving', error: undefined })
        draft = await saveUploadForm(draft.id, {
          expectedRevision: draft.formRevision,
          contentVersion: draft.contentVersion,
          form: { ...draft.form, knowledgeBaseId: r.target, usageScope: r.scope, editedFields: [...new Set([...draft.form.editedFields, 'knowledgeBaseId', 'usageScope'])] },
        })
        patch(key, { phase: 'confirming', draft })
        draft = await confirmUpload(draft.id, { expectedRevision: draft.formRevision, contentVersion: draft.contentVersion, idempotencyKey: r.idemKey })
        changed.current()
      }
      patch(key, { draft, phase: 'processing', processing: await getUploadProcessing(draft.id) })
    }
    catch (e) {
      patch(key, { phase: 'error', error: (e as Error).message || '上传未完成，请重试' })
    }
  }, [])

  // 处理中的文件定时刷新进度；变成「已可用」时刷新材料列表
  useEffect(() => {
    const t = setInterval(async () => {
      for (const r of rowsRef.current) {
        if (r.phase !== 'processing' || !r.draft || ['READY', 'FAILED', 'REPLACED'].includes(r.processing?.state ?? ''))
          continue
        try {
          const p = await getUploadProcessing(r.draft.id)
          patch(r.key, { processing: p })
          if (p.state === 'READY') {
            changed.current()
            toast(`《${r.draft.form.title}》已可用于问答`)
          }
          if (p.state === 'FAILED')
            changed.current()
        }
        catch {}
      }
    }, POLL_MS)
    return () => clearInterval(t)
  }, [toast])

  const addFiles = (list: FileList | null) => {
    const files = [...(list ?? [])]
    setError('')
    if (!files.length)
      return
    if (!target)
      return setError('请先选择要放入的知识库')
    if (files.length > MAX_BATCH)
      return setError('每次最多选择 20 份材料')
    if (files.some(f => !f.size || f.size > MAX_BYTES))
      return setError('请选择非空文件，每份不超过 128 MiB')
    if (files.some(f => /\.pptx?$/i.test(f.name) && f.size > MAX_PPT))
      return setError('PPT / PPTX 每份不超过 32 MiB')
    const fresh: Row[] = files.map(file => ({ key: mockId('row'), file, target, scope, idemKey: uuid(), phase: 'uploading' }))
    setRows(rs => [...fresh, ...rs])
    // 串行上传，和知识库一致，避免一次压太多请求
    queueMicrotask(async () => {
      for (const f of fresh) await run(f.key)
    })
  }

  const retry = async (r: Row) => {
    if (r.phase === 'error')
      return run(r.key)
    patch(r.key, { busy: true })
    try {
      patch(r.key, { processing: await retryUploadProcessing(r.draft!.id, r.draft!.contentVersion), busy: false })
    }
    catch (e) {
      patch(r.key, { busy: false, error: (e as Error).message })
    }
  }
  const remove = (r: Row) => {
    if (r.draft?.state === 'DRAFT')
      cancelUpload(r.draft.id, { expectedRevision: r.draft.formRevision, contentVersion: r.draft.contentVersion }).catch(() => {})
    setRows(rs => rs.filter(x => x.key !== r.key))
  }

  const targetName = (id: string) => options.data?.targets.find(t => t.id === id)?.name ?? ''
  const active = rows.some(r => r.phase !== 'error' && r.processing?.state !== 'READY' && r.processing?.state !== 'FAILED')

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={(
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em]">上传材料</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">上传后自动解析和建立索引，完成后就能检索和提问。</p>
        </div>
      )}
      footer={(
        <>
          <span className="flex-1 self-center text-[12px] text-ink-3">{active ? '关闭面板不影响后台处理' : rows.length ? `${rows.length} 份材料` : ''}</span>
          <Button variant="primary" onClick={onClose}>完成</Button>
        </>
      )}
    >
      <div className="space-y-4 pt-2">
        {options.loading
          ? <Skeleton className="h-11 w-full rounded-2xl" />
          : options.error
            ? <ErrorBar error={options.error} onRetry={options.reload} />
            : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="放入知识库" required>
                    <Select value={target} onValueChange={setTarget} options={(options.data?.targets ?? []).map(t => ({ value: t.id, label: t.name }))} placeholder="选择知识库" />
                  </Field>
                  <Field label="对外使用范围">
                    <Select value={scope} onValueChange={setScope} options={SCOPES.map(s => ({ value: s, label: s }))} />
                  </Field>
                </div>
              )}

        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-[22px] border-2 border-dashed px-6 py-8 text-center transition-[border-color,background-color] duration-200',
            drag ? 'border-volt bg-volt-soft' : 'border-line-strong hover:border-ink-3 hover:bg-hover',
          )}
        >
          <motion.span animate={{ y: drag ? -4 : 0, scale: drag ? 1.06 : 1 }} transition={{ duration: 0.2 }} className="grid size-12 place-items-center rounded-2xl bg-volt-soft text-volt-text">
            <RiUploadCloud2Line className="size-6" />
          </motion.span>
          <p className="text-[14px] font-semibold">{drag ? '松开即可上传' : '拖入文件，或点击选择'}</p>
          <p className="text-[12px] text-ink-3">PDF、Word、Excel、PPT、Markdown、图片 · 每次最多 20 份 · 单份 ≤ 128 MiB（PPT ≤ 32 MiB）</p>
          <input ref={input} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        </div>
        {error && <ErrorBar error={new Error(error)} />}

        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const p = r.processing
              const failed = r.phase === 'error' || p?.state === 'FAILED'
              const ready = p?.state === 'READY'
              const label = r.phase === 'error' ? '上传未完成' : r.phase === 'processing' && p ? STATE_LABEL[p.state] : PHASE_LABEL[r.phase as keyof typeof PHASE_LABEL] ?? '处理中'
              const pct = r.phase === 'processing' && p ? STATE_PROGRESS[p.state] : PHASE_PROGRESS[r.phase as keyof typeof PHASE_PROGRESS] ?? 0
              return (
                <motion.li
                  key={r.key}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.28, ease: ease.out }}
                  className="rounded-2xl border border-line bg-hover p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <FileGlyph format={formatOfName(r.file.name)} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium" title={r.file.name}>{r.file.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">{fmtSize(r.file.size)} · {targetName(r.target)} · {r.scope}</p>
                    </div>
                    {(failed || ready) && <Button variant="ghost" size="icon-small" aria-label="从列表移除" onClick={() => remove(r)}><RiCloseLine className="size-4" /></Button>}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className={cn('flex shrink-0 items-center gap-1.5 text-[12.5px]', failed ? 'text-rose' : ready ? 'text-mint' : 'text-ink-2')}>
                      {failed ? <RiErrorWarningLine className="size-4" /> : ready ? <RiCheckboxCircleLine className="size-4" /> : <i className="breathe-dot size-1.5 rounded-full bg-amber text-amber" />}
                      {label}
                    </span>
                    {!failed && <span className="min-w-0 flex-1"><Progress value={pct} tone={ready ? 'mint' : 'cyan'} /></span>}
                    {failed && <span className="flex-1" />}
                    {failed && (r.phase === 'error' || p?.retryAllowed) && <Button size="small" variant="ghost-accent" loading={r.busy} onClick={() => retry(r)}><RiRefreshLine className="size-3.5" />重试</Button>}
                    {ready && r.draft?.result && <Button size="small" variant="ghost-accent" onClick={() => onOpenMaterial(r.draft!.result!.documentId)}>查看材料</Button>}
                  </div>
                  {(r.error || (p && p.state !== 'READY' && r.phase === 'processing')) && (
                    <p className={cn('mt-2 text-[12px] leading-relaxed', failed ? 'text-rose' : 'text-ink-3')}>{r.error ?? p?.message}</p>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      </div>
    </Drawer>
  )
}
