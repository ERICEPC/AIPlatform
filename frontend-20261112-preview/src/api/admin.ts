/*
  管理后台接口层（2026-11-08 新增）。前缀与控制台接口相同（/console/api），路径以 /admin 开头，服务端按角色校验：
  - 超级管理员：全部接口，含 AI 技术栈组件的连接配置、测试与导出。
  - 普通管理员：只返回其管理范围（部门 / 业务 / 工作流）内的数据；技术栈组件只读（状态与健康）。
  前端只负责按角色隐藏无权操作，权限以服务端为准。mock 见 ./mock/admin.ts；接口清单见 docs/api/admin.md。
*/
import type { FieldDef, FieldValue, Health } from '@/components/console'
import type { AdminScope, Role } from './access'
import type { ReleaseRequest, Visibility } from './releases'
import { request } from './http'
import * as db from './mock/admin'

export type Overview = {
  pending: number
  published_30d: number
  members: number
  admins: number
  spaces: number
  calls_7d: number[]
  tokens_7d: number
  apps: { id: string, name: string, calls_7d: number, status: Health }[]
  components: { id: string, name: string, status: Health }[]
  recent: AuditEntry[]
}
export type Department = { id: string, name: string, parent: string | null, members: number, admins: string[] }
export type Member = { id: string, name: string, email: string, dept: string, title: string, role: Role | 'user', apps: string[], status: 'active' | 'disabled', last_login: string }
export type AdminRecord = { id: string, name: string, email: string, role: 'super_admin' | 'admin', role_id: string, scopes: AdminScope[], granted_by: string, granted_at: string }
/* 组织与权限参考飞书管理后台：部门 · 成员 · 用户组 · 通讯录同步；管理员角色 ＝ 权限项集合 ＋ 管理范围；资源可用范围按部门 / 用户组 / 成员授予 */
export type UserGroup = { id: string, name: string, type: 'static' | 'dynamic', rule: string, members: number, used_by: string[], owner: string }
export type DirectorySync = { source: 'feishu' | 'oidc' | 'manual', status: Health, last_sync: string, next_sync: string, schedule: string, departments: number, members: number, mapping: { field: string, from: string }[], log: { time: string, text: string }[] }
export type PermissionItem = { id: string, group: string, name: string, desc: string }
export type AdminRole = { id: string, name: string, preset: boolean, desc: string, permissions: string[], scope_types: ('all' | 'department' | 'business' | 'workflow')[], members: number }
export type PermissionRow = { object: string, actions: Record<'developer' | 'admin' | 'super_admin', string> }

export type SpaceResource = { kind: 'database' | 'vector' | 'object' | 'kb' | 'model' | 'app', name: string, detail: string, usage?: number, quota?: number, unit?: string }
export type BusinessSpace = {
  id: string
  name: string
  desc: string
  admins: string[]
  members: number
  apps: string[]
  agents: number
  workflows: number
  resources: SpaceResource[]
  fields: FieldDef[]
  values: Record<string, FieldValue>
}

export type Capability = 'agents' | 'kb' | 'memory' | 'workflows' | 'skills' | 'mcp' | 'models' | 'database' | 'accelerator' | 'scaffold' | 'monitor'
export type AppIntegration = {
  id: string
  name: string
  en: string
  desc: string
  status: Health
  owner: string
  client_id: string
  secret_hint: string
  callback_url: string
  sso: boolean
  capabilities: Capability[]
  rate_limit: number
  calls_7d: number
  last_call: string
  usage_note: string
}

export type ComponentCategory = 'data' | 'model' | 'runtime' | 'knowledge' | 'tools' | 'devkit' | 'security' | 'observe'
export type StackComponent = {
  id: string
  category: ComponentCategory
  name: string
  product: string
  desc: string
  status: Health
  version: string
  endpoint: string
  last_check: string
  latency_ms: number | null
  used_by: string[]
  /** 普通开发者在用户端能做的配置（说明用） */
  user_side: string
  fields: FieldDef[]
  values: Record<string, FieldValue>
}
export type TestResult = { ok: boolean, latency_ms: number, steps: { name: string, ok: boolean, detail: string }[] }
export type AuditEntry = { id: string, time: string, actor: string, role: string, action: string, object: string, scope: string, result: 'success' | 'denied' | 'failed' }

