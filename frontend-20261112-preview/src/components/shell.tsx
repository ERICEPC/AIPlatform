import { useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import { ease } from '@/lib/motion'
import {
  RiApps2Line,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowLeftRightLine,
  RiBarChartBoxLine,
  RiBookOpenLine,
  RiBriefcase4Line,
  RiChat3Line,
  RiCodeBoxLine,
  RiCommunityLine,
  RiCpuLine,
  RiDashboardLine,
  RiDatabase2Line,
  RiFileShieldLine,
  RiFlashlightLine,
  RiNotification3Line,
  RiOrganizationChart,
  RiQuestionLine,
  RiRocketLine,
  RiSearchLine,
  RiServerLine,
  RiShieldStarLine,
  RiSpeedUpLine,
  RiTeamLine,
  RiUserSettingsLine,
} from '@remixicon/react'
import { governance, type Release } from '@/api/governance'
import type { Permissions } from '@/api/access'
const listApprovals = (state: string) => governance<{data: Release[]}>(`/admin/approvals?state=${state}`)
import { useQuery } from '@/api/hooks'
import { isAdmin, ROLE_LABEL } from '@/api/access'
import { cn } from '@/lib/cn'
import { useSession } from '@/lib/session'
import { ModuleMark } from './page-mark'
import { UserCard } from './settings'
import { TeamSwitcher } from './team-switcher'

const SIDEBAR_KEY = 'rx-global-sidebar-collapsed'
let sidebarCollapsed = (() => { try { return localStorage.getItem(SIDEBAR_KEY) === 'true' } catch { return false } })()
const sidebarListeners = new Set<() => void>()
const subscribeSidebar = (listener: () => void) => { sidebarListeners.add(listener); return () => { sidebarListeners.delete(listener) } }
function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribeSidebar, () => sidebarCollapsed)
  const toggle = () => {
    sidebarCollapsed = !sidebarCollapsed
    try { localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed)) } catch { /* Storage can be unavailable. */ }
    sidebarListeners.forEach(listener => listener())
  }
  return { collapsed, toggle }
}

/*
  企业版外框（2026-11-08 重做）：顶栏 + 左侧导航 + 内容区，去掉浮动毛玻璃面板与背景特效。
  一套前端两个区域：
  - 用户端（开发者工作台）：所有开发者，与 xBuddy 同一身份登录
  - 管理后台：普通管理员（按部门 / 业务 / 工作流授权）与超级管理员
*/
export type Route =
  | 'login' | 'assistant' | 'config' | 'collab' | 'review' | 'tune' | 'teams'
  | 'agents' | 'studio' | 'kb' | 'skills' | 'integrations'
  | 'data' | 'models' | 'accelerator' | 'scaffold' | 'monitor' | 'releases' | 'mcphub'
  | 'admin' | 'maas' | 'dev-assistant' | 'app-integrations' | 'operations' | 'device-authorize' | 'app-authorize'

/* 背景只保留纯色底（企业版不再渲染光斑、点阵与颗粒） */
export function Backdrop() {
  return null
}

type NavItem = { path: string, label: string, icon: React.ComponentType<{ className?: string }>, color: string, match?: string[], superOnly?: boolean, badge?: number }
type NavGroup = { title: string, items: NavItem[] }

export const WORKSPACE_NAV: NavGroup[] = [
  { title: '工作台', items: [
    { path: 'assistant', label: '个人助手', color: '#f08c00', icon: RiChat3Line, match: ['assistant', 'config'] },
    { path: 'collab', label: '智能体协同', color: '#12a594', icon: RiOrganizationChart },
    { path: 'tune', label: '助手成长', color: '#7c5cff', icon: RiSpeedUpLine },
  ] },
  { title: '智能体开发', items: [
    { path: 'agents', label: '智能体', color: '#8b5cf6', icon: RiCommunityLine },
    { path: 'teams', label: '智能体团队', color: '#1f9d55', icon: RiTeamLine },
    { path: 'skills', label: 'Skills', color: '#e8a317', icon: RiFlashlightLine },
    { path: 'integrations', label: 'MCP 与工具', color: '#0ea5a4', icon: RiServerLine },
    { path: 'releases', label: '我的发布', color: '#e8487d', icon: RiRocketLine },
  ] },
  { title: '知识库', items: [
    { path: 'kb', label: '知识库', color: '#2f7fe0', icon: RiBookOpenLine },
  ] },
  { title: '技术开发栈', items: [
    { path: 'dev-assistant', label: '开发助手', color: '#6366f1', icon: RiCodeBoxLine },
    { path: 'accelerator', label: 'Buddy 加速包', color: '#2563eb', icon: RiApps2Line },
    { path: 'scaffold', label: '脚手架', color: '#3b82f6', icon: RiCodeBoxLine },
  ] },
  { title: 'MaaS平台', items: [
    { path: 'maas', label: 'MaaS管理', color: '#6366f1', icon: RiCpuLine },
  ] },
  { title: '观测', items: [
    { path: 'data', label: '数据库与存储', color: '#0f766e', icon: RiDatabase2Line },
    { path: 'models', label: '模型与额度', color: '#5b5bd6', icon: RiCpuLine },
    { path: 'monitor', label: '调用与监控', color: '#0891b2', icon: RiBarChartBoxLine },
  ] },
]

