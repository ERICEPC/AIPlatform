/*
  组织治理与共享审批接口（2026-11-13 改版）。角色：超级管理员 / 部门负责人 / 成员。
  - 共享范围：仅个人（立即生效）/ 部门（部门负责人或超级管理员审批）/ 公共空间（仅超级管理员审批）
  - mock 模式所有接口共用 ./mock/governance.ts 的同一份内存数据，切换演示账号即可看到联动。
  路径与旧后端 controllers/console/agent/governance.py 一致。
*/
import { request, type HttpMethod } from './http'
import * as db from './mock/governance'

export type Role = 'super_admin' | 'dept_head' | 'member'
export type Scope = 'private' | 'department' | 'public'
export type ShareKind = 'agent' | 'team' | 'skill' | 'mcp'
export type RequestState = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'returned' | 'failed' | 'stale'
export type Department = { id: string, name: string, parent_id: string | null }
export type Authority = {
  role: Role
  account_id: string
  name: string
  department_id: string | null
  department_name: string | null
  head_department_ids: string[]
  scope_ids: string[]
  departments: Department[]
  permissions: string[]
  enabled: boolean
}
export type ShareRequest = {
  id: string
  code: string
  kind: ShareKind
  resource_id: string
  resource_name: string
  version: string
  applicant_id: string
  applicant_name: string
  applicant_department_id: string | null
  applicant_department_name: string | null
  requested_scope: 'department' | 'public'
  approved_scope: 'department' | 'public' | null
  department_id: string | null
  department_name: string | null
  current_scope: Scope
  note: string
  state: RequestState
  assignee: 'dept_head' | 'super_admin'
  forwarded_by_name: string | null
  forwarded_at: string | null
  forward_comment: string | null
  reviewer_name: string | null
  comment: string
  created_at: string
  decided_at: string | null
  can_decide: boolean
  can_forward: boolean
}
export type ApprovalDetail = ShareRequest & {
  resource: {
    description: string
    url: string
    owner_name: string
    agent?: { model: string, prompt: string, tools: string[], skills: string[], knowledge: string[] }
    team?: { leader: string, members: string[] }
    skill?: { files: string[], instructions: string }
    mcp?: { server_url: string, tools: string[], authorized: boolean }
  }
  checks: { level: 'ok' | 'warn' | 'risk', text: string }[]
  dependencies: string[]
  changes: string[]
  timeline: { action: 'submit' | 'forward' | 'approve' | 'reject' | 'withdraw', actor_name: string, at: string, comment: string }[]
}
export type ResourceShare = {
  kind: ShareKind
  resource_id: string
  name: string
  visibility: Scope
  department_id: string | null
  department_name: string | null
  can_manage: boolean
  owner_id: string
  published: boolean
  request: ShareRequest | null
  updated_at: string | null
}
export type OrgDepartment = Department & { member_count: number, head_ids: string[] }
export type OrgMember = { id: string, name: string, email: string, department_id: string | null, role: Role, last_login_at: string | null }
export type HeadRecord = { department_id: string, department_name: string, account_id: string, name: string, granted_by_name: string | null, granted_at: string | null }
export type SuperRecord = { account_id: string, name: string, email: string, department_name: string | null, granted_by_name: string | null, granted_at: string | null }
export type IdentitySource = { provider: string, issuer: string, configured: boolean, methods: string[], note: string }
export type UsageAgent = { id: string, name: string, owner_name: string, department_id: string | null, department_name: string | null, visibility: Scope, calls: number, callers: number, tokens: number, models: { model: string, tokens: number }[], last_called_at: string | null }
export type Usage = { days: number, departments: { id: string, name: string }[], summary: { agents: number, calls: number, callers: number, tokens: number }, agents: UsageAgent[] }
export type AuditResult = 'success' | 'denied' | 'failed'
export type AuditRow = { id: string, time: string, actor_name: string, object_name: string, category: string, summary: string, department_name: string | null, result: AuditResult }
export type AuditQuery = { actor?: string, category?: string, department_id?: string, result?: string, days?: string, keyword?: string }
export type ShareHint = { name?: string, published?: boolean }

/** 通用调用（旧页面沿用）；mock 模式只覆盖治理相关路径 */
export const governance = <T,>(path: string, method: HttpMethod = 'GET', body?: unknown) => request<T>({ path, method, body }, () => db.route(path) as T)

