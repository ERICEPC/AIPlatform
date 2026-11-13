import type { AppFeatures, SandboxCaller, SandboxEntry } from '@/api/agents'
import { RiAddLine, RiArrowLeftSLine, RiCloseLine, RiDownload2Line, RiFileLine, RiFolder3Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { downloadSandboxFile, listSandboxFiles, readSandboxFile } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Field, NumberInput, Textarea } from '@/components/ui/form'
import { EmptyState, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { errText, fileSize, fromNow, IconBtn, openUrl, Row } from '../shared'
import { useConfig } from './context'

/* ---------- 工作目录：Agent 运行环境里的文件 ---------- */
export function WorkspaceDrawer({ open, onClose, caller }: { open: boolean, onClose: () => void, caller: SandboxCaller | null }) {
  const { agentId } = useConfig()
  const toast = useToast()
  const [root, setRoot] = useState<'~' | '.'>('~')
  const [path, setPath] = useState('~')
  const [entries, setEntries] = useState<SandboxEntry[] | null>(null)
  const [file, setFile] = useState<{ path: string, content: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPath(root)
    setFile(null)
  }, [root])
  useEffect(() => {
    if (!open || !caller)
      return
    setEntries(null)
    setError(null)
    listSandboxFiles(agentId, caller, path).then(r => setEntries(r.data)).catch(e => setError(errText(e)))
  }, [open, caller, agentId, path])

  const read = async (p: string) => {
    try {
      const r = await readSandboxFile(agentId, caller!, p)
      setFile({ path: p, content: r.binary ? '（二进制文件，无法预览）' : r.content })
    }
    catch (e) {
      toast(errText(e), 'info')
    }
  }
  const download = async (p: string) => {
    try {
      openUrl((await downloadSandboxFile(agentId, caller!, p)).url)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={<div><p className="text-[17px] font-semibold">工作目录</p><p className="mt-1 text-[12.5px] text-ink-3">Agent 在运行环境里读写的文件</p></div>}>
      <Segmented size="small" value={root} onValueChange={setRoot} options={[{ value: '~', label: '长期 ~' }, { value: '.', label: '临时 .' }]} />
      <p className="mt-2 mb-3 text-[12px] text-ink-3">{root === '~' ? '跨会话保留，适合记忆、偏好等长期资料。' : '只在当前会话有效，会话结束后清理。'}</p>
      {!caller
        ? <EmptyState icon={<RiFolder3Line className="size-6" />} title="还没有工作目录" hint="开始一轮对话后，Agent 写入的文件会出现在这里。" />
        : file
          ? (
              <div>
                <div className="mb-2 flex items-center gap-1">
                  <IconBtn label="返回" onClick={() => setFile(null)}><RiArrowLeftSLine className="size-4" /></IconBtn>
                  <span className="flex-1 truncate font-mono text-[12.5px]">{file.path}</span>
                  <Button variant="ghost" size="small" onClick={() => download(file.path)}><RiDownload2Line className="size-3.5" />下载</Button>
                </div>
                <pre className="overflow-auto rounded-2xl border border-line bg-hover p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{file.content}</pre>
              </div>
            )
          : (
              <>
                <div className="mb-2 flex items-center gap-1 text-[12.5px] text-ink-3">
                  {path !== root && <IconBtn label="上一级" onClick={() => setPath(path.replace(/\/[^/]+$/, ''))}><RiArrowLeftSLine className="size-4" /></IconBtn>}
                  <span className="font-mono">{path}</span>
                </div>
                {error && <p className="text-[13px] text-rose">{error}</p>}
                {!entries && !error && <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>}
                {entries?.length === 0 && <p className="py-8 text-center text-[13px] text-ink-3">这个目录是空的</p>}
                <div className="space-y-0.5">
                  {entries?.map((e) => {
                    const p = `${path}/${e.name}`
                    return (
                      <Row
                        key={e.name}
                        onClick={() => (e.type === 'dir' ? setPath(p) : read(p))}
                        icon={e.type === 'dir' ? <RiFolder3Line className="size-4 text-amber" /> : <RiFileLine className="size-4 text-ink-3" />}
                        title={e.name}
                        sub={[fileSize(e.size), e.mtime ? `${fromNow(e.mtime)}修改` : ''].filter(Boolean).join(' · ')}
                        right={e.type === 'file' ? <IconBtn label="下载" onClick={() => download(p)}><RiDownload2Line className="size-4" /></IconBtn> : undefined}
                      />
                    )
                  })}
                </div>
              </>
            )}
    </Drawer>
  )
}

/* ---------- 对话功能：写入 agent_soul.app_features ---------- */
const FILE_TYPES = [{ v: 'image', l: '图片' }, { v: 'document', l: '文档' }, { v: 'audio', l: '音频' }, { v: 'video', l: '视频' }]

function Toggle({ title, desc, checked, onChange, children }: { title: string, desc: string, checked: boolean, onChange: (c: boolean) => void, children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">{title}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">{desc}</p>
        </div>
        <Switch aria-label={title} checked={checked} onCheckedChange={onChange} />
      </div>
      {checked && children && <div className="mt-3">{children}</div>}
    </div>
  )
}

export function FeaturesDrawer({ open, onClose }: { open: boolean, onClose: () => void }) {
  const { soul, update } = useConfig()
  const f = soul.app_features ?? {}
  const set = (p: Partial<AppFeatures>) => update(s => ({ ...s, app_features: { ...s.app_features, ...p } }))
  const qs = f.suggested_questions ?? []
  const fu = f.file_upload ?? {}

  return (
    <Drawer open={open} onClose={onClose} title={<div><p className="text-[17px] font-semibold">对话功能</p><p className="mt-1 text-[12.5px] text-ink-3">作用于 Web 应用、API 和预览对话，改动自动保存</p></div>}>
      <div className="space-y-3">
        <div className="rounded-2xl border border-line p-3.5">
          <Field label="开场白" hint="用户打开对话时先看到的话，留空则不显示。">
            <Textarea rows={3} value={f.opening_statement ?? ''} placeholder="你好，我是翼飞售后小助手…" onChange={e => set({ opening_statement: e.target.value })} />
          </Field>
          <p className="mt-3 mb-1.5 text-[13px] font-medium">建议问题</p>
          <div className="space-y-1.5">
            {qs.map((q, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={q} placeholder="例如：退货多久到账" onChange={e => set({ suggested_questions: qs.map((x, j) => (j === i ? e.target.value : x)) })} className="h-9 flex-1 rounded-xl border border-line-strong bg-hover px-3 text-[13px] outline-none focus:border-volt" />
                <IconBtn label="删除" danger onClick={() => set({ suggested_questions: qs.filter((_, j) => j !== i) })}><RiCloseLine className="size-4" /></IconBtn>
              </div>
            ))}
            {qs.length < 6 && <Button variant="ghost-accent" size="small" onClick={() => set({ suggested_questions: [...qs, ''] })}><RiAddLine className="size-3.5" />添加问题</Button>}
          </div>
        </div>
        <Toggle title="下一步问题建议" desc="每次回答后给出 3 个可能的追问。" checked={!!f.suggested_questions_after_answer?.enabled} onChange={c => set({ suggested_questions_after_answer: { ...f.suggested_questions_after_answer, enabled: c } })} />
        <Toggle title="文字转语音" desc="回答可以朗读出来。" checked={!!f.text_to_speech?.enabled} onChange={c => set({ text_to_speech: { ...f.text_to_speech, enabled: c } })}>
          <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
            自动播放
            <Switch aria-label="自动播放" checked={f.text_to_speech?.autoPlay === 'enabled'} onCheckedChange={c => set({ text_to_speech: { ...f.text_to_speech, autoPlay: c ? 'enabled' : 'disabled' } })} />
          </div>
        </Toggle>
        <Toggle title="语音转文字" desc="输入框出现麦克风，按住说话转成文字。" checked={!!f.speech_to_text?.enabled} onChange={c => set({ speech_to_text: { enabled: c } })} />
        <Toggle title="文件上传" desc="用户可以在对话里发送文件。" checked={!!fu.enabled} onChange={c => set({ file_upload: { allowed_file_types: ['image', 'document'], allowed_file_upload_methods: ['local_file'], number_limits: 3, ...fu, enabled: c } })}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {FILE_TYPES.map((t) => {
                const on = fu.allowed_file_types?.includes(t.v)
                return <button key={t.v} type="button" onClick={() => set({ file_upload: { ...fu, allowed_file_types: on ? fu.allowed_file_types!.filter(x => x !== t.v) : [...(fu.allowed_file_types ?? []), t.v] } })} className={cn('h-8 cursor-pointer rounded-full border px-3 text-[12.5px]', on ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2 hover:bg-hover')}>{t.l}</button>
              })}
            </div>
            <div className="flex items-center gap-3 text-[12.5px] text-ink-2">每次最多<NumberInput className="w-24" value={fu.number_limits ?? 3} min={1} max={10} onChange={n => set({ file_upload: { ...fu, number_limits: n } })} />个</div>
          </div>
        </Toggle>
        <Toggle title="引用和归属" desc="回答下方显示引用的知识库片段，方便核对来源。" checked={!!f.retriever_resource?.enabled} onChange={c => set({ retriever_resource: { enabled: c } })} />
      </div>
    </Drawer>
  )
}