export const ADMIN_NAV: NavGroup[] = [
  { title: '管理后台', items: [
    { path: 'admin', label: '概览', color: '#2563eb', icon: RiDashboardLine, match: ['admin/'] },
    { path: 'admin/approvals', label: '发布审批', color: '#f0503c', icon: RiFileShieldLine },
    { path: 'admin/org', label: '组织与成员', color: '#12a594', icon: RiOrganizationChart },
    { path: 'admin/admins', label: '管理员与权限', color: '#7c5cff', icon: RiShieldStarLine },
    { path: 'admin/spaces', label: '业务空间', color: '#1f9d55', icon: RiBriefcase4Line },
    { path: 'admin/audit', label: '审计日志', color: '#64748b', icon: RiUserSettingsLine },
  ] },
]
/* 应用接入（xBuddy）与 AI 技术栈组件不再出现在导航与页面搜索中；路由保留，仅超级管理员可直接打开 */
export function canSeeAdmin(path:string,p:Permissions|null){const permission:Record<string,string>={'admin':'ops.view','admin/approvals':'release.approve','admin/org':'org.members','admin/admins':'super','admin/spaces':'ops.view','admin/apps':'super','admin/stack':'super','admin/audit':'audit.view'};const need=permission[path.split('/').slice(0,2).join('/')]||'ops.view';return !!p&&(p.role==='super_admin'||(need!=='super'&&p.permissions.includes(need)))}

function NavLink({ item, current, go }: { item: NavItem, current: string, go: (path: string) => void }) {
  const active = (item.match ?? [item.path]).some(m => (m.endsWith('/') ? current === m.slice(0, -1) : current === m || current.startsWith(`${m}/`)))
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => go(item.path)}
      aria-current={active ? 'page' : undefined}
      className={cn('relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-[13.5px] transition-colors', active ? 'bg-volt-soft font-semibold text-volt-text' : 'text-ink-2 hover:bg-hover hover:text-ink')}
    >
      {active && <span className="absolute top-2 bottom-2 -left-2 w-[3px] rounded-r bg-volt" />}
      <ModuleMark icon={Icon} color={item.color} size={22} />
      <span className="truncate">{item.label}</span>
      {item.badge !== undefined && <span className={cn('ml-auto grid h-[18px] min-w-[18px] place-items-center rounded px-1 text-[11px] font-semibold tabular-nums', active ? 'bg-volt text-volt-ink' : 'bg-press text-ink-2')}>{item.badge}</span>}
    </button>
  )
}

