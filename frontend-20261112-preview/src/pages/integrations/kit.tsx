/* 集成模块内部通用小件：图标色块、来源徽标、搜索框、弹出层、加载/空/错误三态、键值编辑 */
import type { PluginCategory, PluginSource } from '@/api/integrations'
import { Popover } from '@base-ui/react/popover'
import { RiAddLine, RiCloseLine, RiSearchLine } from '@remixicon/react'
import { createContext, useContext } from 'react'
import { SectionHeader } from '@/components/detail-shell'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { fieldBase, Input } from '@/components/ui/form'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/* ---------- 模块上下文：跨分区刷新、打开插件市场、跟踪安装任务 ---------- */
export type IntegrationsCtx = {
  /** 安装/卸载完成后递增，分区列表把它放进 useQuery 依赖里自动重取 */
  version: number
  bump: () => void
  go: (path: string) => void
  openMarketplace: (category?: PluginCategory) => void
  /** 开始轮询安装任务 */
  watchTasks: () => void
  /** 分区头部右侧的全局操作（安装、任务、自动更新） */
  globalActions: React.ReactNode
}
const noop = () => {}
/** 默认值让 kit / marketplace 里的组件在模块外（如个人设置里的模型供应商）也能直接用 */
export const Ctx = createContext<IntegrationsCtx>({ version: 0, bump: noop, go: noop, openMarketplace: noop, watchTasks: noop, globalActions: null })
export const useIntegrations = () => useContext(Ctx)

/* ---------- 分区外框 ---------- */
export function SectionFrame({ title, desc, actions, children, wide }: { title: React.ReactNode, desc?: React.ReactNode, actions?: React.ReactNode, children: React.ReactNode, wide?: boolean }) {
  const { globalActions } = useIntegrations()
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className={cn('mx-auto px-8 pt-7 pb-16', wide ? 'max-w-[1320px]' : 'max-w-[1180px]')}>
        <SectionHeader
          title={title}
          desc={desc}
          actions={(
            <>
              {actions}
              {actions && <span className="mx-1 h-5 w-px bg-line" aria-hidden />}
              {globalActions}
            </>
          )}
        />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

/* ---------- 图标：tile:<字>:<色> 渲染为色块；emoji 直接显示；URL 显示图片 ---------- */
export function PluginTile({ icon: input, size = 40, className, background }: { icon: unknown, size?: number, className?: string, background?: string }) {
  // Real providers return localized URL maps; MCP may return an emoji descriptor.
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : null
  const candidate = typeof input === 'string' ? input : raw?.zh_Hans || raw?.en_US || raw?.url || raw?.content
  const normalized = typeof candidate === 'string' ? candidate : '🧩'
  const icon = ['🦝', '🧭'].includes(normalized) ? '/raccoon-emoji-v1/042-ai.webp' : normalized

  const radius = Math.round(size * 0.3)
  if (icon.startsWith('tile:')) {
    const [, text, color] = icon.split(':')
    return (
      <span
        className={cn('grid shrink-0 place-items-center font-bold text-white shadow-[0_6px_16px_-8px_currentColor]', className)}
        style={{ width: size, height: size, borderRadius: radius, background: color, color, fontSize: size * (text.length > 2 ? 0.28 : text.length > 1 ? 0.34 : 0.42) }}
      >
        <span className="text-white">{text}</span>
      </span>
    )
  }
  if (/^(https?:|\/)/.test(icon))
    return <img src={icon} alt="" className={cn('shrink-0 border border-line object-cover', className)} style={{ width: size, height: size, borderRadius: radius }} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = `${import.meta.env.BASE_URL}raccoon-emoji-v1/042-ai.webp` }} />
  return (
    <span className={cn('grid shrink-0 place-items-center border border-line bg-hover', className)} style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.5, background }}>
      {icon && [...icon].length <= 4 ? icon : '🧩'}
    </span>
  )
}

export const authorName = (org?: string) => (org === 'langgenius' ? '官方' : org ?? '')

const sourceMeta: Record<PluginSource, { label: string, tone: 'cyan' | 'neutral' | 'amber' | 'volt' }> = {
  marketplace: { label: '插件市场', tone: 'cyan' },
  github: { label: 'GitHub', tone: 'neutral' },
  package: { label: '本地', tone: 'amber' },
  remote: { label: '内置', tone: 'volt' },
}
export function SourceBadge({ source }: { source: PluginSource }) {
  const m = sourceMeta[source] ?? sourceMeta.remote
  return <Badge tone={m.tone} className="h-5 px-2 text-[11px]">{m.label}</Badge>
}

