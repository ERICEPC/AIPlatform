import type { TeamAgent } from './agent-source'
import type { Team } from '@/api/teams'
import { RiAddLine, RiSearchLine, RiTeamLine, RiUserLine } from '@remixicon/react'
import { useMemo, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listTeams, splitGoal } from '@/api/teams'
import { Page, Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { CountUp, SpotlightCard } from '@/components/ui/effects'
import { fieldBase, Select } from '@/components/ui/form'
import { Menu } from '@/components/ui/menu'
import { Badge, EmptyState, Panel, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { useAgentSource } from './agent-source'
import { ConflictBanner, CURRENT_USER, fmtAgo, TeamAvatar, useDebounced } from './shared'
import { CreateTeamDialog, LineUp, useTeamActions } from './team-dialogs'

type Filter = 'all' | 'published' | 'drafts'
type Sort = 'last_modified' | 'recently_created' | 'earliest_created'

function TeamCard({ team, resolve, go, onChanged, onConflict }: { team: Team, resolve: (id: string) => TeamAgent, go: (p: string) => void, onChanged: () => void, onConflict: (m: string) => void }) {
  const { items, dialogs } = useTeamActions(team, { onChanged, onConflict })
  const c = team.config
  return (
    <>
      <SpotlightCard className="cursor-pointer" onClick={() => go(`teams/${team.id}`)}>
        <div className="flex h-full min-h-[214px] flex-col p-5">
          <div className="flex items-start gap-3">
            <TeamAvatar value={c.avatar} name={team.name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16.5px] font-semibold tracking-[-0.01em]">{team.name}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">{c.members.length} 个 Agent · {fmtAgo(team.updated_at)}更新</p>
            </div>
            {team.published_id ? <Badge tone="mint" dot>已发布 v{team.published_version}</Badge> : <Badge>草稿</Badge>}
            <span onClick={e => e.stopPropagation()}><Menu items={items} /></span>
          </div>
          <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{c.description || splitGoal(c.goal)[0]}</p>
          <div className="mt-auto pt-5"><LineUp config={c} resolve={resolve} /></div>
        </div>
      </SpotlightCard>
      {dialogs}
    </>
  )
}

export function TeamsList({ go }: { go: (path: string) => void }) {
  const q = useQuery(listTeams, [])
  const [filter, setFilter] = useState<Filter>('all')
  const [keyword, setKeyword] = useState('')
  const kw = useDebounced(keyword.trim().toLowerCase())
  const [mine, setMine] = useState(false)
  const [sort, setSort] = useState<Sort>('last_modified')
  const [creating, setCreating] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const teams = q.data?.teams ?? []
  const agents = useMemo(() => q.data?.agents ?? [], [q.data])
  const src = useAgentSource(agents)
  const published = teams.filter(t => t.published_id).length
  const visible = useMemo(() => teams
    .filter(t => (filter === 'all' || (filter === 'published' ? !!t.published_id : !t.published_id)) && (!kw || t.name.toLowerCase().includes(kw)) && (!mine || t.created_by === CURRENT_USER))
    .sort((a, b) => (sort === 'last_modified' ? b.updated_at - a.updated_at : sort === 'recently_created' ? b.created_at - a.created_at : a.created_at - b.created_at) || a.id.localeCompare(b.id)), [teams, filter, kw, mine, sort])
  const noAgents = !q.loading && !agents.length
  const createBtn = (
    <Button variant="primary" disabled={q.loading || noAgents} onClick={() => setCreating(true)}><RiAddLine className="size-[18px]" />新建团队</Button>
  )

  return (
    <Page className="overflow-auto">
      <ConflictBanner message={conflict} onClose={() => setConflict(null)} onRefresh={q.reload} />
      <div className="px-10 pt-10 pb-16">
        <Rise className="flex items-end gap-4">
          <div>
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.035em]">Agent Teams</h1>
            <p className="mt-3 text-[14.5px] text-ink-2">选一位团长和几个已发布的 Agent，写清任务；团长按需请它们参与，汇总成一份答复。</p>
          </div>
          <div className="mb-0.5 ml-auto">
            {noAgents ? <Tip label="当前工作空间还没有已发布的 Agent，请先创建并发布 Agent"><span>{createBtn}</span></Tip> : createBtn}
          </div>
        </Rise>

        <Rise className="mt-8 grid grid-cols-3 gap-3">
          {([['团队', teams.length, '支'], ['已发布', published, '支'], ['可用 Agent', agents.length, '个']] as const).map(([k, v, u]) => (
            <Panel key={k} level={2} radius="lg" className="p-5">
              <p className="text-[13px] text-ink-2">{k}</p>
              <div className="mt-2 text-[36px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{q.loading ? <Skeleton className="h-9 w-16" /> : <><CountUp value={v} /><span className="ml-1 text-[16px] text-ink-3">{u}</span></>}</div>
            </Panel>
          ))}
        </Rise>

        <Rise className="mt-6 flex flex-wrap items-center gap-2">
          <Segmented<Filter> value={filter} onValueChange={setFilter} aria-label="发布状态" options={[{ value: 'all', label: '全部', count: teams.length }, { value: 'published', label: '已发布', count: published }, { value: 'drafts', label: '草稿', count: teams.length - published }]} />
          <div className="relative ml-auto w-60">
            <RiSearchLine className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <input aria-label="搜索团队" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索团队名称" className={cn(fieldBase, 'h-9 rounded-full pl-9 text-[13px]')} />
          </div>
          <button type="button" aria-pressed={mine} onClick={() => setMine(v => !v)} className={cn('flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors', mine ? 'border-volt bg-volt-soft text-volt-text' : 'border-line-strong text-ink-2 hover:bg-hover')}>
            <RiUserLine className="size-4" />我创建的
          </button>
          <Select<Sort> size="sm" className="w-32" value={sort} onValueChange={setSort} options={[{ value: 'last_modified', label: '最近修改' }, { value: 'recently_created', label: '最近创建' }, { value: 'earliest_created', label: '最早创建' }]} />
        </Rise>

        <div className="mt-4"><ErrorBar error={q.error} onRetry={q.reload} /></div>

        {q.loading
          ? <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[214px] rounded-[22px]" />)}</div>
          : !teams.length
              ? (
                  <EmptyState
                    icon={<RiTeamLine className="size-6" />}
                    title="组建你的第一个 Agent 团队"
                    hint={noAgents ? '当前工作空间还没有已发布的 Agent，请先到 Agents 创建并发布。' : '例如：团长「售前协调者」＋ 需求分析、方案撰写、报价测算三个 Agent，一起出售前方案包。'}
                    action={noAgents ? <Button onClick={() => go('agents')}>去发布 Agent</Button> : createBtn}
                  />
                )
              : !visible.length
                  ? <EmptyState icon={<RiSearchLine className="size-6" />} title="没有符合条件的团队" hint="换个关键词，或清除筛选条件。" action={<Button onClick={() => { setFilter('all'); setKeyword(''); setMine(false) }}>清除筛选</Button>} />
                  : (
                      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
                        {visible.map(t => <TeamCard key={t.id} team={t} resolve={src.resolve} go={go} onChanged={q.refresh} onConflict={setConflict} />)}
                      </div>
                    )}
      </div>
      <CreateTeamDialog open={creating} onOpenChange={setCreating} agents={src.candidates} onCreated={(t) => { setCreating(false); go(`teams/${t.id}`) }} />
    </Page>
  )
}
