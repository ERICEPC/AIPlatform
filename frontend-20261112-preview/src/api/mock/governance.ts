/*
  组织治理 mock：演示账号、部门、负责人、共享申请、审批、用量与审计共用一份内存数据。
  - 切换演示账号会刷新页面，数据存 sessionStorage（rx-demo-governance），因此审批后切回申请人即可看到新状态。
  - 列表页里的通用示例资源（智能体、技能、MCP 等）按「当前演示账号 + 资源 id」各自一份，每个账号都能演示申请共享。
  规则与旧后端 services/platform_governance/policy.py 一致。
*/
import type { ApprovalDetail, AuditQuery, AuditRow, Authority, Department, ResourceShare, Role, Scope, ShareHint, ShareKind, ShareRequest, Usage } from '../governance'
import { ApiError } from '../http'

/* ---------------- 演示账号 ---------------- */
export type DemoAccount = { id: string, person: string, name: string, title: string, hint: string, avatar: string }
export const demoAccounts: DemoAccount[] = [
  { id: 'dev', person: 'p-yy', name: '叶源', title: 'FDE 交付中心 · 开发者 / 超级管理员', hint: '开发者视角：申请共享、我的发布；同时是超级管理员', avatar: '/raccoon-emoji-v1/004-programming.webp' },
  { id: 'member', person: 'p-zy', name: '周莹', title: '北区东区 · 成员', hint: '纯成员：申请共享到部门 / 公共空间，在「我的发布」看审批结果', avatar: '/raccoon-emoji-v1/002-office.webp' },
  { id: 'admin', person: 'p-jl', name: '蒋磊', title: '北区东区 · 部门负责人', hint: '审批本部门（含下级）成员的「部门」申请，可转审超级管理员', avatar: '/raccoon-emoji-v1/007-sales.webp' },
  { id: 'super', person: 'p-lpc', name: '李鹏程', title: 'FDE 交付中心 · 超级管理员', hint: '审批部门与公共空间申请、维护组织与负责人', avatar: '/raccoon-emoji-v1/036-leadership.webp' },
]
const ACCOUNT_KEY = 'rx-demo-account'
export function currentDemo(): DemoAccount | null {
  try { return demoAccounts.find(a => a.id === localStorage.getItem(ACCOUNT_KEY)) ?? null } catch { return null }
}
export function signIn(id: string) { try { localStorage.setItem(ACCOUNT_KEY, id) } catch {} }
export function signOut() { try { localStorage.removeItem(ACCOUNT_KEY) } catch {} }

/* ---------------- 数据 ---------------- */
type Person = { id: string, name: string, email: string, department_id: string | null, last_login_at: string | null }
type Resource = { key: string, kind: ShareKind, id: string, name: string, owner: string, visibility: Scope, department_id: string | null, published: boolean, updated_at: string, description: string, version: string }
type Req = { id: string, key: string, applicant: string, dept: string | null, requested: 'department' | 'public', approved: 'department' | 'public' | null, note: string, state: ShareRequest['state'], assignee: ShareRequest['assignee'], forwarded_by: string | null, forwarded_at: string | null, forward_comment: string | null, reviewer: string | null, comment: string, created_at: string, decided_at: string | null }
type Audit = { id: string, time: string, actor: string, object: string, category: string, summary: string, department_id: string | null, result: AuditRow['result'] }
type Store = { depts: Department[], people: Person[], supers: { id: string, by: string | null, at: string | null }[], heads: { department_id: string, account_id: string, by: string | null, at: string | null }[], resources: Resource[], requests: Req[], audit: Audit[], seq: number }

