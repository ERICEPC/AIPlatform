import type { ConfigSkillRef, LibrarySkill, SkillFilePreview, Tag } from '@/api/agents'
import { RiArrowLeftSLine, RiCheckLine, RiDeleteBinLine, RiDownload2Line, RiFileLine, RiFlashlightLine, RiFolder3Line, RiSearchLine, RiUpload2Line } from '@remixicon/react'
import { useEffect, useRef, useState } from 'react'
import { deleteSkill, downloadSkill, listLibrarySkills, listSkillTags, previewSkillFiles, setAgentSkills, uploadSkill } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { AddButton, ConfigCard, errText, fileSize, fromNow, IconBtn, openUrl, Row, useDebounced } from '../shared'
import { useConfig } from './context'

const MAX = 20

export function SkillsSection() {
  const { agentId, soul, changed, flush, reload } = useConfig()
  const toast = useToast()
  const skills = soul.config_skills ?? []
  const [lib, setLib] = useState(false)
  const [detail, setDetail] = useState<ConfigSkillRef | null>(null)
  const [uploading, setUploading] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const upload = async (f: File) => {
    if (!/\.(zip|skill)$/i.test(f.name)) {
      toast('只支持 .zip 或 .skill 格式的 Skill 包', 'info')
      return
    }
    setUploading(true)
    try {
      await flush()
      const r = await uploadSkill(agentId, f)
      await reload()
      toast(`已添加 Skill「${r.name}」`)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setUploading(false)
    }
  }
  const remove = async (s: ConfigSkillRef) => {
    try {
      await flush()
      await deleteSkill(agentId, s.name)
      await reload()
      toast(`已移除「${s.name}」`)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
  }
  const download = async (s: ConfigSkillRef) => {
    try {
      openUrl((await downloadSkill(agentId, s.name)).url)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
  }

  return (
    <ConfigCard
      id="sec-skills"
      icon={RiFlashlightLine}
      title="Skills"
      count={skills.length}
      changed={changed.has('config_skills')}
      hint={skills.length ? undefined : '把可复用的做事方法打包成 Skill，Agent 遇到对应任务时会按步骤执行。'}
      actions={(
        <>
          <Button variant="ghost" size="small" loading={uploading} onClick={() => file.current?.click()}><RiUpload2Line className="size-3.5" />上传</Button>
          <AddButton onClick={() => setLib(true)}>从 Skill 库添加</AddButton>
          <input ref={file} type="file" accept=".zip,.skill" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </>
      )}
    >
      {skills.length > 0 && (
        <div className="space-y-0.5">
          {skills.map(s => (
            <Row
              key={s.name}
              tone={s.is_missing ? 'warn' : undefined}
              onClick={() => setDetail(s)}
              icon={<RiFlashlightLine className="size-4 text-volt-text" />}
              title={<span className="flex items-center gap-2">{s.name}{s.skill_id ? <Badge tone="neutral">Skill 库</Badge> : <Badge tone="cyan">上传</Badge>}{s.is_missing && <Badge tone="rose">不存在</Badge>}</span>}
              sub={s.description || fileSize(s.size)}
              right={(
                <>
                  <IconBtn label="下载" onClick={() => download(s)}><RiDownload2Line className="size-4" /></IconBtn>
                  <IconBtn label="移除" danger onClick={() => remove(s)}><RiDeleteBinLine className="size-4" /></IconBtn>
                </>
              )}
            />
          ))}
        </div>
      )}
      <LibraryDialog open={lib} onOpenChange={setLib} selected={skills.filter(s => s.skill_id).map(s => s.skill_id!)} uploaded={skills.filter(s => !s.skill_id).length} />
      <SkillDrawer skill={detail} onClose={() => setDetail(null)} onDownload={download} />
    </ConfigCard>
  )
}

function LibraryDialog({ open, onOpenChange, selected, uploaded }: { open: boolean, onOpenChange: (o: boolean) => void, selected: string[], uploaded: number }) {
  const { agentId, flush, reload } = useConfig()
  const toast = useToast()
  const [kw, setKw] = useState('')
  const keyword = useDebounced(kw.trim())
  const [tags, setTags] = useState<Tag[]>([])
  const [tag, setTag] = useState<string | null>(null)
  const [rows, setRows] = useState<LibrarySkill[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [pick, setPick] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setPick(selected)
      setKw('')
      setTag(null)
      listSkillTags().then(setTags).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const load = async (p: number) => {
    setLoading(true)
    try {
      const r = await listLibrarySkills({ page: p, keyword: keyword || undefined, tag: tag ? [tag] : undefined })
      setRows(x => (p === 1 ? r.data : [...x, ...r.data]))
      setPage(p)
      setHasMore(r.has_more)
      setError(null)
    }
    catch (e) {
      setError(e as Error)
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (open)
      load(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, keyword, tag])

  const limit = MAX - uploaded
  const toggle = (id: string) => setPick(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= limit ? p : [...p, id]))
  const save = async () => {
    setSaving(true)
    try {
      await flush()
      await setAgentSkills(agentId, pick)
      await reload()
      toast('Skills 已更新')
      onOpenChange(false)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="从 Skill 库添加"
      description={`只能选择已发布的 Skill，每个 Agent 最多 ${MAX} 个（含上传的 ${uploaded} 个）。`}
      footer={(
        <>
          <span className="mr-auto self-center text-[12.5px] text-ink-3">已选 <b className="text-ink tabular-nums">{pick.length}</b> / {limit}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={saving} onClick={save}>确定</Button>
        </>
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="glass-1 flex h-9 w-[240px] items-center gap-2 rounded-full px-3.5 text-ink-3 focus-within:border-volt">
          <RiSearchLine className="size-4" />
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索 Skill" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
        </label>
        {[{ id: null, name: '全部' } as { id: string | null, name: string }, ...tags].map(t => (
          <button key={t.id ?? 'all'} type="button" onClick={() => setTag(t.id)} className={cn('h-8 cursor-pointer rounded-full border px-3 text-[12.5px] transition-colors', tag === t.id ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2 hover:bg-hover')}>{t.name}</button>
        ))}
      </div>
      <ErrorBar error={error} onRetry={() => load(1)} />
      <div className="grid grid-cols-2 gap-2">
        {rows.map((s) => {
          const on = pick.includes(s.id)
          const disabled = s.status !== 'published' || (!on && pick.length >= limit)
          return (
            <button key={s.id} type="button" disabled={disabled} onClick={() => toggle(s.id)} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45', on ? 'border-volt bg-volt-soft' : 'border-line hover:bg-hover')}>
              <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border', on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong')}>{on && <RiCheckLine className="size-3.5" />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13.5px] font-medium">{s.name}{s.status !== 'published' && <Badge tone="amber">未发布</Badge>}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12px] text-ink-3">{s.description}</span>
                <span className="mt-1.5 block text-[11.5px] text-ink-3">{s.tags.map(t => t.name).join(' · ')}{s.author_name && ` · ${s.author_name}`} · {fromNow(s.updated_at)}更新</span>
              </span>
            </button>
          )
        })}
        {loading && [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[88px] rounded-2xl" />)}
      </div>
      {!loading && rows.length === 0 && !error && <p className="py-10 text-center text-[13px] text-ink-3">没有找到 Skill。可以到「Skills」页面创建并发布。</p>}
      {hasMore && !loading && <div className="mt-3 flex justify-center"><Button variant="secondary" size="small" onClick={() => load(page + 1)}>加载更多</Button></div>}
    </Dialog>
  )
}

function SkillDrawer({ skill, onClose, onDownload }: { skill: ConfigSkillRef | null, onClose: () => void, onDownload: (s: ConfigSkillRef) => void }) {
  const { agentId } = useConfig()
  const [path, setPath] = useState('')
  const [data, setData] = useState<SkillFilePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (skill)
      setPath('')
  }, [skill])
  useEffect(() => {
    if (!skill)
      return
    setData(null)
    setError(null)
    previewSkillFiles(agentId, skill.name, path).then(setData).catch(e => setError(errText(e)))
  }, [agentId, skill, path])

  const parent = path.replace(/[^/]+\/?$/, '')
  return (
    <Drawer
      open={!!skill}
      onClose={onClose}
      title={<div><p className="text-[17px] font-semibold">{skill?.name}</p><p className="mt-1 text-[12.5px] text-ink-3">{skill?.description}</p></div>}
      footer={skill && <Button variant="secondary" onClick={() => onDownload(skill)}><RiDownload2Line className="size-4" />下载 Skill 包</Button>}
    >
      <div className="mb-2 flex items-center gap-1 text-[12.5px] text-ink-3">
        {path && <IconBtn label="上一级" onClick={() => setPath(parent)}><RiArrowLeftSLine className="size-4" /></IconBtn>}
        <span className="font-mono">/{path}</span>
      </div>
      {error && <p className="text-[13px] text-rose">{error}</p>}
      {!data && !error && <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9" />)}</div>}
      {data?.type === 'dir' && (
        <div className="space-y-0.5">
          {data.entries?.map(e => (
            <Row key={e.path} onClick={() => setPath(e.path)} icon={e.type === 'dir' ? <RiFolder3Line className="size-4 text-amber" /> : <RiFileLine className="size-4 text-ink-3" />} title={e.name} right={<span className="text-[12px] text-ink-3">{fileSize(e.size)}</span>} />
          ))}
        </div>
      )}
      {data?.type === 'file' && (
        <pre className="overflow-auto rounded-2xl border border-line bg-hover p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{data.text}{data.truncated && '\n…（内容过长，已截断）'}</pre>
      )}
    </Drawer>
  )
}
