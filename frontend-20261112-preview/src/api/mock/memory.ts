/*
  记忆模块的有状态内存 mock：增删改、确认候选、分享审查、体检优化、Leader 复盘都即时可见。
  示例数据为演示用途，人名沿用开发约定里的示例同事；不代表真实业务记录。
*/
import type { Consumer, DistillDraft, LayerSummary, LeaderEvaluation, LeaderMemory, LeaderMemoryConfig, LeaderSkill, TeamRouterConfig, MemoryHealth, MemoryKind, MemoryPolicy, PersonalMemory, PersonalStatus, Proposal, ReviewDecision, ReviewItem, Suggestion, TeamMemory, TeamStatus } from '../memory'
import { ApiError } from '../http'
import * as teamsDb from './teams'

const DAY = 86400000
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString()
const dateIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10)
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`
const missing = (what = '记录') => new ApiError(`${what}不存在或已删除`, 404)
const ME = '李鹏程'

export const consumers: Consumer[] = [
  { id: 'assistant', name: '个人助手', kind: 'assistant' },
  { id: 'salesbuddy', name: '销售小浣熊 SalesBuddy', kind: 'buddy' },
  { id: 'projectbuddy', name: '项目小浣熊 ProjectBuddy', kind: 'buddy' },
  { id: 'kefu', name: '客服小浣熊', kind: 'buddy' },
  { id: 'hr', name: 'HR 小浣熊', kind: 'buddy' },
]

type P = [MemoryKind, string, PersonalStatus, PersonalMemory['source'], string[], number, number | null, number, string | null, number | null]
// kind, content, status, source, consumers, 创建于几天前, 最近使用几天前, 使用次数, 有效期, 把握度
const seed: P[] = [
  ['preference', '周报先写风险，再写进展和下周计划；每条风险标明依据和负责人。', 'active', { type: 'chat', label: '对话中「记住」· 周报整理' }, ['assistant', 'salesbuddy', 'projectbuddy'], 38, 1, 23, null, null],
  ['preference', '回复先给结论，再给依据；资料不足时先提问，不自行假设。', 'active', { type: 'manual', label: '手动添加' }, ['assistant', 'projectbuddy'], 60, 0, 41, null, null],
  ['background', '负责 FDE 交付中心，在跟的事：翼飞客服 Agent 上线评估、银行项目交付、售前方案攻坚。', 'active', { type: 'manual', label: '手动添加' }, ['assistant', 'projectbuddy'], 52, 0, 37, dateIn(53), null],
  ['experience', '上线评估先跑评测集回放，再看效果数据；没有评测集的 Agent 不进入上线评估。', 'active', { type: 'task', label: '产品开发协作群 · 上线评估', ref: 'collab/g1' }, ['assistant', 'projectbuddy'], 21, 2, 18, null, null],
  ['experience', '报价单第 2 版以后的口径变更，要同时更新方案正文的报价概要一章。', 'candidate', { type: 'task', label: '售前方案攻坚组 · 报价单第 2 版', ref: 'collab/g2' }, ['assistant'], 4, null, 0, null, 0.72],
  ['context', '翼飞客服 Agent 上线评估截止 11 月 11 日，需要效果数据和风险评估。', 'candidate', { type: 'collab', label: '产品开发协作群 · 叶源的助手' }, ['assistant', 'projectbuddy'], 3, null, 0, dateIn(3), 0.86],
  ['preference', '周报里把风险放在最前面。', 'candidate', { type: 'task', label: '周报汇总 · 自动提取' }, ['assistant'], 2, null, 0, null, 0.64],
  ['context', '银行项目交付群：延期不行，需要每天同步进展。', 'paused', { type: 'collab', label: '银行项目交付群' }, ['assistant'], 30, 12, 6, null, null],
  ['experience', '10 月月会材料按旧组织架构图准备。', 'expired', { type: 'task', label: '10 月月会' }, ['assistant'], 45, 20, 3, dateIn(-8), null],
  ['preference', '方案 PPT 默认 1.5 倍行距，正文不小于 10pt。', 'active', { type: 'chat', label: '对话中「记住」· PPT 修改' }, ['assistant'], 90, 63, 5, null, null],
  ['experience', '和周玮对齐技术问题时，先列现网盘点清单，再谈新需求。', 'active', { type: 'task', label: '智能体中台评审' }, ['assistant'], 26, 6, 9, null, null],
]
let personal: PersonalMemory[] = seed.map(([kind, content, status, source, cs, created, used, uses, valid, conf], i) => ({
  id: `mem-${String(i + 1).padStart(2, '0')}`, kind, content, status, source, consumers: cs, valid_until: valid,
  created_at: iso(created), updated_at: iso(Math.max(0, created - 3)), last_used_at: used == null ? null : iso(used), use_count: uses, confidence: conf,
}))

let team: TeamMemory[] = [
  { id: 'tm-01', team: 'FDE 交付中心', kind: 'sop', title: '上线评估检查清单', content: '评测集回放 → 效果数据 → 风险评估 → 负责人核对；缺评测集时先补评测集，不进入上线评估。', source: { type: 'manual', label: '个人分享', from: ME }, status: 'published', version: 2, maintainer: ME, reviewer: '周玮', scope: 'team', valid_until: null, updated_at: iso(6), use_count: 31, feedback: { up: 9, down: 0 } },
  { id: 'tm-02', team: '售前方案团队', kind: 'experience', title: '客户拜访前准备清单', content: '查商机阶段与上次拜访记录；准备三个待确认问题；带上同行业案例（只用已授权材料）。客户信息已去除。', source: { type: 'manual', label: '个人分享', from: '蒋磊' }, status: 'published', version: 1, maintainer: '蒋磊', reviewer: ME, scope: 'team', valid_until: dateIn(120), updated_at: iso(12), use_count: 22, feedback: { up: 6, down: 1 } },
  { id: 'tm-03', team: '售前方案团队', kind: 'experience', title: '报价口径变更同步规则', content: '报价单口径变更后，同步更新方案正文报价概要与风险页，并在群里 @ 销售负责人。', source: { type: 'manual', label: '个人分享', from: '叶源' }, status: 'reviewing', version: 1, maintainer: '叶源', reviewer: ME, scope: 'team', valid_until: null, updated_at: iso(1), use_count: 0, feedback: { up: 0, down: 0 } },
  { id: 'tm-04', team: 'FDE 交付中心', kind: 'context', title: '银行项目周会纪要模板', content: '议题、结论、负责人、截止时间、待确认事项五栏。', source: { type: 'manual', label: '个人分享', from: '金豫玮' }, status: 'returned', version: 1, maintainer: '金豫玮', reviewer: ME, scope: 'team', valid_until: null, updated_at: iso(5), use_count: 0, feedback: { up: 0, down: 0 } },
  { id: 'tm-05', team: '售前方案团队', kind: 'handoff', title: '需求清单确认后再并行', content: '需求清单经负责人确认后，方案撰写与报价测算并行；合规检查最后审阅方案和报价。', source: { type: 'leader', label: 'Leader 复盘', from: '售前协调者' }, status: 'published', version: 3, maintainer: '售前协调者', reviewer: ME, scope: 'workflow', valid_until: null, updated_at: iso(9), use_count: 58, feedback: { up: 4, down: 0 } },
]

let reviews: ReviewItem[] = [
  { id: 'rv-01', type: 'share', title: '报价口径变更同步规则', from: '叶源', team: '售前方案团队', submitted_at: iso(1), preview: team[2].content, basis: '来自售前方案攻坚组近两次报价单修改，均出现正文未同步的问题。', checks: [{ level: 'ok', text: '未发现客户名称、金额等敏感信息' }, { level: 'ok', text: '与已发布条目不重复' }], entry_id: 'tm-03' },
  { id: 'rv-02', type: 'leader', title: '合规初筛前置到方案与报价之前', from: '售前协调者（团长）', team: '售前方案团队', submitted_at: iso(0.3), preview: '需求清单确认后先做合规初筛（数据出境、私有化部署条件），再并行方案撰写与报价测算，合规检查做终审。', basis: 'Leader 复盘：近 30 天 86 次运行中，4 次在报价之后才发现数据出境风险，方案返工。', checks: [{ level: 'warn', text: '将修改已发布的交接规则「需求清单确认后再并行」（v3 → v4）' }, { level: 'ok', text: '不涉及成员私人记忆' }], entry_id: 'tm-05' },
  { id: 'rv-03', type: 'conflict', title: '拜访前是否必须查商机阶段', from: '蒋磊的助手', team: '售前方案团队', submitted_at: iso(2), preview: '个人记忆「新客户首次拜访不查商机阶段」与团队条目「客户拜访前准备清单 v1」不一致。', basis: '同一客户事实不一致时，不由模型静默覆盖，交给维护人确认。', checks: [{ level: 'risk', text: '与团队条目冲突，确认前两条都暂停检索' }], entry_id: 'tm-02' },
]

let policy: MemoryPolicy = { retrieval: true, extract: true, extract_on: ['explicit', 'task_end', 'correction'], require_confirm: true, candidate_ttl_days: 14, default_valid_days: null, consumers: ['assistant', 'salesbuddy', 'projectbuddy'], max_context: 12, dedupe: true, conflict_to_review: true, suggest_skill: true }

/* ---------------- 个人记忆 ---------------- */
const findP = (id: string) => personal.find(m => m.id === id) ?? (() => { throw missing('记忆') })()
export function listPersonal(q: { kind?: string, status?: string, q?: string }) {
  const k = (q.q ?? '').trim()
  const data = personal.filter(m => (!q.kind || m.kind === q.kind) && (!q.status || m.status === q.status) && (!k || m.content.includes(k) || m.source.label.includes(k)))
  return { data: data.sort((a, b) => order(a) - order(b) || b.updated_at.localeCompare(a.updated_at)), consumers }
}
const order = (m: PersonalMemory) => ({ candidate: 0, active: 1, paused: 2, expired: 3 })[m.status]
export function createPersonal(b: Pick<PersonalMemory, 'kind' | 'content' | 'consumers' | 'valid_until'>) {
  if (!b.content.trim())
    throw new ApiError('请填写记忆内容', 400)
  const m: PersonalMemory = { id: uid('mem'), ...b, content: b.content.trim(), status: 'active', source: { type: 'manual', label: '手动添加' }, created_at: iso(0), updated_at: iso(0), last_used_at: null, use_count: 0, confidence: null }
  personal = [m, ...personal]
  return m
}
export function updatePersonal(id: string, b: Partial<PersonalMemory>) {
  const m = findP(id)
  Object.assign(m, b, { updated_at: iso(0) })
  return m
}
export const confirmPersonal = (id: string, content?: string) => updatePersonal(id, { status: 'active', ...(content?.trim() ? { content: content.trim() } : {}) })
export function deletePersonal(id: string) {
  findP(id)
  personal = personal.filter(m => m.id !== id)
  return { ok: true }
}
export function mergePersonal(ids: string[], content: string) {
  const list = ids.map(findP)
  const base = list[0]
  Object.assign(base, { content: content.trim() || base.content, status: 'active', updated_at: iso(0), use_count: list.reduce((s, m) => s + m.use_count, 0), consumers: [...new Set(list.flatMap(m => m.consumers))] })
  personal = personal.filter(m => m === base || !ids.includes(m.id))
  return base
}
export function sharePersonal(id: string, b: { team: string, title: string, content: string, scope: TeamMemory['scope'] }) {
  const m = findP(id)
  const entry: TeamMemory = { id: uid('tm'), team: b.team, kind: m.kind, title: b.title, content: b.content, source: { type: 'manual', label: '个人分享', from: ME }, status: 'reviewing', version: 1, maintainer: ME, reviewer: '周玮', scope: b.scope, valid_until: m.valid_until, updated_at: iso(0), use_count: 0, feedback: { up: 0, down: 0 } }
  team = [entry, ...team]
  m.shared_to = { team: b.team, entry_id: entry.id, status: 'reviewing' }
  const r: ReviewItem = { id: uid('rv'), type: 'share', title: b.title, from: ME, team: b.team, submitted_at: iso(0), preview: b.content, basis: `来自个人记忆（${m.source.label}）`, checks: [{ level: 'ok', text: '已预览将公开的内容' }], entry_id: entry.id }
  return r
}

/* ---------------- 团队记忆与审查 ---------------- */
const findT = (id: string) => team.find(t => t.id === id) ?? (() => { throw missing('团队条目') })()
export const listTeam = (q: { team?: string, status?: string }) => ({ data: team.filter(t => (!q.team || t.team === q.team) && (!q.status || t.status === q.status)), teams: [...new Set(team.map(t => t.team))] })
export function revokeTeam(id: string) {
  const t = findT(id)
  Object.assign(t, { status: 'revoked' as TeamStatus, updated_at: iso(0) })
  return t
}
export function feedbackTeam(id: string, up: boolean) {
  const t = findT(id)
  t.feedback = up ? { ...t.feedback, up: t.feedback.up + 1 } : { ...t.feedback, down: t.feedback.down + 1 }
  return t
}
export const listReviews = () => ({ data: reviews })
export function decideReview(id: string, decision: ReviewDecision) {
  const r = reviews.find(x => x.id === id) ?? (() => { throw missing('审查事项') })()
  const t = findT(r.entry_id)
  if (r.type === 'leader' && decision === 'approve')
    Object.assign(t, { content: r.preview, version: t.version + 1, status: 'published', updated_at: iso(0) })
  else if (r.type !== 'conflict')
    Object.assign(t, { status: decision === 'approve' ? 'published' : decision === 'return' ? 'returned' : 'rejected', updated_at: iso(0) })
  personal.forEach(m => m.shared_to?.entry_id === t.id && (m.shared_to.status = t.status))
  reviews = reviews.filter(x => x.id !== id)
  return { ok: true, entry: t }
}

/* ---------------- 体检与优化 ---------------- */
let dismissed = new Set<string>()
function suggestions(): Suggestion[] {
  const has = (id: string) => personal.some(m => m.id === id)
  const cands = personal.filter(m => m.status === 'candidate')
  const all: (Suggestion | false)[] = [
    has('mem-01') && has('mem-07') && { id: 'sg-merge', type: 'merge', title: '合并 2 条重复的偏好', detail: '「周报先写风险……」与「周报里把风险放在最前面」意思相同，合并后保留来源和使用次数。', items: ['mem-01', 'mem-07'], impact: '减少重复带入，每次对话约少 30 个 Token', action: '合并' },
    cands.length > 0 && { id: 'sg-candidate', type: 'candidate', title: `${cands.length} 条候选等你确认`, detail: '自动提取的内容在确认前不会被任何助手使用；超过 14 天未确认会自动清除。', items: cands.map(m => m.id), impact: '确认后生效', action: '去确认' },
    has('mem-06') && { id: 'sg-expire', type: 'expire', title: '1 条业务上下文即将过期', detail: '「翼飞客服 Agent 上线评估截止 11 月 11 日」3 天后到期，到期后自动停止检索。', items: ['mem-06'], impact: '避免过期信息被当成事实', action: '到期提醒' },
    personal.some(m => m.id === 'mem-10' && m.status === 'active') && { id: 'sg-stale', type: 'stale', title: '1 条记忆 60 天未被使用', detail: '「方案 PPT 默认 1.5 倍行距……」最近 60 天没有任何助手用到，建议暂停，需要时再恢复。', items: ['mem-10'], impact: '缩短每次带入的上下文', action: '暂停' },
    personal.some(m => m.id === 'mem-08' && m.status === 'paused') && { id: 'sg-conflict', type: 'conflict', title: '1 条记忆与团队条目冲突', detail: '「银行项目交付群：延期不行……」与团队条目中的交付节奏说明不一致，按策略转「待我确认」，由你确认以哪条为准。', items: ['mem-08'], impact: '冲突确认前两条都不参与检索', action: '转待我确认' },
    personal.some(m => m.id === 'mem-04' && m.status === 'active') && { id: 'sg-skill', type: 'skill', title: '1 条做法已稳定，可以沉淀为 Skill', detail: '「上线评估先跑评测集回放……」近 21 天被使用 18 次、没有被纠正，适合写成 Skill「上线评估检查」，固定步骤不再每次推理。', items: ['mem-04'], impact: '生成 Skill 草稿，需在 Skills 里检查后发布', action: '生成 Skill 草稿' },
    { id: 'sg-compress', type: 'compress', title: '压缩背景类记忆', detail: '3 条背景与上下文可以整理成一段摘要带入，原条目保留、可随时展开。', items: ['mem-03', 'mem-06', 'mem-11'], impact: '每次对话带入的记忆约减少三分之一', action: '生成摘要' },
  ]
  return all.filter((s): s is Suggestion => !!s && !dismissed.has(s.id))
}
export function health(): MemoryHealth {
  const n = (s: PersonalStatus) => personal.filter(m => m.status === s).length
  const sg = suggestions()
  return {
    score: Math.max(60, 96 - sg.length * 5),
    checked_at: iso(0),
    totals: { active: n('active'), candidate: n('candidate'), paused: n('paused'), expired: n('expired'), team_published: team.filter(t => t.status === 'published').length, reviewing: team.filter(t => t.status === 'reviewing').length },
    context_tokens: personal.filter(m => m.status === 'active').reduce((s, m) => s + m.content.length * 2, 180),
    hit_rate: 0.78,
    suggestions: sg,
  }
}
export function optimize(ids: string[]) {
  const sg = suggestions().filter(s => ids.includes(s.id))
  for (const s of sg) {
    if (s.type === 'merge')
      mergePersonal(s.items, '周报先写风险，再写进展和下周计划；每条风险标明依据和负责人。')
    if (s.type === 'stale')
      s.items.forEach(id => updatePersonal(id, { status: 'paused' }))
    if (s.type === 'conflict') {
      reviews = [{ id: uid('rv'), type: 'conflict', title: '银行项目交付节奏以哪条为准', from: '记忆体检', team: 'FDE 交付中心', submitted_at: iso(0), preview: personal.find(m => m.id === 'mem-08')?.content ?? '', basis: '个人记忆与团队条目不一致。', checks: [{ level: 'risk', text: '确认前两条都暂停检索' }], entry_id: 'tm-04' }, ...reviews]
    }
    dismissed.add(s.id)
  }
  return { applied: sg.length, health: health() }
}
export const getPolicy = () => ({ policy, consumers })
export function savePolicy(p: MemoryPolicy) {
  policy = { ...p, require_confirm: true }
  return { policy }
}
export function resetForDemo() {
  dismissed = new Set()
}

/* ---------------- 专家团队 Leader 记忆 ---------------- */
type LeaderRec = { config: LeaderMemoryConfig, entries: TeamMemory[], evaluation: LeaderEvaluation, baseRuns: number, skills: LeaderSkill[], router: TeamRouterConfig }
const leaders: Record<string, LeaderRec> = {}
const defaultConfig = (): LeaderMemoryConfig => ({ enabled: true, sources: ['run_logs', 'handoffs', 'human_review', 'member_feedback'], write_mode: 'candidate', reviewer: ME, scope: 'workflow', cadence: 'weekly', min_runs: 10, retention_days: 180, metrics: ['success', 'handoff', 'rework', 'human', 'latency'], read_private: false })

const entry = (teamName: string, leaderName: string, kind: TeamMemory['kind'], title: string, content: string, version: number, uses: number, daysAgo: number, status: TeamStatus = 'published'): TeamMemory => ({
  id: uid('tl'), team: teamName, kind, title, content, source: { type: 'leader', label: kind === 'role' ? '团队配置' : 'Leader 复盘', from: leaderName }, status, version, maintainer: leaderName, reviewer: ME, scope: 'workflow', valid_until: null, updated_at: iso(daysAgo), use_count: uses, feedback: { up: Math.round(uses / 12), down: 0 },
})

function seedLeader(teamId: string): LeaderRec {
  const { team: t, agents } = teamsDb.detail(teamId)
  const name = (id: string) => agents.find(a => a.id === id)?.name ?? id
  const lead = name(t.config.leader_id)
  const members = t.config.members.map(m => ({ name: name(m.agent_id), duty: m.responsibility }))
  const curated: Record<string, { entries: TeamMemory[], bottlenecks: LeaderEvaluation['bottlenecks'], proposals: Omit<Proposal, 'id' | 'status'>[], numbers: [number, number, number, number, number, number] }> = {
    presales: {
      entries: [
        entry(t.name, lead, 'sop', '售前方案包四段输出', '需求清单 → 方案要点 → 报价 → 风险与待确认；不确定内容标「待确认」，不编造金额与日期。', 2, 64, 14),
        entry(t.name, lead, 'handoff', '需求清单确认后再并行', '需求清单经负责人确认后，方案撰写与报价测算并行；合规检查最后审阅方案和报价。', 3, 58, 9),
        entry(t.name, lead, 'handoff', '报价输入缺项退回', '报价测算收到的需求清单必须含部署方式与并发量；缺失时退回需求分析补充，不自行假设。', 1, 21, 6),
        entry(t.name, lead, 'feedback', '数据出境风险多发场景', '近 30 天合规检查 4 次发现数据出境风险，均出现在「私有化 ＋ 海外子公司」场景。', 1, 7, 3),
        entry(t.name, lead, 'experience', '长材料先出目录摘要', '客户材料超过 50 页时，需求分析先出目录摘要，再按章节细读。', 1, 0, 1, 'reviewing'),
      ],
      bottlenecks: [{ step: '报价测算', agent: '报价测算', issue: '需求清单缺部署方式，退回补充', runs: 7 }, { step: '合规检查', agent: '合规检查', issue: '报价之后才发现数据出境风险，方案返工', runs: 4 }],
      proposals: [
        { type: 'handoff', title: '合规初筛前置', before: '方案撰写、报价测算并行 → 合规检查最后审阅', after: '需求清单确认后先做合规初筛（数据出境、私有化条件）→ 方案与报价并行 → 合规终审', evidence: '近 30 天 4 次因合规问题返工，均在报价之后才发现', impact: '减少因合规问题导致的整包返工' },
        { type: 'role', title: '报价测算的输入说明补两项必填', before: '输入说明：需求清单', after: '输入说明：需求清单（必须含部署方式、并发量；缺失时退回）', evidence: '7 次运行因缺部署方式退回补充', impact: '减少一次往返交接' },
        { type: 'skill', title: '四段式方案包格式沉淀为 Skill', before: '每次由团长在指令里重复说明输出格式', after: '生成 Skill「售前方案包格式」，团长与成员直接调用', evidence: '该格式连续 20 次运行未被人工修改', impact: '格式稳定、不再每次推理' },
        { type: 'distill', title: '提炼岗位专家智能体「售前方案专家」', before: '四个 Agent 分别维护记忆，经验分散', after: '合并需求分析、方案撰写、报价测算的已发布记忆与本团队 SOP，生成一个可复用的岗位专家智能体草稿', evidence: '本团队 86 次运行沉淀的 5 条团队记忆与 3 个 Agent 的已发布记忆', impact: '其他团队可直接复用售前经验（发布前需审批）' },
      ],
      numbers: [86, 94, 4.6, 11.6, 1.3, 96],
    },
    'cs-escalation': {
      entries: [
        entry(t.name, lead, 'sop', '升级处理三段输出', '问题判断 → 相关历史 → 处理建议；已通知人员单列。', 2, 120, 20),
        entry(t.name, lead, 'handoff', '高紧急度才通知值班', '问题诊断与工单检索并行；诊断为高紧急度时才安排值班通知，其余进入次日处理。', 2, 96, 11),
        entry(t.name, lead, 'feedback', '硬件故障误判', '近 30 天 6 次把网络抖动判成硬件故障，值班同事退回。', 1, 12, 4),
      ],
      bottlenecks: [{ step: '问题诊断', agent: '问题诊断', issue: '网络抖动被判成硬件故障，值班退回', runs: 6 }],
      proposals: [
        { type: 'handoff', title: '诊断不确定时先查工单再判定', before: '问题诊断与工单检索并行，诊断直接给出紧急度', after: '诊断把握度低于阈值时，等工单检索结果再判定紧急度', evidence: '6 次误判均有相似历史工单可参考', impact: '减少误通知值班' },
        { type: 'distill', title: '提炼岗位专家智能体「客服升级专家」', before: '三个 Agent 分别维护记忆', after: '合并诊断与检索经验，生成岗位专家智能体草稿', evidence: '312 次运行沉淀的团队记忆', impact: '其他客服团队可复用（发布前需审批）' },
      ],
      numbers: [312, 89, 3.1, 8.3, 0.6, 41],
    },
  }
  const c = curated[teamId] ?? {
    entries: [entry(t.name, lead, 'sop', '团队输出格式', t.config.output || '按团队任务要求输出。', 1, 8, 6), ...members.slice(0, 3).map((m, i) => entry(t.name, lead, 'role', `${m.name} 负责什么`, m.duty || '按团长分派处理子任务。', 1, 6 - i, 6))],
    bottlenecks: [{ step: members[0]?.name ?? '成员', agent: members[0]?.name ?? '成员', issue: '输入不完整，被团长退回补充', runs: 3 }],
    proposals: [{ type: 'handoff', title: '统一交接格式', before: '成员各自输出', after: '每位成员按「结论 · 依据 · 待确认」交给团长', evidence: '3 次因格式不一致需要团长重写', impact: '汇总更快' }],
    numbers: [24, 92, 3.0, 9.0, 0.8, 58] as [number, number, number, number, number, number],
  }
  const [runs, success, handoffs, rework, human, latency] = c.numbers
  return {
    baseRuns: runs,
    skills: [
      { id: 'ls-plan', name: '任务拆解', purpose: 'plan', desc: '把目标拆成可交接的子任务，写清输入与验收标准', source: 'org', version: '1.2', enabled: true, uses: runs },
      { id: 'ls-dispatch', name: '按职责派发', purpose: 'dispatch', desc: '按成员职责与输入说明派发，缺输入先补齐', source: 'org', version: '1.1', enabled: true, uses: runs },
      { id: 'ls-handoff', name: '交接检查', purpose: 'handoff', desc: '检查每次交接是否带齐结论、依据与待确认项', source: 'team', version: '0.8', enabled: true, uses: Math.round(runs * 0.9) },
      { id: 'ls-summary', name: t.config.output ? '团队输出格式' : '汇总报告', purpose: 'summary', desc: t.config.output || '把各成员结果汇总成一份答复', source: 'team', version: '2.0', enabled: true, uses: runs },
      { id: 'ls-review', name: '协作复盘', purpose: 'review', desc: '按运行记录评价协作效果，提出 SOP 与交接修订', source: 'org', version: '1.0', enabled: true, uses: 4 },
    ],
    router: { dispatch: 'leader', max_rounds: t.config.max_rounds, parallelism: t.config.parallelism, checkpoints: ['对外发送前', '报价与承诺'], handoff_format: '结论 · 依据 · 待确认', escalate_to_human: ['专家结论冲突', '超出授权', '缺少关键输入'] },
    config: defaultConfig(),
    entries: c.entries,
    evaluation: { period: '近 30 天', runs, success_rate: success, avg_handoffs: handoffs, rework_rate: rework, human_touches: human, avg_latency: latency, trend: [rework + 4.2, rework + 3.1, rework + 3.4, rework + 1.8, rework + 1.2, rework + 0.6, rework], bottlenecks: c.bottlenecks, proposals: c.proposals.map((p, i) => ({ ...p, id: `pp-${teamId}-${i}`, status: 'open' })), evaluated_at: iso(0.2) },
  }
}
function rec(teamId: string) {
  return (leaders[teamId] ??= seedLeader(teamId))
}
export function leader(teamId: string): LeaderMemory {
  const r = rec(teamId)
  const { team: t, agents } = teamsDb.detail(teamId)
  const name = (id: string) => agents.find(a => a.id === id)?.name ?? id
  const agentLayer: LayerSummary[] = t.config.members.map((m, i) => ({ id: m.agent_id, name: name(m.agent_id), owner: i % 2 ? '周玮' : '叶源', entries: 6 + ((i * 7) % 11), updated_at: iso(i + 1), note: '已发布记忆，Leader 只读摘要', kind: 'agent' }))
  const assistantLayer: LayerSummary[] = [ME, '蒋磊'].map((n, i) => ({ id: `as-${i}`, name: `${n}的助手`, owner: n, entries: 0, updated_at: iso(i), note: '私有，Leader 不可读', kind: 'assistant' }))
  const personal = !t.config.leader_id.endsWith('-lead')
  return { team_id: teamId, leader: { id: t.config.leader_id, name: name(t.config.leader_id), kind: personal ? 'personal' : 'org', owner: personal ? ME : t.name }, skills: r.skills, router: r.router, config: r.config, layers: { assistants: assistantLayer, agents: agentLayer }, entries: r.entries, evaluation: r.evaluation }
}
export function saveLeaderConfig(teamId: string, config: LeaderMemoryConfig) {
  rec(teamId).config = { ...config, read_private: false }
  return leader(teamId)
}
export function evaluate(teamId: string, range: '7d' | '30d' | '90d') {
  const r = rec(teamId)
  const k = { '7d': 0.24, '30d': 1, '90d': 2.9 }[range]
  r.evaluation = { ...r.evaluation, period: { '7d': '近 7 天', '30d': '近 30 天', '90d': '近 90 天' }[range], runs: Math.max(3, Math.round(r.baseRuns * k)), evaluated_at: iso(0) }
  return r.evaluation
}
export function decideProposal(teamId: string, pid: string, action: 'submit' | 'dismiss') {
  const r = rec(teamId)
  const p = r.evaluation.proposals.find(x => x.id === pid) ?? (() => { throw missing('建议') })()
  p.status = action === 'submit' ? 'submitted' : 'dismissed'
  if (action === 'submit' && p.type !== 'distill') {
    const { team: t } = teamsDb.detail(teamId)
    const lead = leader(teamId).leader.name
    const kind: TeamMemory['kind'] = p.type === 'skill' ? 'sop' : p.type === 'role' ? 'role' : p.type === 'sop' ? 'sop' : 'handoff'
    const e = entry(t.name, lead, kind, p.title, p.after, 1, 0, 0, 'reviewing')
    r.entries = [e, ...r.entries]
    reviews = [{ id: uid('rv'), type: 'leader', title: p.title, from: `${lead}（团长）`, team: t.name, submitted_at: iso(0), preview: p.after, basis: `Leader 复盘：${p.evidence}`, checks: [{ level: 'warn', text: '发布后影响本团队后续运行' }, { level: 'ok', text: '不涉及成员私人记忆' }], entry_id: e.id }, ...reviews]
    team = [e, ...team]
  }
  return leader(teamId)
}
export function updateLeaderEntry(teamId: string, entryId: string, b: { content?: string, status?: TeamStatus }) {
  const r = rec(teamId)
  const e = r.entries.find(x => x.id === entryId) ?? (() => { throw missing('团队条目') })()
  if (b.content && b.content !== e.content)
    Object.assign(e, { content: b.content, status: e.status === 'published' ? 'reviewing' : e.status, updated_at: iso(0) })
  if (b.status)
    Object.assign(e, { status: b.status, updated_at: iso(0) })
  return leader(teamId)
}
export function saveLeaderSkills(teamId: string, skills: LeaderSkill[]) {
  rec(teamId).skills = skills
  return leader(teamId)
}
export function saveTeamRouter(teamId: string, router: TeamRouterConfig) {
  rec(teamId).router = router
  return leader(teamId)
}
export function distill(teamId: string, d: DistillDraft) {
  if (!d.name.trim())
    throw new ApiError('请填写岗位专家智能体名称', 400)
  const r = rec(teamId)
  r.evaluation.proposals.forEach(p => p.type === 'distill' && (p.status = 'submitted'))
  return { agent_draft_id: uid('agent-draft'), approval_id: uid('approval') }
}
