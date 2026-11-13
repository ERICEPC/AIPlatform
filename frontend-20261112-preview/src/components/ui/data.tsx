import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Skeleton } from './primitives'

/* ---------- 表格：列定义驱动，行可点击，加载骨架、空状态 ---------- */
export type Column<T> = {
  key: string
  title: React.ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
  render: (row: T) => React.ReactNode
}

function DataTable<T>({ columns, rows, rowKey, onRowClick, loading, empty, className, activeKey, compact = false }: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  empty?: React.ReactNode
  className?: string
  activeKey?: string
  /** Dense rows for high-volume operational tables such as logs. */
  compact?: boolean
}) {
  const grid = { gridTemplateColumns: columns.map(c => c.width ?? 'minmax(0,1fr)').join(' ') }
  return (
    <div className={cn('overflow-hidden rounded-xl border border-line', compact ? 'rounded-lg' : '', className)}>
      <div className={cn('grid gap-3 border-b border-line bg-hover px-5 py-2.5 text-[12px] text-ink-3', compact && 'px-4 py-2 text-[11.5px]')} style={grid}>
        {columns.map(c => <span key={c.key} className={cn(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>{c.title}</span>)}
      </div>
      {loading
        ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={cn('grid gap-3 border-b border-line px-5 py-3.5 last:border-b-0', compact && 'px-4 py-2.5')} style={grid}>
              {columns.map(c => <Skeleton key={c.key} className="h-4" />)}
            </div>
          ))
        : rows.length === 0
          ? <div className="px-5 py-12 text-center text-[13px] text-ink-3">{empty ?? '暂无数据'}</div>
          : rows.map((r) => {
              const k = rowKey(r)
              return (
                <div
                  key={k}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={() => onRowClick?.(r)}
                  onKeyDown={e => onRowClick && (e.key === 'Enter' || e.key === ' ') && onRowClick(r)}
                  className={cn(
                    'grid items-center gap-3 border-b border-line px-5 py-3 text-[13.5px] transition-colors last:border-b-0',
                    compact && 'px-4 py-2 text-[12.5px]',
                    onRowClick && 'cursor-pointer hover:bg-hover',
                    activeKey === k && 'bg-press',
                  )}
                  style={grid}
                >
                  {columns.map(c => <div key={c.key} className={cn('min-w-0', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>{c.render(r)}</div>)}
                </div>
              )
            })}
    </div>
  )
}

/* ---------- 可复制的值：URL、API Key、ID ---------- */
function CopyField({ value, mono, mask, className }: { value: string, mono?: boolean, mask?: boolean, className?: string }) {
  const [done, setDone] = useState(false)
  const shown = mask ? `${value.slice(0, 6)}••••••••${value.slice(-4)}` : value
  return (
    <div className={cn('flex h-10 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface pr-1.5 pl-3', className)}>
      <span className={cn('min-w-0 flex-1 truncate text-[13px]', mono && 'font-mono text-[12.5px]')} title={value}>{shown}</span>
      <button
        type="button"
        aria-label="复制"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setDone(true)
            setTimeout(() => setDone(false), 1400)
          }
          catch {}
        }}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-3 transition-colors hover:bg-press hover:text-ink"
      >
        {done ? <RiCheckLine className="size-4 text-mint" /> : <RiFileCopyLine className="size-4" />}
      </button>
    </div>
  )
}

/* ---------- 分页 ---------- */
function Pager({ page, total, limit, onPage }: { page: number, total: number, limit: number, onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  return (
    <div className="flex items-center justify-between text-[12.5px] text-ink-3">
      <span>共 <b className="text-ink tabular-nums">{total}</b> 条</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 cursor-pointer rounded-md px-3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40">上一页</button>
        <span className="px-2 tabular-nums">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 cursor-pointer rounded-md px-3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40">下一页</button>
      </div>
    </div>
  )
}

/* ---------- 统计小卡 ---------- */
function Stat({ label, value, sub, className }: { label: React.ReactNode, value: React.ReactNode, sub?: React.ReactNode, className?: string }) {
  return (
    <div className={cn('rounded-xl border border-line bg-solid p-4', className)}>
      <p className="text-[12.5px] text-ink-2">{label}</p>
      <p className="mt-1.5 text-[20px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
      {sub && <p className="mt-2 text-[12px] text-ink-3">{sub}</p>}
    </div>
  )
}

/* ---------- 错误提示条 ---------- */
function ErrorBar({ error, onRetry }: { error: Error | null | undefined, onRetry?: () => void }) {
  if (!error)
    return null
  return (
    <div className="flex items-center gap-3 rounded-lg border border-rose/40 bg-rose-soft px-4 py-2.5 text-[13px] text-rose">
      <span className="flex-1">{error.message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="cursor-pointer font-medium hover:underline">重试</button>}
    </div>
  )
}

export { CopyField, DataTable, ErrorBar, Pager, Stat }
