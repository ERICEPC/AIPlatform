import { requestBlob } from '@/api/http'
import type { ArtifactStatus, ArtifactType, CollabArtifact } from '@/api/collab'
import { RiBookShelfLine, RiChatQuoteLine, RiCloseLine, RiDownload2Line, RiEyeLine, RiFileExcel2Line, RiFilePdf2Line, RiFilePpt2Line, RiFileWord2Line, RiFolderOpenLine, RiMarkdownLine, RiShieldCheckLine, RiTaskLine } from '@remixicon/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { Badge, EmptyState, Panel, Progress, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { fmtTime, fullName, KindTag, MemberAvatar, shortName, useMemberLookup } from './shared'

type Filter = 'all' | ArtifactType
const typeLabel: Record<ArtifactType, string> = { doc: '文档', data: '数据', decision: '决策', task: '任务' }
const order: ArtifactType[] = ['doc', 'data', 'decision', 'task']

const statusBadge: Record<ArtifactStatus, React.ReactNode> = {
  draft: <Badge tone="amber">草稿</Badge>,
  final: <Badge tone="mint">定稿</Badge>,
  exported: <Badge tone="cyan">已导出</Badge>,
  pending: <Badge tone="volt" dot>待核对</Badge>,
  confirmed: <Badge tone="mint">已确认</Badge>,
  rejected: <Badge tone="rose">已驳回</Badge>,
  running: <Badge tone="amber" dot>进行中</Badge>,
  done: <Badge tone="mint">已完成</Badge>,
}

function ArtifactIcon({ a, size = 36 }: { a: CollabArtifact, size?: number }) {
  const [Icon, tone] = a.type === 'decision'
    ? [RiShieldCheckLine, 'bg-amber-soft text-amber']
    : a.type === 'task'
      ? [RiTaskLine, 'bg-volt-soft text-volt-text']
      : ({
          docx: [RiFileWord2Line, 'bg-cyan-soft text-cyan'],
          pdf: [RiFilePdf2Line, 'bg-rose-soft text-rose'],
          xlsx: [RiFileExcel2Line, 'bg-mint-soft text-mint'],
          csv: [RiFileExcel2Line, 'bg-mint-soft text-mint'],
          md: [RiMarkdownLine, 'bg-hover text-ink-2'],
          pptx: [RiFilePpt2Line, 'bg-amber-soft text-amber'],
        } as const)[a.ext ?? 'md']
  return <span className={cn('grid shrink-0 place-items-center rounded-xl', tone)} style={{ width: size, height: size }}><Icon className="size-[50%]" /></span>
}

const fileName = (a: CollabArtifact) => a.ext ? `${a.title}.${a.ext}` : a.title

