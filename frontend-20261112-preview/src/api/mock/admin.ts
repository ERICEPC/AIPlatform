import { developmentSeeds } from './development-seeds'
/*
  管理后台与发布申请的有状态 mock（演示数据）。开发者提交的发布申请与管理员审批共用这里的数据，
  所以在「我的发布」提交后，切换到管理员演示账号就能在「发布审批」里看到。
  连接配置里的地址都是示例（*.example.internal），密钥只存掩码。
*/
import type { AdminRecord, AdminRole, AppIntegration, AuditEntry, BusinessSpace, Department, DirectorySync, Member, Overview, PermissionItem, PermissionRow, StackComponent, TestResult, UserGroup } from '../admin'
import type { CopyAssistantBody, ReleaseKind, ReleaseRequest, Visibility } from '../releases'
import type { FieldDef, FieldValue } from '@/components/console'
import { ApiError } from '../http'
import { currentDemo, permissions } from './access'
import * as teamDb from './teams'
import { listGroups as collabGroups } from './collab'
import { db as agentDb } from './agents'
import { db as skillDb } from './skills'
import { kbDb } from './knowledge'
import { toolDb } from './integrations/tools'
import type { ExpertTeamBody } from '../releases'

const iso = (h: number) => new Date(Date.now() - h * 3600000).toISOString()
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`
const who = () => currentDemo()?.name ?? '叶源'

/* ---------------- 发布申请 ---------------- */
let releases: ReleaseRequest[] = [
  { id: 'RQ-1108-01', kind: 'assistant_copy', object_id: 'ag-eval', name: '上线评估助手', version: 'v1', note: '由个人助手复制：上线评估检查清单、评测集回放与风险评估三个 Skill，附 3 条经确认的工作经验。', visibility: 'department', scope: 'FDE 交付中心', applicant: '叶源', submitted_at: iso(2), state: 'pending', checks: [{ level: 'ok', text: '模型：SenseNova-6.8-Flash，可用' }, { level: 'ok', text: '3 条记忆已去除个人与客户信息' }, { level: 'warn', text: '引用知识库「FDE 交付规范」，发布后调用者需各自具备访问权限' }], dependencies: ['知识库 · FDE 交付规范', 'Skill · 上线评估检查 0.9'], changes: ['新建：由个人助手复制'], test_summary: '3 条真实样例：通过 3 条' },
  { id: 'RQ-1108-02', kind: 'agent', object_id: 'ag-visit', name: '拜访纪要整理', version: 'v3', note: '补充 SPIN 话术识别；输出增加「下一步行动」与负责人待确认标记。', visibility: 'org', scope: '销售管理', applicant: '叶源', submitted_at: iso(5), state: 'pending', checks: [{ level: 'ok', text: '工具授权正常' }, { level: 'warn', text: '可见范围为「组织内」，超出申请人所在部门' }, { level: 'ok', text: '被 SalesBuddy 拜访页调用，发布后线上立即使用新版本' }], dependencies: ['知识库 · GTM 弹药库', 'MCP · 商机系统（只读）'], changes: ['提示词：新增 SPIN 识别规则', '输出结构：新增「下一步行动」'], test_summary: '5 条真实样例：通过 4 条，1 条缺少负责人（已标待确认）' },
  { id: 'RQ-1107-05', kind: 'team', object_id: 'presales', name: '售前方案团队', version: 'v3', note: 'Leader 采纳复盘建议：合规初筛前置；报价测算输入补两项必填。', visibility: 'department', scope: '售前方案团队', applicant: '蒋磊', submitted_at: iso(20), state: 'pending', checks: [{ level: 'ok', text: '成员 4 个均为已发布版本' }, { level: 'ok', text: '团队记忆修订已审查' }], dependencies: ['智能体 · 需求分析 v2', '智能体 · 报价测算 v3'], changes: ['团队 Router：交接顺序调整', 'Leader 技能：交接检查 0.8 → 0.9'], test_summary: '试运行 6 次：成功 6 次' },
  { id: 'RQ-1107-03', kind: 'skill', object_id: 'sk-weekly', name: '周报三段式', version: '1.0', note: '由个人记忆沉淀的 Skill，分享给销售管理业务使用。', visibility: 'org', scope: '销售管理', applicant: '李鹏程', submitted_at: iso(28), state: 'pending', checks: [{ level: 'ok', text: '无脚本依赖' }], dependencies: [], changes: ['新建'], test_summary: '在周报生成里试用 10 次' },
  { id: 'RQ-1106-02', kind: 'buddy_app', object_id: 'app-growth', name: '业绩增长带教（基于 SalesBuddy）', version: '1.0', note: '用 ProjectBuddy 与 Buddy 加速器开发的销售管理应用，调用 X 平台的智能体与知识库。', visibility: 'department', scope: '销售管理', applicant: '叶源', submitted_at: iso(40), state: 'pending', checks: [{ level: 'ok', text: '框架层 v4.3，与加速器一致' }, { level: 'warn', text: '申请开放能力：智能体、知识库、记忆；记忆需业务管理员确认用途' }], dependencies: ['业务空间 · 销售管理', '数据库 schema · sales_growth'], changes: ['新建应用'], test_summary: '27 个页面走查通过' },
  { id: 'RQ-1105-01', kind: 'agent', object_id: 'ag-minutes', name: '会议纪要助手', version: 'v2', note: '优化行动项抽取。', visibility: 'department', scope: '北区东区', applicant: '叶源', submitted_at: iso(70), state: 'returned', approver: '蒋磊', decided_at: iso(60), comment: '请补充三条真实样例的测试结果，并把可见范围从「组织内」改为「北区东区」。', checks: [], dependencies: [], changes: ['提示词：行动项抽取'], test_summary: '未填写' },
  { id: 'RQ-1103-02', kind: 'agent', object_id: 'ag-weekly', name: '周报生成', version: 'v2', note: '风险前置。', visibility: 'org', scope: '销售管理', applicant: '叶源', submitted_at: iso(130), state: 'approved', approver: '蒋磊', decided_at: iso(120), comment: '通过，组织内可见。', checks: [], dependencies: [], changes: ['输出结构：风险前置'], test_summary: '8 条样例全部通过' },
]
releases.unshift(...developmentSeeds.filter(s => s.state !== 'personal').map((s, i): ReleaseRequest => ({
  id: `RQ-DEMO-${s.id}`, kind: 'resource_share', resource_share: { resource_kind: s.kind }, object_id: s.id, name: s.name, version: 'v1.0', note: s.description + '申请共享给团队复用。', visibility: s.state === 'approved' ? 'org' : 'department', scope: 'FDE 交付中心', applicant: '李鹏程', submitted_at: iso(12 + i * 4), state: s.state as 'pending' | 'returned' | 'approved',
  ...(s.state !== 'pending' ? { approver: '李鹏程', decided_at: iso(3 + i), comment: s.state === 'approved' ? '演示审批：已确认复用价值，准予纳入团队沉淀。' : '演示审批：请补充适用边界和两条验证样例后重新提交。' } : {}),
  checks: [{ level: 'ok', text: '演示资源已保存，详情可查看' }, { level: 'warn', text: '示例数据，仅用于体验共享审批流程' }], dependencies: [], changes: ['个人成果申请沉淀为团队资源'], test_summary: '演示样例：正常输入与信息缺失场景各 1 条',
})))

const scopeNames = () => permissions().scopes.map(s => s.name)
const visible = (r: ReleaseRequest) => permissions().role === 'super_admin' || scopeNames().includes(r.scope)
export const myReleases = () => ({ data: releases.filter(r => r.applicant === who()) })
export function submitRelease(b: { kind: ReleaseKind, object_id: string, name: string, version_note: string, visibility: Visibility, scope: string, test_summary: string }) {
  const r: ReleaseRequest = { id: `RQ-${uid('n').slice(2)}`.toUpperCase(), kind: b.kind, object_id: b.object_id, name: b.name, version: '新版本', note: b.version_note, visibility: b.visibility, scope: b.scope, applicant: who(), submitted_at: iso(0), state: 'pending', checks: [{ level: 'ok', text: '已保存并通过发布前检查' }], dependencies: [], changes: [b.version_note || '未填写版本说明'], test_summary: b.test_summary || '未填写' }
  releases = [r, ...releases]
  return r
}
export function withdrawRelease(id: string) {
  const r = releases.find(x => x.id === id)
  if (!r)
    throw new ApiError('申请不存在', 404)
  if (r.applicant !== who() || r.state !== 'pending') throw new ApiError('只能撤回本人待审批的申请', 403)
  r.state = 'withdrawn'
  return r
}
export function copyAssistant(b: CopyAssistantBody) {
  const id = uid('ag')
  const r = submitRelease({ kind: 'assistant_copy', object_id: id, name: b.name, version_note: `由个人助手复制：${b.include_instructions ? '角色与工作指令、' : ''}${b.include_skills.length} 个 Skill、${b.include_memory === 'none' ? '不含记忆' : '经确认的工作经验'}`, visibility: b.visibility, scope: b.scope, test_summary: '待补充' })
  return { agent_id: id, release: r }
}
export const approvals = (state: 'pending' | 'done' | 'all') => ({ data: releases.filter(r => visible(r) && r.state !== 'withdrawn' && (state === 'all' || (state === 'pending' ? r.state === 'pending' : r.state !== 'pending'))) })
export const resourceShares = () => ({ data: releases.filter(r => r.resource_share || r.expert_team).filter(r => r.applicant === who() || (r.state === 'approved' && (r.visibility === 'org' || r.visibility === 'public' || r.scope === permissions().department || visible(r))) || visible(r)) })
export function submitResourceShare(b: import('../resource-sharing').ShareBody) {
  if (!['agent', 'team', 'knowledge', 'skill', 'mcp'].includes(b.resource_kind) || !b.object_id || !b.name.trim() || !b.reason.trim()) throw new ApiError('请填写资源信息和共享理由', 400)
  const ownerId = { dev: 'yy', admin: 'jl', super: 'lpc' }[currentDemo()?.id ?? 'dev']
  const owns = b.resource_kind === 'agent' ? agentDb.detail(b.object_id).created_by === `acc-${ownerId}`
    : b.resource_kind === 'team' ? teamDb.detail(b.object_id).team.created_by === ownerId
    : b.resource_kind === 'skill' ? skillDb.getLocal(b.object_id).installed_by === who()
    : b.resource_kind === 'mcp' ? toolDb.mcpList().some(m => m.id === b.object_id && m.author === who())
    : kbDb.personalLibraries().some(k => k.id === b.object_id)
  if (b.resource_kind === 'mcp' && !toolDb.mcpList().find(m => m.id === b.object_id)?.is_team_authorization) throw new ApiError('请先完成 MCP 服务授权，再申请共享', 409)
  if (!owns) throw new ApiError('只能提交自己创建的资源', 403)
  if (b.resource_kind === 'agent' && !agentDb.detail(b.object_id).active_config_is_published) throw new ApiError('草稿不能共享，请先发布智能体', 409)
  if (b.resource_kind === 'team' && !teamDb.detail(b.object_id).team.published_id) throw new ApiError('草稿不能共享，请先发布智能体团队', 409)
  if (b.scope !== permissions().department && !permissions().org_grants.some(g => g.name === b.scope)) throw new ApiError('无权向该范围提交共享申请', 403)
  if (releases.some(r => r.resource_share?.resource_kind === b.resource_kind && r.object_id === b.object_id && ['pending', 'approved'].includes(r.state))) throw new ApiError('该资源已在审批中或已沉淀，请勿重复提交', 409)
  const r = submitRelease({ kind: 'resource_share', object_id: b.object_id, name: b.name, version_note: b.reason, visibility: 'department', scope: b.scope, test_summary: '请管理员审核复用价值与资源权限' })
  r.resource_share = { resource_kind: b.resource_kind }
  r.checks = [{ level: 'warn', text: '审批通过后标记为团队共享；底层凭据和私人数据不自动共享' }]
  r.changes = ['审批通过后开启团队共享，保留创建者归属']
  return r
}
export const latestExpertTeam = (groupId: string) => ({ request: releases.find(r => r.expert_team?.group_id === groupId) ?? null })
export function submitExpertTeam(groupId: string, body: ExpertTeamBody) {
  const group = collabGroups().data.find(g => g.id === groupId)
  if (!group || group.kind === 'direct') throw new ApiError('请选择协同群聊', 400)
  const prior = latestExpertTeam(groupId).request
  if (prior && ['pending', 'approved'].includes(prior.state)) throw new ApiError('该群已提交或已沉淀，请勿重复提交', 409)
  const c = structuredClone(body.config)
  teamDb.validate(c)
  const ids = body.member_mapping.map(m => m.agent_id)
  if (ids.length !== group.members.length || new Set(ids).size !== ids.length || group.members.some(m => !body.member_mapping.some(x => x.source === m.id)) || !ids.includes(c.leader_id) || c.members.length !== ids.length - 1 || c.members.some(m => !ids.includes(m.agent_id) || m.agent_id === c.leader_id)) throw new ApiError('请为每位群成员配置不同的专家智能体，并选择团长', 400)
  if (!body.scope.trim()) throw new ApiError('请填写审批范围', 400)
  const r = submitRelease({ kind: 'expert_team', object_id: groupId, name: c.name, version_note: `由协同群「${group.name}」沉淀专家团。目标：${c.goal}`, visibility: 'department', scope: body.scope, test_summary: '尚未试运行，审批时请核对成员职责与资源授权' })
  r.expert_team = { group_id: groupId, group_name: group.name, config: c, member_mapping: structuredClone(body.member_mapping) }
  r.dependencies = body.member_mapping.map(m => `${group.members.find(x => x.id === m.source)?.name} → ${teamDb.listing().agents.find(a => a.id === m.agent_id)?.name}`)
  r.changes = [c.goal, ...c.members.map(m => m.responsibility), `预期产出：${c.output}`]
  r.checks = [{ level: 'ok', text: '团长与专家均为已发布智能体' }, { level: 'warn', text: '仅保存成员映射与任务分工，不包含私人记忆或群聊原文；审批通过后生成智能体团队' }]
  return r
}
export function decide(id: string, b: { decision: 'approve' | 'return' | 'reject', visibility?: Visibility, comment: string }) {
  const r = releases.find(x => x.id === id)
  if (!r)
    throw new ApiError('申请不存在', 404)
  if (permissions().role === 'developer' || !visible(r)) throw new ApiError('无权审批该申请', 403)
  if (r.state !== 'pending') throw new ApiError('申请已处理，请刷新', 409)
  if (b.decision !== 'approve' && !b.comment.trim())
    throw new ApiError('退回或拒绝时请写明原因', 400)
  if (b.decision === 'approve' && r.resource_share && !['department', 'org'].includes(b.visibility ?? r.visibility)) throw new ApiError('团队共享请选择部门或组织范围', 400)
  if (b.decision === 'approve' && r.expert_team) {
    const team = teamDb.create(r.expert_team.config)
    teamDb.publish(team.id, team.revision)
    r.expert_team.team_id = team.id
    r.object_id = team.id
  }
  Object.assign(r, { state: b.decision === 'approve' ? 'approved' : 'returned', approver: who(), decided_at: iso(0), comment: b.comment, visibility: b.visibility ?? r.visibility })
  log(`${b.decision === 'approve' ? '通过' : b.decision === 'return' ? '退回' : '拒绝'}发布申请`, `${r.name} ${r.version}`, r.scope)
  return r
}

/* ---------------- 组织 ---------------- */
const departments: Department[] = [
  { id: 'dept-root', name: '大模型生态渠道部', parent: null, members: 16, admins: ['李鹏程'] },
  { id: 'dept-north', name: '北区东区', parent: 'dept-root', members: 4, admins: ['蒋磊'] },
  { id: 'dept-south', name: '南区', parent: 'dept-root', members: 4, admins: [] },
  { id: 'dept-isv', name: '生态 ISV', parent: 'dept-root', members: 2, admins: [] },
  { id: 'dept-growth', name: '增长和运营', parent: 'dept-root', members: 2, admins: [] },
  { id: 'dept-fde', name: 'FDE 交付中心', parent: 'dept-root', members: 3, admins: ['李鹏程'] },
]
let members: Member[] = [
  ['李鹏程', 'lipengcheng', 'FDE 交付中心', 'FDE 交付中心负责人', 'super_admin', ['ProjectBuddy', 'SalesBuddy']],
  ['蒋磊', 'jianglei', '北区东区', '北区东区负责人', 'admin', ['SalesBuddy']],
  ['叶源', 'yeyuan', 'FDE 交付中心', '智能体开发', 'developer', ['ProjectBuddy', 'SalesBuddy']],
  ['周玮', 'zhouwei', 'FDE 交付中心', '架构师', 'developer', ['ProjectBuddy']],
  ['金豫玮', 'jinyuwei', '生态 ISV', '生态 ISV 负责人', 'user', ['SalesBuddy']],
  ['郭强健', 'guoqiangjian', '南区', '南区负责人', 'user', ['SalesBuddy']],
  ['薛佳欣', 'xuejiaxin', '增长和运营', '增长和运营负责人', 'user', ['SalesBuddy']],
  ['张汉申', 'zhanghanshen', '北区东区', '渠道销售', 'user', ['SalesBuddy']],
  ['周莹', 'zhouying', '北区东区', '渠道销售', 'developer', ['SalesBuddy', 'ProjectBuddy']],
  ['傅博', 'fubo', '北区东区', '渠道销售', 'user', ['SalesBuddy']],
].map(([name, mail, dept, title, role, apps], i) => ({ id: `m-${i}`, name: name as string, email: `${mail}@example.com`, dept: dept as string, title: title as string, role: role as Member['role'], apps: apps as string[], status: 'active', last_login: iso(i * 7 + 1) }))
export function org() {
  const p = permissions()
  if (p.role === 'super_admin')
    return { departments, members }
  const names = scopeNames()
  return { departments: departments.filter(d => names.includes(d.name)), members: members.filter(m => names.includes(m.dept)) }
}
export function updateMember(id: string, b: Partial<Member>) {
  const m = members.find(x => x.id === id)
  if (!m)
    throw new ApiError('成员不存在', 404)
  Object.assign(m, b)
  log('修改成员', m.name, m.dept)
  return m
}
let adminList: AdminRecord[] = [
  { id: 'adm-1', name: '李鹏程', email: 'lipengcheng@example.com', role: 'super_admin', role_id: 'role-super', scopes: [], granted_by: '平台初始化', granted_at: iso(24 * 60) },
  { id: 'adm-2', name: '蒋磊', email: 'jianglei@example.com', role: 'admin', role_id: 'role-biz', scopes: [{ type: 'business', id: 'biz-sales', name: '销售管理' }, { type: 'department', id: 'dept-north', name: '北区东区' }, { type: 'workflow', id: 'presales', name: '售前方案团队' }], granted_by: '李鹏程', granted_at: iso(24 * 21) },
  { id: 'adm-3', name: '周玮', email: 'zhouwei@example.com', role: 'admin', role_id: 'role-approver', scopes: [{ type: 'workflow', id: 'cs-escalation', name: '客服升级处理' }], granted_by: '李鹏程', granted_at: iso(24 * 9) },
]
const matrix: PermissionRow[] = [
  { object: '个人助手、个人记忆', actions: { developer: '本人配置与管理', admin: '本人配置与管理；不能浏览他人记忆正文', super_admin: '本人配置；平台级策略（不能浏览他人记忆正文）' } },
  { object: '智能体、智能体团队', actions: { developer: '创建、调试；发布需提交审批', admin: '审批范围内的发布与公开；停用', super_admin: '全部' } },
  { object: '知识库、Skills、MCP', actions: { developer: '个人可见资源的创建与关联', admin: '为业务创建共享资源，设置可见范围', super_admin: '全部' } },
  { object: '团队记忆', actions: { developer: '提交分享、纠错', admin: '审查与发布、撤回', super_admin: '全部' } },
  { object: '业务空间', actions: { developer: '查看已授权的空间', admin: '配置管理范围内的业务空间（数据库 schema、知识库空间、模型额度、xBuddy 接入）', super_admin: '创建与配置全部空间' } },
  { object: 'xBuddy 应用接入', actions: { developer: '查看自己应用的调用情况', admin: '查看', super_admin: '登记应用、开放能力、轮换密钥' } },
  { object: 'AI 技术栈组件', actions: { developer: '查看状态；在用户端使用已分配的资源', admin: '查看状态与健康', super_admin: '连接配置、测试、导出' } },
  { object: '管理员任命与审计', actions: { developer: '—', admin: '查看范围内审计', super_admin: '任命、撤销、全部审计' } },
]
export const admins = () => ({ data: adminList, matrix })
export function grantAdmin(b: { member_id: string, role_id: string, scopes: AdminRecord['scopes'] }) {
  const m = members.find(x => x.id === b.member_id)
  if (!m)
    throw new ApiError('成员不存在', 404)
  const a: AdminRecord = { id: uid('adm'), name: m.name, email: m.email, role: 'admin', role_id: b.role_id, scopes: b.scopes, granted_by: who(), granted_at: iso(0) }
  adminList = [...adminList, a]
  m.role = 'admin'
  log('任命普通管理员', m.name, b.scopes.map(s => s.name).join('、'))
  return a
}
export function revokeAdmin(id: string) {
  adminList = adminList.filter(a => a.id !== id)
  return { ok: true }
}

/* ---------------- 用户组 · 通讯录同步 · 管理员角色（参考飞书管理后台） ---------------- */
let groupList: UserGroup[] = [
  { id: 'g-sales', name: '销售一线', type: 'dynamic', rule: '部门属于「北区东区」「南区」且岗位包含「销售」', members: 9, used_by: ['周报生成 · 可用范围', 'SalesBuddy 业务空间'], owner: '蒋磊' },
  { id: 'g-devs', name: '平台开发者', type: 'static', rule: '手动维护', members: 5, used_by: ['开发者工作台登录', '脚手架模板'], owner: '李鹏程' },
  { id: 'g-approvers', name: '发布审批人', type: 'static', rule: '手动维护', members: 3, used_by: ['发布审批 · 销售管理'], owner: '李鹏程' },
  { id: 'g-presales', name: '售前方案组', type: 'dynamic', rule: '加入「售前方案团队」工作流的成员', members: 6, used_by: ['售前方案团队 · 可用范围', '团队记忆审查'], owner: '蒋磊' },
]
export const groups = () => ({ data: groupList })
export function createGroup(b: Pick<UserGroup, 'name' | 'type' | 'rule'>) {
  if (!b.name.trim())
    throw new ApiError('请填写用户组名称', 400)
  const g: UserGroup = { id: uid('g'), name: b.name.trim(), type: b.type, rule: b.rule || '手动维护', members: 0, used_by: [], owner: who() }
  groupList = [...groupList, g]
  log('新建用户组', g.name, '平台')
  return g
}
let dir: DirectorySync = { source: 'feishu', status: 'ok', last_sync: iso(2), next_sync: iso(-22), schedule: '每天 02:00 增量同步', departments: 6, members: 16, mapping: [{ field: '姓名', from: 'name' }, { field: '邮箱', from: 'enterprise_email' }, { field: '部门', from: 'department_ids' }, { field: '岗位', from: 'job_title' }, { field: '直属上级', from: 'leader_user_id' }], log: [{ time: iso(2), text: '增量同步完成：新增 1 人，更新 2 人，停用 0 人' }, { time: iso(26), text: '增量同步完成：无变化' }] }
export const directory = () => dir
export function runDirectory() {
  dir = { ...dir, last_sync: iso(0), log: [{ time: iso(0), text: '手动同步完成：无变化' }, ...dir.log] }
  return dir
}
const permItems: PermissionItem[] = [
  ['org.members', '组织与成员', '成员与部门', '查看与维护范围内的成员、部门'], ['org.groups', '组织与成员', '用户组', '新建与维护用户组'], ['org.sync', '组织与成员', '通讯录同步', '配置飞书 / 统一身份同步'],
  ['release.approve', '发布与治理', '发布审批', '审批范围内的发布申请'], ['release.public', '发布与治理', '允许公开', '批准对外部公开（单独授权）'], ['memory.review', '发布与治理', '团队记忆审查', '审查与发布团队记忆'],
  ['space.config', '业务与应用', '业务空间配置', '为业务分配数据、知识与额度'], ['apps.view', '业务与应用', '查看应用接入', '查看 xBuddy 接入与调用'], ['apps.manage', '业务与应用', '管理应用接入', '登记应用、开放能力、轮换密钥'],
  ['stack.view', '平台', '查看技术栈组件', '查看组件状态与健康'], ['stack.config', '平台', '配置技术栈组件', '修改连接、测试、导出'], ['admins.manage', '平台', '任命管理员', '任命与撤销管理员、维护角色'], ['audit.view', '平台', '审计日志', '查看范围内的审计'],
].map(([id, group, name, desc]) => ({ id, group, name, desc }))
let roleList: AdminRole[] = [
  { id: 'role-super', name: '超级管理员', preset: true, desc: '拥有全部权限，不受管理范围限制。', permissions: permItems.map(p => p.id), scope_types: ['all'], members: 1 },
  { id: 'role-biz', name: '业务管理员', preset: true, desc: '管理一个或多个业务或部门：成员、发布审批、业务空间与审计。', permissions: ['org.members', 'org.groups', 'release.approve', 'memory.review', 'space.config', 'apps.view', 'stack.view', 'audit.view'], scope_types: ['department', 'business', 'workflow'], members: 1 },
  { id: 'role-approver', name: '审批管理员', preset: true, desc: '只负责范围内的发布审批与团队记忆审查。', permissions: ['release.approve', 'memory.review', 'audit.view'], scope_types: ['department', 'business', 'workflow'], members: 1 },
  { id: 'role-auditor', name: '安全审计员', preset: true, desc: '只读：组件状态与全部审计日志。', permissions: ['stack.view', 'audit.view', 'apps.view'], scope_types: ['all'], members: 0 },
]
export const roles = () => ({ data: roleList, items: permItems })
export function saveRole(id: string, b: Pick<AdminRole, 'name' | 'desc' | 'permissions' | 'scope_types'>) {
  const r = roleList.find(x => x.id === id)
  if (!r)
    throw new ApiError('角色不存在', 404)
  if (r.id === 'role-super')
    throw new ApiError('超级管理员角色不能修改', 400)
  Object.assign(r, b)
  log('修改管理员角色', r.name, '平台')
  return r
}
export function createRole(b: Pick<AdminRole, 'name' | 'desc' | 'permissions' | 'scope_types'>) {
  const r: AdminRole = { id: uid('role'), preset: false, members: 0, ...b }
  roleList = [...roleList, r]
  log('新建管理员角色', r.name, '平台')
  return r
}

/* ---------------- 业务空间 ---------------- */
const spaceFields: FieldDef[] = [
  { key: 'db_schema', label: '数据库 schema', type: 'text', group: '数据', hint: '在平台 PostgreSQL 中为本业务分配的 schema；应用与工作流只能读写本 schema。' },
  { key: 'db_quota_gb', label: '数据库配额', type: 'number', suffix: 'GB', group: '数据' },
  { key: 'vector_collection', label: '向量集合', type: 'text', group: '数据' },
  { key: 'bucket', label: '对象存储目录', type: 'text', group: '数据' },
  { key: 'kb_spaces', label: '知识库空间', type: 'tags', group: '知识与模型', placeholder: '多个用逗号分隔' },
  { key: 'model_quota', label: '每月模型额度', type: 'number', suffix: '万 Token', group: '知识与模型' },
  { key: 'default_model', label: '默认模型', type: 'select', group: '知识与模型', options: [{ value: 'SenseNova-6.8-Flash', label: 'SenseNova-6.8-Flash' }, { value: 'SenseNova-6.8-Flash-Lite', label: 'SenseNova-6.8-Flash-Lite' }, { value: 'deepseek-chat', label: 'DeepSeek-V3' }] },
  { key: 'apps', label: '可调用的 xBuddy', type: 'tags', group: '开放与审批' },
  { key: 'default_visibility', label: '新发布的默认可见范围', type: 'select', group: '开放与审批', options: [{ value: 'department', label: '部门内' }, { value: 'org', label: '组织内' }] },
  { key: 'need_approval', label: '发布需要审批', type: 'switch', group: '开放与审批', hint: '企业版固定开启。', readonly: true },
  { key: 'memory_reviewer', label: '团队记忆审查人', type: 'text', group: '开放与审批' },
]
let spaceList: BusinessSpace[] = [
  { id: 'biz-sales', name: '销售管理', desc: 'SalesBuddy 的业务空间：拜访、商机、客户、周报相关的智能体与知识库。', admins: ['蒋磊'], members: 12, apps: ['SalesBuddy'], agents: 14, workflows: 3, resources: [{ kind: 'database', name: 'PostgreSQL · sales_mgmt', detail: '业务数据', usage: 12.6, quota: 50, unit: 'GB' }, { kind: 'vector', name: '向量集合 · sales_kb', detail: '知识检索', usage: 1.8, quota: 10, unit: 'GB' }, { kind: 'kb', name: 'GTM 弹药库', detail: '214 份材料' }, { kind: 'model', name: '模型额度', detail: 'SenseNova-6.8-Flash 默认', usage: 3120, quota: 5000, unit: '万 Token' }], fields: spaceFields, values: { db_schema: 'sales_mgmt', db_quota_gb: 50, vector_collection: 'sales_kb', bucket: 'raccoonx/sales', kb_spaces: ['GTM 弹药库', '销售方法论'], model_quota: 5000, default_model: 'SenseNova-6.8-Flash', apps: ['SalesBuddy'], default_visibility: 'department', need_approval: true, memory_reviewer: '蒋磊' } },
  { id: 'biz-delivery', name: 'FDE 交付', desc: 'ProjectBuddy 的业务空间：项目、任务、交付物与上线评估。', admins: ['李鹏程'], members: 6, apps: ['ProjectBuddy'], agents: 9, workflows: 2, resources: [{ kind: 'database', name: 'PostgreSQL · fde_delivery', detail: '业务数据', usage: 4.1, quota: 30, unit: 'GB' }, { kind: 'object', name: '对象存储 · raccoonx/fde', detail: '交付物', usage: 38, quota: 200, unit: 'GB' }, { kind: 'kb', name: 'FDE 交付规范', detail: '38 份材料' }, { kind: 'model', name: '模型额度', detail: '按任务选模型', usage: 1460, quota: 3000, unit: '万 Token' }], fields: spaceFields, values: { db_schema: 'fde_delivery', db_quota_gb: 30, vector_collection: 'fde_kb', bucket: 'raccoonx/fde', kb_spaces: ['FDE 交付规范'], model_quota: 3000, default_model: 'SenseNova-6.8-Flash', apps: ['ProjectBuddy'], default_visibility: 'department', need_approval: true, memory_reviewer: '李鹏程' } },
  { id: 'biz-service', name: '客服中心', desc: '客服小浣熊的业务空间：坐席辅助、工单与知识问答。', admins: ['周玮'], members: 5, apps: ['客服小浣熊'], agents: 6, workflows: 1, resources: [{ kind: 'database', name: 'PostgreSQL · service_desk', detail: '工单', usage: 7.9, quota: 40, unit: 'GB' }, { kind: 'kb', name: '客服知识库', detail: '612 条问答' }], fields: spaceFields, values: { db_schema: 'service_desk', db_quota_gb: 40, vector_collection: 'service_kb', bucket: 'raccoonx/service', kb_spaces: ['客服知识库'], model_quota: 2000, default_model: 'SenseNova-6.8-Flash-Lite', apps: ['客服小浣熊'], default_visibility: 'department', need_approval: true, memory_reviewer: '周玮' } },
]
export function spaces() {
  const p = permissions()
  return { data: p.role === 'super_admin' ? spaceList : spaceList.filter(s => s.admins.includes(who()) || scopeNames().includes(s.name)) }
}
export function saveSpace(id: string, values: Record<string, FieldValue>) {
  const s = spaceList.find(x => x.id === id)
  if (!s)
    throw new ApiError('业务空间不存在', 404)
  s.values = { ...values, need_approval: true }
  log('配置业务空间', s.name, s.name)
  return s
}

/* ---------------- 应用接入 ---------------- */
let appList: AppIntegration[] = [
  { id: 'salesbuddy', name: '销售小浣熊', en: 'Raccoon SalesBuddy', desc: '面向销售一线与管理者；主要调用智能体与知识库，在业务页面里唤起个人助手。', status: 'ok', owner: '销售管理', client_id: 'rx_app_salesbuddy', secret_hint: '••••••••3fa9', callback_url: 'https://salesbuddy.example.internal/x/callback', sso: true, capabilities: ['agents', 'kb', 'memory', 'workflows'], rate_limit: 600, calls_7d: 18420, last_call: iso(0.01), usage_note: '拜访记录结构化与质检、商机与客户经营建议、周报；GTM 弹药库检索' },
  { id: 'projectbuddy', name: '项目小浣熊', en: 'ProjectBuddy', desc: '面向开发者与 FDE；调用整套技术栈给用户做开发，例如用它开发 SalesBuddy 这样的业务应用。', status: 'ok', owner: 'FDE 交付', client_id: 'rx_app_projectbuddy', secret_hint: '••••••••81c2', callback_url: 'https://projectbuddy.example.internal/x/callback', sso: true, capabilities: ['agents', 'kb', 'memory', 'workflows', 'skills', 'mcp', 'models', 'database', 'accelerator', 'scaffold', 'monitor'], rate_limit: 1200, calls_7d: 9630, last_call: iso(0.05), usage_note: '与 X 平台账户体系一体：同一账号、同一角色与管理范围，登录一处另一处免登录。普通开发者在 ProjectBuddy 里用脚手架模板与 Buddy 加速器开发 Buddy 应用、绑定智能体与技术栈；详细配置与调用监控在 X 平台。' },
  { id: 'kefu', name: '客服小浣熊', en: '', desc: '智能客服中台；调用智能体、知识库与智能体团队。', status: 'ok', owner: '客服中心', client_id: 'rx_app_kefu', secret_hint: '••••••••07de', callback_url: 'https://kefu.example.internal/x/callback', sso: true, capabilities: ['agents', 'kb', 'workflows'], rate_limit: 2000, calls_7d: 41200, last_call: iso(0.002), usage_note: '坐席辅助、工单摘要、升级处理团队' },
  { id: 'hr', name: 'HR 小浣熊', en: '', desc: '人事全模块；调用智能体、知识库与记忆。', status: 'pending', owner: '—', client_id: 'rx_app_hr', secret_hint: '尚未生成', callback_url: '', sso: false, capabilities: ['agents', 'kb'], rate_limit: 300, calls_7d: 0, last_call: '', usage_note: '待接入' },
]
export const apps = () => ({ data: appList })
export function updateApp(id: string, b: Partial<AppIntegration>) {
  const a = appList.find(x => x.id === id)
  if (!a)
    throw new ApiError('应用不存在', 404)
  Object.assign(a, b)
  log('修改应用接入', a.name, '平台')
  return a
}
export function rotateSecret(id: string) {
  const s = `rxs_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
  updateApp(id, { secret_hint: `••••••••${s.slice(-4)}` })
  return { secret: s }
}

