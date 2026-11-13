import { Select } from '@base-ui/react/select'
import { RiArrowDownSLine, RiCheckLine, RiFilter3Line } from '@remixicon/react'
import { cn } from '@/lib/cn'
import type { ReleaseState } from '@/api/releases'
type Status = ReleaseState | 'all'
type Option = { value: Status, label: string, count: number }
const dots: Record<Status,string> = { all:'bg-ink-3', draft:'bg-slate-300', pending:'bg-amber-400', approved:'bg-blue-500', returned:'bg-orange-400', rejected:'bg-rose-400', withdrawn:'bg-slate-400' }
export function ReleaseStatusFilter({ value, options, onChange }: { value: Status, options: Option[], onChange: (v: Status) => void }) {
  const current = options.find(o => o.value === value)!
  return <Select.Root value={value} onValueChange={v => v && onChange(v as Status)}>
    <Select.Trigger aria-label="按审批状态筛选" className="flex h-8 min-w-[174px] cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-solid px-3 text-xs text-ink-2 outline-none transition-colors hover:border-volt/40 focus-visible:ring-2 focus-visible:ring-volt-soft data-popup-open:border-volt/40">
      <RiFilter3Line className="size-3.5 text-ink-3" /><span className="flex-1 text-left">{current.label}</span><span className="rounded bg-hover px-1.5 py-0.5 text-[10px] tabular-nums text-ink-3">{current.count}</span><RiArrowDownSLine className="size-3.5 text-ink-3" />
    </Select.Trigger>
    <Select.Portal><Select.Positioner align="end" sideOffset={6} alignItemWithTrigger={false} className="z-[76]"><Select.Popup className="w-[218px] overflow-hidden rounded-xl border border-line bg-solid p-1.5 shadow-float outline-none">
      <div className="px-2.5 pb-2 pt-1.5 text-[10px] font-medium tracking-wide text-ink-3">按审批状态筛选</div>
      {options.map((o,i) => <div key={o.value}>{i === 1 && <div className="mx-2 my-1 h-px bg-line" />}<Select.Item value={o.value} className={cn('flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-xs outline-none transition-colors data-highlighted:bg-hover',value === o.value ? 'bg-volt-soft/60 text-volt-text' : 'text-ink-2')}>
        <span className={cn('size-1.5 shrink-0 rounded-full',dots[o.value])} /><Select.ItemText className="flex-1">{o.label}</Select.ItemText><span className={cn('min-w-5 rounded px-1 text-center text-[10px] tabular-nums',value === o.value ? 'bg-volt-soft text-volt-text' : 'bg-hover text-ink-3')}>{o.count}</span><span className="w-3.5"><Select.ItemIndicator><RiCheckLine className="size-3.5 text-volt-text" /></Select.ItemIndicator></span>
      </Select.Item></div>)}
    </Select.Popup></Select.Positioner></Select.Portal>
  </Select.Root>
}