const H = 3600_000
const ago = (h: number) => new Date(Date.now() - h * H).toISOString()
function seed(): Store {
  const depts: Department[] = [
    { id: 'dept-root', name: '大模型生态渠道部', parent_id: null },
    { id: 'dept-north', name: '北区东区', parent_id: 'dept-root' },
    { id: 'dept-south', name: '南区', parent_id: 'dept-root' },
    { id: 'dept-isv', name: '生态 ISV', parent_id: 'dept-root' },
    { id: 'dept-growth', name: '增长和运营', parent_id: 'dept-root' },
    { id: 'dept-fde', name: 'FDE 交付中心', parent_id: 'dept-root' },
  ]
  const people: Person[] = ([
    ['p-lpc', '李鹏程', 'lipengcheng', 'dept-fde', 1], ['p-zw', '周玮', 'zhouwei', 'dept-fde', 5], ['p-yy', '叶源', 'yeyuan', 'dept-fde', 0.2],
    ['p-jl', '蒋磊', 'jianglei', 'dept-north', 2], ['p-zy', '周莹', 'zhouying', 'dept-north', 3], ['p-zhs', '张汉申', 'zhanghanshen', 'dept-north', 20], ['p-fb', '傅博', 'fubo', 'dept-north', 30],
    ['p-gqj', '郭强健', 'guoqiangjian', 'dept-south', 8], ['p-wc', '王晨', 'wangchen', 'dept-south', 26],
    ['p-jyw', '金豫玮', 'jinyuwei', 'dept-isv', 12], ['p-csy', '陈思远', 'chensiyuan', 'dept-isv', 40],
    ['p-xjx', '薛佳欣', 'xuejiaxin', 'dept-growth', 9], ['p-lc', '刘畅', 'liuchang', 'dept-growth', 50],
    ['p-new', '孙一鸣', 'sunyiming', null, 72],
  ] as const).map(([id, name, mail, d, h]) => ({ id, name, email: `${mail}@sensetime.com`, department_id: d, last_login_at: ago(h) }))
  const supers = [{ id: 'p-lpc', by: null, at: ago(24 * 90) }, { id: 'p-zw', by: 'p-lpc', at: ago(24 * 60) }, { id: 'p-yy', by: 'p-lpc', at: ago(24 * 30) }]
  const heads = ([['dept-north', 'p-jl'], ['dept-south', 'p-gqj'], ['dept-isv', 'p-jyw'], ['dept-growth', 'p-xjx'], ['dept-fde', 'p-lpc']] as const).map(([d, a], i) => ({ department_id: d, account_id: a, by: 'p-lpc', at: ago(24 * (50 - i)) }))
  const R = (kind: ShareKind, id: string, name: string, owner: string, visibility: Scope, description: string, version = 'v1', published = true): Resource =>
    ({ key: `${kind}:${id}`, kind, id, name, owner, visibility, department_id: visibility === 'department' ? people.find(p => p.id === owner)!.department_id : null, published, updated_at: ago(30), description, version })
  const resources = [
    R('agent', 'ag-visit-review', '客户拜访复盘助手', 'p-zy', 'private', '根据拜访纪要整理客户诉求、风险与下一步行动，自动生成复盘卡片。', 'v3'),
    R('agent', 'ag-quote', '报价测算助手', 'p-zhs', 'private', '按产品目录与折扣规则测算报价，并给出审批所需材料清单。', 'v2'),
    R('agent', 'ag-minutes', '会议纪要助手', 'p-yy', 'department', '自动抽取会议结论、行动项与负责人。', 'v4'),
    R('agent', 'ag-weekly', '周报生成', 'p-yy', 'public', '汇总本周商机推进与风险，输出三段式周报。', 'v2'),
    R('agent', 'ag-contract', '合同条款审查', 'p-zw', 'department', '对照合同模板标出偏离条款与风险等级。', 'v5'),
    R('agent', 'ag-isv-onboard', 'ISV 入驻助手', 'p-csy', 'department', '解答生态伙伴入驻流程与资质要求。', 'v1'),
    R('agent', 'ag-south-leads', '南区线索分拣', 'p-wc', 'private', '按行业和预算给线索打标签并分派。', 'v2'),
    R('agent', 'ag-growth-copy', '活动文案助手', 'p-lc', 'public', '按活动主题生成多渠道推广文案。', 'v3'),
    R('team', 'tm-presales', '售前方案团队', 'p-fb', 'private', '需求分析、方案撰写、报价测算三个智能体协作产出售前方案。', 'v3'),
    R('team', 'tm-delivery', '交付验收团队', 'p-yy', 'private', '交付清单核对、验收报告生成与客户确认。', 'v2'),
    R('team', 'tm-isv', '伙伴方案联创团队', 'p-csy', 'department', '伙伴方案拆解与联合方案撰写。', 'v1'),
    R('skill', 'sk-weekly', '周报三段式', 'p-zy', 'private', '把零散工作记录整理成「进展 / 风险 / 下周计划」三段式周报。', '1.0'),
    R('skill', 'sk-ticket', '售后工单分类', 'p-yy', 'private', '按产品线与严重程度对售后工单分类。', '1.2'),
    R('skill', 'sk-pricing', '折扣规则校验', 'p-gqj', 'department', '校验报价折扣是否超出授权。', '2.0'),
    R('mcp', 'mcp-crm', '销售 CRM', 'p-zhs', 'private', '商机、客户、拜访记录查询。'),
    R('mcp', 'mcp-wiki', '内部知识检索', 'p-zw', 'private', '检索内部知识库与制度文档。'),
    R('mcp', 'mcp-bi', '经营数据看板', 'p-xjx', 'department', '查询经营指标与区域排名。'),
  ]
  const Q = (id: string, key: string, applicant: string, requested: 'department' | 'public', state: Req['state'], h: number, extra: Partial<Req> = {}): Req =>
    ({ id, key, applicant, dept: people.find(p => p.id === applicant)!.department_id, requested, approved: state === 'approved' ? requested : null, note: '', state, assignee: requested === 'public' ? 'super_admin' : 'dept_head', forwarded_by: null, forwarded_at: null, forward_comment: null, reviewer: null, comment: '', created_at: ago(h), decided_at: state === 'pending' ? null : ago(h - 2), ...extra })
  const requests: Req[] = [
    Q('rq-01', 'agent:ag-visit-review', 'p-zy', 'department', 'pending', 3, { note: '北区东区同事每周都要做拜访复盘，希望部门内复用。' }),
    Q('rq-02', 'agent:ag-quote', 'p-zhs', 'public', 'pending', 6, { note: '报价规则全渠道一致，申请公共空间供各区使用。' }),
    Q('rq-03', 'team:tm-presales', 'p-fb', 'department', 'pending', 26, { note: '售前方案团队已在北区东区试运行 6 次，申请部门共享。', assignee: 'super_admin', forwarded_by: 'p-jl', forwarded_at: ago(20), forward_comment: '涉及报价策略，请超级管理员确认后共享。' }),
    Q('rq-04', 'skill:sk-weekly', 'p-zy', 'public', 'rejected', 50, { note: '周报格式全员通用。', reviewer: 'p-lpc', comment: '请先在部门内试用两周，补充 3 条真实样例后再申请公共空间。' }),
    Q('rq-05', 'mcp:mcp-crm', 'p-zhs', 'department', 'pending', 9, { note: '部门内查询商机用，已完成授权。' }),
    Q('rq-06', 'agent:ag-weekly', 'p-yy', 'public', 'approved', 130, { note: '风险前置版本。', reviewer: 'p-lpc', comment: '通过，公共空间可见。' }),
    Q('rq-07', 'agent:ag-minutes', 'p-yy', 'public', 'approved', 90, { note: '会议纪要通用。', approved: 'department', reviewer: 'p-lpc', comment: '先收窄为部门可见，观察一周反馈。' }),
    Q('rq-08', 'team:tm-delivery', 'p-yy', 'public', 'pending', 4, { note: '交付验收流程各区一致，申请公共空间。' }),
    Q('rq-09', 'skill:sk-ticket', 'p-yy', 'department', 'pending', 2, { note: 'FDE 交付中心处理售后工单时复用。' }),
    Q('rq-10', 'mcp:mcp-wiki', 'p-zw', 'public', 'rejected', 70, { note: '全员检索制度文档。', reviewer: 'p-lpc', comment: '授权账号权限过大，请改用只读账号后重新申请。' }),
    Q('rq-11', 'agent:ag-south-leads', 'p-wc', 'department', 'rejected', 40, { note: '南区线索分派。', reviewer: 'p-gqj', comment: '标签规则还在调整，下周再提交。' }),
    Q('rq-12', 'team:tm-isv', 'p-csy', 'department', 'approved', 100, { note: '伙伴联合方案。', reviewer: 'p-jyw', comment: '同意部门内共享。' }),
    Q('rq-13', 'skill:sk-pricing', 'p-gqj', 'public', 'pending', 12, { note: '折扣规则各区通用。' }),
    Q('rq-14', 'mcp:mcp-bi', 'p-xjx', 'department', 'approved', 120, { note: '增长和运营看板。', reviewer: 'p-lpc', comment: '同意。' }),
  ]
  const A = (h: number, actor: string, object: string, category: string, summary: string, department_id: string | null, result: AuditRow['result'] = 'success'): Audit => ({ id: `au-${h}-${object}`, time: ago(h), actor, object, category, summary, department_id, result })
  const audit = [
    A(2, 'p-yy', '售后工单分类', '发布申请', '申请共享到部门', 'dept-fde'),
    A(3, 'p-zy', '客户拜访复盘助手', '发布申请', '申请共享到部门', 'dept-north'),
    A(4, 'p-yy', '交付验收团队', '发布申请', '申请共享到公共空间', 'dept-fde'),
    A(6, 'p-zhs', '报价测算助手', '发布申请', '申请共享到公共空间', 'dept-north'),
    A(9, 'p-zhs', '销售 CRM', '发布申请', '申请共享到部门', 'dept-north'),
    A(12, 'p-gqj', '折扣规则校验', '发布申请', '申请共享到公共空间', 'dept-south'),
    A(20, 'p-jl', '售前方案团队', '审批处理', '转审超级管理员：涉及报价策略', 'dept-north'),
    A(22, 'p-jl', '报价测算助手', '审批处理', '尝试审批公共空间申请', 'dept-north', 'denied'),
    A(26, 'p-fb', '售前方案团队', '发布申请', '申请共享到部门', 'dept-north'),
    A(38, 'p-gqj', '南区线索分拣', '审批处理', '驳回：标签规则还在调整', 'dept-south'),
    A(48, 'p-lpc', '周报三段式', '审批处理', '驳回：请先在部门内试用', 'dept-north'),
    A(60, 'p-lpc', '孙一鸣', '组织变更', '新成员通过统一身份首次登录，待分配部门', null),
    A(68, 'p-lpc', '内部知识检索', '审批处理', '驳回：授权账号权限过大', 'dept-fde'),
    A(88, 'p-lpc', '会议纪要助手', '审批处理', '通过，收窄为部门可见', 'dept-fde'),
    A(98, 'p-jyw', '伙伴方案联创团队', '审批处理', '通过，部门可见', 'dept-isv'),
    A(118, 'p-lpc', '经营数据看板', '审批处理', '通过，部门可见', 'dept-growth'),
    A(128, 'p-lpc', '周报生成', '审批处理', '通过，公共空间可见', 'dept-fde'),
    A(150, 'p-lpc', '增长和运营', '权限变更', '设置部门负责人：薛佳欣', 'dept-growth'),
    A(170, 'p-lpc', 'FDE 交付中心', '组织变更', '新建部门', 'dept-fde'),
    A(200, 'p-zw', '模型网关', '技术栈配置', '更新模型网关连接配置', null),
    A(240, 'p-lpc', '叶源', '权限变更', '任命超级管理员', 'dept-fde'),
  ]
  return { depts, people, supers, heads, resources, requests, audit, seq: 100 }
}