/** 产出物的通用操作：下载 / 存入知识库 */
function useArtifactActions() {
  const toast = useToast()
  return {
    download: async (a: CollabArtifact) => {
      if (!a.url) { toast('该成果尚未提供下载文件', 'info'); return }
      try {
        const blob = await requestBlob({ method: 'GET', path: a.url.replace('/console/api', '') }, () => new Blob(a.preview.paragraphs ?? []))
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a'); link.href = url; link.download = fileName(a); link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch (e) { toast(`下载失败：${(e as Error).message}`, 'info') }
    },
    saveToKb: (_a: CollabArtifact) => toast('知识库当前为演示页面，尚未接入保存功能', 'info'),
  }
}

/* 右栏：本群的协作产出物 */
export function ArtifactsPanel({ artifacts, error, onRetry, onClose, onJump, onPreview }: {
  artifacts: CollabArtifact[] | undefined
  error: Error | null
  onRetry: () => void
  onClose: () => void
  onJump: (messageId: string) => void
  onPreview: (a: CollabArtifact) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const actions = useArtifactActions()
  const list = artifacts ?? []
  const count = (t: Filter) => t === 'all' ? list.length : list.filter(a => a.type === t).length
  const types = order.filter(t => (filter === 'all' || filter === t) && list.some(a => a.type === t))

  return (
    <Panel level={2} radius="lg" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="space-y-3 p-4 pb-3">
        <div className="flex items-center gap-2">
          <RiFolderOpenLine className="size-[18px] text-volt-text" />
          <p className="text-[14.5px] font-semibold">协作产出物</p>
          {artifacts && <span className="text-[12px] text-ink-3 tabular-nums">{list.length}</span>}
          <Tip label="收起协作产出物">
            <Button variant="ghost" size="icon-small" className="ml-auto" aria-label="收起协作产出物" onClick={onClose}><RiCloseLine className="size-4" /></Button>
          </Tip>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="按类型筛选">
          {(['all', ...order] as Filter[]).map(t => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={filter === t}
              onClick={() => setFilter(t)}
              className={cn('h-7 cursor-pointer rounded-full border px-2.5 text-[12.5px] transition-colors', filter === t ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2 hover:bg-hover')}
            >
              {t === 'all' ? '全部' : typeLabel[t]}
              <span className="ml-1 tabular-nums opacity-70">{count(t)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {error && <ErrorBar error={error} onRetry={onRetry} />}
        {!artifacts && !error && [0, 1, 2].map(i => (
          <div key={i} className="flex gap-3 p-2.5"><Skeleton className="size-9 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
        ))}
        {artifacts && !list.length && (
          <EmptyState icon={<RiFolderOpenLine className="size-5" />} title="还没有产出物" hint="实际生成的 HTML、PDF、Word 等交付文件会显示在这里；讨论与交接记录保留在聊天中" />
        )}
        {artifacts && list.length > 0 && !types.length && <p className="py-10 text-center text-[13px] text-ink-3">这个群还没有{typeLabel[filter as ArtifactType]}类产出物</p>}
        {types.map(t => (
          <section key={t} className="mb-2">
            <p className="px-2 pt-2 pb-1.5 text-[12px] font-medium text-ink-3">{typeLabel[t]} · {count(t)}</p>
            {list.filter(a => a.type === t).map(a => (
              <ArtifactRow key={a.id} a={a} onPreview={() => onPreview(a)} onJump={() => onJump(a.message_id)} onDownload={() => actions.download(a)} onSave={() => actions.saveToKb(a)} />
            ))}
          </section>
        ))}
      </div>
    </Panel>
  )
}

function ArtifactRow({ a, onPreview, onJump, onDownload, onSave }: { a: CollabArtifact, onPreview: () => void, onJump: () => void, onDownload: () => void, onSave: () => void }) {
  const downloadable = a.type === 'doc' || a.type === 'data'
  const lookup = useMemberLookup()
  return (
    <div className="group rounded-2xl p-2.5 transition-colors hover:bg-hover">
      <div className="flex gap-3">
        <ArtifactIcon a={a} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <button type="button" onClick={onPreview} className="min-w-0 flex-1 cursor-pointer text-left text-[13.5px] leading-snug font-medium hover:text-volt-text">{a.type === 'decision' ? `「${a.title}」` : fileName(a)}</button>
            {statusBadge[a.status]}
          </div>
          <p className="mt-1 truncate text-[12px] text-ink-3">
            {fullName(lookup(a.author_id))} · {a.task} · {fmtTime(a.created_at)}
          </p>
          {a.type === 'decision' && a.reviewer_id && <p className="mt-0.5 text-[12px] text-ink-3">核对人：{shortName(lookup(a.reviewer_id))}</p>}
          {a.type === 'task' && a.progress !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1"><Progress value={a.progress} tone={a.progress === 100 ? 'mint' : 'volt'} /></div>
              <span className="text-[11.5px] text-ink-3 tabular-nums">{a.progress}%</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Tip label="预览内容"><Button variant="ghost" size="icon-small" aria-label="预览" onClick={onPreview}><RiEyeLine className="size-4" /></Button></Tip>
        {downloadable && <Tip label="下载文件"><Button variant="ghost" size="icon-small" aria-label="下载" onClick={onDownload}><RiDownload2Line className="size-4" /></Button></Tip>}
        <Tip label="跳转到群里的来源消息"><Button variant="ghost" size="icon-small" aria-label="跳转到消息" onClick={onJump}><RiChatQuoteLine className="size-4" /></Button></Tip>
        <Tip label="存入知识库"><Button variant="ghost" size="icon-small" aria-label="存入知识库" onClick={onSave}><RiBookShelfLine className="size-4" /></Button></Tip>
      </div>
    </div>
  )
}

/* 产出物预览抽屉 */
export function ArtifactPreview({ artifact: a, onClose, onJump }: { artifact: CollabArtifact | null, onClose: () => void, onJump: (messageId: string) => void }) {
  const actions = useArtifactActions()
  const lookup = useMemberLookup()
  const who = a ? lookup(a.author_id) : undefined
  return (
    <Drawer
      open={!!a}
      onClose={onClose}
      title={a && (
        <div className="flex items-center gap-3">
          <ArtifactIcon a={a} size={40} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[16px] font-semibold">{a.type === 'decision' ? `「${a.title}」` : fileName(a)}</p>
            <p className="mt-1 text-[12.5px] text-ink-3">{typeLabel[a.type]}{a.size ? ` · ${a.size}` : ''} · {fmtTime(a.created_at)}</p>
          </div>
        </div>
      )}
      footer={a && (
        <>
          {(a.type === 'doc' || a.type === 'data') && <Button variant="secondary" onClick={() => actions.download(a)}><RiDownload2Line className="size-4" />下载</Button>}
          <Button variant="secondary" onClick={() => { onClose(); onJump(a.message_id) }}><RiChatQuoteLine className="size-4" />跳转到消息</Button>
          <Button variant="primary" className="ml-auto" onClick={() => actions.saveToKb(a)}><RiBookShelfLine className="size-4" />存入知识库</Button>
        </>
      )}
    >
      {a && (
        <div className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            {who && <span className="flex items-center gap-1.5"><MemberAvatar member={who} size={20} />{who.name}{who.kind === 'agent' && <KindTag kind="agent" />}</span>}
            <span className="text-ink-3">·</span>
            <span>关联任务：{a.task}</span>
            {statusBadge[a.status]}
          </div>
          {a.type === 'decision' && a.reviewer_id && <p className="text-[13px] text-ink-2">核对人：{shortName(lookup(a.reviewer_id))}</p>}

          {a.preview.paragraphs && (
            <div className="glass-2 space-y-2.5 rounded-[20px] p-4 text-[14px] leading-[1.75]">
              {a.preview.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}

          {a.preview.table && (
            <div className="overflow-hidden rounded-[20px] border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-hover text-ink-2">
                  <tr>{a.preview.table.columns.map(c => <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {a.preview.table.rows.map((r, i) => (
                    <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-3 py-2 tabular-nums">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-3 py-2 text-[12px] text-ink-3">仅预览前 {a.preview.table.rows.length} 行，完整数据请下载</p>
            </div>
          )}

          {a.subtasks && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[13px]"><span className="font-medium">整体进度</span><span className="tabular-nums text-ink-2">{a.progress}%</span></div>
              <Progress value={a.progress ?? 0} />
              {a.subtasks.map(s => (
                <div key={s.title} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[13.5px]"><span>{s.title}<span className="ml-2 text-ink-3">{fullName(lookup(s.assignee_id))}</span></span><span className="tabular-nums text-ink-3">{s.progress}%</span></div>
                  <Progress value={s.progress} tone={s.progress === 100 ? 'mint' : 'volt'} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
