import type { SectionProps } from './detail'
import type { Metrics, Statistics } from '@/api/teams'
import { RiInformationLine, RiRefreshLine } from '@remixicon/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getStatistics, runSources } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { fieldBase, Select } from '@/components/ui/form'
import { Panel, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { dayStr } from './shared'

type Range = 'today' | '7d' | '30d' | 'custom'
type Metric = { key: keyof Metrics, title: string, explain: string, unit?: string, kind: 'bar' | 'line', max?: number }
const METRICS: Metric[] = [
  { key: 'total', title: '全部任务数', kind: 'bar', explain: '按创建时间统计所选范围内的全部任务，含排队、运行、完成、失败和取消。' },
  { key: 'success_rate', title: '任务成功率', kind: 'line', unit: '%', max: 100, explain: '成功 ÷ 已结束（成功、失败、超时、中断），不含排队、运行中及主动取消。' },
  { key: 'avg_latency', title: '平均响应时间', kind: 'line', unit: '秒', explain: '成功任务从提交到完成的平均耗时，含排队、团长规划、Agent 执行和汇总。' },
  { key: 'avg_queue', title: '平均排队时间', kind: 'line', unit: '秒', explain: '已开始执行的任务从提交到开始的平均等待时间。' },
  { key: 'expert_calls', title: 'Agent 调用次数', kind: 'bar', explain: '已发起的 Agent 调用次数，含失败调用，不含团长的规划和汇总。' },
  { key: 'total_tokens', title: 'Token 用量', kind: 'bar', unit: 'Tokens', explain: '团长和参与 Agent 消息记录的输入与输出 Token 合计；未上报用量的调用不计入。' },
]
const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('zh-CN', { maximumFractionDigits: 1 }))