const STORE_KEY = 'rx-demo-governance-v1'
const db: Store = (() => { try { const v = sessionStorage.getItem(STORE_KEY); if (v) return JSON.parse(v) as Store } catch {} return seed() })()
const save = () => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(db)) } catch {} }
const nid = (p: string) => `${p}-${++db.seq}`
const now = () => new Date().toISOString()

/* ---------------- 角色与范围 ---------------- */
const fail = (message: string, status = 409): never => { throw new ApiError(message, status) }
const person = (id: string | null) => db.people.find(p => p.id === id)
const nameOf = (id: string | null) => person(id)?.name ?? ''
const dept = (id: string | null) => db.depts.find(d => d.id === id)
const deptName = (id: string | null) => dept(id)?.name ?? null
function descendants(seeds: string[]) {
  const found = new Set(seeds)
  let grew = true
  while (grew) { grew = false; for (const d of db.depts) if (d.parent_id && found.has(d.parent_id) && !found.has(d.id)) { found.add(d.id); grew = true } }
  return [...found]
}
const isSuper = (id: string) => db.supers.some(s => s.id === id)
const headOf = (id: string) => db.heads.filter(h => h.account_id === id).map(h => h.department_id)
const roleOf = (id: string): Role => isSuper(id) ? 'super_admin' : headOf(id).length ? 'dept_head' : 'member'
const scopeOf = (id: string) => isSuper(id) ? db.depts.map(d => d.id) : descendants(headOf(id))
function me() {
  const a = currentDemo()
  if (!a) fail('请先选择演示账号登录', 401)
  return person(a!.person)!
}
export function authority(): Authority {
  const p = me(), role = roleOf(p.id)
  return {
    role, account_id: p.id, name: p.name, department_id: p.department_id, department_name: deptName(p.department_id),
    head_department_ids: headOf(p.id), scope_ids: role === 'member' ? [] : scopeOf(p.id), departments: db.depts,
    permissions: role === 'super_admin' ? ['release.approve', 'org.members', 'org.manage', 'audit.view', 'ops.view', 'admins.manage'] : role === 'dept_head' ? ['release.approve', 'org.members', 'audit.view', 'ops.view'] : [],
    enabled: true,
  }
}
function requireAdmin(superOnly = false) {
  const p = me(), role = roleOf(p.id)
  if (role === 'member' || (superOnly && role !== 'super_admin')) fail('你没有此管理权限', 403)
  return { p, role, scope: scopeOf(p.id) }
}
function log(actor: string, object: string, category: string, summary: string, department_id: string | null, result: AuditRow['result'] = 'success') {
  db.audit.unshift({ id: nid('au'), time: now(), actor, object, category, summary, department_id, result })
}

