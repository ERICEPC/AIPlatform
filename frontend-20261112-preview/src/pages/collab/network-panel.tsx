import type { CollabDelegation, CollabGroup, CollabMember } from '@/api/collab'
import type { NetworkNode } from '@/three/CollabNetwork'
import { RiArrowRightLine, RiArrowRightUpLine, RiUserAddLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { fullName, KindTag, MemberAvatar, shortName, sourceLabel, statusLabel, useMemberLookup } from './shared'

const CollabNetwork = lazy(() => import('@/three/CollabNetwork'))

/* 右栏：当前群的协同网络（3D）+ 选中成员在本群的委派关系 + 本群成员（同事的助手 / Agent） */
export function NetworkPanel({ theme, group, selected, executing, onSelect, onAddMembers }: {
  theme: 'dark' | 'light'
  group: CollabGroup
  selected: string
  executing?: string
  onSelect: (id: string) => void
  onAddMembers: () => void
}) {
  const members = group.members
  // 选中的成员不在本群（例如刚切群）时，退回到第一位成员
  const sel = members.find(m => m.id === selected) ?? members[0]
  const nodes = useMemo<NetworkNode[]>(() => members.map(m => ({ id: m.id, label: shortName(m), kind: m.kind, status: m.id === executing ? 'busy' : m.status, avatar: m.avatar })), [members, executing])
  const assistants = members.filter(m => m.kind === 'assistant')
  const agents = members.filter(m => m.kind === 'agent')

  return (
    <>
      <Panel level={2} radius="lg" className="relative h-[330px] shrink-0 overflow-hidden">
        <div className="absolute inset-x-4 top-3.5 z-10 flex items-start justify-between gap-2">
          <div className="leading-tight">
            <p className="text-[13.5px] font-semibold">协同网络</p>
            <p className="mt-1 text-[11.5px] text-ink-3">本群 {members.length} 位成员 · {group.delegations.length} 项委派</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-[11.5px] text-ink-3">
            <span className="flex items-center gap-2.5">
              <span className="flex items-center gap-1"><i className="size-1.5 rounded-full bg-amber" />忙碌</span>
              <span className="flex items-center gap-1"><i className="size-1.5 rounded-full bg-mint" />空闲</span>
              <span className="flex items-center gap-1"><i className="size-1.5 rounded-full bg-ink-3" />离线</span>
            </span>
            <span className="flex items-center gap-2.5">
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-full border border-line-strong" />助手</span>
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-[3px] border border-cyan" />Agent</span>
            </span>
          </div>
        </div>
        <Suspense fallback={null}>
          <CollabNetwork theme={theme} nodes={nodes} edges={group.delegations} selectedId={sel?.id ?? null} onSelect={onSelect} />
        </Suspense>
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11.5px] text-ink-3">
          {executing ? `正在执行：${members.find(m => m.id === executing)?.name ?? ''} · 高亮随任务自动切换` : group.delegations.length ? '拖动旋转，点击成员查看委派关系' : '还没有委派，团长调度成员后这里会显示协作关系'}
        </p>
      </Panel>

      <Panel level={2} radius="lg" className="min-h-0 flex-1 overflow-auto p-4">
        <AnimatePresence mode="wait">
          {sel && (
            <motion.div key={`${group.id}-${sel.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              <MemberDetail member={sel} delegations={group.delegations} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 mb-1 flex items-center justify-between">
          <p className="text-[12px] font-medium text-ink-3">本群成员 · {members.length}</p>
          <Button variant="ghost" size="small" disabled={group.kind === 'direct'} onClick={onAddMembers}><RiUserAddLine className="size-3.5" />管理</Button>
        </div>
        <MemberSection title="同事的助手" list={assistants} selected={sel?.id} onSelect={onSelect} />
        <MemberSection title="Agent" list={agents} selected={sel?.id} onSelect={onSelect} empty="还没有 Agent，点「添加」把 Agents 里的企服或自己的 Agent 拉进群" />
      </Panel>
    </>
  )
}

function MemberDetail({ member: m, delegations }: { member: CollabMember, delegations: CollabDelegation[] }) {
  const lookup = useMemberLookup()
  const outgoing = delegations.filter(d => d.from === m.id)
  const incoming = delegations.filter(d => d.to === m.id)
  // 企服 Agent 没有详情页，跳到企服列表；我的 Agent 跳到详情
  const openAgent = () => {
    if (m.kind === 'agent')
      location.hash = `agents/${m.id.replace(/^agent:/, '')}/configure`
  }
  return (
    <>
      <div className="flex items-center gap-3">
        <MemberAvatar member={m} size={42} presence ring />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{m.name}</span>
            <KindTag kind={m.kind} />
          </p>
          <p className="mt-1 truncate text-[12.5px] text-ink-3">
            {m.kind === 'assistant' ? m.role : `来源：${sourceLabel[m.source]} · ${m.status_text || statusLabel[m.status]}`}
          </p>
        </div>
        {m.kind === 'agent' && (
          <Button variant="ghost-accent" size="small" onClick={openAgent}>查看 Agent<RiArrowRightUpLine className="size-3.5" /></Button>
        )}
      </div>
      {m.kind === 'agent' && m.description && <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-2">{m.description}</p>}

      <p className="mt-4 mb-2 text-[12px] font-medium text-ink-3">在本群收到的任务</p>
      {incoming.length
        ? incoming.map(d => (
            <div key={d.from + d.task} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[13.5px] hover:bg-hover">
              <span className="truncate">{d.task}</span>
              <span className="shrink-0 text-ink-2">来自 {shortName(lookup(d.from))}</span>
            </div>
          ))
        : <p className="px-2 text-[13px] text-ink-3">暂无</p>}
      <p className="mt-3 mb-2 text-[12px] font-medium text-ink-3">在本群交出去的任务</p>
      {outgoing.length
        ? outgoing.map(d => (
            <div key={d.to + d.task} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[13.5px] hover:bg-hover">
              <span className="truncate">{d.task}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-ink-2"><RiArrowRightLine className="size-3.5 text-cyan" />{shortName(lookup(d.to))}</span>
            </div>
          ))
        : <p className="px-2 text-[13px] text-ink-3">暂无</p>}
    </>
  )
}

function MemberSection({ title, list, selected, onSelect, empty }: { title: string, list: CollabMember[], selected?: string, onSelect: (id: string) => void, empty?: string }) {
  if (!list.length && !empty)
    return null
  return (
    <div className="mt-2">
      <p className="px-2 pb-1 text-[11.5px] text-ink-3">{title} · {list.length}</p>
      {!list.length && <p className="px-2 pb-1 text-[12.5px] leading-relaxed text-ink-3">{empty}</p>}
      {list.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m.id)}
          aria-pressed={m.id === selected}
          className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors', m.id === selected ? 'bg-press' : 'hover:bg-hover')}
        >
          <MemberAvatar member={m} size={30} presence />
          <span className="min-w-0 flex-1 leading-tight">
            <span className={cn('block truncate text-[13.5px] font-medium', m.kind === 'agent' && 'text-cyan')}>{fullName(m)}</span>
            <span className="block truncate text-[12px] text-ink-3">{m.kind === 'agent' ? `${sourceLabel[m.source]} · ${m.status_text}` : m.role}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