export const fmtCount = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万` : n.toLocaleString('zh-CN'))
export const fmtTime = (s?: string | number) => {
  if (!s)
    return ''
  const d = typeof s === 'number' ? new Date(s * 1000) : new Date(s)
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/* ---------- 搜索框 ---------- */
export function SearchBox({ value, onChange, placeholder = '搜索', className }: { value: string, onChange: (v: string) => void, placeholder?: string, className?: string }) {
  return (
    <div className={cn('relative w-[260px]', className)}>
      <RiSearchLine className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cn(fieldBase, 'h-9 rounded-full pr-8 pl-9 text-[13px]')} />
      {value && (
        <button type="button" aria-label="清空" onClick={() => onChange('')} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-hover hover:text-ink">
          <RiCloseLine className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/* ---------- 弹出层（调试、权限、任务、安装方式） ---------- */
export function Pop({ trigger, children, side = 'bottom', align = 'end', className, open, onOpenChange }: {
  trigger: React.ReactElement
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'right' | 'left'
  align?: 'start' | 'center' | 'end'
  className?: string
  open?: boolean
  onOpenChange?: (o: boolean) => void
}) {
  return (
    <Popover.Root open={open} onOpenChange={o => onOpenChange?.(o)}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side={side} align={align} sideOffset={8} className="z-[74]">
          <Popover.Popup className={cn('glass-3 w-[320px] rounded-[24px] p-4 shadow-float outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0', className)}>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* ---------- 列表三态 ---------- */
export function CardsSkeleton({ count = 6, height = 'h-[148px]' }: { count?: number, height?: string }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className={cn('rounded-[22px]', height)} />)}
    </div>
  )
}

export function ListState<T>({ loading, error, data, onRetry, empty, skeleton, children }: {
  loading: boolean
  error: Error | null
  data: T[] | undefined
  onRetry: () => void
  empty: React.ComponentProps<typeof EmptyState>
  skeleton?: React.ReactNode
  children: (rows: T[]) => React.ReactNode
}) {
  if (error && !data)
    return <ErrorBar error={error} onRetry={onRetry} />
  if (loading && !data)
    return <>{skeleton ?? <CardsSkeleton />}</>
  if (!data?.length)
    return <EmptyState {...empty} />
  return <>{children(data)}</>
}

/** 卡片网格 */
export function Grid({ children, min = 300, className }: { children: React.ReactNode, min?: number, className?: string }) {
  return <div className={cn('grid gap-3', className)} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>
}

/* ---------- 键值对编辑（MCP 请求头） ---------- */
export type KV = { key: string, value: string }
export function KeyValueEditor({ rows, onChange, keyPlaceholder = '名称', valuePlaceholder = '值' }: { rows: KV[], onChange: (rows: KV[]) => void, keyPlaceholder?: string, valuePlaceholder?: string }) {
  const set = (i: number, patch: Partial<KV>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="h-10 flex-1 font-mono text-[13px]" placeholder={keyPlaceholder} value={r.key} onChange={e => set(i, { key: e.target.value })} />
          <Input className="h-10 flex-[1.4] font-mono text-[13px]" placeholder={valuePlaceholder} value={r.value} onChange={e => set(i, { value: e.target.value })} />
          <Button variant="ghost" size="icon-small" aria-label="删除这一行" onClick={() => onChange(rows.filter((_, j) => j !== i))}><RiCloseLine className="size-4" /></Button>
        </div>
      ))}
      <Button variant="ghost-accent" size="small" onClick={() => onChange([...rows, { key: '', value: '' }])}><RiAddLine className="size-4" />添加一行</Button>
    </div>
  )
}

/** 分组小标题 */
export function GroupTitle({ children, aside, className }: { children: React.ReactNode, aside?: React.ReactNode, className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center gap-3', className)}>
      <h2 className="text-[14px] font-semibold">{children}</h2>
      <span className="h-px flex-1 bg-line" />
      {aside}
    </div>
  )
}

/** 选项卡片（单选：认证方式、权限、更新策略） */
export function ChoiceCard({ on, onClick, title, desc, icon }: { on: boolean, onClick: () => void, title: React.ReactNode, desc?: React.ReactNode, icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn('flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow]', on ? 'border-volt bg-volt-soft shadow-glow-volt' : 'border-line hover:border-line-strong hover:bg-hover')}
    >
      {icon && <span className={cn('mt-0.5', on ? 'text-volt-text' : 'text-ink-3')}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium">{title}</span>
        {desc && <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-3">{desc}</span>}
      </span>
      <span className={cn('mt-1 size-3.5 shrink-0 rounded-full border-2', on ? 'border-volt bg-volt' : 'border-line-strong')} />
    </button>
  )
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : '操作失败，请稍后重试')