/* ---------------- 资源与申请 ---------------- */
function resourceFor(kind: ShareKind, id: string, hint?: ShareHint, create = true): Resource | undefined {
  const seeded = db.resources.find(r => r.key === `${kind}:${id}`)
  if (seeded) return seeded
  const viewer = me().id, key = `${kind}:${id}@${viewer}`
  let r = db.resources.find(x => x.key === key)
  if (!r && create) {
    r = { key, kind, id, name: hint?.name || id, owner: viewer, visibility: 'private', department_id: null, published: hint?.published ?? true, updated_at: now(), description: '', version: kind === 'agent' || kind === 'team' ? 'v1' : '1.0' }
    db.resources.push(r)
  }
  if (r && hint?.name) r.name = hint.name
  if (r && hint?.published !== undefined) r.published = hint.published
  return r
}
const canDecide = (q: Req, viewer: string) => {
  if (q.state !== 'pending' || q.applicant === viewer) return false
  if (isSuper(viewer)) return true
  return q.requested === 'department' && q.assignee === 'dept_head' && !!q.dept && scopeOf(viewer).includes(q.dept)
}
const canForward = (q: Req, viewer: string) => q.state === 'pending' && !isSuper(viewer) && q.requested === 'department' && q.assignee === 'dept_head' && !!q.dept && scopeOf(viewer).includes(q.dept)
function view(q: Req): ShareRequest {
  const r = db.resources.find(x => x.key === q.key)!, viewer = currentDemo() ? me().id : ''
  const d = new Date(q.created_at)
  return {
    id: q.id, code: `RQ-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${q.id.slice(-2).toUpperCase()}`,
    kind: r.kind, resource_id: r.id, resource_name: r.name, version: r.version, applicant_id: q.applicant, applicant_name: nameOf(q.applicant),
    applicant_department_id: q.dept, applicant_department_name: deptName(q.dept), requested_scope: q.requested, approved_scope: q.approved,
    department_id: q.dept, department_name: deptName(q.dept), current_scope: r.visibility, note: q.note, state: q.state, assignee: q.assignee,
    forwarded_by_name: q.forwarded_by ? nameOf(q.forwarded_by) : null, forwarded_at: q.forwarded_at, forward_comment: q.forward_comment,
    reviewer_name: q.reviewer ? nameOf(q.reviewer) : null, comment: q.comment, created_at: q.created_at, decided_at: q.decided_at,
    can_decide: canDecide(q, viewer), can_forward: canForward(q, viewer),
  }
}
function shareView(r: Resource): ResourceShare {
  const latest = db.requests.filter(q => q.key === r.key).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return { kind: r.kind, resource_id: r.id, name: r.name, visibility: r.visibility, department_id: r.department_id, department_name: deptName(r.department_id), can_manage: r.owner === me().id, owner_id: r.owner, published: r.published, request: latest ? view(latest) : null, updated_at: r.updated_at }
}
export const share = (kind: ShareKind, id: string, hint?: ShareHint) => shareView(resourceFor(kind, id, hint)!)
const RANK: Record<Scope, number> = { private: 0, department: 1, public: 2 }
export function submitShare(b: { kind: ShareKind, resource_id: string, scope: Scope, note?: string }, hint?: ShareHint) {
  const u = me(), r = resourceFor(b.kind, b.resource_id, hint)!
  if (r.owner !== u.id) fail('仅资源创建者可以申请共享', 403)
  if ((b.note ?? '').length > 500) fail('申请说明最多 500 字', 400)
  const pending = db.requests.find(q => q.key === r.key && q.state === 'pending')
  if (b.scope === 'private') {
    if (pending) Object.assign(pending, { state: 'withdrawn', decided_at: now(), comment: '改为仅个人，原申请自动撤回' })
    const was = r.visibility
    Object.assign(r, { visibility: 'private', department_id: null, updated_at: now() })
    log(u.id, r.name, '发布申请', was === 'private' && !pending ? '设为仅个人' : `改为仅个人${was !== 'private' ? '，立即收回共享' : ''}${pending ? '，撤回审批中的申请' : ''}`, u.department_id)
    save()
    return shareView(r)
  }
  if (!r.published) fail(r.kind === 'agent' ? '草稿不能共享，请先发布智能体' : r.kind === 'team' ? '草稿不能共享，请先发布智能体团队' : r.kind === 'mcp' ? '请先完成 MCP 服务授权，再申请共享' : '请先发布 Skill，再申请共享')
  if (pending) fail('该资源已有审批中的申请，请先撤回或等待处理')
  if (RANK[b.scope] <= RANK[r.visibility]) fail('当前已是该范围或更大范围')
  if (b.scope === 'department' && !u.department_id) fail('请联系超级管理员分配部门')
  db.requests.push({ id: nid('rq'), key: r.key, applicant: u.id, dept: u.department_id, requested: b.scope, approved: null, note: (b.note ?? '').trim(), state: 'pending', assignee: b.scope === 'public' ? 'super_admin' : 'dept_head', forwarded_by: null, forwarded_at: null, forward_comment: null, reviewer: null, comment: '', created_at: now(), decided_at: null })
  log(u.id, r.name, '发布申请', `申请共享到${b.scope === 'public' ? '公共空间' : '部门'}`, u.department_id)
  save()
  return shareView(r)
}
export function withdraw(id: string) {
  const u = me(), q = db.requests.find(x => x.id === id) ?? fail('申请不存在', 404)
  if (q.applicant !== u.id) fail('只能撤回自己的申请', 403)
  if (q.state !== 'pending') fail('申请已经处理，不能撤回')
  Object.assign(q, { state: 'withdrawn', decided_at: now() })
  log(u.id, db.resources.find(r => r.key === q.key)!.name, '发布申请', '撤回申请', q.dept)
  save()
  return view(q)
}
export const mine = () => ({ data: db.resources.filter(r => r.owner === me().id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(shareView) })

/* ---------------- 审批 ---------------- */
function visible(q: Req, viewer: string, role: Role) {
  if (role === 'super_admin') return true
  const inScope = !!q.dept && scopeOf(viewer).includes(q.dept) && q.requested === 'department'
  return inScope || q.forwarded_by === viewer
}
export function approvals(state: 'pending' | 'done' | 'all') {
  const { p, role } = requireAdmin()
  const rows = db.requests.filter(q => q.state !== 'withdrawn' || state !== 'pending').filter(q => visible(q, p.id, role)).filter((q) => {
    const open = q.state === 'pending' && (role === 'super_admin' || q.assignee === 'dept_head')
    return state === 'all' || (state === 'pending' ? open : !open)
  })
  return { data: rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(view) }
}
const findVisible = (id: string) => {
  const { p, role } = requireAdmin()
  const q = db.requests.find(x => x.id === id)
  if (!q || !visible(q, p.id, role)) fail('申请不存在或不在你的审批范围内', 404)
  return { q: q!, p, role }
}
const DETAIL: Record<string, Partial<ApprovalDetail['resource']>> = {
  'agent:ag-visit-review': { agent: { model: 'SenseNova-V6-Pro', prompt: '你是渠道销售的拜访复盘助手。读取拜访纪要后，按「客户诉求、关键人物、风险信号、承诺事项、下一步行动」五部分输出复盘卡片；行动项必须写明负责人和截止时间，缺失信息用「待确认」标出，不要编造客户数据。涉及报价时只引用已审批的价格表。', tools: ['销售 CRM · 查询拜访记录', '飞书日历 · 创建跟进日程'], skills: ['周报三段式'], knowledge: ['客户拜访纪要库', '翼飞产品手册'] } },
  'agent:ag-quote': { agent: { model: 'DeepSeek-V3', prompt: '你是报价测算助手。根据产品目录、区域折扣和客户等级计算报价，输出明细与审批所需材料；折扣超出授权时必须提示走特价审批。', tools: ['经营数据看板 · 查询价格表'], skills: ['折扣规则校验'], knowledge: ['价格目录 2026H2'] } },
  'team:tm-presales': { team: { leader: '售前方案负责人', members: ['需求分析 v2', '方案撰写 v4', '报价测算 v3'] } },
  'team:tm-delivery': { team: { leader: '交付经理助手', members: ['交付清单核对 v2', '验收报告生成 v1'] } },
  'skill:sk-weekly': { skill: { files: ['SKILL.md', 'templates/weekly.md', 'examples/sample-01.md'], instructions: '# 周报三段式\n把一周的零散记录整理成：\n1. 本周进展（按商机分组，带金额）\n2. 风险与求助（写清需要谁、什么时候）\n3. 下周计划（可量化）' } },
  'skill:sk-ticket': { skill: { files: ['SKILL.md', 'rules.yaml'], instructions: '# 售后工单分类\n按产品线 × 严重程度（P0–P3）分类，并给出建议处理组。' } },
  'mcp:mcp-crm': { mcp: { server_url: 'https://crm.example.com/mcp/****', tools: ['search_opportunity', 'get_customer', 'list_visits'], authorized: true } },
}
export function approval(id: string): ApprovalDetail {
  const { q } = findVisible(id)
  const r = db.resources.find(x => x.key === q.key)!
  const extra = DETAIL[r.key] ?? {}
  const base = r.kind === 'agent' ? { agent: { model: 'SenseNova-V6-Turbo', prompt: `你是「${r.name}」。${r.description || '按业务规范回答问题，引用来源，不编造数据。'}`, tools: ['飞书文档 · 读取'], skills: [], knowledge: ['部门知识库'] } }
    : r.kind === 'team' ? { team: { leader: `${r.name} Leader`, members: ['需求分析 v1', '方案撰写 v1'] } }
      : r.kind === 'skill' ? { skill: { files: ['SKILL.md'], instructions: `# ${r.name}\n${r.description}` } }
        : { mcp: { server_url: 'https://mcp.example.com/****', tools: ['query', 'search'], authorized: r.published } }
  const timeline: ApprovalDetail['timeline'] = [{ action: 'submit', actor_name: nameOf(q.applicant), at: q.created_at, comment: q.note }]
  if (q.forwarded_at) timeline.push({ action: 'forward', actor_name: nameOf(q.forwarded_by), at: q.forwarded_at, comment: q.forward_comment ?? '' })
  if (q.state === 'approved' || q.state === 'rejected') timeline.push({ action: q.state === 'approved' ? 'approve' : 'reject', actor_name: nameOf(q.reviewer), at: q.decided_at!, comment: q.comment })
  if (q.state === 'withdrawn') timeline.push({ action: 'withdraw', actor_name: nameOf(q.applicant), at: q.decided_at!, comment: q.comment })
  return {
    ...view(q),
    resource: { description: r.description, url: r.kind === 'agent' ? `agents/${r.id}` : r.kind === 'team' ? `teams/${r.id}` : r.kind === 'skill' ? 'skills/local' : 'integrations/mcp', owner_name: nameOf(r.owner), ...base, ...extra },
    checks: [
      { level: r.published ? 'ok' : 'risk', text: r.kind === 'mcp' ? (r.published ? '服务已授权' : '服务未授权') : r.published ? `已发布 ${r.version}` : '仍是草稿' },
      { level: 'ok', text: r.kind === 'agent' ? '模型可用，额度充足' : r.kind === 'team' ? '成员智能体均为已发布版本' : r.kind === 'skill' ? '无外部脚本依赖' : '工具调用均为只读' },
      q.requested === 'public' ? { level: 'warn', text: '公共空间对全员可见，请确认不含部门内部数据' } : { level: 'ok', text: '共享范围限于申请人所在部门' },
    ],
    dependencies: r.kind === 'agent' ? ['知识库 · 部门知识库（共享后可见范围不自动扩大）'] : r.kind === 'team' ? ['3 个成员智能体需各自共享'] : [],
    changes: r.version === 'v1' || r.version === '1.0' ? ['首次共享'] : [`${r.version}：优化输出结构与引用来源`],
    timeline,
  }
}
export function decide(id: string, b: { decision: 'approve' | 'reject', scope?: 'department' | 'public', comment: string }) {
  const { q, p } = findVisible(id)
  const r = db.resources.find(x => x.key === q.key)!
  const deny = (m: string) => { log(p.id, r.name, '审批处理', `尝试${b.decision === 'approve' ? '通过' : '驳回'}：${m}`, q.dept, 'denied'); save(); return fail(m, 403) }
  if (q.state !== 'pending') fail('申请已处理，不能重复审批')
  if (q.applicant === p.id) deny('不能审批自己提交的申请')
  if (!canDecide(q, p.id)) deny(q.requested === 'public' ? '公共空间申请只能由超级管理员审批' : '该申请已转审或不在你的审批范围内')
  const comment = b.comment.trim()
  if (b.decision === 'reject' && !comment) fail('驳回必须填写意见', 400)
  const scope = b.decision === 'approve' ? (b.scope ?? q.requested) : null
  if (scope && RANK[scope] > RANK[q.requested]) fail('只能收窄范围，不能扩大', 400)
  Object.assign(q, { state: b.decision === 'approve' ? 'approved' : 'rejected', approved: scope, reviewer: p.id, comment, decided_at: now() })
  if (scope) Object.assign(r, { visibility: scope, department_id: scope === 'department' ? q.dept : null, updated_at: now() })
  log(p.id, r.name, '审批处理', b.decision === 'approve' ? `通过，${scope === 'public' ? '公共空间' : '部门'}可见${scope !== q.requested ? '（收窄）' : ''}` : `驳回：${comment}`, q.dept)
  save()
  return view(q)
}
export function forward(id: string, comment: string) {
  const { q, p } = findVisible(id)
  const r = db.resources.find(x => x.key === q.key)!
  if (!canForward(q, p.id)) fail('只有部门负责人可以转审本部门审批中的部门申请', 403)
  if (!comment.trim()) fail('转审必须填写意见', 400)
  Object.assign(q, { assignee: 'super_admin', forwarded_by: p.id, forwarded_at: now(), forward_comment: comment.trim() })
  log(p.id, r.name, '审批处理', `转审超级管理员：${comment.trim()}`, q.dept)
  save()
  return view(q)
}

/* ---------------- 组织 ---------------- */
/** 演示工作空间与成员（工作空间切换器用，不需要管理权限） */
export const workspaceInfo = () => ({ workspaces: [{ id: 'demo', name: db.depts.find(d => !d.parent_id)?.name ?? '演示工作空间', current: true }], accounts: db.people.map(p => ({ id: p.id })) })

export function org() {
  const { role, scope } = requireAdmin()
  const depts = role === 'super_admin' ? db.depts : db.depts.filter(d => scope.includes(d.id))
  const people = role === 'super_admin' ? db.people : db.people.filter(p => p.department_id && scope.includes(p.department_id))
  return {
    departments: depts.map(d => ({ ...d, member_count: db.people.filter(p => p.department_id === d.id).length, head_ids: db.heads.filter(h => h.department_id === d.id).map(h => h.account_id) })),
    members: people.map(p => ({ id: p.id, name: p.name, email: p.email, department_id: p.department_id, role: roleOf(p.id), last_login_at: p.last_login_at })),
    readonly: role !== 'super_admin',
  }
}
const label = (v: string) => { const s = v.trim(); if (!s || s.length > 100) fail('部门名称不能为空，且不超过 100 字', 400); return s }
export function createDept(b: { name: string, parent_id: string | null }) {
  const { p } = requireAdmin(true)
  const d = { id: nid('dept'), name: label(b.name), parent_id: b.parent_id || null }
  db.depts.push(d); log(p.id, d.name, '组织变更', `新建部门${d.parent_id ? `（上级：${deptName(d.parent_id)}）` : ''}`, d.id); save()
  return d
}
export function updateDept(id: string, b: { name: string, parent_id: string | null }) {
  const { p } = requireAdmin(true)
  const d = dept(id) ?? fail('部门不存在', 404)
  if (b.parent_id && descendants([id]).includes(b.parent_id)) fail('不能把部门放到自身或下级部门下面', 400)
  const name = label(b.name), moved = (b.parent_id || null) !== d.parent_id, renamed = name !== d.name
  const old = d.name
  Object.assign(d, { name, parent_id: b.parent_id || null })
  if (renamed) log(p.id, name, '组织变更', `重命名部门：${old} → ${name}`, id)
  if (moved) log(p.id, name, '组织变更', `移动部门到 ${deptName(d.parent_id) ?? '顶级'}`, id)
  save()
  return d
}
export function deleteDept(id: string) {
  const { p } = requireAdmin(true)
  const d = dept(id) ?? fail('部门不存在', 404)
  if (db.depts.some(x => x.parent_id === id) || db.people.some(x => x.department_id === id) || db.heads.some(h => h.department_id === id)) fail('部门仍有成员、下级部门或负责人，不能删除')
  db.depts = db.depts.filter(x => x.id !== id); log(p.id, d.name, '组织变更', '删除部门', null); save()
  return { result: 'success' }
}
export function setMemberDept(id: string, department_id: string | null) {
  const { p } = requireAdmin(true)
  const m = person(id) ?? fail('成员不存在', 404)
  if (department_id && !dept(department_id)) fail('部门不存在', 404)
  const from = deptName(m.department_id) ?? '未分配'
  m.department_id = department_id
  log(p.id, m.name, '组织变更', `调整部门：${from} → ${deptName(department_id) ?? '未分配'}`, department_id); save()
  return { result: 'success', department_id }
}
export function heads() {
  const { role, scope } = requireAdmin()
  return { data: db.heads.filter(h => role === 'super_admin' || scope.includes(h.department_id)).map(h => ({ department_id: h.department_id, department_name: deptName(h.department_id) ?? '', account_id: h.account_id, name: nameOf(h.account_id), granted_by_name: h.by ? nameOf(h.by) : null, granted_at: h.at })) }
}
export function addHead(department_id: string, account_id: string) {
  const { p } = requireAdmin(true)
  const d = dept(department_id) ?? fail('部门不存在', 404), m = person(account_id) ?? fail('成员不存在', 404)
  const chain: string[] = []
  for (let c: Department | undefined = d; c; c = dept(c.parent_id)) chain.push(c.id)
  if (!m.department_id || !chain.includes(m.department_id)) fail('负责人需从该部门或上级部门成员中选择', 400)
  if (db.heads.some(h => h.department_id === department_id && h.account_id === account_id)) fail('已是该部门负责人')
  db.heads.push({ department_id, account_id, by: p.id, at: now() }); log(p.id, d.name, '权限变更', `设置部门负责人：${m.name}`, department_id); save()
  return { result: 'success' }
}
export function removeHead(department_id: string, account_id: string) {
  const { p } = requireAdmin(true)
  db.heads = db.heads.filter(h => !(h.department_id === department_id && h.account_id === account_id))
  log(p.id, deptName(department_id) ?? '', '权限变更', `移除部门负责人：${nameOf(account_id)}`, department_id); save()
  return { result: 'success' }
}
export function supers() {
  requireAdmin(true)
  return { data: db.supers.map(s => { const m = person(s.id)!; return { account_id: s.id, name: m.name, email: m.email, department_name: deptName(m.department_id), granted_by_name: s.by ? nameOf(s.by) : null, granted_at: s.at } }) }
}
export function addSuper(account_id: string) {
  const { p } = requireAdmin(true)
  const m = person(account_id) ?? fail('成员不存在', 404)
  if (isSuper(account_id)) fail('已是超级管理员')
  db.supers.push({ id: account_id, by: p.id, at: now() }); log(p.id, m.name, '权限变更', '任命超级管理员', m.department_id); save()
  return { result: 'success' }
}
export function removeSuper(account_id: string) {
  const { p } = requireAdmin(true)
  if (db.supers.length <= 1) fail('至少保留一位超级管理员')
  db.supers = db.supers.filter(s => s.id !== account_id); log(p.id, nameOf(account_id), '权限变更', '撤销超级管理员', person(account_id)?.department_id ?? null); save()
  return { result: 'success' }
}
export const identitySource = () => { requireAdmin(); return { provider: 'partner_auth', issuer: 'https://partner.sensetime.com/auth', configured: false, methods: ['OIDC 授权码 + PKCE（S256）', '账号密码（开发 / 演示入口）'], note: '账号来自统一身份，部门在本平台维护。首次登录按 (issuer, tenant_id, sub) 自动建立平台成员（未分配部门）。' } }

/* ---------------- 用量 ---------------- */
const MODELS = ['SenseNova-V6-Pro', 'SenseNova-V6-Turbo', 'DeepSeek-V3']
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
export function usage(days: 7 | 30, department_id: string): Usage {
  const { role, scope, p } = requireAdmin()
  const visibleDepts = role === 'super_admin' ? db.depts : db.depts.filter(d => headOf(p.id).includes(d.id))
  const allowed = department_id ? (scope.includes(department_id) ? descendants([department_id]) : fail('不在你的管理范围内', 403)) : role === 'super_admin' ? null : scope
  const agents = db.resources.filter(r => r.kind === 'agent').map((r) => {
    const owner = person(r.owner)!, h = hash(r.id), base = 40 + h % 260
    const calls = Math.round(base * (days === 30 ? 3.6 + (h % 7) / 10 : 1)), callers = Math.max(1, Math.round(calls / (4 + h % 6)))
    const models = MODELS.filter((_, i) => (h >>> i) % 3 !== 0 || i === h % 3).map((model, i) => ({ model, tokens: Math.round(calls * (1800 + ((h >>> (i + 2)) % 9) * 420)) }))
    return { id: r.id, name: r.name, owner_name: owner.name, department_id: owner.department_id, department_name: deptName(owner.department_id), visibility: r.visibility, calls, callers, tokens: models.reduce((n, m) => n + m.tokens, 0), models, last_called_at: ago((h % 30) / 3 + 0.3) }
  }).filter(a => !allowed || (a.department_id && allowed.includes(a.department_id))).sort((a, b) => b.calls - a.calls)
  return { days, departments: visibleDepts.map(d => ({ id: d.id, name: d.name })), summary: { agents: agents.length, calls: agents.reduce((n, a) => n + a.calls, 0), callers: new Set(agents.flatMap(a => Array.from({ length: a.callers }, (_, i) => `${a.department_id}-${i}`))).size, tokens: agents.reduce((n, a) => n + a.tokens, 0) }, agents }
}

/* ---------------- 审计 ---------------- */
export const CATEGORIES = ['发布申请', '审批处理', '权限变更', '组织变更', '技术栈配置', '登录']
export function audit(q: AuditQuery) {
  const { role, scope } = requireAdmin()
  const inScope = (a: Audit) => role === 'super_admin' || (a.department_id && scope.includes(a.department_id)) || (!!person(a.actor)?.department_id && scope.includes(person(a.actor)!.department_id!))
  const since = q.days ? Date.now() - Number(q.days) * 24 * H : 0
  const base = db.audit.filter(inScope)
  const rows = base.filter(a => (!q.actor || nameOf(a.actor) === q.actor) && (!q.category || a.category === q.category) && (!q.department_id || a.department_id === q.department_id) && (!q.result || a.result === q.result) && new Date(a.time).getTime() >= since && (!q.keyword || a.object.includes(q.keyword)))
  return { data: rows.slice(0, 200).map(a => ({ id: a.id, time: a.time, actor_name: nameOf(a.actor), object_name: a.object, category: a.category, summary: a.summary, department_name: deptName(a.department_id), result: a.result })), actors: [...new Set(base.map(a => nameOf(a.actor)))], categories: CATEGORIES }
}
/** 演示登录记一条审计 */
export function recordLogin() { const a = currentDemo(); if (a) { const p = person(a.person)!; log(p.id, p.name, '登录', '演示账号登录成功', p.department_id); save() } }

/** governance(path) 通用调用的 mock 路由（仅治理相关路径） */
export function route(path: string): unknown {
  const [p, qs] = path.split('?')
  const query = Object.fromEntries(new URLSearchParams(qs ?? ''))
  if (p === '/account/permissions') return authority()
  if (p === '/admin/approvals') return approvals((query.state as 'pending') ?? 'pending')
  const vis = p.match(/^\/resource-visibility\/(agent|team|skill|mcp)\/(.+)$/)
  if (vis) return share(vis[1] as ShareKind, decodeURIComponent(vis[2]))
  if (p === '/admin/operations') return operations(Number(query.days) === 30 ? 30 : 7)
  return fail('该功能需要连接真实平台', 501)
}
function operations(days: 7 | 30) {
  const u = usage(days, ''), total = u.summary.calls, failed = Math.round(total * 0.012)
  return {
    days, scope: authority().role === 'super_admin' ? '全部部门' : '负责的部门', metrics_note: '演示数据', members: db.people.length,
    stats: { total, successful: total - failed, failed, p95_ms: 2400 },
    daily: Array.from({ length: days }, (_, i) => { const t = Math.round(total / days * (0.8 + ((i * 7) % 5) / 10)); return { day: new Date(Date.now() - (days - 1 - i) * 24 * H).toISOString().slice(0, 10), total: t, failed: Math.round(t * 0.012) } }),
    apps: [], recent: [], health: [{ name: '模型网关', status: 'healthy', detail: '演示数据' }], releases: { pending: approvals('pending').data.length, approved_30d: db.requests.filter(q => q.state === 'approved').length },
  }
}
