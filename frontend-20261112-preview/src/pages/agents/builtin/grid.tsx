import type { GroupId } from './meta'
import type { BuddyId, BuiltinAgentItem } from '@/api/agents'
import { RiHistoryLine, RiRobot2Line, RiSearchLine } from '@remixicon/react'
import { useMemo, useState } from 'react'
import { listBuiltinAgents } from '@/api/agents'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { SpotlightCard } from '@/components/ui/effects'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { AgentIcon, dateTime, fromNow } from '../shared'
import { builtinIcon, GROUPS, groupOf, parseName } from './meta'

/** 某个 Buddy 的内置 Agent 卡片网格：搜索 + 业务分组 */
export default function BuiltinGrid({ buddy, go }: { buddy: BuddyId, go: (path: string) => void }) {
  const q = useQuery(() => listBuiltinAgents(buddy), [buddy])
  const [keyword, setKeyword] = useState('')
  const [group, setGroup] = useState<GroupId | 'all'>('all')

  const rows = useMemo(() => (q.data?.data ?? []).map(a => ({ a, p: parseName(a.name), g: groupOf(a.name) })), [q.data])
  const kw = keyword.trim().toLowerCase()
  const shown = rows.filter(r => (group === 'all' || r.g === group) && (!kw || `${r.a.name} ${r.a.role ?? ''} ${r.a.description ?? ''}`.toLowerCase().includes(kw)))
  const groupCount = (id: GroupId) => rows.filter(r => r.g === id).length
  const clear = () => {
    setKeyword('')
    setGroup('all')
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ id: 'all' as const, label: '全部分组' }, ...GROUPS].map((g) => {
            const on = group === g.id
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                onClick={() => setGroup(g.id)}
                className={cn('flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors', on ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')}
              >
                {g.label}
                {g.id !== 'all' && <span className="text-[11.5px] opacity-70 tabular-nums">{groupCount(g.id)}</span>}
              </button>
            )
          })}
        </div>
        <label className="glass-1 ml-auto flex h-10 w-[260px] items-center gap-2 rounded-full px-4 text-ink-3 transition-[border-color,box-shadow] focus-within:border-volt focus-within:shadow-glow-volt">
          <RiSearchLine className="size-4" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索名称、角色或简介" className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" />
        </label>
      </div>

      {q.error && <div className="mt-5"><ErrorBar error={q.error} onRetry={q.reload} /></div>}

      <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {q.loading && !q.data && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[204px] rounded-[22px]" />)}
        {shown.map(({ a, p }) => <BuiltinCard key={a.id} a={a} title={p.title} onOpen={() => go(`agents/${a.id}`)} />)}
      </div>

      {!q.loading && !q.error && shown.length === 0 && (
        rows.length === 0
          ? <EmptyState icon={<RiRobot2Line className="size-6" />} title="还没有内置 Agent" hint="企业服务团队发布后会出现在这里。" />
          : <EmptyState icon={<RiSearchLine className="size-6" />} title="没有符合条件的 Agent" hint="换个关键词，或清除筛选条件再试试。" action={<Button variant="secondary" onClick={clear}>清除筛选</Button>} />
      )}
    </>
  )
}

function BuiltinCard({ a, title, onOpen }: { a: BuiltinAgentItem, title: string, onOpen: () => void }) {
  const version = a.active_config_snapshot?.display_version ?? a.version ?? a.active_config_snapshot?.version
  const label = version != null ? `v${version}` : parseName(a.name).tags.find(t => /^v\d+$/i.test(t))?.toLowerCase()

  return (
    <SpotlightCard
      role="link"
      tabIndex={0}
      className="cursor-pointer"
      onClick={onOpen}
      onKeyDown={e => e.key === 'Enter' && onOpen()}
    >
      <div className="flex h-full min-h-[204px] flex-col p-5">
        <div className="flex items-start gap-3.5">
          <AgentIcon agent={builtinIcon(a)} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15.5px] font-semibold tracking-[-0.01em]" title={a.name}>{title}</p>
            <p className="truncate text-[12.5px] text-ink-3">{a.role || 'Agent'}</p>
          </div>
          {a.active_config_is_published ? <Badge tone="mint" dot>已发布</Badge> : <Badge>未发布</Badge>}
        </div>
        <p className="rx-agent-description mt-3.5 text-[13px] leading-relaxed text-ink-2" title={a.description || '暂无简介'}>
          {a.description || <span className="text-ink-3">暂无简介</span>}
        </p>
        <div className="mt-4 flex items-center gap-1.5 border-t border-line pt-3.5 text-[12px] text-ink-3">
          <Badge tone="cyan" className="h-5 px-2 text-[11.5px] tabular-nums">{label ?? '暂无版本'}</Badge>
          <span className="ml-auto flex items-center gap-1 tabular-nums" title={`最近更新 ${dateTime(a.updated_at)}`}>
            <RiHistoryLine className="size-3.5" />{fromNow(a.updated_at)}更新
          </span>
        </div>
      </div>
    </SpotlightCard>
  )
}
