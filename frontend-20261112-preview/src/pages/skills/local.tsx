import type { LocalSkill, LocalSkillSource } from '@/api/skills'
import type { Go } from './shared'
import { RiDeleteBinLine, RiExternalLinkLine, RiEyeLine, RiFolderUserLine, RiRefreshLine, RiSearchLine, RiStore2Line } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { deleteLocalSkill, listLocalSkills, patchLocalSkill, updateLocalSkill } from '@/api/skills'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { ErrorBar } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { Menu } from '@/components/ui/menu'
import { Badge, EmptyState, Panel, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Tip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { AddSkill, FileList } from './local-add'
import { dateTime, errText, fromNow, itemVariants, Monogram, SourceBadge } from './shared'

type Filter = 'all' | LocalSkillSource

/** 本地技能的行内操作：启停、更新、删除（列表和抽屉共用） */
function useLocalActions(setRows: (fn: (rows: LocalSkill[]) => LocalSkill[]) => void) {
  const toast = useToast()
  const [busy, setBusy] = useState<Record<string, 'toggle' | 'update' | undefined>>({})
  const mark = (id: string, v?: 'toggle' | 'update') => setBusy(b => ({ ...b, [id]: v }))
  const replace = (s: LocalSkill) => setRows(rows => rows.map(r => (r.id === s.id ? s : r)))

  const toggle = async (s: LocalSkill, enabled: boolean) => {
    replace({ ...s, enabled })
    mark(s.id, 'toggle')
    try {
      replace(await patchLocalSkill(s.id, { enabled }))
      toast(enabled ? `已启用「${s.name}」` : `已停用「${s.name}」，助手和 Agent 不会再调用它`, enabled ? 'ok' : 'info')
    }
    catch (e) {
      replace(s)
      toast(`操作失败：${errText(e)}`, 'info')
    }
    finally {
      mark(s.id)
    }
  }
  const update = async (s: LocalSkill) => {
    mark(s.id, 'update')
    try {
      const n = await updateLocalSkill(s.id)
      replace(n)
      toast(`「${n.name}」已更新到 v${n.version}`)
    }
    catch (e) {
      toast(`更新失败：${errText(e)}`, 'info')
    }
    finally {
      mark(s.id)
    }
  }
  return { busy, toggle, update }
}

export default function LocalTab({ detail, open, go }: { detail?: string, open: (id?: string) => void, go: Go }) {
  const q = useQuery(listLocalSkills, [])
  const toast = useToast()
  const rows = q.data?.data ?? []
  const setRows = (fn: (r: LocalSkill[]) => LocalSkill[]) => q.setData(d => ({ data: fn(d?.data ?? []) }))
  const { busy, toggle, update } = useLocalActions(setRows)
  const [filter, setFilter] = useState<Filter>('all')
  const [kw, setKw] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [del, setDel] = useState<LocalSkill | null>(null)
  const [deleting, setDeleting] = useState(false)

  const count = (s: LocalSkillSource) => rows.filter(r => r.source === s).length
  const shown = useMemo(() => {
    const k = kw.trim().toLowerCase()
    return rows.filter(r => (filter === 'all' || r.source === filter) && (!k || `${r.name}${r.description}`.toLowerCase().includes(k)))
  }, [rows, filter, kw])
  const cur = rows.find(r => r.id === detail)

  const onAdded = (s: LocalSkill) => {
    setRows(list => [s, ...list.filter(r => r.id !== s.id)])
    setFilter('all')
    setFresh(s.id)
    setTimeout(() => setFresh(f => (f === s.id ? null : f)), 2400)
  }

  const remove = async () => {
    if (!del)
      return
    setDeleting(true)
    try {
      await deleteLocalSkill(del.id)
      setRows(list => list.filter(r => r.id !== del.id))
      toast(`已删除「${del.name}」`, 'info')
      if (detail === del.id)
        open()
      setDel(null)
    }
    catch (e) {
      toast(`删除失败：${errText(e)}`, 'info')
    }
    finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <AddSkill onAdded={onAdded} />

      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onValueChange={setFilter}
          size="small"
          aria-label="按来源筛选"
          options={[
            { value: 'all', label: '全部', count: rows.length },
            { value: 'upload', label: '上传', count: count('upload') },
            { value: 'github', label: 'GitHub', count: count('github') },
            { value: 'market', label: '市场', count: count('market') },
          ]}
        />
        <label className="glass-1 ml-auto flex h-9 w-[240px] items-center gap-2 rounded-full px-3.5 text-[13px]">
          <RiSearchLine className="size-4 text-ink-3" />
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索本地技能" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
        </label>
      </motion.div>

      <ErrorBar error={q.error} onRetry={q.reload} />

      {q.loading && !q.data
        ? <Panel level={2} className="divide-y divide-line">{Array.from({ length: 3 }, (_, i) => <RowSkeleton key={i} />)}</Panel>
        : rows.length === 0
          ? (
              <Panel level={2}>
                <EmptyState
                  icon={<RiFolderUserLine className="size-5" />}
                  title="还没有本地技能"
                  hint="把带 SKILL.md 的技能目录打包上传，或粘贴 GitHub 地址导入；也可以去市场挑现成的。SKILL.md 开头需写明 name 和 description。"
                  action={<Button variant="secondary" onClick={() => go('skills/market')}><RiStore2Line className="size-4" />去市场看看</Button>}
                />
              </Panel>
            )
          : shown.length === 0
            ? <Panel level={2}><EmptyState icon={<RiSearchLine className="size-5" />} title="没有符合条件的技能" hint="换个关键词或来源筛选试试" /></Panel>
            : (
                <Panel level={2} className="overflow-hidden">
                  <div className="grid grid-cols-[1fr_88px_80px_96px_auto] items-center gap-4 border-b border-line px-5 py-2.5 text-[12px] text-ink-3">
                    <span>技能</span><span>来源</span><span>版本</span><span>更新于</span><span className="w-[148px] text-right">启用 / 操作</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {shown.map(s => (
                      <motion.div key={s.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }} transition={spring.smooth}>
                        <LocalRow s={s} fresh={fresh === s.id} busy={busy[s.id]} onOpen={() => open(s.id)} onToggle={v => toggle(s, v)} onUpdate={() => update(s)} onDelete={() => setDel(s)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </Panel>
              )}

      <LocalDrawer skill={cur} busy={cur ? busy[cur.id] : undefined} onClose={() => open()} onToggle={v => cur && toggle(cur, v)} onUpdate={() => cur && update(cur)} onDelete={() => cur && setDel(cur)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={o => !o && setDel(null)}
        title={`删除「${del?.name ?? ''}」？`}
        description={del?.source === 'market' ? '删除后可以在市场重新安装。正在使用它的助手和 Agent 将无法再调用。' : '技能文件会一并删除，正在使用它的助手和 Agent 将无法再调用，此操作不可撤销。'}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  )
}

function LocalRow({ s, fresh, busy, onOpen, onToggle, onUpdate, onDelete }: {
  s: LocalSkill
  fresh: boolean
  busy?: 'toggle' | 'update'
  onOpen: () => void
  onToggle: (v: boolean) => void
  onUpdate: () => void
  onDelete: () => void
}) {
  const remote = s.source !== 'upload'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => e.key === 'Enter' && onOpen()}
      className={cn('grid cursor-pointer grid-cols-[1fr_88px_80px_96px_auto] items-center gap-4 border-b border-line px-5 py-3.5 transition-colors last:border-b-0 hover:bg-hover focus-visible:bg-hover focus-visible:outline-none', fresh && 'bg-volt-soft', !s.enabled && 'opacity-70')}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <Monogram name={s.name} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14.5px] font-medium">{s.name}</p>
            {fresh && <Badge tone="volt">新添加</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-ink-3">{s.description}</p>
        </div>
      </div>
      <span><SourceBadge source={s.source} /></span>
      <span className="flex items-center gap-1 font-mono text-[12.5px] text-ink-2">
        v{s.version}
        {s.has_update && <Tip label="有新版本"><i className="breathe-dot size-1.5 rounded-full bg-amber text-amber" /></Tip>}
      </span>
      <span className="text-[12.5px] text-ink-3">{fromNow(s.updated_at)}</span>
      <div className="flex w-[148px] items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
        {remote && (
          <Button variant={s.has_update ? 'ghost-accent' : 'ghost'} size="small" loading={busy === 'update'} onClick={onUpdate}>
            {busy !== 'update' && <RiRefreshLine className="size-3.5" />}
            更新
          </Button>
        )}
        <Switch checked={s.enabled} disabled={busy === 'toggle'} onCheckedChange={onToggle} aria-label={`启用 ${s.name}`} />
        <Menu
          items={[
            { label: '查看详情', icon: RiEyeLine, onSelect: onOpen },
            ...(s.source_url ? [{ label: '在 GitHub 查看', icon: RiExternalLinkLine, onSelect: () => window.open(s.source_url!, '_blank', 'noopener') }] : []),
            'separator',
            { label: '删除', icon: RiDeleteBinLine, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Skeleton className="size-10 rounded-[14px]" />
      <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-72" /></div>
      <Skeleton className="h-5 w-12 rounded-full" />
      <Skeleton className="h-6 w-10 rounded-full" />
    </div>
  )
}

function LocalDrawer({ skill: s, busy, onClose, onToggle, onUpdate, onDelete }: {
  skill?: LocalSkill
  busy?: 'toggle' | 'update'
  onClose: () => void
  onToggle: (v: boolean) => void
  onUpdate: () => void
  onDelete: () => void
}) {
  return (
    <Drawer
      open={!!s}
      onClose={onClose}
      title={s && (
        <div className="flex items-center gap-3">
          <Monogram name={s.name} size={48} />
          <div className="min-w-0">
            <p className="truncate text-[18px] font-semibold">{s.name}</p>
            <div className="mt-1 flex items-center gap-2"><SourceBadge source={s.source} /><Badge className="font-mono">v{s.version}</Badge>{s.has_update && <Badge tone="amber" dot>有新版本</Badge>}</div>
          </div>
        </div>
      )}
      footer={s && (
        <>
          <Button variant="ghost" tone="destructive" size="large" onClick={onDelete}><RiDeleteBinLine className="size-4" />删除</Button>
          {s.source !== 'upload' && <Button variant="secondary" size="large" className="flex-1" loading={busy === 'update'} onClick={onUpdate}>{busy !== 'update' && <RiRefreshLine className="size-4" />}拉取最新版本</Button>}
        </>
      )}
    >
      {s && (
        <div className="space-y-6 text-[14px]">
          <p className="leading-relaxed text-ink-2">{s.description}</p>
          <div className="flex items-center justify-between rounded-2xl border border-line bg-hover px-4 py-3">
            <div>
              <p className="font-medium">{s.enabled ? '已启用' : '已停用'}</p>
              <p className="text-[12.5px] text-ink-3">{s.enabled ? '助手和 Agent 会按 SKILL.md 的触发条件调用它' : '停用后不会被调用，文件保留'}</p>
            </div>
            <Switch checked={s.enabled} disabled={busy === 'toggle'} onCheckedChange={onToggle} aria-label={`启用 ${s.name}`} />
          </div>
          <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-ink-3">安装人</dt><dd>{s.installed_by ?? '—'}</dd>
            <dt className="text-ink-3">安装时间</dt><dd className="tabular-nums">{dateTime(s.installed_at)}</dd>
            <dt className="text-ink-3">更新时间</dt><dd className="tabular-nums">{dateTime(s.updated_at)}</dd>
            {s.file_name && (<><dt className="text-ink-3">原始文件</dt><dd className="truncate font-mono">{s.file_name}</dd></>)}
            {s.ref && (<><dt className="text-ink-3">分支</dt><dd className="font-mono">{s.ref}</dd></>)}
            {s.source_url && (
              <>
                <dt className="text-ink-3">来源地址</dt>
                <dd className="min-w-0"><a href={s.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-volt-text hover:underline"><span className="truncate">{s.source_url.replace('https://github.com/', '')}</span><RiExternalLinkLine className="size-3.5 shrink-0" /></a></dd>
              </>
            )}
          </dl>
          <section>
            <p className="mb-2 text-[13px] font-semibold">文件 <span className="font-normal text-ink-3">{s.files.length}</span></p>
            <FileList files={s.files} />
          </section>
        </div>
      )}
    </Drawer>
  )
}
