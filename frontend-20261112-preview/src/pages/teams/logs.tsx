import type { SectionProps } from './detail'
import type { RunsQuery, RunSummary } from '@/api/teams'
import { RiArrowDownLine, RiArrowUpLine, RiErrorWarningLine, RiFileList3Line, RiRefreshLine, RiSearchLine, RiStopFill } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { cancelRun, getRun, isActiveRun, listRuns, runDuration, runReasons, runSources, runStates, runVersion, sourceName } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { CopyField, DataTable, ErrorBar, Pager } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { fieldBase, Select } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { fmtTime, Markdown, StateDot, useDebounced } from './shared'
import { RunTrace } from './trace'

function RunDrawer({ teamId, log, versionOf, onClose, onChanged }: { teamId: string, log: RunSummary | null, versionOf: (sid: string) => number | null, onClose: () => void, onChanged: () => void }) {
  const [view, setView] = useState<'answer' | 'steps'>('answer')
  const [stopping, setStopping] = useState(false)
  const [err, setErr] = useState('')
  const toast = useToast()
  const q = useQuery(() => getRun(teamId, log!.id), [teamId, log?.id], { enabled: !!log })
  const run = q.data && q.data.id === log?.id ? q.data : undefined
  const active = run ? isActiveRun(run.state) : !!log && isActiveRun(log.state)
  useEffect(() => {
    if (!log || !active)
      return
    const t = setInterval(q.refresh, 2000)
    return () => clearInterval(t)
  }, [log?.id, active]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setView('answer'); setErr('') }, [log?.id])
  const stop = async () => {
    if (!log)
      return
    setStopping(true)
    setErr('')
    try {
      await cancelRun(teamId, log.id)
      toast('已请求停止任务', 'info')
      onChanged()
    }
    catch {
      setErr('停止请求未确认，请刷新查看任务状态后再操作。')
    }
    finally {
      await q.refresh()
      setStopping(false)
    }
  }
  const state = run?.state ?? log?.state ?? 'queued'
  return (
    <Drawer
      open={!!log}
      onClose={onClose}
      title={log && (
        <div className="space-y-2">
          <p className="text-[12px] text-ink-3">任务 ID</p>
          <CopyField value={log.id} mono className="h-8" />
        </div>
      )}
      footer={active && <Button variant="secondary" tone="destructive" loading={stopping} disabled={run?.cancelled} onClick={stop}><RiStopFill className="size-4" />{run?.cancelled ? '正在停止…' : '停止任务'}</Button>}
    >
      {log && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-2xl border border-line bg-hover p-3.5 text-[12.5px]">
            {([
              ['状态', <StateDot key="s" state={state} />],
              ['来源', sourceName(log.source)],
              ['版本', runVersion({ ...log, published_version: log.published_version ?? versionOf(log.snapshot_id) })],
              ['总耗时', runDuration(run ?? log)],
              ['创建时间', fmtTime(log.created_at, true)],
              ['结束时间', fmtTime(run?.finished_at ?? log.finished_at, true)],
            ] as const).map(([k, v]) => <div key={k}><p className="text-ink-3">{k}</p><div className="mt-0.5 text-ink">{v}</div></div>)}
          </div>
          {err && <ErrorBar error={new Error(err)} />}
          <Segmented<'answer' | 'steps'> size="small" value={view} onValueChange={setView} aria-label="详情视图" options={[{ value: 'answer', label: '对话结果' }, { value: 'steps', label: `执行过程（${run?.steps.length ?? '…'}）` }]} />
          {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
          {!run
            ? <Skeleton className="h-40" />
            : view === 'answer'
              ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-volt-soft px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap">{run.query}</div>
                    <div className="rounded-2xl border border-line px-4 py-3">
                      {run.answer
                        ? <Markdown text={run.answer} />
                        : active
                          ? <p className="text-[13px] text-ink-2">{run.cancelled ? '正在停止任务…' : '团队正在协作，完成后显示最终答复。'}</p>
                          : <p className="flex items-center gap-2 text-[13px] text-rose"><RiErrorWarningLine className="size-4" />{runReasons[run.error_code] ?? `任务${runStates[run.state]}`}</p>}
                    </div>
                  </div>
                )
              : <RunTrace run={run} maxCols={2} />}
        </div>
      )}
    </Drawer>
  )
}

type Sort = `${'created_at' | 'finished_at'}:${'asc' | 'desc'}`