/* ---------------- 技术栈组件 ---------------- */
const F = {
  host: (d = '', g = '连接'): FieldDef => ({ key: 'host', label: '主机地址', type: 'text', required: true, placeholder: d, group: g }),
  port: (g = '连接'): FieldDef => ({ key: 'port', label: '端口', type: 'number', required: true, group: g }),
  user: (g = '连接'): FieldDef => ({ key: 'username', label: '用户名', type: 'text', group: g }),
  pass: (label = '密码', g = '连接'): FieldDef => ({ key: 'password', label, type: 'secret', hint: '留空表示不修改；保存后只显示掩码。', group: g }),
  url: (label = '服务地址', d = ''): FieldDef => ({ key: 'endpoint', label, type: 'text', required: true, placeholder: d, group: '连接' }),
  key: (label = 'API Key'): FieldDef => ({ key: 'api_key', label, type: 'secret', hint: '留空表示不修改。', group: '连接' }),
  timeout: (): FieldDef => ({ key: 'timeout_ms', label: '超时', type: 'number', suffix: '毫秒', group: '运行参数' }),
}
const sel = (key: string, label: string, opts: string[][], group = '运行参数'): FieldDef => ({ key, label, type: 'select', group, options: opts.map(([value, l]) => ({ value, label: l ?? value })) })
type C = Omit<StackComponent, 'last_check'>
let comps: StackComponent[] = ([
  { id: 'postgres', category: 'data', name: '业务数据库', product: 'PostgreSQL 16', desc: '平台元数据、业务空间 schema、工作流与发布记录。', status: 'ok', version: '16.4', endpoint: 'pg-primary.example.internal:5432', latency_ms: 3, used_by: ['编排引擎', '业务空间', 'ProjectBuddy'], user_side: '开发者在「数据库与存储」查看已分配的 schema、表与用量；业务管理员在业务空间分配 schema 与配额。', fields: [F.host('pg-primary.example.internal'), F.port(), { key: 'database', label: '数据库名', type: 'text', required: true, group: '连接' }, F.user(), F.pass(), sel('sslmode', 'SSL 模式', [['require', 'require'], ['verify-full', 'verify-full'], ['disable', 'disable（仅测试环境）']]), { key: 'pool_max', label: '连接池上限', type: 'number', group: '运行参数' }, { key: 'replica_host', label: '只读副本地址', type: 'text', group: '运行参数', placeholder: '可选' }, { key: 'schema_prefix', label: '业务 schema 前缀', type: 'text', group: '运行参数', hint: '业务空间创建 schema 时使用的前缀。' }], values: { host: 'pg-primary.example.internal', port: 5432, database: 'raccoonx', username: 'rx_app', password: '', sslmode: 'require', pool_max: 50, replica_host: 'pg-replica.example.internal', schema_prefix: 'biz_' } },
  { id: 'vector', category: 'data', name: '向量数据库', product: 'pgvector / Milvus', desc: '知识库与记忆的向量检索。', status: 'ok', version: 'Milvus 2.4', endpoint: 'milvus.example.internal:19530', latency_ms: 9, used_by: ['知识库服务', '记忆服务'], user_side: '开发者在「数据库与存储」查看自己知识库的向量集合与索引状态。', fields: [sel('engine', '引擎', [['milvus', 'Milvus'], ['pgvector', 'pgvector（复用业务数据库）']], '连接'), F.host('milvus.example.internal'), F.port(), F.user(), F.pass(), { key: 'dimension', label: '向量维度', type: 'number', group: '运行参数', hint: '需与向量化模型一致。' }, sel('metric', '相似度', [['COSINE', '余弦'], ['IP', '内积'], ['L2', '欧氏']])], values: { engine: 'milvus', host: 'milvus.example.internal', port: 19530, username: 'rx_vec', password: '', dimension: 1024, metric: 'COSINE' } },
  { id: 'redis', category: 'data', name: '缓存与热记忆', product: 'Redis 7', desc: '会话上下文、短期记忆（热数据）、任务队列与限流。', status: 'ok', version: '7.2', endpoint: 'redis.example.internal:6379', latency_ms: 1, used_by: ['记忆服务', '编排引擎', 'Harness'], user_side: '无需用户配置；在「调用与监控」查看队列与排队情况。', fields: [F.host('redis.example.internal'), F.port(), F.pass(), { key: 'db', label: '库编号', type: 'number', group: '连接' }, { key: 'tls', label: 'TLS', type: 'switch', group: '连接' }, { key: 'hot_ttl_hours', label: '热记忆保留', type: 'number', suffix: '小时', group: '运行参数', hint: '热数据实时转存为冷数据（永久记忆）。' }], values: { host: 'redis.example.internal', port: 6379, password: '', db: 0, tls: true, hot_ttl_hours: 72 } },
  { id: 'object', category: 'data', name: '对象存储', product: 'S3 兼容（MinIO / OSS）', desc: '上传文件、交付物、知识库原文与导出包。', status: 'ok', version: 'S3 v4', endpoint: 'https://oss.example.internal', latency_ms: 18, used_by: ['知识库服务', '个人助手', 'ProjectBuddy'], user_side: '开发者在「数据库与存储」查看自己的目录与用量。', fields: [F.url('Endpoint', 'https://oss.example.internal'), { key: 'region', label: '区域', type: 'text', group: '连接' }, { key: 'bucket', label: 'Bucket', type: 'text', required: true, group: '连接' }, { key: 'access_key', label: 'Access Key', type: 'text', group: '连接' }, { key: 'secret_key', label: 'Secret Key', type: 'secret', group: '连接' }, { key: 'path_style', label: 'Path-style 访问', type: 'switch', group: '运行参数' }, { key: 'max_upload_mb', label: '单文件上限', type: 'number', suffix: 'MB', group: '运行参数' }], values: { endpoint: 'https://oss.example.internal', region: 'cn-shanghai', bucket: 'raccoonx', access_key: 'RXACCESSDEMO', secret_key: '', path_style: true, max_upload_mb: 200 } },
  { id: 'search', category: 'data', name: '全文检索', product: 'OpenSearch / Elasticsearch', desc: '知识库关键词召回与审计日志检索。', status: 'warn', version: '2.13', endpoint: 'https://search.example.internal:9200', latency_ms: 140, used_by: ['知识库服务', '审计'], user_side: '无需用户配置。', fields: [F.url('地址', 'https://search.example.internal:9200'), F.user(), F.pass(), { key: 'index_prefix', label: '索引前缀', type: 'text', group: '运行参数' }], values: { endpoint: 'https://search.example.internal:9200', username: 'rx_search', password: '', index_prefix: 'rx-' } },
  { id: 'model_gateway', category: 'model', name: '模型网关', product: 'MaaS 平台（OpenAI 兼容）', desc: '统一接入模型、按任务选模型、计量到人和任务。', status: 'ok', version: 'v1', endpoint: 'https://maas.example.internal/v1', latency_ms: 210, used_by: ['Harness', '编排引擎', '全部 xBuddy'], user_side: '开发者在「模型与额度」查看可用模型、额度与用量，设置默认模型。', fields: [F.url('Base URL', 'https://maas.example.internal/v1'), F.key(), { key: 'default_model', label: '默认对话模型', type: 'text', group: '模型' }, { key: 'light_model', label: '轻量模型', type: 'text', group: '模型' }, { key: 'models', label: '开放给平台的模型', type: 'tags', group: '模型' }, F.timeout(), { key: 'metering', label: '计量到人和任务', type: 'switch', group: '运行参数' }], values: { endpoint: 'https://maas.example.internal/v1', api_key: '', default_model: 'SenseNova-6.8-Flash', light_model: 'SenseNova-6.8-Flash-Lite', models: ['SenseNova-6.8-Flash', 'SenseNova-6.8-Flash-Lite', 'deepseek-chat'], timeout_ms: 60000, metering: true } },
  { id: 'embedding', category: 'model', name: '向量化与重排序', product: 'Embedding / Rerank', desc: '知识库与记忆的向量化、检索重排序。', status: 'ok', version: 'v1', endpoint: 'https://maas.example.internal/v1', latency_ms: 85, used_by: ['知识库服务', '记忆服务'], user_side: '无需用户配置。', fields: [F.url('Base URL'), F.key(), { key: 'embedding_model', label: '向量化模型', type: 'text', group: '模型' }, { key: 'rerank_model', label: '重排序模型', type: 'text', group: '模型' }, { key: 'batch', label: '批大小', type: 'number', group: '运行参数' }], values: { endpoint: 'https://maas.example.internal/v1', api_key: '', embedding_model: 'embedding-default', rerank_model: 'rerank-default', batch: 32 } },
  { id: 'orchestrator', category: 'runtime', name: '编排引擎', product: 'X 平台核心（工作流与智能体运行时）', desc: '智能体、智能体团队、发布版本与运行记录。', status: 'ok', version: '1.9', endpoint: 'http://x-core.example.internal:5001', latency_ms: 12, used_by: ['全部模块'], user_side: '开发者在「智能体」「智能体团队」里使用；无需配置引擎本身。', fields: [F.url('内部地址', 'http://x-core.example.internal:5001'), { key: 'service_token', label: '服务令牌', type: 'secret', group: '连接' }, { key: 'workers', label: 'Worker 数', type: 'number', group: '运行参数' }, { key: 'run_timeout_s', label: '单次运行超时', type: 'number', suffix: '秒', group: '运行参数' }, { key: 'trace', label: '记录完整执行轨迹', type: 'switch', group: '运行参数', hint: '工作流对话窗口依赖执行轨迹展示过程。' }], values: { endpoint: 'http://x-core.example.internal:5001', service_token: '', workers: 8, run_timeout_s: 600, trace: true } },
  { id: 'harness', category: 'runtime', name: '个人助手服务', product: 'DeepSeek Harness', desc: '理解用户需求，创建智能体与协作群，并配置技能、知识库和工具。', status: 'ok', version: '0.9', endpoint: 'http://harness.example.internal:8700', latency_ms: 26, used_by: ['个人助手', 'xBuddy 内的助手'], user_side: '在「个人助手」通过对话创建与配置资源，在「助手成长」查看任务表现与记忆。', fields: [F.url('服务地址', 'http://harness.example.internal:8700'), { key: 'service_token', label: '服务令牌', type: 'secret', group: '连接' }, { key: 'max_sessions', label: '并发会话上限', type: 'number', group: '运行参数' }, { key: 'workspace_root', label: '云端工作区根目录', type: 'text', group: '运行参数' }], values: { endpoint: 'http://harness.example.internal:8700', service_token: '', max_sessions: 200, workspace_root: '/data/workspaces' } },
  { id: 'sandbox', category: 'runtime', name: '代码执行沙箱', product: 'Sandbox', desc: 'Skill 脚本与代码执行的隔离环境。', status: 'ok', version: '1.2', endpoint: 'http://sandbox.example.internal:8194', latency_ms: 40, used_by: ['开发助手', 'Skills', '编排引擎'], user_side: '在开发助手中选择沙箱环境，查看代码执行、预览与交付结果。', fields: [F.url('地址', 'http://sandbox.example.internal:8194'), F.key('访问密钥'), { key: 'cpu', label: 'CPU 限额', type: 'number', suffix: '核', group: '运行参数' }, { key: 'memory_mb', label: '内存限额', type: 'number', suffix: 'MB', group: '运行参数' }, { key: 'network', label: '允许出网', type: 'switch', group: '运行参数' }], values: { endpoint: 'http://sandbox.example.internal:8194', api_key: '', cpu: 2, memory_mb: 2048, network: false } },
  { id: 'kb', category: 'knowledge', name: '知识库服务', product: 'Raccoon KnowledgeBase（多模态 RAG）', desc: '资料入库、解析、索引、带出处的问答与权限。', status: 'ok', version: '2.3', endpoint: 'https://kb.example.internal', latency_ms: 64, used_by: ['个人助手', '智能体', 'SalesBuddy', 'ProjectBuddy'], user_side: '开发者在「知识库」建库、上传、分享与问答。', fields: [F.url('服务地址', 'https://kb.example.internal'), { key: 'bridge_token', label: '桥接令牌', type: 'secret', group: '连接', hint: '控制台通过 /console/api/knowledge-bridge 代理访问。' }, { key: 'app_url', label: '完整知识库应用地址', type: 'text', group: '连接' }, { key: 'ocr', label: '扫描件文字识别', type: 'switch', group: '运行参数' }, { key: 'chunk_size', label: '切片长度', type: 'number', suffix: '字', group: '运行参数' }, { key: 'cite', label: '回答必须带出处', type: 'switch', group: '运行参数' }], values: { endpoint: 'https://kb.example.internal', bridge_token: '', app_url: 'https://kb.example.internal/app', ocr: true, chunk_size: 800, cite: true } },
  { id: 'memory', category: 'knowledge', name: '记忆服务', product: 'Memory Service', desc: '管理记忆提炼、候选确认、关联检索与保留策略。', status: 'ok', version: '1.0', endpoint: 'http://memory.example.internal:8600', latency_ms: 15, used_by: ['个人助手', '智能体团队', 'xBuddy'], user_side: '在「助手成长 · 梦境与记忆」编辑笔记、管理目录并查看关联图谱。', fields: [F.url('服务地址', 'http://memory.example.internal:8600'), { key: 'service_token', label: '服务令牌', type: 'secret', group: '连接' }, { key: 'candidate_ttl_days', label: '候选默认保留', type: 'number', suffix: '天', group: '策略' }, { key: 'require_confirm', label: '候选必须确认', type: 'switch', group: '策略', readonly: true }, { key: 'team_review', label: '团队记忆需要审查', type: 'switch', group: '策略', readonly: true }, { key: 'admin_read_private', label: '管理员可浏览个人记忆正文', type: 'switch', group: '策略', readonly: true, hint: '固定关闭。' }], values: { endpoint: 'http://memory.example.internal:8600', service_token: '', candidate_ttl_days: 14, require_confirm: true, team_review: true, admin_read_private: false } },
  { id: 'parser', category: 'knowledge', name: '文档解析与 OCR', product: 'Parser', desc: 'PDF、Office、图片、音视频的解析与转写。', status: 'ok', version: '1.6', endpoint: 'http://parser.example.internal:8300', latency_ms: 120, used_by: ['知识库服务'], user_side: '无需用户配置；在知识库里看解析状态。', fields: [F.url('服务地址'), { key: 'formats', label: '支持格式', type: 'tags', group: '运行参数' }, { key: 'asr', label: '音视频转写', type: 'switch', group: '运行参数' }], values: { endpoint: 'http://parser.example.internal:8300', formats: ['pdf', 'docx', 'pptx', 'xlsx', 'md', 'png', 'mp4'], asr: true } },
  { id: 'mcp_gateway', category: 'tools', name: 'MCP 网关', product: 'MCP Gateway', desc: '远程 MCP 服务的接入、授权与调用审计。', status: 'ok', version: '1.1', endpoint: 'https://mcp.example.internal', latency_ms: 48, used_by: ['个人助手', '智能体'], user_side: '开发者在「MCP 与工具」添加服务、授权并关联到助手或智能体。', fields: [F.url('网关地址'), { key: 'transport', label: '允许的传输方式', type: 'tags', group: '运行参数' }, { key: 'allow_hosts', label: '允许访问的主机', type: 'tags', group: '运行参数', hint: '为空表示不限制（不建议）。' }, { key: 'audit', label: '记录调用审计', type: 'switch', group: '运行参数' }], values: { endpoint: 'https://mcp.example.internal', transport: ['streamable-http', 'sse'], allow_hosts: ['*.example.internal', 'open.feishu.cn'], audit: true } },
  { id: 'plugins', category: 'tools', name: '插件市场', product: 'Plugin Registry', desc: '模型供应商、工具与数据源插件的安装来源。', status: 'off', version: '—', endpoint: '内网镜像（未启用外部市场）', latency_ms: null, used_by: ['MCP 与工具'], user_side: '开发者在「MCP 与工具 · 插件市场」安装已允许的插件。', fields: [{ key: 'enabled', label: '启用外部插件市场', type: 'switch', group: '连接' }, F.url('市场地址'), { key: 'mirror', label: '内网镜像地址', type: 'text', group: '连接' }], values: { enabled: false, endpoint: '', mirror: 'https://plugins.example.internal' } },
  { id: 'channels', category: 'tools', name: '消息渠道', product: '飞书 · 企业微信 · 钉钉 · 微信', desc: '把已发布的智能体接到日常聊天入口。', status: 'ok', version: '—', endpoint: 'open.feishu.cn 等', latency_ms: 90, used_by: ['智能体', '智能体团队'], user_side: '在智能体或智能体团队的「访问 · 消息渠道」连接渠道。', fields: [{ key: 'feishu', label: '允许飞书渠道', type: 'switch', group: '渠道' }, { key: 'wecom', label: '允许企业微信渠道', type: 'switch', group: '渠道' }, { key: 'dingtalk', label: '允许钉钉渠道', type: 'switch', group: '渠道' }, { key: 'wechat', label: '允许微信渠道', type: 'switch', group: '渠道' }, { key: 'callback_base', label: '回调根地址', type: 'text', group: '渠道' }], values: { feishu: true, wecom: true, dingtalk: false, wechat: true, callback_base: 'https://x.example.internal/channels' } },
  { id: 'sso', category: 'security', name: '统一身份', product: 'OIDC · 飞书 · xBuddy 统一身份', desc: '开发者、管理员与 xBuddy 用户使用同一身份登录。', status: 'ok', version: 'OIDC', endpoint: 'https://sso.example.internal', latency_ms: 30, used_by: ['登录', '全部 xBuddy'], user_side: '无需用户配置。', fields: [F.url('Issuer', 'https://sso.example.internal'), { key: 'client_id', label: 'Client ID', type: 'text', group: '连接' }, { key: 'client_secret', label: 'Client Secret', type: 'secret', group: '连接' }, { key: 'feishu_app_id', label: '飞书 App ID', type: 'text', group: '飞书登录' }, { key: 'feishu_secret', label: '飞书 App Secret', type: 'secret', group: '飞书登录' }, { key: 'role_claim', label: '角色字段', type: 'text', group: '映射', hint: '从身份令牌读取角色与部门，用于自动授权。' }], values: { endpoint: 'https://sso.example.internal', client_id: 'raccoonx-console', client_secret: '', feishu_app_id: 'cli_xxxxxxxx', feishu_secret: '', role_claim: 'groups' } },
  { id: 'kms', category: 'security', name: '密钥管理', product: 'KMS', desc: '模型密钥、渠道凭据、MCP 授权的加密存储。', status: 'ok', version: '—', endpoint: 'kms.example.internal', latency_ms: 6, used_by: ['全部组件'], user_side: '无需用户配置；凭据不进入模型。', fields: [F.url('地址'), { key: 'key_id', label: '主密钥 ID', type: 'text', group: '连接' }, { key: 'rotate_days', label: '轮换周期', type: 'number', suffix: '天', group: '运行参数' }], values: { endpoint: 'kms.example.internal', key_id: 'rx-master-01', rotate_days: 90 } },
  { id: 'otel', category: 'observe', name: '日志与监控', product: 'OpenTelemetry', desc: '调用链、指标与日志汇总，供「调用与监控」与审计使用。', status: 'ok', version: '1.x', endpoint: 'http://otel.example.internal:4318', latency_ms: 5, used_by: ['全部组件'], user_side: '开发者在「调用与监控」查看自己对象的调用、延迟与错误。', fields: [F.url('OTLP 地址'), { key: 'sample', label: '采样率', type: 'number', suffix: '%', group: '运行参数' }, { key: 'retention_days', label: '保留天数', type: 'number', suffix: '天', group: '运行参数' }], values: { endpoint: 'http://otel.example.internal:4318', sample: 20, retention_days: 30 } },
] as C[]).map((c, i) => ({ ...c, last_check: iso(0.1 + i * 0.01) }))
export const components = () => ({ data: comps })
export function saveComponent(id: string, values: Record<string, FieldValue>) {
  if (permissions().role !== 'super_admin')
    throw new ApiError('只有超级管理员可以修改技术栈组件的连接配置', 403)
  const c = comps.find(x => x.id === id)
  if (!c)
    throw new ApiError('组件不存在', 404)
  const secrets = c.fields.filter(f => f.type === 'secret').map(f => f.key)
  c.values = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, secrets.includes(k) ? '' : v]))
  if (c.status === 'pending')
    c.status = 'ok'
  log('修改组件连接配置', c.name, '平台')
  return c
}
export function testComponent(id: string, values: Record<string, FieldValue>): TestResult {
  const c = comps.find(x => x.id === id)
  if (!c)
    throw new ApiError('组件不存在', 404)
  const missing = c.fields.filter(f => f.required && !values[f.key])
  const ok = !missing.length
  const latency = c.latency_ms ?? 20
  return { ok, latency_ms: latency, steps: [
    { name: '解析地址', ok: !missing.some(f => ['host', 'endpoint'].includes(f.key)), detail: missing.length ? `缺少：${missing.map(f => f.label).join('、')}` : String(values.host ?? values.endpoint ?? c.endpoint) },
    { name: '建立连接', ok, detail: ok ? `${latency} 毫秒` : '未执行' },
    { name: '认证与权限', ok, detail: ok ? '账号可用，权限满足平台要求' : '未执行' },
    { name: '读写探测', ok, detail: ok ? '探测成功（未写入业务数据）' : '未执行' },
  ] }
}
export function exportStack() {
  const lines: string[] = ['# Raccoon X 后端连接配置（由管理后台导出）', `# 导出时间：${new Date().toLocaleString('zh-CN')}；密钥以占位符输出，请在部署环境的密钥管理中填写。`, '']
  const json: Record<string, Record<string, FieldValue>> = {}
  for (const c of comps) {
    lines.push(`# ${c.name}（${c.product}）`)
    json[c.id] = {}
    for (const f of c.fields) {
      const k = `RX_${c.id.toUpperCase()}_${f.key.toUpperCase()}`
      const v = f.type === 'secret' ? `\${${k}}` : Array.isArray(c.values[f.key]) ? (c.values[f.key] as string[]).join(',') : String(c.values[f.key] ?? '')
      lines.push(`${k}=${v}`)
      json[c.id][f.key] = f.type === 'secret' ? `\${${k}}` : c.values[f.key]
    }
    lines.push('')
  }
  return { env: lines.join('\n'), json: JSON.stringify(json, null, 2) }
}