/* ---------------- 概览 ---------------- */
/** GET /admin/overview 管理后台概览（普通管理员只统计管理范围内） */
export const getOverview = () => request<Overview>({ method: 'GET', path: '/admin/overview' }, () => db.overview())

/* ---------------- 发布审批 ---------------- */
/** GET /admin/approvals?state= 发布申请（按管理范围过滤） */
export const listApprovals = (state: 'pending' | 'done' | 'all' = 'pending') => request<{ data: ReleaseRequest[] }>({ method: 'GET', path: '/admin/approvals', query: { state } }, () => db.approvals(state))
/** POST /admin/approvals/{id}/decision 通过 / 退回 / 拒绝；通过时可收窄可见范围；退回、拒绝必须写原因 */
export const decideApproval = (id: string, b: { decision: 'approve' | 'return' | 'reject', visibility?: Visibility, range?: string[], comment: string }) =>
  request<ReleaseRequest>({ method: 'POST', path: `/admin/approvals/${id}/decision`, body: b }, () => db.decide(id, b))

/* ---------------- 组织、成员、管理员 ---------------- */
/** GET /admin/org 部门树与成员（普通管理员只看管理范围） */
export const getOrg = () => request<{ departments: Department[], members: Member[] }>({ method: 'GET', path: '/admin/org' }, () => db.org())
/** PATCH /admin/members/{id} 修改成员角色或停用（超级管理员） */
export const updateMember = (id: string, b: Partial<Pick<Member, 'role' | 'status'>>) => request<Member>({ method: 'PATCH', path: `/admin/members/${id}`, body: b }, () => db.updateMember(id, b))
/** GET /admin/admins 管理员与权限矩阵 */
export const listAdmins = () => request<{ data: AdminRecord[], matrix: PermissionRow[] }>({ method: 'GET', path: '/admin/admins' }, () => db.admins())
/** GET /admin/groups 用户组（静态 / 按规则动态），用于可用范围、审批人与记忆审查人 */
export const listGroups = () => request<{ data: UserGroup[] }>({ method: 'GET', path: '/admin/groups' }, () => db.groups())
/** POST /admin/groups 新建用户组 */
export const createGroup = (b: Pick<UserGroup, 'name' | 'type' | 'rule'>) => request<UserGroup>({ method: 'POST', path: '/admin/groups', body: b }, () => db.createGroup(b))
/** GET /admin/directory-sync 通讯录同步（飞书 / 统一身份）状态与字段映射 */
export const getDirectorySync = () => request<DirectorySync>({ method: 'GET', path: '/admin/directory-sync' }, () => db.directory())
/** POST /admin/directory-sync/run 立即同步 */
export const runDirectorySync = () => request<DirectorySync>({ method: 'POST', path: '/admin/directory-sync/run' }, () => db.runDirectory())
/** GET /admin/roles 管理员角色与权限项（预置角色不可删除；超级管理员角色不可修改） */
export const listRoles = () => request<{ data: AdminRole[], items: PermissionItem[] }>({ method: 'GET', path: '/admin/roles' }, () => db.roles())
/** PUT /admin/roles/{id} 修改自定义角色的权限项与可用的管理范围类型 */
export const saveRole = (id: string, b: Pick<AdminRole, 'name' | 'desc' | 'permissions' | 'scope_types'>) => request<AdminRole>({ method: 'PUT', path: `/admin/roles/${id}`, body: b }, () => db.saveRole(id, b))
/** POST /admin/roles 新建自定义管理员角色 */
export const createRole = (b: Pick<AdminRole, 'name' | 'desc' | 'permissions' | 'scope_types'>) => request<AdminRole>({ method: 'POST', path: '/admin/roles', body: b }, () => db.createRole(b))
/** POST /admin/admins 任命管理员：选择角色并指定管理范围（超级管理员） */
export const grantAdmin = (b: { member_id: string, role_id: string, scopes: AdminScope[] }) => request<AdminRecord>({ method: 'POST', path: '/admin/admins', body: b }, () => db.grantAdmin(b))
/** DELETE /admin/admins/{id} 撤销管理员（超级管理员） */
export const revokeAdmin = (id: string) => request<{ ok: boolean }>({ method: 'DELETE', path: `/admin/admins/${id}` }, () => db.revokeAdmin(id))