export function TeamLogs({ team }: SectionProps) {
  const [period, setPeriod] = useState<RunsQuery['period']>('last7days')
  const [source, setSource] = useState('all')
  const [state, setState] = useState('all')
  const [keyword, setKeyword] = useState('')
  const kw = useDebounced(keyword.trim().slice(0, 200))
  const [sort, setSort] = useState<Sort>('created_at:desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [selected, setSelected] = useState<RunSummary | null>(null)
  const [by, order] = sort.split(':') as [RunsQuery['sort_by'], RunsQuery['sort_order']]
  useEffect(() => setPage(1), [period, source, state, kw, sort, limit])
  const q = useQuery(() => listRuns(team.id, { period, source, state, keyword: kw, page, limit, sort_by: by, sort_order: order }), [team.id, period, source, state, kw, page, limit, sort], { pollMs: 5000 })
  const versionOf = (sid: string) => team.versions?.find(v => v.id === sid)?.version ?? null
  const filtered = source !== 'all' || state !== 'all' || !!kw || period !== 'last7days'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<RunsQuery['period']> size="small" value={period} onValueChange={setPeriod} aria-label="时间范围" options={[{ value: 'last7days', label: '最近 7 天' }, { value: 'last30days', label: '最近 30 天' }, { value: 'allTime', label: '全部时间' }]} />
        <Select size="sm" className="w-36" value={source} onValueChange={setSource} options={[{ value: 'all', label: '全部来源' }, ...runSources.map(s => ({ value: s.value, label: s.name }))]} />
        <Select size="sm" className="w-32" value={state} onValueChange={setState} options={[{ value: 'all', label: '全部状态' }, ...Object.entries(runStates).map(([value, label]) => ({ value, label }))]} />
        <div className="relative w-56">
          <RiSearchLine className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <input aria-label="搜索任务内容或 ID" value={keyword} maxLength={200} onChange={e => setKeyword(e.target.value)} placeholder="搜索任务内容或 ID" className={cn(fieldBase, 'h-9 rounded-full pl-9 text-[13px]')} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select<Sort> size="sm" className="w-40" value={sort} onValueChange={setSort} options={[{ value: 'created_at:desc', label: '创建时间 · 新→旧' }, { value: 'created_at:asc', label: '创建时间 · 旧→新' }, { value: 'finished_at:desc', label: '结束时间 · 新→旧' }, { value: 'finished_at:asc', label: '结束时间 · 旧→新' }]} />
          <span className="flex items-center gap-1 text-[11.5px] text-ink-3">{order === 'desc' ? <RiArrowDownLine className="size-3.5" /> : <RiArrowUpLine className="size-3.5" />}每 5 秒刷新</span>
          <Button size="icon" variant="ghost" aria-label="刷新运行日志" onClick={q.reload}><RiRefreshLine className="size-4" /></Button>
        </div>
      </div>
      {q.error && <ErrorBar error={new Error(`日志加载失败${q.data ? '，当前显示上次获取的记录' : ''}`)} onRetry={q.reload} />}
      <DataTable
        rows={q.data?.runs ?? []}
        rowKey={r => r.id}
        loading={q.loading && !q.data}
        activeKey={selected?.id}
        onRowClick={setSelected}
        empty={(
          <span className="flex flex-col items-center gap-2">
            <RiFileList3Line className="size-6 text-ink-3" />
            {filtered ? '没有符合条件的任务，试试放宽筛选条件' : '还没有任务记录。在「运行」里发起一次对话试试'}
          </span>
        )}
        columns={[
          { key: 'q', title: '标题', render: r => <span className="block truncate" title={r.query}>{r.query}</span> },
          { key: 'src', title: '来源', width: '110px', render: r => <span className="text-[12.5px] text-ink-2">{sourceName(r.source)}</span> },
          { key: 'st', title: '状态', width: '96px', render: r => <StateDot state={r.state} /> },
          { key: 'ex', title: 'Agent 调用', width: '76px', align: 'right', render: r => <span className="tabular-nums">{r.expert_calls}</span> },
          { key: 'd', title: '总耗时', width: '84px', align: 'right', render: r => <span className="text-ink-2 tabular-nums">{runDuration(r)}</span> },
          { key: 'c', title: '创建时间', width: '136px', render: r => <span className="text-[12.5px] text-ink-2 tabular-nums">{fmtTime(r.created_at)}</span> },
          { key: 'f', title: '结束时间', width: '136px', render: r => <span className="text-[12.5px] text-ink-3 tabular-nums">{fmtTime(r.finished_at)}</span> },
        ]}
      />
      <div className="flex items-center gap-3">
        <div className="flex-1"><Pager page={page} total={q.data?.total ?? 0} limit={limit} onPage={setPage} /></div>
        <Select<string> size="sm" className="w-28" value={String(limit)} onValueChange={v => setLimit(Number(v))} options={[10, 25, 50].map(n => ({ value: String(n), label: `${n} 条/页` }))} />
      </div>
      <RunDrawer teamId={team.id} log={selected} versionOf={versionOf} onClose={() => setSelected(null)} onChanged={q.refresh} />
    </div>
  )
}
