import { API_MODE } from '@/api/http'
import type { KbLibraryItem } from '@/api/knowledge'
import { RiAddLine, RiArrowLeftRightLine, RiFolderOpenLine, RiFolderSharedLine, RiSettings4Line, RiStackLine, RiUser3Line } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { Tip } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

export type KbScope = 'mine' | 'all'

type Props = {
  scope: KbScope
  libraries?: KbLibraryItem[]
  loading: boolean
  error: unknown
  onRetry: () => void
  /** 当前选中的库（我的视图下未指定时为默认个人库；全部视图下空串 = 全部材料） */
  activeId: string
  onScope: (s: KbScope) => void
  onSelect: (lib: KbLibraryItem | null) => void
  onManage: () => void
}

/*
  找材料左栏（模式之下的第二层）：
    范围  我的 / 全部可访问（我的在前、默认选中）
    子范围 知识库：我的视图只列我的库；全部视图分「我的库」「共享给我的」两组，组内按最近更新
*/
export function LibraryNav({ scope, libraries, loading, error, onRetry, activeId, onScope, onSelect, onManage }: Props) {
  const mine = libraries?.filter(l => l.ownedByMe) ?? []
  const shared = libraries?.filter(l => !l.ownedByMe) ?? []
  const sum = (list: KbLibraryItem[]) => list.reduce((n, l) => n + l.count, 0)

  if (API_MODE === 'live') return <div className="space-y-2">
    <p className="px-3 text-xs text-ink-3">对接账号可访问的知识库</p>
    {loading ? <Skeleton className="h-20" /> : error ? <button onClick={onRetry}>加载失败，重试</button> : <>
      <NavItem lib={null} active={!activeId} count={libraries ? sum(libraries) : undefined} onClick={() => onSelect(null)} />
      {libraries?.map(l => <NavItem key={l.id} lib={l} active={l.id === activeId} onClick={() => onSelect(l)} />)}
    </>}
    <button className="px-3 py-2 text-sm text-volt-text cursor-pointer" onClick={onManage}>＋ 管理知识库</button>
  </div>
  return (
    <>
      <ScopeSwitch scope={scope} mineCount={libraries ? sum(mine) : undefined} allCount={libraries ? sum(libraries) : undefined} onScope={onScope} />

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {loading
          ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="mx-2 my-2.5 h-5" />)
          : error
            ? <div className="px-3 py-2 text-[12px] text-rose">知识库列表加载失败<button type="button" className="ml-2 cursor-pointer underline" onClick={onRetry}>重试</button></div>
            : scope === 'mine'
              ? (
                  <>
                    <GroupHeading label="我的库" count={mine.length} action={<Tip label="管理我的知识库"><button type="button" aria-label="管理我的知识库" onClick={onManage} className="grid size-6 cursor-pointer place-items-center rounded-full text-ink-3 transition-colors hover:bg-press hover:text-ink"><RiSettings4Line className="size-3.5" /></button></Tip>} />
                    {mine.length
                      ? mine.map(l => <NavItem key={l.id} lib={l} active={l.id === activeId} onClick={() => onSelect(l)} />)
                      : <p className="px-3 py-2 text-[12px] leading-relaxed text-ink-3">还没有个人知识库。新建一个，把方案和笔记整理进去。</p>}
                    <button type="button" onClick={onManage} className="mt-1 flex h-8 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-[12.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink">
                      <RiAddLine className="size-4" />新建私有库
                    </button>
                  </>
                )
              : (
                  <>
                    <NavItem lib={null} active={!activeId} count={libraries ? sum(libraries) : undefined} onClick={() => onSelect(null)} />
                    <GroupHeading label="我的库" count={mine.length} />
                    {mine.length
                      ? mine.map(l => <NavItem key={l.id} lib={l} active={l.id === activeId} onClick={() => onSelect(l)} />)
                      : <p className="px-3 py-1.5 text-[12px] text-ink-3">暂无</p>}
                    <GroupHeading label="共享给我的" count={shared.length} />
                    {shared.length
                      ? shared.map(l => <NavItem key={l.id} lib={l} active={l.id === activeId} onClick={() => onSelect(l)} />)
                      : <p className="px-3 py-1.5 text-[12px] text-ink-3">暂无共享给你的知识库</p>}
                  </>
                )}
      </div>
    </>
  )
}

const SCOPES = {
  mine: { label: '我的', icon: RiUser3Line },
  all: { label: '全部可访问', icon: RiStackLine },
} as const

/* 范围切换：一张卡片，显示当前范围；点卡片或双向箭头切到另一个（默认「我的」） */
function ScopeSwitch({ scope, mineCount, allCount, onScope }: { scope: KbScope, mineCount?: number, allCount?: number, onScope: (s: KbScope) => void }) {
  const other: KbScope = scope === 'mine' ? 'all' : 'mine'
  const cur = SCOPES[scope]
  const count = scope === 'mine' ? mineCount : allCount
  const otherCount = scope === 'mine' ? allCount : mineCount
  const fmt = (n?: number) => (n === undefined ? '…' : `${n} 份材料`)
  return (
    <button
      type="button"
      onClick={() => onScope(other)}
      aria-label={`当前：${cur.label}，点击切换到${SCOPES[other].label}`}
      className="group relative mb-3 flex h-[58px] w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-volt/40 bg-volt-soft px-3 text-left transition-colors hover:border-volt/70"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={scope}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={spring.snappy}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-volt text-volt-ink"><cur.icon className="size-4" /></span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[13.5px] font-semibold text-ink">{cur.label}</span>
            <span className="mt-0.5 block truncate text-[11.5px] text-volt-text tabular-nums">
              {fmt(count)}
              <span className="text-ink-3"> · 切换到{SCOPES[other].label}（{otherCount ?? '…'}）</span>
            </span>
          </span>
        </motion.span>
      </AnimatePresence>
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong bg-glass-3 text-ink-2 transition-transform duration-300 group-hover:rotate-180 group-hover:text-volt-text">
        <RiArrowLeftRightLine className="size-4" />
      </span>
    </button>
  )
}

function GroupHeading({ label, count, action }: { label: string, count: number, action?: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1 flex h-6 items-center gap-1.5 px-3 text-[11.5px] font-medium text-ink-3 first:mt-0">
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  )
}

function NavItem({ lib, active, count, onClick }: { lib: KbLibraryItem | null, active: boolean, count?: number, onClick: () => void }) {
  const Icon = !lib ? RiStackLine : lib.ownedByMe ? RiFolderOpenLine : RiFolderSharedLine
  const n = lib ? lib.count : count
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={lib?.description || undefined}
      className={cn('relative flex min-h-9 w-full cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors', active ? 'text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink')}
    >
      {active && <motion.span layoutId="kb-lib" transition={spring.snappy} className="absolute inset-0 rounded-xl border border-line-strong bg-glass-3" />}
      <Icon className={cn('relative mt-0.5 size-4 shrink-0', active ? 'text-volt-text' : 'text-ink-3')} />
      <span className={cn('relative min-w-0 flex-1 break-words', active && 'font-semibold')}>{lib ? lib.name : '全部材料'}</span>
      {n !== undefined && <span className="relative mt-0.5 text-[11.5px] text-ink-3 tabular-nums">{n}</span>}
    </button>
  )
}