/** GET /account/permissions 当前账号角色与部门 */
export const getAuthority = () => request<Authority>({ method: 'GET', path: '/account/permissions' }, () => db.authority())

/* ---------------- 共享申请（开发者侧） ---------------- */
/** GET /resource-visibility/{kind}/{id} 资源当前可见范围与最近一次申请 */
export const getShare = (kind: ShareKind, id: string, hint?: ShareHint) =>
  request<ResourceShare>({ method: 'GET', path: `/resource-visibility/${kind}/${encodeURIComponent(id)}` }, () => db.share(kind, id, hint))
/** POST /resource-shares 申请共享：private 立即生效；department / public 进入审批 */
export const submitShare = (b: { kind: ShareKind, resource_id: string, scope: Scope, note?: string }, hint?: ShareHint) =>
  request<ResourceShare>({ method: 'POST', path: '/resource-shares', body: b }, () => db.submitShare(b, hint))
/** POST /releases/{id}/withdraw 撤回审批中的申请 */
export const withdrawShare = (id: string) => request<ShareRequest>({ method: 'POST', path: `/releases/${id}/withdraw` }, () => db.withdraw(id))
/** GET /releases/mine 我的发布：本人创建的全部智能体、团队、Skills、MCP */
export const listMine = () => request<{ data: ResourceShare[] }>({ method: 'GET', path: '/releases/mine' }, () => db.mine())

/* ---------------- 发布审批 ---------------- */
/** GET /admin/approvals?state= 按角色过滤 */
export const listApprovals = (state: 'pending' | 'done' | 'all') => request<{ data: ShareRequest[] }>({ method: 'GET', path: '/admin/approvals', query: { state } }, () => db.approvals(state))
/** GET /admin/approvals/{id} 审批详情（含资源信息、检查、审批路径） */
export const getApproval = (id: string) => request<ApprovalDetail>({ method: 'GET', path: `/admin/approvals/${id}` }, () => db.approval(id))
/** POST /admin/approvals/{id}/decision 通过（可收窄范围）/ 驳回（必填意见） */
export const decideApproval = (id: string, b: { decision: 'approve' | 'reject', scope?: 'department' | 'public', comment: string }) =>
  request<ShareRequest>({ method: 'POST', path: `/admin/approvals/${id}/decision`, body: b }, () => db.decide(id, b))
/** POST /admin/approvals/{id}/forward 部门负责人转审超级管理员（必填意见） */
export const forwardApproval = (id: string, comment: string) => request<ShareRequest>({ method: 'POST', path: `/admin/approvals/${id}/forward`, body: { comment } }, () => db.forward(id, comment))

/* ---------------- 组织与成员 ---------------- */
export const getOrg = () => request<{ departments: OrgDepartment[], members: OrgMember[], readonly: boolean }>({ method: 'GET', path: '/admin/org' }, () => db.org())
export const createDepartment = (b: { name: string, parent_id: string | null }) => request<Department>({ method: 'POST', path: '/admin/departments', body: b }, () => db.createDept(b))
export const updateDepartment = (id: string, b: { name: string, parent_id: string | null }) => request<Department>({ method: 'PUT', path: `/admin/departments/${id}`, body: b }, () => db.updateDept(id, b))
export const deleteDepartment = (id: string) => request<{ result: string }>({ method: 'DELETE', path: `/admin/departments/${id}` }, () => db.deleteDept(id))
export const setMemberDepartment = (id: string, department_id: string | null) => request<{ result: string }>({ method: 'PUT', path: `/admin/members/${id}/department`, body: { department_id } }, () => db.setMemberDept(id, department_id))
export const listHeads = () => request<{ data: HeadRecord[] }>({ method: 'GET', path: '/admin/department-heads' }, () => db.heads())
export const addHead = (department_id: string, account_id: string) => request<{ result: string }>({ method: 'POST', path: '/admin/department-heads', body: { department_id, account_id } }, () => db.addHead(department_id, account_id))
export const removeHead = (department_id: string, account_id: string) => request<{ result: string }>({ method: 'DELETE', path: `/admin/department-heads/${department_id}/${account_id}` }, () => db.removeHead(department_id, account_id))
export const listSupers = () => request<{ data: SuperRecord[] }>({ method: 'GET', path: '/admin/super-admins' }, () => db.supers())
export const addSuper = (account_id: string) => request<{ result: string }>({ method: 'POST', path: '/admin/super-admins', body: { account_id } }, () => db.addSuper(account_id))
export const removeSuper = (account_id: string) => request<{ result: string }>({ method: 'DELETE', path: `/admin/super-admins/${account_id}` }, () => db.removeSuper(account_id))
export const getIdentitySource = () => request<IdentitySource>({ method: 'GET', path: '/admin/identity-source' }, () => db.identitySource())