/* ---------------- 审计 ---------------- */
let auditList: AuditEntry[] = [
  ['蒋磊', '普通管理员', '通过发布申请', '周报生成 v2', '销售管理', 'success', 120],
  ['叶源', '开发者', '提交发布申请', '拜访纪要整理 v3', '销售管理', 'success', 5],
  ['叶源', '开发者', '读取技术栈组件配置', '业务数据库', '平台', 'denied', 4],
  ['李鹏程', '超级管理员', '修改组件连接配置', '模型网关', '平台', 'success', 26],
  ['李鹏程', '超级管理员', '任命普通管理员', '周玮', '客服升级处理', 'success', 24 * 9],
  ['ProjectBuddy', '应用', '调用智能体', '上线评估助手（草稿）', 'FDE 交付', 'denied', 3],
  ['SalesBuddy', '应用', '调用知识库', 'GTM 弹药库', '销售管理', 'success', 0.1],
].map(([actor, role, action, object, scope, result, h], i) => ({ id: `au-${i}`, actor: actor as string, role: role as string, action: action as string, object: object as string, scope: scope as string, result: result as AuditEntry['result'], time: iso(h as number) }))
function log(action: string, object: string, scope: string) {
  const d = currentDemo()
  auditList = [{ id: uid('au'), actor: d?.name ?? '—', role: d ? { developer: '开发者', admin: '普通管理员', super_admin: '超级管理员' }[d.role] : '—', action, object, scope, result: 'success', time: iso(0) }, ...auditList]
}
export function audit(q: { actor?: string, action?: string }) {
  const p = permissions()
  const names = scopeNames()
  return { data: auditList.filter(a => (p.role === 'super_admin' || names.includes(a.scope)) && (!q.actor || a.actor.includes(q.actor)) && (!q.action || a.action.includes(q.action))) }
}

/* ---------------- 概览 ---------------- */
export function overview(): Overview {
  return {
    pending: approvals('pending').data.length,
    published_30d: 23,
    members: org().members.length,
    admins: adminList.length,
    spaces: spaces().data.length,
    calls_7d: [9.2, 10.4, 11.8, 10.9, 12.6, 6.1, 5.4],
    tokens_7d: 4620,
    apps: appList.map(a => ({ id: a.id, name: a.name, calls_7d: a.calls_7d, status: a.status })),
    components: comps.map(c => ({ id: c.id, name: c.name, status: c.status })),
    recent: audit({}).data.slice(0, 6),
  }
}
