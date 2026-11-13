import type { CollabGroup, CollabGroupId } from '@/api/collab'
import { RiAddLine, RiChatSmile3Line, RiSearchLine, RiSidebarFoldLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { EmptyState, Panel, Skeleton } from '@/components/ui/primitives'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { AvatarStack, MemberAvatar, fmtTime, GroupAvatar, groupStatus } from './shared'

export const LIST_WIDTH = 296

/* 左侧「群聊」列：搜索、新建、全部群聊；可收起（宽度动画） */
export function GroupList({ collapsed, groups, loading, error, onRetry, activeId, onSelect, onCreate, onDirect, onCollapse }: {
  collapsed: boolean
  groups: CollabGroup[] | undefined
  loading: boolean
  error: Error | null
  onRetry: () => void
  activeId: CollabGroupId | null
  onSelect: (id: CollabGroupId) => void
  onDirect: () => void
  onCreate: () => void
  onCollapse: () => void
}) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return (groups ?? []).filter(g => !k || g.name.toLowerCase().includes(k) || g.description.toLowerCase().includes(k) || g.last_message?.text.toLowerCase().includes(k) || g.members.some(m => m.name.toLowerCase().includes(k)))
  }, [groups, q])

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : LIST_WIDTH, opacity: collapsed ? 0 : 1 }}
      transition={{ duration: 0.42, ease: ease.sheet }}
      className="shrink-0 overflow-hidden"
      aria-hidden={collapsed}
      inert={collapsed}
    >
      <div className="flex h-full flex-col p-3 pr-0" style={{ width: LIST_WIDTH }}>
        <Panel level={2} radius="lg" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="space-y-3 p-3.5 pb-2.5">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold">会话</p>
              {groups && <span className="text-[12px] text-ink-3 tabular-nums">{groups.length}</span>}
              <Tip label="收起群聊列表">
                <Button variant="ghost" size="icon-small" className="ml-auto" aria-label="收起群聊列表" onClick={onCollapse}><RiSidebarFoldLine className="size-4" /></Button>
              </Tip>
            </div>
            <Button variant="primary" size="medium" className="w-full" onClick={onCreate}><RiAddLine className="size-4" />新建群聊</Button><Button variant="secondary" className="w-full" onClick={onDirect}><RiChatSmile3Line className="size-4" />发起单聊</Button>
            <label className="flex h-9 items-center gap-2 rounded-2xl border border-line-strong bg-hover px-3 transition-[border-color,box-shadow] focus-within:border-volt focus-within:shadow-glow-volt">
              <RiSearchLine className="size-4 shrink-0 text-ink-3" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索会话、成员或消息" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3" />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {error && <div className="p-1.5"><ErrorBar error={error} onRetry={onRetry} /></div>}
            {loading && !groups && Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex gap-3 px-2 py-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-full" /></div>
              </div>
            ))}
            {groups && !shown.length && (
              q
                ? <p className="px-3 py-10 text-center text-[13px] text-ink-3">没有找到「{q}」相关的群聊</p>
                : <EmptyState icon={<RiChatSmile3Line className="size-5" />} title="还没有群聊" hint="新建一个群，拉同事的助手和 Agent 进来协作" />
            )}
            {shown.map(g => <GroupItem key={g.id} group={g} active={g.id === activeId} onClick={() => onSelect(g.id)} />)}
          </div>
        </Panel>
      </div>
    </motion.aside>
  )
}

function GroupItem({ group: g, active, onClick }: { group: CollabGroup, active: boolean, onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn('group relative mb-0.5 flex w-full cursor-pointer gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors', active ? 'bg-press' : 'hover:bg-hover')}
    >
      {active && <motion.span layoutId="collab-group-active" className="absolute top-3 bottom-3 -left-px w-[3px] rounded-full bg-volt shadow-[0_0_12px_var(--volt)]" />}
      {g.kind === 'direct' && g.members[0] ? <MemberAvatar member={g.members[0]} size={40} /> : <GroupAvatar icon={g.icon} size={40} glow={active} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-[14px] font-medium', active && 'text-volt-text')}>{g.name}</span>
          <span className="shrink-0 text-[11.5px] text-ink-3">{fmtTime(g.last_message?.created_at ?? g.created_at)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">
            {g.last_message ? `${g.last_message.author}：${g.last_message.text}` : '还没有消息，开始对话吧'}
          </span>
          {g.unread > 0 && !active && (
            <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-volt px-1.5 text-[10.5px] font-bold text-volt-ink shadow-[0_0_10px_var(--volt)]">{g.unread > 99 ? '99+' : g.unread}</span>
          )}
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          {g.kind === 'direct' ? <span className="text-[11px] text-ink-3">单聊</span> : <AvatarStack members={g.members} />}
          <span className={cn('truncate text-[11.5px]', g.running_tasks > 0 ? 'text-amber' : 'text-ink-3')}>{groupStatus(g)}</span>
        </span>
      </span>
    </button>
  )
}