/* ---------------- 业务空间用量与审计 ---------------- */
export const getUsage = (days: 7 | 30, department_id = '') => request<Usage>({ method: 'GET', path: '/admin/usage', query: { days, department_id } }, () => db.usage(days, department_id))
export const listAudit = (q: AuditQuery) => request<{ data: AuditRow[], actors: string[], categories: string[] }>({ method: 'GET', path: '/admin/audit', query: q }, () => db.audit(q))

/* ---------------- 统一身份登录 ---------------- */
export const partnerAuthStatus = () => request<{ configured: boolean, issuer: string, bound?: boolean }>({ method: 'GET', path: '/auth/partner/status' }, () => ({ configured: false, bound: false, issuer: 'https://partner.sensetime.com/auth' }))

/* ---------------- 文案 ---------------- */
export const ROLE_TEXT: Record<Role, string> = { super_admin: '超级管理员', dept_head: '部门负责人', member: '成员' }
export const SCOPE_TEXT: Record<Scope, string> = { private: '仅个人', department: '部门', public: '公共空间' }
export const KIND_TEXT: Record<ShareKind, string> = { agent: '智能体', team: '智能体团队', skill: 'Skills', mcp: 'MCP与工具' }
export const STATE_TEXT: Record<RequestState, [string, 'neutral' | 'amber' | 'mint' | 'rose' | 'volt']> = { pending: ['审批中', 'amber'], approved: ['已通过', 'mint'], rejected: ['已驳回', 'rose'], returned: ['已驳回', 'rose'], withdrawn: ['已撤回', 'neutral'], failed: ['执行失败', 'rose'], stale: ['配置已变化', 'rose'] }
export const isForwarded = (r: Pick<ShareRequest, 'state' | 'forwarded_at'>) => r.state === 'pending' && !!r.forwarded_at
export const approverText = (r: Pick<ShareRequest, 'assignee' | 'department_name'>) => r.assignee === 'super_admin' ? '超级管理员' : `${r.department_name || '部门'}负责人`
/** 「申请 部门 · 审批中 · 审批人：北区东区负责人」 */
export function requestLine(r: ShareRequest) {
  if (isForwarded(r)) return `申请 ${SCOPE_TEXT[r.requested_scope]} · 已转审超级管理员`
  if (r.state === 'pending') return `申请 ${SCOPE_TEXT[r.requested_scope]} · 审批中 · 审批人：${approverText(r)}`
  return `申请 ${SCOPE_TEXT[r.requested_scope]} · ${STATE_TEXT[r.state][0]}${r.state === 'approved' && r.approved_scope && r.approved_scope !== r.requested_scope ? `（收窄为${SCOPE_TEXT[r.approved_scope]}）` : ''}`
}
export const fmtTime = (v?: string | null) => v ? new Date(v).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'

/* ---------------- 旧发布接口（智能体 / Skill 版本发布仍在使用） ---------------- */
export type ReleaseOptions = { visibility: 'private' | 'department' | 'workspace', department_ids: string[], department_id: string | null, external_access?: boolean }
export type Release = { id: string, resource_name: string, kind: string, action: string, state: string, note: string, comment: string, created_at: string, department_id: string | null, visibility: string, department_ids: string[], summary: Record<string, unknown>, result: { message?: string } }
export const submitRelease = (kind: string, resource_id: string, action: string, note: string, options: ReleaseOptions) => governance<Release>('/releases', 'POST', { kind, resource_id, action, note, ...options })
export const releaseStates: Record<string, string> = { pending: '待审批', approved: '已生效', returned: '退回修改', rejected: '已拒绝', withdrawn: '已撤回', failed: '执行失败', stale: '配置已变化' }

/** 已登录用户把当前平台账号绑定到企业统一身份（服务端按当前会话绑定，不按邮箱合并） */
export const bindPartnerAuth = () => { location.href = `${import.meta.env.VITE_API_BASE ?? '/console/api'}/auth/partner/login?bind=1&redirect_url=${encodeURIComponent(`${location.pathname}${location.hash || '#assistant'}`)}` }
