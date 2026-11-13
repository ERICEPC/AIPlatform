/*
  个人智能体优化接口层（个人助手 = DeepSeek Harness 驱动的个人智能体）。
  一个人的助手做事分三层优化：
  - 任务路由（个人 Router）：一句话进来，判断用哪些工具、Skill、专家智能体、智能体团队，在桌面端还是云端执行；
  - 记忆与技能：记忆保存经确认的偏好和经验，稳定的做法沉淀为 Skill（记忆接口见 ./memory.ts）；
  - 专家智能体：助手可委派的个人专家智能体与已授权的组织专家智能体，看调用效果再调整。
  桌面端（本地连接器，操作本机文件与命令）与云端（核心 Worker）协同执行。mock 见 ./mock/tune.ts。
*/
import { request } from './http'
import * as db from './mock/tune'

export type TargetType = 'local' | 'cloud' | 'expert' | 'team' | 'kb' | 'skill' | 'human'
export type RouterRule = {
  id: string
  when: string
  target: { type: TargetType, name: string }
  confirm: boolean
  enabled: boolean
  priority: number
  hits_7d: number
  success_rate: number
}
export type RouterSettings = {
  mode: 'auto' | 'rules_first'
  fallback: 'ask' | 'cloud'
  confidence: number
  prefer_local_files: boolean
  max_parallel: number
  model_by_task: boolean
  explain_route: boolean
}
export type RouteStep = { target: { type: TargetType, name: string }, reason: string, where: 'desktop' | 'cloud' | 'human' }
export type RouteTest = { confidence: number, steps: RouteStep[], matched_rule?: string }

export type PersonalSkill = { id: string, name: string, desc: string, source: 'native' | 'local' | 'org' | 'memory', version: string, enabled: boolean, uses_30d: number, success: number, last_used: string, note?: string }
export type ExpertLink = { id: string, name: string, desc: string, kind: 'personal' | 'org', owner: string, status: 'published' | 'reviewing' | 'draft', enabled: boolean, calls_30d: number, success: number, avg_latency: number, issue?: string }
export type Connector = { id: string, device: string, os: string, status: 'online' | 'offline', last_seen: string, workspace: string, version: string, allowed: string[] }
export type DesktopState = {
  connectors: Connector[]
  cloud: { workers: number, running: number, queued: number, region: string }
  split_7d: { desktop: number, cloud: number, human: number }
  settings: { prefer_local_files: boolean, sync_artifacts: boolean, offline_queue: boolean, command_policy: 'deny_by_default' | 'allow_listed' }
}
export type TuneOverview = {
  route_accuracy: number
  memory_score: number
  skills_active: number
  experts_active: number
  desktop_online: boolean
  tasks_7d: number
  human_rate: number
  trend: number[]
  tips: { id: string, title: string, detail: string, to: string }[]
}

/** GET /personal-assistant/tune/overview 个人智能体优化概览 */
export const getTuneOverview = () => request<TuneOverview>({ method: 'GET', path: '/personal-assistant/tune/overview' }, () => db.overview())
/** GET /personal-assistant/router 个人 Router 规则与设置 */
export const getRouter = () => request<{ rules: RouterRule[], settings: RouterSettings }>({ method: 'GET', path: '/personal-assistant/router' }, () => db.router())
/** PUT /personal-assistant/router 保存规则与设置（保存并应用后生效） */
export const saveRouter = (b: { rules: RouterRule[], settings: RouterSettings }) => request<{ rules: RouterRule[], settings: RouterSettings }>({ method: 'PUT', path: '/personal-assistant/router', body: b }, () => db.saveRouter(b))
/** POST /personal-assistant/router/test 试一句任务，看会路由到哪里（不真正执行） */
export const testRoute = (text: string) => request<RouteTest>({ method: 'POST', path: '/personal-assistant/router/test', body: { text } }, () => db.testRoute(text))
/** GET /personal-assistant/skills 助手可用的 Skill 与使用效果 */
export const listMySkills = () => request<{ data: PersonalSkill[] }>({ method: 'GET', path: '/personal-assistant/skills' }, () => ({ data: db.skills }))
/** PATCH /personal-assistant/skills/{id} 启用 / 停用 */
export const toggleMySkill = (id: string, enabled: boolean) => request<PersonalSkill>({ method: 'PATCH', path: `/personal-assistant/skills/${id}`, body: { enabled } }, () => db.toggle(db.skills, id, enabled))
/** GET /personal-assistant/experts 助手可委派的专家智能体（个人 + 组织授权） */
export const listMyExperts = () => request<{ data: ExpertLink[] }>({ method: 'GET', path: '/personal-assistant/experts' }, () => ({ data: db.experts }))
/** PATCH /personal-assistant/experts/{id} 允许 / 不允许助手委派 */
export const toggleMyExpert = (id: string, enabled: boolean) => request<ExpertLink>({ method: 'PATCH', path: `/personal-assistant/experts/${id}`, body: { enabled } }, () => db.toggle(db.experts, id, enabled))
/** GET /personal-assistant/connectors 桌面连接器与云端执行状态 */
export const getDesktop = () => request<DesktopState>({ method: 'GET', path: '/personal-assistant/connectors' }, () => db.desktop())
/** PUT /personal-assistant/connectors/settings 桌面与云端协同设置 */
export const saveDesktopSettings = (s: DesktopState['settings']) => request<DesktopState>({ method: 'PUT', path: '/personal-assistant/connectors/settings', body: s }, () => db.saveDesktop(s))

/** POST /personal-assistant/team-draft 让个人助手按一段描述起草智能体团队（Leader、成员、分工与输出），由你确认后保存 */
export const draftTeamByAssistant = (text: string, agents: { id: string, name: string, description: string }[]) =>
  request<{ leader_id: string, members: { agent_id: string, responsibility: string }[], goal: string, output: string, name: string, reason: string }>({ method: 'POST', path: '/personal-assistant/team-draft', body: { text } }, () => db.draftTeam(text, agents))

export const TARGET_LABEL: Record<TargetType, string> = { local: '桌面端执行', cloud: '云端执行', expert: '专家智能体', team: '智能体团队', kb: '知识库检索', skill: 'Skill', human: '交给人确认' }
