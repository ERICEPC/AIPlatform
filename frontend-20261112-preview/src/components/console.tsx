/*
  企业控制台通用版式（2026-11-08 新增）：新页面统一用这些组件，保证开发者工作台与管理后台是同一套样子。
  - ConsolePage：页面根（标题栏 + 可滚动内容区）
  - PageHeader：标题、说明、右侧操作、面包屑、下划线页签
  - Section：白底卡片（标题行 + 内容）
  - KV / StatusTag / MetricRow / SettingRow / SchemaForm：信息与配置项
*/
import { RiArrowRightSLine, RiEyeLine, RiEyeOffLine } from '@remixicon/react'
import { ModuleMark, usePageMark } from './page-mark'
import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'
import { Input, NumberInput, Select, Textarea } from './ui/form'
import { Badge } from './ui/primitives'

export type TabItem<T extends string> = { id: T, label: string, count?: number, hidden?: boolean }

export function Tabs<T extends string>({ items, value, onChange, className }: { items: TabItem<T>[], value: T, onChange: (v: T) => void, className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-6 border-b border-line', className)}>
      {items.filter(i => !i.hidden).map(i => (
        <button
          key={i.id}
          type="button"
          role="tab"
          aria-selected={value === i.id}
          onClick={() => onChange(i.id)}
          className={cn('relative -mb-px flex h-10 cursor-pointer items-center gap-1.5 border-b-2 text-[13.5px] whitespace-nowrap transition-colors', value === i.id ? 'border-volt font-semibold text-volt-text' : 'border-transparent text-ink-2 hover:text-ink')}
        >
          {i.label}
          {i.count !== undefined && <span className={cn('rounded px-1.5 text-[11.5px] tabular-nums', value === i.id ? 'bg-volt-soft text-volt-text' : 'bg-press text-ink-3')}>{i.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function PageHeader<T extends string>({ title, desc, actions, crumbs, tabs, tab, onTab, meta }: {
  title: React.ReactNode
  desc?: React.ReactNode
  actions?: React.ReactNode
  crumbs?: { label: string, onClick?: () => void }[]
  tabs?: TabItem<T>[]
  tab?: T
  onTab?: (t: T) => void
  meta?: React.ReactNode
}) {
  const mark = usePageMark()
  return (
    <header className="shrink-0 border-b border-line bg-solid px-6 pt-4">
      {crumbs && (
        <nav className="mb-1.5 flex items-center gap-1 text-[12.5px] text-ink-3" aria-label="面包屑">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <RiArrowRightSLine className="size-3.5" />}
              {c.onClick ? <button type="button" className="cursor-pointer hover:text-volt-text" onClick={c.onClick}>{c.label}</button> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className={cn('flex items-start gap-4', !tabs && 'pb-4')}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">{mark && <ModuleMark icon={mark.icon} color={mark.color} size={28} />}<h1 className="text-[20px] leading-7 font-semibold">{title}</h1>{meta}</div>
          {desc && <p className="mt-1 text-[13px] text-ink-2">{desc}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {tabs && tab && onTab && <Tabs className="mt-3 border-b-0" items={tabs} value={tab} onChange={onTab} />}
    </header>
  )
}

export function ConsolePage({ header, children, className, bodyClass }: { header: React.ReactNode, children: React.ReactNode, className?: string, bodyClass?: string }) {
  return (
    <section className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      {header}
      <div className={cn('min-h-0 flex-1 overflow-auto p-6', bodyClass)}>{children}</div>
    </section>
  )
}

export function Section({ title, desc, actions, children, className, bodyClass, id }: { title?: React.ReactNode, desc?: React.ReactNode, actions?: React.ReactNode, children: React.ReactNode, className?: string, bodyClass?: string, id?: string }) {
  return (
    <section id={id} className={cn('scroll-mt-4 rounded-xl border border-line bg-solid', className)}>
      {(title || actions) && (
        <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-[14.5px] font-semibold">{title}</h2>}
            {desc && <p className="mt-0.5 text-[12.5px] text-ink-3">{desc}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClass)}>{children}</div>
    </section>
  )
}

export function KV({ items, cols = 2 }: { items: [React.ReactNode, React.ReactNode][], cols?: 1 | 2 | 3 | 4 }) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-3', { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[cols])}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[12px] text-ink-3">{k}</dt>
          <dd className="mt-0.5 truncate text-[13.5px] text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export type Health = 'ok' | 'warn' | 'error' | 'off' | 'pending'
const HEALTH: Record<Health, [string, 'mint' | 'amber' | 'rose' | 'neutral' | 'volt']> = { ok: ['正常', 'mint'], warn: ['需关注', 'amber'], error: ['异常', 'rose'], off: ['未启用', 'neutral'], pending: ['待配置', 'volt'] }
export function StatusTag({ status, label }: { status: Health, label?: string }) {
  const [text, tone] = HEALTH[status]
  return <Badge tone={tone}><i className="size-1.5 rounded-full bg-current" />{label ?? text}</Badge>
}

export function MetricRow({ items }: { items: { label: string, value: React.ReactNode, sub?: React.ReactNode, tone?: 'volt' | 'amber' | 'rose' }[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] overflow-hidden rounded-xl border border-line bg-solid">
      {items.map((m, i) => (
        <div key={i} className={cn('px-5 py-4', i > 0 && 'border-l border-line')}>
          <p className="text-[12.5px] text-ink-3">{m.label}</p>
          <p className={cn('mt-1 text-[22px] leading-7 font-semibold tabular-nums', m.tone === 'volt' && 'text-volt-text', m.tone === 'amber' && 'text-amber', m.tone === 'rose' && 'text-rose')}>{m.value}</p>
          {m.sub && <p className="mt-0.5 text-[12px] text-ink-3">{m.sub}</p>}
        </div>
      ))}
    </div>
  )
}

export function SettingRow({ title, hint, children, className }: { title: React.ReactNode, hint?: React.ReactNode, children?: React.ReactNode, className?: string }) {
  return (
    <div className={cn('flex min-h-[56px] items-center gap-6 border-t border-line py-3 first:border-t-0 first:pt-0', className)}>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

/* ---------- 按字段定义渲染的配置表单：技术栈组件、业务空间、应用接入共用 ---------- */
export type FieldDef = {
  key: string
  label: string
  type: 'text' | 'secret' | 'number' | 'select' | 'switch' | 'textarea' | 'tags'
  hint?: string
  placeholder?: string
  options?: { value: string, label: string }[]
  required?: boolean
  /** 只读：开发者视角或无权限时展示但不能改 */
  readonly?: boolean
  suffix?: string
  group?: string
}
export type FieldValue = string | number | boolean | string[]

export function SchemaForm({ fields, value, onChange, disabled }: { fields: FieldDef[], value: Record<string, FieldValue>, onChange: (k: string, v: FieldValue) => void, disabled?: boolean }) {
  const groups = [...new Set(fields.map(f => f.group ?? ''))]
  return (
    <div className="space-y-6">
      {groups.map(g => (
        <div key={g}>
          {g && <p className="mb-2 text-[12.5px] font-semibold text-ink-2">{g}</p>}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-xl:grid-cols-1">
            {fields.filter(f => (f.group ?? '') === g).map(f => (
              <div key={f.key} className={cn((f.type === 'textarea' || f.type === 'tags') && 'col-span-2 max-xl:col-span-1')}>
                <label className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-ink">{f.label}{f.required && <span className="text-rose">*</span>}{f.readonly && <span className="ml-1 rounded bg-press px-1.5 text-[11px] font-normal text-ink-3">只读</span>}</label>
                <FieldControl f={f} v={value[f.key]} onChange={v => onChange(f.key, v)} disabled={disabled || f.readonly} />
                {f.hint && <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{f.hint}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FieldControl({ f, v, onChange, disabled }: { f: FieldDef, v: FieldValue | undefined, onChange: (v: FieldValue) => void, disabled?: boolean }) {
  const [show, setShow] = useState(false)
  if (f.type === 'switch')
    return <div className="flex h-9 items-center"><Switch aria-label={f.label} checked={!!v} disabled={disabled} onCheckedChange={onChange} /></div>
  if (f.type === 'select')
    return <Select value={String(v ?? '')} onValueChange={onChange} options={f.options ?? []} disabled={disabled} />
  if (f.type === 'number')
    return <NumberInput value={Number(v ?? 0)} onChange={onChange} suffix={f.suffix} className={disabled ? 'pointer-events-none opacity-60' : ''} />
  if (f.type === 'textarea')
    return <Textarea rows={3} value={String(v ?? '')} placeholder={f.placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} className="font-mono text-[12.5px]" />
  if (f.type === 'tags')
    return <Input value={(Array.isArray(v) ? v : []).join('，')} placeholder={f.placeholder} disabled={disabled} onChange={e => onChange(e.target.value.split(/[,，]\s*/).filter(Boolean))} />
  if (f.type === 'secret') {
    return (
      <div className="relative">
        <Input type={show ? 'text' : 'password'} value={String(v ?? '')} placeholder={f.placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} className="pr-9 font-mono" autoComplete="new-password" />
        <button type="button" aria-label={show ? '隐藏' : '显示'} onClick={() => setShow(s => !s)} className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-ink-3 hover:text-ink">{show ? <RiEyeOffLine className="size-4" /> : <RiEyeLine className="size-4" />}</button>
      </div>
    )
  }
  return <Input value={String(v ?? '')} placeholder={f.placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} className={f.key.includes('url') || f.key.includes('host') || f.key.includes('endpoint') ? 'font-mono text-[13px]' : ''} />
}

/** 简单条形图（监控页用；纯 CSS，无第三方依赖） */
export function Bars({ data, labels, height = 120, unit = '' }: { data: number[], labels?: string[], height?: number, unit?: string }) {
  const max = Math.max(1, ...data)
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="group relative flex-1">
            <div className="rounded-t-sm bg-volt/80 transition-colors group-hover:bg-volt" style={{ height: Math.max(2, (d / max) * height) }} />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[11px] whitespace-nowrap text-solid group-hover:block">{d}{unit}</span>
          </div>
        ))}
      </div>
      {labels && <div className="mt-1.5 flex gap-1.5">{labels.map((l, i) => <span key={i} className="flex-1 text-center text-[11px] text-ink-3">{l}</span>)}</div>}
    </div>
  )
}