function Chart({ metric, data }: { metric: Metric, data: Statistics }) {
  const [hover, setHover] = useState<number | null>(null)
  const rows = data.daily.map(d => ({ date: d.date, v: d[metric.key] as number | null }))
  const Wd = 520
  const Ht = 150
  const pad = { l: 8, r: 8, t: 10, b: 22 }
  const max = metric.max ?? Math.max(1, ...rows.map(r => r.v ?? 0)) * 1.15
  const n = rows.length
  const step = (Wd - pad.l - pad.r) / Math.max(1, n)
  const x = (i: number) => pad.l + step * i + step / 2
  const y = (v: number) => pad.t + (Ht - pad.t - pad.b) * (1 - v / max)
  const pts = rows.map((r, i) => (r.v == null ? null : [x(i), y(r.v)] as const)).filter(Boolean) as (readonly [number, number])[]
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
  const area = pts.length ? `${line} L${pts.at(-1)![0]},${Ht - pad.b} L${pts[0][0]},${Ht - pad.b} Z` : ''
  const color = metric.kind === 'bar' ? 'var(--cyan)' : 'var(--volt)'
  const labelEvery = Math.ceil(n / 7)
  const value = data.summary[metric.key] as number | null
  return (
    <Panel level={2} radius="lg" className="p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-[13px] text-ink-2">{metric.title}</p>
        <Tip label={metric.explain}><span className="cursor-help text-ink-3"><RiInformationLine className="size-3.5" /></span></Tip>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cn('text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums', !value && 'text-ink-3')}>{fmt(value)}</span>
        {metric.unit && value != null && <span className="text-[12.5px] text-ink-3">{metric.unit}</span>}
        {metric.key === 'total_tokens' && data.summary.model_calls > 0 && <span className="ml-auto text-[11.5px] text-ink-3">已记录 {data.summary.recorded_calls} / {data.summary.model_calls} 次调用</span>}
      </div>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${Wd} ${Ht}`} className="h-[150px] w-full overflow-visible" onMouseLeave={() => setHover(null)} role="img" aria-label={`${metric.title}每日趋势`}>
          {[0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={pad.l} x2={Wd - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeDasharray="3 5" />)}
          <line x1={pad.l} x2={Wd - pad.r} y1={Ht - pad.b} y2={Ht - pad.b} stroke="var(--line-strong)" />
          {metric.kind === 'bar'
            ? rows.map((r, i) => r.v != null && r.v > 0 && (
                <rect key={r.date} x={x(i) - Math.min(18, step * 0.32)} width={Math.min(36, step * 0.64)} y={y(r.v)} height={Ht - pad.b - y(r.v)} rx={Math.min(5, step * 0.15)} fill={color} opacity={hover === null || hover === i ? 0.9 : 0.4} style={{ transition: 'opacity .2s' }} />
              ))
            : (
                <>
                  <path d={area} fill={color} opacity={0.12} />
                  <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px var(--volt))' }} />
                  {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={n <= 7 ? 3.5 : 2.5} fill="var(--solid)" stroke={color} strokeWidth={2} />)}
                </>
              )}
          {rows.map((r, i) => (i % labelEvery === 0 || n === 1) && <text key={r.date} x={x(i)} y={Ht - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{r.date.slice(5)}</text>)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={Ht - pad.b} stroke="var(--ink-3)" strokeDasharray="2 3" />}
          {rows.map((r, i) => <rect key={`h${r.date}`} x={pad.l + step * i} y={0} width={step} height={Ht} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        </svg>
        {hover !== null && rows[hover] && (
          <div className="glass-3 pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-float" style={{ left: `${(x(hover) / Wd) * 100}%` }}>
            <span className="text-ink-3">{rows[hover].date}</span>
            <span className="ml-2 font-semibold tabular-nums">{rows[hover].v == null ? '暂无数据' : `${fmt(rows[hover].v)} ${metric.unit ?? ''}`}</span>
          </div>
        )}
      </div>
    </Panel>
  )
}

export function TeamMonitoring({ team }: SectionProps) {
  const today = dayStr(new Date())
  const daysAgo = (n: number) => dayStr(new Date(Date.now() - n * 86400000))
  const [range, setRange] = useState<Range>('7d')
  const [custom, setCustom] = useState({ start: daysAgo(13), end: today })
  const [source, setSource] = useState('all')
  const span = range === 'today' ? { start: today, end: today } : range === '7d' ? { start: daysAgo(6), end: today } : range === '30d' ? { start: daysAgo(29), end: today } : custom
  const tooLong = (new Date(span.end).getTime() - new Date(span.start).getTime()) / 86400000 > 30 || span.start > span.end
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const q = useQuery(() => getStatistics(team.id, { ...span, timezone, source }), [team.id, span.start, span.end, source], { pollMs: 15000, enabled: !tooLong })
  const s = q.data?.summary
  const strip = s && [
    ['已完成', s.succeeded, 'bg-mint'],
    ['排队中', s.queued, 'bg-amber'],
    ['执行中', s.running, 'bg-volt'],
    ['失败 / 超时 / 中断', s.failed + s.timed_out + s.interrupted, 'bg-rose'],
    ['已取消', s.cancelled, 'bg-ink-3'],
  ] as const

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto px-6 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Range> size="small" value={range} onValueChange={setRange} aria-label="时间范围" options={[{ value: 'today', label: '今天' }, { value: '7d', label: '7 天' }, { value: '30d', label: '30 天' }, { value: 'custom', label: '自定义' }]} />
        {range === 'custom' && (
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <input type="date" aria-label="开始日期" value={custom.start} max={custom.end} onChange={e => setCustom(c => ({ ...c, start: e.target.value }))} className={cn(fieldBase, 'h-9 w-auto rounded-full px-3 text-[12.5px]')} />
            至
            <input type="date" aria-label="结束日期" value={custom.end} max={today} onChange={e => setCustom(c => ({ ...c, end: e.target.value }))} className={cn(fieldBase, 'h-9 w-auto rounded-full px-3 text-[12.5px]')} />
          </div>
        )}
        <Select size="sm" className="w-40" value={source} onValueChange={setSource} options={[{ value: 'all', label: '全部来源' }, ...runSources.map(x => ({ value: x.value, label: x.name }))]} />
        <span className="ml-auto text-[11.5px] text-ink-3">{timezone} · 每 15 秒刷新</span>
        <Button size="small" variant="ghost" onClick={q.reload} disabled={tooLong}><RiRefreshLine className="size-3.5" />刷新</Button>
      </div>
      {tooLong && <ErrorBar error={new Error('时间范围最多 30 天，且开始日期不能晚于结束日期')} />}
      {q.error && <ErrorBar error={new Error(`监控数据加载失败${q.data ? '，当前显示上次成功获取的数据' : ''}`)} onRetry={q.reload} />}
      <div className="flex flex-wrap items-center gap-2">
        {strip
          ? strip.map(([k, v, c]) => (
              <span key={k} className="glass-2 flex h-9 items-center gap-2 rounded-full px-3.5 text-[12.5px] text-ink-2">
                <i className={cn('size-1.5 rounded-full', c)} />{k}<b className="text-ink tabular-nums">{v}</b>
              </span>
            ))
          : [0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-28 rounded-full" />)}
        {s?.total === 0 && <span className="text-[12.5px] text-ink-3">所选范围内暂无任务</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {q.data && !tooLong
          ? METRICS.map(m => <Chart key={m.key} metric={m} data={q.data!} />)
          : METRICS.map(m => <Skeleton key={m.key} className="h-[252px] rounded-[22px]" />)}
      </div>
    </div>
  )
}
