import { GrowthInsights } from './growth-insights'
import { useState } from 'react'
import { ConsolePage, PageHeader, Section } from '@/components/console'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/form'
import { cases } from './optimization-data'
import type { TaskCase } from './optimization-data'
import { MemoryVault } from './memory-vault'

const tabs = [{ id: 'overview', label: '看板' }, { id: 'memory', label: '梦境与记忆' }]
export default function TuneModule({ param, go }: { param?: string, go: (p: string) => void }) {
  const tab = param === 'memory' ? 'memory' : 'overview'
  const [days, setDays] = useState(7)
  const [selected, setSelected] = useState<TaskCase | null>(null)
  const samples = cases.filter(c => c.day <= days)
  const completed = samples.filter(c => c.result === '完成').length
  const used = samples.filter(c => c.used).length
  const rate = samples.length ? Math.round(completed / samples.length * 100) : 0
  return <ConsolePage header={<PageHeader title="助手成长" desc="查看助手的任务表现，通过梦境沉淀经验，管理长期记忆。" tabs={tabs} tab={tab} onTab={t => go(t === 'overview' ? 'tune' : 'tune/memory')} />}>
    {tab === 'memory' ? <MemoryVault /> : <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">任务概览</h2><p className="mt-1 text-xs text-ink-3">了解助手创建 Agent、组织群聊的完成情况与使用情况。</p></div><Select aria-label="统计时间范围" value={String(days)} onValueChange={v => setDays(Number(v))} size="sm" className="w-[132px] shrink-0" options={[{value:'7',label:'最近 7 天'},{value:'30',label:'最近 30 天'}]} /></div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[['创建任务', String(samples.length), '所选时间内的创建任务'], ['一次通过', String(completed), '配置与试运行无需返工'], ['一次通过率', `${rate}%`, '一次通过任务占全部任务的比例'], ['创建后已使用', String(used), '创建后至少使用过一次']].map(([label,value,hint]) => <div key={label} className="rounded-lg border border-line bg-solid p-5"><p className="text-xs text-ink-2">{label}</p><p className="my-2 text-[28px] font-semibold tabular-nums">{value}</p><p className="text-xs text-ink-3">{hint}</p></div>)}</div>
      <GrowthInsights samples={samples} days={days} go={go} />
      <Section title="最近创建任务" desc="查看任务结果及创建后的使用情况。"><div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-xs"><thead className="border-b border-line bg-hover text-ink-3"><tr>{['任务','类型','验收结果','使用情况','操作'].map(h => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{samples.map(c => <tr key={c.id} className="border-b border-line last:border-0"><td className="px-3 py-3"><p className="font-medium">{c.title}</p><p className="mt-1 text-[11px] text-ink-3">{c.day} 天前</p></td><td className="px-3">{c.kind}</td><td className="px-3"><Badge tone={c.result === '完成' ? 'mint' : 'amber'}>{c.result === '完成' ? '一次通过' : '需调整'}</Badge></td><td className="px-3 text-ink-2">{c.used ? '已使用' : '尚未使用'}</td><td className="px-3"><Button size="small" variant="ghost" onClick={() => setSelected(c)}>查看详情</Button></td></tr>)}</tbody></table></div><p className="mt-3 text-[11px] text-ink-3">当前展示示例任务，统计随时间范围筛选变化。</p></Section>
    </div>}
    <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)} title={selected?.title || '任务详情'} size="lg" footer={<Button onClick={() => setSelected(null)}>关闭</Button>}>
      {selected && <div className="space-y-4"><div className="flex gap-2"><Badge>{selected.kind}</Badge><Badge tone={selected.result === '完成' ? 'mint' : 'amber'}>{selected.result === '完成' ? '一次通过' : '需调整'}</Badge></div>{[['任务目标',selected.expected],['执行结果',selected.actual]].map(([label,text]) => <div key={label}><p className="mb-1 text-xs text-ink-3">{label}</p><p className="text-sm leading-6">{text}</p></div>)}<div className="rounded-lg bg-hover p-3 text-xs leading-7">{selected.steps.map((step,i) => <p key={step}>{i+1}. {step}</p>)}</div></div>}
    </Dialog>
  </ConsolePage>
}
