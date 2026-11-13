import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getMonitor } from '@/api/stack'
import { Bars, ConsolePage, MetricRow, PageHeader, Section } from '@/components/console'
import { ErrorBar } from '@/components/ui/data'
import { Segmented } from '@/components/ui/segmented'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { StatusStrip } from './status-strip'

/* 调用与监控：我做的智能体、智能体团队、知识库和 Buddy 应用被谁调用、成功率、延迟与错误 */
export function MonitorPage({ go }: { go: (p: string) => void }) {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d')
  const q = useQuery(() => getMonitor(period), [period])
  const d = q.data
  const max = Math.max(1, ...(d?.by_source.map(s => s.calls) ?? [1]))
  return (
    <ConsolePage header={<PageHeader title="调用与监控" desc="SalesBuddy、ProjectBuddy、Web、API 与消息渠道对你所建对象的调用情况。ProjectBuddy 里能做配置，详细状态在这里看。" actions={<Segmented size="small" value={period} onValueChange={setPeriod} aria-label="时间范围" options={[{ value: '24h', label: '24 小时' }, { value: '7d', label: '7 天' }, { value: '30d', label: '30 天' }]} />} />}>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <StatusStrip ids={['orchestrator', 'harness', 'model_gateway', 'kb', 'memory', 'otel']} go={go} />
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        {!d ? <Skeleton className="h-72" /> : (
          <>
            <MetricRow items={[{ label: `调用（${d.period}）`, value: d.calls.toLocaleString() }, { label: '成功率', value: `${d.success}%`, tone: 'volt' }, { label: 'P95 延迟', value: `${(d.p95_ms / 1000).toFixed(1)} 秒` }, { label: '模型用量', value: `${d.tokens} 万 Token` }]} />
            <div className="grid grid-cols-[1fr_1.3fr] gap-5 max-xl:grid-cols-1">
              <Section title="调用来源">
                <div className="space-y-2.5">{d.by_source.map(s => <div key={s.name} className="flex items-center gap-3 text-[13px]"><span className="w-28">{s.name}</span><div className="h-2 flex-1 overflow-hidden rounded bg-press"><div className="h-full bg-volt" style={{ width: `${(s.calls / max) * 100}%` }} /></div><span className="w-16 text-right text-ink-2 tabular-nums">{s.calls.toLocaleString()}</span></div>)}</div>
              </Section>
              <Section title="每日调用（近 7 天）"><Bars data={d.daily} labels={['一', '二', '三', '四', '五', '六', '日']} height={120} /></Section>
            </div>
            <Section title="按对象" bodyClass="p-0">
              <table className="w-full text-[13px]"><thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">对象</th><th className="px-3 font-medium">类型</th><th className="px-3 font-medium">调用</th><th className="px-3 font-medium">成功率</th><th className="px-3 font-medium">P95</th><th className="px-3 font-medium">最近问题</th></tr></thead>
                <tbody>{d.by_object.map(o => <tr key={o.name} className="border-t border-line"><td className="px-5 py-2.5 font-medium">{o.name}</td><td className="px-3"><Badge>{o.kind}</Badge></td><td className="px-3 tabular-nums">{o.calls.toLocaleString()}</td><td className="px-3 tabular-nums">{o.success}%</td><td className="px-3 tabular-nums">{(o.p95_ms / 1000).toFixed(1)} 秒</td><td className="px-3 text-[12.5px] text-amber">{o.last_error ?? '—'}</td></tr>)}</tbody>
              </table>
            </Section>
            <Section title="最近错误" bodyClass="p-0">
              {d.errors.map(e => <div key={e.time} className="flex gap-4 border-t border-line px-5 py-3 text-[13px] first:border-t-0"><span className="w-36 shrink-0 text-ink-3">{new Date(e.time).toLocaleString('zh-CN')}</span><span className="w-28 shrink-0 font-medium">{e.object}</span><Badge>{e.source}</Badge><span className="flex-1 text-ink-2">{e.message}</span></div>)}
            </Section>
          </>
        )}
      </div>
    </ConsolePage>
  )
}