export function Sidebar({ current, go, admin }: { current: string, go: (path: string) => void, admin: boolean }) {
  const { collapsed, toggle } = useSidebarCollapsed()
  const { perms } = useSession()
  // 管理后台发布审批数量；切换路由时刷新
  const approvals = useQuery(() => listApprovals('pending'), [current], { enabled: admin && !!perms?.permissions.includes('release.approve') })
  const counts: Record<string, number | undefined> = { 'admin/approvals': approvals.data?.data.length }
  const groups = (admin
    ? ADMIN_NAV.map(g => ({ ...g, items: g.items.filter(i => canSeeAdmin(i.path, perms)) }))
    : WORKSPACE_NAV).map(g => ({ ...g, items: g.items.map(i => (counts[i.path] ? { ...i, badge: counts[i.path] } : i)) }))
  return (
    <div className="relative flex min-h-0 shrink-0">
    <motion.aside id="global-sidebar" initial={false} animate={{ width: collapsed ? 0 : 228, opacity: collapsed ? 0 : 1 }} transition={{ duration: 0.42, ease: ease.sheet }} aria-hidden={collapsed} inert={collapsed} className="flex min-h-0 shrink-0 overflow-hidden bg-solid">
      <div className="flex min-h-0 w-[228px] shrink-0 flex-col border-r border-line">
      <div className="px-3 pt-3"><TeamSwitcher /></div>
      <nav className="mt-2 min-h-0 flex-1 space-y-4 overflow-auto px-3 pb-3">
        {groups.map(g => (
          <div key={g.title}>
            <p className="mb-1 px-3 text-[11.5px] font-medium tracking-wide text-ink-3">{g.title}</p>
            <div className="space-y-0.5">{g.items.map(i => <NavLink key={i.path} item={i} current={current} go={go} />)}</div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line px-3 pb-3"><UserCard go={go} /></div>
      </div>
    </motion.aside>
    <button type="button" onClick={toggle} aria-label={collapsed ? '展开导航' : '收起导航'} title={collapsed ? '展开导航' : '收起导航'} aria-expanded={!collapsed} aria-controls="global-sidebar" className={cn('absolute top-9 z-30 grid h-8 w-5 cursor-pointer place-items-center border border-line bg-solid text-ink-3 shadow-sm transition-colors hover:border-volt/40 hover:bg-volt-soft hover:text-volt-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt', collapsed ? 'left-0 rounded-r-md border-l-0' : '-right-2.5 rounded-md')}>
      {collapsed ? <RiArrowRightSLine className="size-4" /> : <RiArrowLeftSLine className="size-4" />}
    </button>
    </div>
  )
}

export function TopBar({ admin, go, onSearch }: { admin: boolean, go: (path: string) => void, onSearch: () => void }) {
  const { perms } = useSession()
  const canAdmin = isAdmin(perms)
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-solid px-4">
      <div className="logo-mark h-7 w-[132px] shrink-0" role="img" aria-label="Raccoon X 智能体中台" />
      <span className="h-5 w-px bg-line" />
      <span className="text-[13.5px] font-semibold">{admin ? '管理后台' : '开发者工作台'}</span>
      {perms && <span className="rounded bg-press px-1.5 py-0.5 text-[11.5px] text-ink-2">{perms.tenant?.name}</span>}
      <button type="button" onClick={onSearch} className="ml-6 flex h-8 w-[300px] cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink-3 transition-colors hover:border-line-strong max-lg:hidden">
        <RiSearchLine className="size-4" />搜索页面、智能体、知识库…<span className="ml-auto rounded border border-line px-1 text-[11px]">⌘K</span>
      </button>
      <div className="ml-auto flex items-center gap-1.5">

        {canAdmin && (
          <button type="button" onClick={() => go(admin ? 'assistant' : ADMIN_NAV.flatMap(g=>g.items).find(i=>canSeeAdmin(i.path,perms))?.path || 'assistant')} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-solid px-3 text-[13px] font-medium transition-colors hover:border-volt/60 hover:text-volt-text">
            <RiArrowLeftRightLine className="size-4" />{admin ? '返回工作台' : '管理后台'}
          </button>
        )}
        <button type="button" aria-label="帮助文档" className="grid size-8 cursor-pointer place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><RiQuestionLine className="size-[18px]" /></button>
        <button type="button" aria-label="通知" onClick={() => go(admin ? 'admin/approvals' : 'releases')} className="relative grid size-8 cursor-pointer place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
          <RiNotification3Line className="size-[18px]" />
        </button>
        {perms && <span className="ml-1 rounded-md bg-volt-soft px-2 py-1 text-[12px] font-medium text-volt-text">{ROLE_LABEL[perms.role]}</span>}
      </div>
    </header>
  )
}

/** 当前路由对应的导航模块（用于页面标题前的彩色标识） */
export function navItemFor(path: string, admin = false): NavItem | undefined {
  const items = (admin ? ADMIN_NAV : WORKSPACE_NAV).flatMap(g => g.items)
  const hit = (i: NavItem) => (i.match ?? [i.path]).some(m => (m.endsWith('/') ? path === m.slice(0, -1) : path === m || path.startsWith(`${m}/`)))
  return items.filter(hit).sort((a, b) => b.path.length - a.path.length)[0]
}
