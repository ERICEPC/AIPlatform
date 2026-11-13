import type { AgentCtx } from './detail'
import type { StatCharts, StatPoint } from '@/api/agents'
import { useState } from 'react'
import { getStatistics, listLogSources } from '@/api/agents'
import { useQuery } from '@/api/hooks'
import { SectionHeader } from '@/components/detail-shell'
import { Page, Rise } from '@/components/page'
import { ErrorBar } from '@/components/ui/data'
import { CountUp } from '@/components/ui/effects'
import { Select } from '@/components/ui/form'
import { Panel, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { AreaChart } from './charts'
import { rangeOf, calendarRange } from '@/lib/log-date-range'

type Range = 'today' | '7' | '30' | 'custom'

const CHARTS: { key: keyof StatCharts, title: string, desc: string, tone: 'volt' | 'cyan', fmt?: (v: number) => string }[] = [
  { key: 'daily_messages', title: '全部消息数', desc: '每天用户发出的消息', tone: 'volt' },
  { key: 'daily_end_users', title: '活跃用户数', desc: '每天至少对话一次的用户', tone: 'cyan' },
  { key: 'average_session_interactions', title: '平均会话互动数', desc: '每个会话的来回轮数', tone: 'volt', fmt: v => v.toFixed(1) },
  { key: 'tokens_per_second', title: 'Token 输出速度', desc: '每秒输出的 token 数', tone: 'cyan', fmt: v => `${v.toFixed(1)}/秒` },
  { key: 'user_satisfaction_rate', title: '用户满意度', desc: '点赞数占有反馈消息的比例', tone: 'volt', fmt: v => `${(v * 100).toFixed(1)}%` },
  { key: 'token_usage', title: 'Token 消耗', desc: '每天输入 + 输出的 token 总量', tone: 'cyan', fmt: v => `${(v / 1000).toFixed(1)}K` },
]

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function MonitoringSection({ ctx }: { ctx: AgentCtx }) {
  const id = ctx.agent.id
  const [range, setRange] = useState<Range>('7')
  const [custom, setCustom] = useState({ from: dayStr(new Date(Date.now() - 13 * 86400000)), to: dayStr(new Date()) })
  const [source, setSource] = useState('all')
  const src = useQuery(() => listLogSources(id), [id])

  const r = range === 'today' ? rangeOf(1) : range === 'custom' ? calendarRange(custom.from, custom.to) : rangeOf(Number(range))
  const q = useQuery(() => getStatistics(id, { ...r, source: source === 'all' ? undefined : source }), [id, r.start, r.end, source])
  const s = q.data?.summary

  const kpis = s && [
    { label: '全部消息', value: <CountUp value={s.total_messages} />, sub: `${s.total_conversations.toLocaleString('zh-CN')} 个会话` },
    { label: '活跃用户', value: <CountUp value={s.total_end_users} />, sub: `平均每会话 ${s.average_session_interactions} 轮` },
    { label: '用户满意度', value: <CountUp value={s.user_satisfaction_rate * 100} decimals={1} suffix="%" />, sub: '按点赞 / 点踩统计' },
    { label: '平均响应', value: <><CountUp value={s.average_response_time} decimals={2} /><span className="ml-1 text-[15px] text-ink-3">秒</span></>, sub: `输出 ${s.tokens_per_second} token/秒` },
    { label: 'Token 消耗', value: <><CountUp value={s.total_tokens / 10000} decimals={1} /><span className="ml-1 text-[15px] text-ink-3">万</span></>, sub: `约 ¥${s.total_price}` },
  ]

  return (
    <Page className="overflow-auto">
      <div className="space-y-5 px-8 pt-8 pb-16">
        <Rise><SectionHeader title="监控" desc="线上使用情况。预览对话不计入统计。" /></Rise>
        <Rise className="flex flex-wrap items-center gap-2.5">
          <Segmented value={range} onValueChange={setRange} options={[{ value: 'today', label: '今天' }, { value: '7', label: '最近 7 天' }, { value: '30', label: '最近 30 天' }, { value: 'custom', label: '自定义' }]} />
          {range === 'custom' && (
            <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <input type="date" aria-label="开始日期" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="h-9 rounded-full border border-line-strong bg-hover px-3 text-[13px] text-ink outline-none focus:border-volt" />
              至
              <input type="date" aria-label="结束日期" value={custom.to} min={custom.from} max={dayStr(new Date())} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="h-9 rounded-full border border-line-strong bg-hover px-3 text-[13px] text-ink outline-none focus:border-volt" />
            </div>
          )}
          <Select size="sm" className="ml-auto w-[220px]" value={source} onValueChange={setSource} options={[{ value: 'all', label: '全部来源' }, ...(src.data?.data ?? []).map(x => ({ value: x.id, label: x.type === 'webapp' ? 'Web 应用' : x.app_name, hint: x.type === 'workflow' ? '应用' : undefined }))]} />
        </Rise>

        <ErrorBar error={q.error} onRetry={q.reload} />

        <Rise className="grid grid-cols-5 gap-3">
          {!kpis && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-[20px]" />)}
          {kpis?.map((k, i) => (
            <Panel key={k.label} level={2} glow={i === 0 ? 'volt' : 'none'} className="p-4">
              <p className="text-[12.5px] text-ink-2">{k.label}</p>
              <p className="mt-1.5 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{k.value}</p>
              <p className="mt-2 text-[12px] text-ink-3">{k.sub}</p>
            </Panel>
          ))}
        </Rise>

        {!ctx.publish.everPublished && s && (
          <p className="rounded-2xl border border-line px-4 py-3 text-[13px] text-ink-3">还没有发布，统计数据会在发布并开启访问后开始积累。</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {CHARTS.map(c => (
            <Rise key={c.key}>
              <Panel level={2} className="p-5">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[14px] font-semibold">{c.title}</p>
                    <p className="text-[12px] text-ink-3">{c.desc}</p>
                  </div>
                  {q.data && <Latest data={q.data.charts[c.key] ?? []} fmt={c.fmt} />}
                </div>
                {q.loading && !q.data ? <Skeleton className="h-[150px]" /> : <AreaChart data={q.data?.charts[c.key] ?? []} tone={c.tone} format={c.fmt} />}
              </Panel>
            </Rise>
          ))}
        </div>
      </div>
    </Page>
  )
}

function Latest({ data, fmt = v => v.toLocaleString('zh-CN') }: { data: StatPoint[], fmt?: (v: number) => string }) {
  const last = data.at(-1)
  return last ? <p className="text-right"><span className="block text-[18px] font-semibold tabular-nums">{fmt(last.value)}</span><span className="text-[11.5px] text-ink-3">{last.date}</span></p> : null
}