/* ---------------- 业务空间 ---------------- */
/** GET /admin/spaces 业务空间（按部门或业务划分；普通管理员只看自己管理的） */
export const listSpaces = () => request<{ data: BusinessSpace[] }>({ method: 'GET', path: '/admin/spaces' }, () => db.spaces())
/** PUT /admin/spaces/{id} 为业务配置资源：数据库 schema、知识库空间、模型额度、xBuddy 接入、默认可见范围 */
export const saveSpace = (id: string, values: Record<string, FieldValue>) => request<BusinessSpace>({ method: 'PUT', path: `/admin/spaces/${id}`, body: values }, () => db.saveSpace(id, values))

/* ---------------- 应用接入（xBuddy） ---------------- */
/** GET /admin/apps 调用 X 平台的业务应用（SalesBuddy、ProjectBuddy 等） */
export const listApps = () => request<{ data: AppIntegration[] }>({ method: 'GET', path: '/admin/apps' }, () => db.apps())
/** PATCH /admin/apps/{id} 开放能力范围、回调地址、限流、统一身份 */
export const updateApp = (id: string, b: Partial<AppIntegration>) => request<AppIntegration>({ method: 'PATCH', path: `/admin/apps/${id}`, body: b }, () => db.updateApp(id, b))
/** POST /admin/apps/{id}/rotate-secret 轮换应用密钥（只返回一次） */
export const rotateAppSecret = (id: string) => request<{ secret: string }>({ method: 'POST', path: `/admin/apps/${id}/rotate-secret` }, () => db.rotateSecret(id))

/* ---------------- AI 技术栈组件 ---------------- */
/** GET /admin/stack/components 技术栈组件、连接配置（密钥只返回掩码）与健康状态 */
export const listComponents = () => request<{ data: StackComponent[] }>({ method: 'GET', path: '/admin/stack/components' }, () => db.components())
/** PUT /admin/stack/components/{id} 保存连接配置（超级管理员；密钥字段留空表示不修改） */
export const saveComponent = (id: string, values: Record<string, FieldValue>) => request<StackComponent>({ method: 'PUT', path: `/admin/stack/components/${id}`, body: values }, () => db.saveComponent(id, values))
/** POST /admin/stack/components/{id}/test 用当前填写的配置测试连接（不保存） */
export const testComponent = (id: string, values: Record<string, FieldValue>) => request<TestResult>({ method: 'POST', path: `/admin/stack/components/${id}/test`, body: values }, () => db.testComponent(id, values))
/** GET /admin/stack/export 导出后端连接配置（.env 与 JSON；密钥以占位符输出） */
export const exportStack = () => request<{ env: string, json: string }>({ method: 'GET', path: '/admin/stack/export' }, () => db.exportStack())

/* ---------------- 审计 ---------------- */
/** GET /admin/audit 操作审计（谁在什么范围做了什么） */
export const listAudit = (q: { actor?: string, action?: string } = {}) => request<{ data: AuditEntry[] }>({ method: 'GET', path: '/admin/audit', query: q }, () => db.audit(q))

export const CATEGORY: Record<ComponentCategory, string> = { data: '数据与存储', model: '模型与网关', runtime: '智能体运行', knowledge: '知识与记忆', tools: '工具与集成', devkit: '开发套件', security: '身份与安全', observe: '观测' }
export const CAPABILITY: Record<Capability, string> = { agents: '智能体', kb: '知识库', memory: '记忆', workflows: '智能体团队', skills: 'Skills', mcp: 'MCP 与工具', models: '模型网关', database: '数据库与存储', accelerator: 'Buddy 加速包', scaffold: '脚手架', monitor: '调用监控' }
