import type { CollabAssistantMember, CollabGroup, CollabMember, CollabMemberStatus, GroupIcon, Seg } from '@/api/collab'
import type { Presence } from '@/components/ui/primitives'
import { RiBankLine, RiBriefcase4Line, RiCustomerService2Line, RiFileChartLine, RiNodeTree, RiTeamLine } from '@remixicon/react'
import { createContext, useCallback, useContext } from 'react'
import { Avatar } from '@/components/ui/primitives'
import { me, teammates } from '@/data'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'

/* 智能体协同页共用的小组件与工具 */

export const people = [me, ...teammates]
/** 按姓名找到此人的助手（用于群里「人」的发言头像） */
export const assistantOfOwner = (owner: string) => people.find(p => p.owner === owner)

const presenceOf: Record<CollabMemberStatus, Presence> = { busy: 'busy', idle: 'idle', offline: 'off' }
export const toPresence = (s: CollabMemberStatus) => presenceOf[s]
export const statusLabel: Record<CollabMemberStatus, string> = { busy: '忙碌', idle: '空闲', offline: '离线' }
export const sourceLabel = { enterprise: '企服', mine: '我的' } as const

/** 不在当前群成员里的 id（例如历史消息里已退群的同事助手）按通讯录兜底 */
function fallbackAssistant(id: string): CollabAssistantMember | undefined {
  const p = people.find(x => x.id === id)
  return p && { kind: 'assistant', id, name: `${p.owner}的助手`, owner: p.owner, role: p.role, avatar: p.avatar, status: p.presence === 'off' ? 'offline' : p.presence, status_text: p.status }
}

/** 当前群的成员表；消息、产出物、协同网络里的名字和头像都从这里查 */
export const MembersContext = createContext<CollabMember[]>([])
export function useMemberLookup() {
  const members = useContext(MembersContext)
  return useCallback((id: string): CollabMember | undefined => members.find(m => m.id === id) ?? fallbackAssistant(id), [members])
}
export function useMember(id: string) {
  return useMemberLookup()(id)
}
/** 短名：助手显示主人姓名，Agent 显示 Agent 名称 */
export const shortName = (m: CollabMember | undefined) => !m ? '成员' : m.kind === 'assistant' ? m.owner : m.name
export const fullName = (m: CollabMember | undefined) => m?.name ?? '成员'

/** 成员头像：助手圆形，Agent 圆角方形 + 青色描边 */
export function MemberAvatar({ member, size = 36, presence, ring, className }: { member: CollabMember | undefined, size?: number, presence?: boolean, ring?: boolean, className?: string }) {
  if (!member)
    return <span className={cn('inline-block shrink-0 rounded-full bg-press', className)} style={{ width: size, height: size }} />
  if (member.kind === 'assistant')
    return <Avatar src={asset(member.avatar)} size={size} presence={presence ? presenceOf[member.status] : undefined} ring={ring} className={className} />
  const dot = { busy: 'bg-amber breathe-dot text-amber', idle: 'bg-mint', offline: 'bg-ink-3' }[member.status]
  return (
    <span className={cn('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      <img
        src={asset(member.avatar)}
        alt=""
        className={cn('size-full border border-cyan/60 bg-glass-2 object-cover', ring && 'ring-2 ring-volt ring-offset-2 ring-offset-bg')}
        style={{ borderRadius: Math.round(size * 0.3) }}
      />
      {presence && <i className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[var(--solid)]', dot)} />}
    </span>
  )
}

/** 成员类型小标：助手 / Agent */
export function KindTag({ kind, className }: { kind: CollabMember['kind'], className?: string }) {
  return (
    <span className={cn(
      'inline-flex h-[17px] shrink-0 items-center rounded-[5px] px-1.5 text-[10.5px] leading-none font-semibold',
      kind === 'agent' ? 'bg-cyan-soft text-cyan' : 'bg-hover text-ink-3',
      className,
    )}
    >
      {kind === 'agent' ? 'Agent' : '助手'}
    </span>
  )
}

const iconMap: Record<GroupIcon, { Icon: React.ComponentType<{ className?: string }>, bg: string }> = {
  node: { Icon: RiNodeTree, bg: 'from-volt to-cyan' },
  presales: { Icon: RiBriefcase4Line, bg: 'from-amber to-volt' },
  support: { Icon: RiCustomerService2Line, bg: 'from-cyan to-mint' },
  bank: { Icon: RiBankLine, bg: 'from-mint to-cyan' },
  report: { Icon: RiFileChartLine, bg: 'from-cyan to-volt' },
  team: { Icon: RiTeamLine, bg: 'from-volt to-mint' },
}

export function GroupAvatar({ icon, size = 36, glow }: { icon: GroupIcon, size?: number, glow?: boolean }) {
  const { Icon, bg } = iconMap[icon] ?? iconMap.team
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-gradient-to-br text-volt-ink', bg, glow && 'shadow-glow-volt')} style={{ width: size, height: size }}>
      <Icon className="size-[48%]" />
    </span>
  )
}

/** 成员头像叠放 */
export function AvatarStack({ members, size = 18, max = 4 }: { members: CollabMember[], size?: number, max?: number }) {
  const shown = members.slice(0, max)
  return (
    <span className="flex items-center">
      {shown.map((m, i) => <MemberAvatar key={m.id} member={m} size={size} className={cn(i > 0 && '-ml-1.5')} />)}
      {members.length > max && <span className="-ml-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border border-line bg-press px-1 text-[10px] text-ink-2">+{members.length - max}</span>}
    </span>
  )
}

/** 「4 位同事的助手 · 2 个 Agent」 */
export function memberSummary(members: CollabMember[]) {
  const a = members.filter(m => m.kind === 'assistant').length
  const g = members.length - a
  return g ? `${a} 位同事的助手 · ${g} 个 Agent` : `${a} 位同事的助手`
}

export const groupStatus = (g: CollabGroup) => g.running_tasks > 0 ? `${g.running_tasks} 项任务进行中` : '暂无进行中的任务'

/** Unix 秒 → 列表/消息里的相对时间 */
export function fmtTime(sec: number) {
  const d = new Date(sec * 1000)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60)
    return '刚刚'
  if (diff < 3600)
    return `${Math.floor(diff / 60)} 分钟前`
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString())
    return hm
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString())
    return `昨天 ${hm}`
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export function At({ id }: { id: string }) {
  const m = useMember(id)
  return <span className="font-medium text-cyan">@{fullName(m)}</span>
}

export function Segs({ content }: { content: Seg[] }) {
  return (
    <>
      {content.map((s, i) => typeof s === 'string'
        ? <span key={i}>{s}</span>
        : 'at' in s
          ? <At key={i} id={s.at} />
          : <b key={i} className="mx-1 text-[17px] text-glow-volt">{s.em}</b>)}
    </>
  )
}

/** localStorage 读写（隐私模式下可能抛错，静默降级） */
export const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key)
    }
    catch {
      return null
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem(key, v)
    }
    catch {}
  },
}

