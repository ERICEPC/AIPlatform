import { currentUser } from '@/lib/current-user'
import { ResourceVisibility } from '@/components/resource-visibility'
import type { AgentAppPartial, AgentSortBy } from '@/api/agents'
import { RiAddLine, RiGitBranchLine, RiRobot2Line, RiSearchLine, RiSortDesc, RiUserLine } from '@remixicon/react'
import { useEffect, useMemo, useState } from 'react'
import { listPersonalAgents } from '@/api/agents'
import { Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { CountUp, SpotlightCard } from '@/components/ui/effects'
import { Menu } from '@/components/ui/menu'
import { Badge, EmptyState, Panel, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/cn'
import { useAgentActions } from './dialogs'
import { AgentIcon, errText, fromNow, useDebounced } from './shared'

type Status = 'all' | 'published' | 'draft'
const SORTS: { value: AgentSortBy, label: string }[] = [
  { value: 'last_modified', label: '最近修改' },
  { value: 'recently_created', label: '最近创建' },
  { value: 'earliest_created', label: '最早创建' },
]
const LIMIT = 30

/** 「我的」：平台上构建的 Agent（原列表逻辑）。新建 / 导入入口在页头，由 list.tsx 持有 */
export default function MineTab({ go, tick: outerTick, onCreate }: { go: (path: string) => void, tick: number, onCreate: () => void }) {
  const [status, setStatus] = useState<Status>('all')
  const [keyword, setKeyword] = useState('')
  const [mine, setMine] = useState(false)
  const [sort, setSort] = useState<AgentSortBy>('last_modified')
  const name = useDebounced(keyword.trim())

  const [rows, setRows] = useState<AgentAppPartial[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  const reload = () => setTick(t => t + 1)

  useEffect(() => {
    let alive = true
    setLoading(true)
    listPersonalAgents({ page: 1, limit: LIMIT, sort_by: sort, name: name || undefined, is_created_by_me: mine || undefined })
      .then((r) => {
        if (!alive)
          return
        setRows(r.data)
        setPage(1)
        setTotal(r.total)
        setHasMore(r.has_more)
        setError(null)
      })
      .catch(e => alive && setError(e))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [sort, name, mine, tick, outerTick])

  const loadMore = async () => {
    setMore(true)
    try {
      const r = await listPersonalAgents({ page: page + 1, limit: LIMIT, sort_by: sort, name: name || undefined, is_created_by_me: mine || undefined })
      setRows(x => [...x, ...r.data])
      setPage(r.page)
      setHasMore(r.has_more)
    }
    catch (e) {
      setError(new Error(errText(e)))
    }
    finally {
      setMore(false)
    }
  }

  const actions = useAgentActions({
    onChanged: a => setRows(x => x.map(r => (r.id === a.id ? { ...r, ...a } : r))),
    onCopied: reload,
    onDeleted: (id) => {
      setRows(x => x.filter(r => r.id !== id))
      setTotal(n => n - 1)
    },
  })

  const published = rows.filter(r => r.active_config_is_published).length
  const shown = useMemo(() => rows.filter(r => status === 'all' || (status === 'published' ? r.active_config_is_published : !r.active_config_is_published)), [rows, status])
  const refs = rows.reduce((s, r) => s + (r.published_reference_count ?? 0), 0)

  return (
    <>
      <Rise className="mt-6 grid grid-cols-1 items-stretch gap-3 md:grid-cols-3">
        <Panel level={2} radius="lg" glow="volt" className="p-5">
          <p className="text-[13px] text-ink-2">{mine ? '我创建的 Agent' : 'Agent 总数'}</p>
          <div className="mt-2 text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{loading ? <Skeleton className="h-10 w-20" /> : <CountUp value={total} />}</div>
          <p className="mt-3 text-[12.5px] text-ink-3">{name ? `名称包含「${name}」` : '按当前筛选统计'}</p>
        </Panel>
        <Panel level={2} radius="lg" className="p-5">
          <p className="text-[13px] text-ink-2">已发布</p>
          <p className="mt-2 text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums"><CountUp value={published} /><span className="ml-1 text-[18px] text-ink-3">/ {rows.length}</span></p>
          <p className="mt-3 text-[12.5px] text-ink-3">{rows.length - published} 个草稿或有未发布的更改</p>
        </Panel>
        <Panel level={2} radius="lg" className="p-5">
          <p className="text-[13px] text-ink-2">被应用引用</p>
          <p className="mt-2 text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums"><CountUp value={refs} /><span className="ml-1 text-[18px] text-ink-3">次</span></p>
          <p className="mt-3 text-[12.5px] text-ink-3">发布新版本前会提示受影响的应用</p>
        </Panel>
      </Rise>

      <Rise className="mt-8 flex flex-wrap items-center gap-3">
        <Segmented
          value={status}
          onValueChange={setStatus}
          aria-label="按状态筛选"
          options={[
            { value: 'all', label: '全部', count: rows.length },
            { value: 'published', label: '已发布', count: published },
            { value: 'draft', label: '草稿', count: rows.length - published },
          ]}
        />
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => setMine(m => !m)}
          className={cn('flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-[13px] transition-colors', mine ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')}
        >
          <RiUserLine className="size-4" />我创建的
        </button>
        <label className="glass-1 ml-auto flex h-10 w-[280px] items-center gap-2 rounded-full px-4 text-ink-3 transition-[border-color,box-shadow] focus-within:border-volt focus-within:shadow-glow-volt">
          <RiSearchLine className="size-4" />
          <input aria-label="搜索 Agent 名称" type="search" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索 Agent 名称" className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" />
        </label>
        <Menu
          trigger={<Button variant="secondary" className="h-10"><RiSortDesc className="size-4" />{SORTS.find(s => s.value === sort)?.label}</Button>}
          items={SORTS.map(s => ({ label: s.label, hint: s.value === sort ? '当前' : undefined, onSelect: () => setSort(s.value) }))}
        />
      </Rise>

      {error && <div className="mt-5"><ErrorBar error={error} onRetry={reload} /></div>}

      <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {loading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[196px] rounded-[22px]" />)}
        {!loading && shown.map(a => (
          <SpotlightCard key={a.id} className="cursor-pointer" onClick={() => go(`agents/${a.id}`)}>
            <div className="flex h-full min-h-[196px] flex-col p-5">
              <div className="flex items-start gap-3.5">
                <AgentIcon agent={a} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{a.name}</p>
                  <p className="truncate text-[13px] text-ink-3">{a.role || 'Agent'}</p>
                </div>
                {a.active_config_is_published ? <Badge tone="mint" dot>已发布</Badge> : <Badge>草稿</Badge>}
                <div className="-mt-1 -mr-2"><Menu items={a.created_by === currentUser.id ? actions.items(a) : actions.items(a).filter(item => typeof item !== 'string' && ['复制', '导出 DSL'].includes(String(item.label)))} /></div>
              </div>
              <ResourceVisibility kind="agent" id={a.id} name={a.name} published={!!a.active_config_is_published} />
              <p className="rx-agent-description mt-4 text-[13.5px] leading-relaxed text-ink-2" title={a.description || '添加一句话简介，方便同事和助手知道什么时候用它。'}>
                {a.description || <span className="text-ink-3">添加一句话简介，方便同事和助手知道什么时候用它。</span>}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5 text-[12.5px] text-ink-3">
                <span>{a.author_name ?? '—'}<span className="mx-2">·</span>{fromNow(a.updated_at)}修改</span>
                {!!a.published_reference_count && (
                  <span className="flex items-center gap-1 text-cyan"><RiGitBranchLine className="size-3.5" />{a.published_reference_count} 个应用引用</span>
                )}
              </div>
            </div>
          </SpotlightCard>
        ))}
      </div>

      {!loading && !error && shown.length === 0 && (
        <EmptyState
          icon={<RiRobot2Line className="size-6" />}
          title={rows.length === 0 && !name && !mine ? '还没有 Agent' : '没有符合条件的 Agent'}
          hint={rows.length === 0 && !name && !mine ? '从空白创建一个，或导入其他环境导出的 DSL。' : '换个关键词，或清除筛选条件再试试。'}
          action={rows.length === 0 && !name && !mine ? <Button variant="primary" onClick={onCreate}><RiAddLine className="size-4" />从空白创建</Button> : undefined}
        />
      )}

      {hasMore && !loading && (
        <div className="mt-6 flex justify-center"><Button variant="secondary" loading={more} onClick={loadMore}>加载更多</Button></div>
      )}
      {actions.dialogs}
    </>
  )
}
