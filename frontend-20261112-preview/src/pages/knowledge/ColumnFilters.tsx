import type { KbFacetOption } from '@/api/knowledge'
import { RiArrowDownLine, RiArrowDownSLine, RiArrowUpLine, RiCheckLine, RiCloseLine, RiSearchLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { Pop } from './shared'

/*
  表头即筛选：
    材料名称  放大镜 → 表头内展开搜索框
    产品/分类、对外使用范围  下拉筛选（选项 + 文件数，选中高亮）
    更新时间  点击切换排序
*/

const headBtn = 'flex h-7 cursor-pointer items-center gap-1 rounded-full px-2 -mx-2 text-[12px] transition-colors outline-none focus-visible:outline-2 focus-visible:outline-volt'

/** 材料名称：点放大镜在表头展开输入框；有关键词时保持展开 */
export function NameHeader({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (value)
      setOpen(true)
  }, [value])
  useEffect(() => {
    if (open)
      ref.current?.focus()
  }, [open])
  const close = () => {
    onChange('')
    setOpen(false)
  }
  return (
    <div className="flex h-7 min-w-0 items-center">
      <AnimatePresence initial={false} mode="popLayout">
        {open
          ? (
              <motion.label
                key="input"
                initial={{ opacity: 0, scaleX: 0.85 }}
                animate={{ opacity: 1, scaleX: 1 }}
                exit={{ opacity: 0, scaleX: 0.85 }}
                transition={{ duration: 0.18, ease: ease.out }}
                style={{ originX: 0 }}
                className="flex h-7 w-full max-w-[320px] items-center gap-1.5 rounded-full border border-volt bg-glass-3 pr-1 pl-2.5 shadow-glow-volt"
              >
                <RiSearchLine className="size-3.5 shrink-0 text-volt-text" />
                <input
                  ref={ref}
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && close()}
                  onBlur={() => !value && setOpen(false)}
                  placeholder="搜索标题或文件名"
                  aria-label="搜索材料名称"
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
                />
                <button type="button" aria-label="清除搜索" onMouseDown={e => e.preventDefault()} onClick={close} className="grid size-5 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-press hover:text-ink">
                  <RiCloseLine className="size-3.5" />
                </button>
              </motion.label>
            )
          : (
              <motion.button
                key="label"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                onClick={() => setOpen(true)}
                aria-label="按材料名称搜索"
                className={cn(headBtn, 'text-ink-3 hover:bg-press hover:text-ink')}
              >
                材料名称
                <RiSearchLine className="size-3.5" />
              </motion.button>
            )}
      </AnimatePresence>
    </div>
  )
}

export type FacetGroup = { key: string, title?: string, options?: KbFacetOption[], value: string }

/** 下拉筛选列头：一个或多个分组（产品 / 内容分类），选中值高亮；再点一次取消 */
export function FacetHeader({ label, groups, onPick, loading, error, onRetry }: {
  label: string
  groups: FacetGroup[]
  onPick: (key: string, value: string) => void
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  const [open, setOpen] = useState(false)
  const active = groups.filter(g => g.value)
  return (
    <Pop
      open={open}
      onOpenChange={setOpen}
      className="max-h-[420px] w-[260px] overflow-y-auto"
      trigger={(
        <button
          type="button"
          aria-label={`按${label}筛选`}
          className={cn(headBtn, active.length ? 'bg-volt-soft font-semibold text-volt-text' : 'text-ink-3 hover:bg-press hover:text-ink', open && !active.length && 'bg-press text-ink')}
        >
          <span className="truncate">{active.length ? active.map(g => g.value).join(' · ') : label}</span>
          <RiArrowDownSLine className={cn('size-3.5 shrink-0 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      )}
    >
      {loading
        ? <div className="space-y-2 p-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-6" />)}</div>
        : error
          ? <p className="p-2.5 text-[12.5px] text-rose">筛选项加载失败，仍可用名称搜索。<button type="button" className="cursor-pointer underline" onClick={onRetry}>重试</button></p>
          : groups.map((g, gi) => (
              <div key={g.key} className={cn(gi > 0 && 'mt-1.5 border-t border-line pt-1.5')}>
                {g.title && <p className="px-2.5 pt-1 pb-1 text-[11.5px] font-medium text-ink-3">{g.title}</p>}
                <Option label="全部" on={!g.value} onClick={() => { onPick(g.key, ''); setOpen(false) }} />
                {g.options?.length
                  ? g.options.map(o => (
                      <Option
                        key={o.value}
                        label={o.value}
                        count={o.count}
                        on={g.value === o.value}
                        onClick={() => { onPick(g.key, g.value === o.value ? '' : o.value); setOpen(false) }}
                      />
                    ))
                  : <p className="px-2.5 py-1.5 text-[12px] text-ink-3">当前范围没有可选项</p>}
              </div>
            ))}
    </Pop>
  )
}

function Option({ label, count, on, onClick }: { label: string, count?: string, on: boolean, onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn('flex h-8 w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 text-left text-[13px] transition-colors', on ? 'bg-volt-soft font-semibold text-volt-text' : 'text-ink hover:bg-hover')}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className={cn('text-[11.5px] tabular-nums', on ? 'text-volt-text' : 'text-ink-3')}>{count}</span>}
      <RiCheckLine className={cn('size-3.5', on ? 'opacity-100' : 'opacity-0')} />
    </button>
  )
}

export type SortDir = 'desc' | 'asc'

/** 更新时间：点击在「最近更新在前 / 最早在前」之间切换 */
export function SortHeader({ dir, onToggle }: { dir: SortDir, onToggle: () => void }) {
  const Icon = dir === 'desc' ? RiArrowDownLine : RiArrowUpLine
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dir === 'desc' ? '当前最近更新在前，点击改为最早在前' : '当前最早更新在前，点击改为最近在前'}
      title="本页按更新时间排序"
      className={cn(headBtn, dir === 'asc' ? 'bg-volt-soft font-semibold text-volt-text' : 'text-ink-3 hover:bg-press hover:text-ink')}
    >
      更新时间
      <Icon className="size-3.5" />
    </button>
  )
}

export type FilterChip = { key: string, label: string, value: string }

/** 生效中的筛选：只在有条件时出现 */
export function ActiveFilters({ chips, onRemove, onClear }: { chips: FilterChip[], onRemove: (key: string) => void, onClear: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {chips.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: ease.out }}
          className="overflow-hidden border-b border-line"
        >
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-2.5">
            <span className="mr-1 text-[12px] text-ink-3">筛选</span>
            {chips.map(c => (
              <span key={c.key} className="inline-flex h-7 items-center gap-1 rounded-full border border-volt/40 bg-volt-soft pr-1 pl-2.5 text-[12px] text-volt-text">
                <span className="text-ink-3">{c.label}</span>
                <span className="max-w-[200px] truncate font-medium">{c.value}</span>
                <button type="button" aria-label={`移除${c.label}筛选`} onClick={() => onRemove(c.key)} className="grid size-5 cursor-pointer place-items-center rounded-full hover:bg-press">
                  <RiCloseLine className="size-3.5" />
                </button>
              </span>
            ))}
            <button type="button" onClick={onClear} className="ml-1 h-7 cursor-pointer rounded-full px-2.5 text-[12px] text-ink-3 transition-colors hover:bg-press hover:text-ink">清空</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
