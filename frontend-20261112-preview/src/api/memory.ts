/*
  记忆（Memory）接口层：个人记忆 · 团队记忆 · 待审查 · 体检与优化 · 记忆策略 · 专家团队 Leader 记忆。
  依据：《Raccoon X 企业 AI 中台建设规划》一（个人记忆管理、岗位专家智能体沉淀）与二.4（个人记忆与团队记忆分层）；
       《产品介绍与使用指南》9.6（memory 管理：个人可管控，团队可分享）与 10.3（候选 → 确认 → 分类保存）。
  原则（界面与接口都按此实现）：
  - 个人记忆默认私有；自动提取的内容先进入「候选」，经本人确认才生效。
  - 团队记忆是从个人分享或团队协作产出、经审查后发布的独立条目，保留来源；加入团队不会自动共享私人记忆。
  - Leader（专家团队的团长 / 团队 Router）只维护本团队的团队记忆，不读取成员的私人记忆。
  - 删除、停用、撤回之后停止后续检索；已被看到或导出的内容不能收回（界面提示）。
  mock 见 ./mock/memory.ts；接口清单见 docs/api/memory.md。
*/
import { request } from './http'
import * as db from './mock/memory'

/* ---------------- 类型 ---------------- */
/** 偏好 · 背景 · 工作经验 · 业务上下文 */
export type MemoryKind = 'preference' | 'background' | 'experience' | 'context'
/** 候选 → 已启用 → 暂停 / 过期 */
export type PersonalStatus = 'candidate' | 'active' | 'paused' | 'expired'
/** 草稿 → 待审查 → 已发布；或退回 / 拒绝；已发布后可过期或撤回 */
export type TeamStatus = 'draft' | 'reviewing' | 'published' | 'returned' | 'rejected' | 'expired' | 'revoked'
export type SourceType = 'manual' | 'chat' | 'task' | 'collab' | 'leader'
export type MemorySource = { type: SourceType, label: string, ref?: string }

export type PersonalMemory = {
  id: string
  kind: MemoryKind
  content: string
  source: MemorySource
  status: PersonalStatus
  /** 允许使用这条记忆的助手或 Buddy；空数组 = 仅个人助手 */
  consumers: string[]
  valid_until: string | null
  created_at: string
  updated_at: string
  last_used_at: string | null
  use_count: number
  /** 自动提取时的把握度 0–1；手动新增为 null */
  confidence: number | null
  /** 已提交分享时对应的团队条目 */
  shared_to?: { team: string, entry_id: string, status: TeamStatus }
}

export type TeamMemory = {
  id: string
  team: string
  kind: MemoryKind | 'sop' | 'handoff' | 'role' | 'feedback'
  title: string
  content: string
  source: MemorySource & { from?: string }
  status: TeamStatus
  version: number
  maintainer: string
  reviewer: string
  scope: 'team' | 'workflow' | 'org'
  valid_until: string | null
  updated_at: string
  use_count: number
  feedback: { up: number, down: number }
}

export type ReviewType = 'share' | 'leader' | 'conflict' | 'update'
export type ReviewItem = {
  id: string
  type: ReviewType
  title: string
  from: string
  team: string
  submitted_at: string
  /** 将公开的内容（已去除敏感信息） */
  preview: string
  basis: string
  /** 自动检查出的风险：敏感信息、与已有条目冲突、过期依据等 */
  checks: { level: 'ok' | 'warn' | 'risk', text: string }[]
  entry_id: string
}
export type ReviewDecision = 'approve' | 'return' | 'reject'

export type MemoryPolicy = {
  /** 检索开关：关闭后所有助手都不读取个人记忆 */
  retrieval: boolean
  /** 新记忆提取：关闭后不再从任务中提取候选 */
  extract: boolean
  /** 自动提取的时机 */
  extract_on: ('explicit' | 'task_end' | 'feedback' | 'correction')[]
  /** 候选需要本人确认（企业版锁定为 true） */
  require_confirm: true
  candidate_ttl_days: number
  default_valid_days: number | null
  consumers: string[]
  /** 每次对话最多带入多少条 */
  max_context: number
  dedupe: boolean
  /** 与团队记忆或业务系统冲突时转「待我确认」 */
  conflict_to_review: boolean
  /** 已稳定、无需反复推理的做法提示沉淀为 Skill */
  suggest_skill: boolean
}

export type SuggestionType = 'merge' | 'conflict' | 'expire' | 'stale' | 'skill' | 'compress' | 'candidate'
export type Suggestion = { id: string, type: SuggestionType, title: string, detail: string, items: string[], impact: string, action: string }
export type MemoryHealth = {
  score: number
  checked_at: string
  totals: { active: number, candidate: number, paused: number, expired: number, team_published: number, reviewing: number }
  context_tokens: number
  hit_rate: number
  suggestions: Suggestion[]
}

export type Consumer = { id: string, name: string, kind: 'assistant' | 'buddy' }

/* ---------- 专家团队（工作流）的 Leader 记忆 ---------- */
export type LeaderSource = 'run_logs' | 'handoffs' | 'human_review' | 'member_feedback' | 'agent_memory_digest'
export type LeaderMemoryConfig = {
  enabled: boolean
  sources: LeaderSource[]
  /** 新条目写入方式：candidate = 先进候选并经审查；direct 仅允许低风险的交接参数 */
  write_mode: 'candidate' | 'direct_low_risk'
  reviewer: string
  scope: 'workflow' | 'team' | 'org'
  cadence: 'per_run' | 'daily' | 'weekly'
  min_runs: number
  retention_days: number
  metrics: ('success' | 'handoff' | 'rework' | 'human' | 'latency')[]
  /** 恒为 false：Leader 不读取成员的私人记忆 */
  read_private: false
}
export type LayerSummary = { id: string, name: string, owner: string, entries: number, updated_at: string, note: string, kind: 'assistant' | 'agent' }
export type Proposal = {
  id: string
  type: 'sop' | 'handoff' | 'role' | 'skill' | 'distill'
  title: string
  before: string
  after: string
  evidence: string
  impact: string
  status: 'open' | 'submitted' | 'dismissed'
}
export type Bottleneck = { step: string, agent: string, issue: string, runs: number }
export type LeaderEvaluation = {
  period: string
  runs: number
  success_rate: number
  avg_handoffs: number
  rework_rate: number
  human_touches: number
  avg_latency: number
  trend: number[]
  bottlenecks: Bottleneck[]
  proposals: Proposal[]
  evaluated_at: string
}
/** Leader 用来统筹的技能：拆解、派发、交接检查、汇总、复盘 */
export type LeaderSkill = { id: string, name: string, purpose: 'plan' | 'dispatch' | 'handoff' | 'summary' | 'review', desc: string, source: 'org' | 'personal' | 'team', version: string, enabled: boolean, uses: number }
/** 团队 Router（Leader 侧）：本工作流内的分派与交接方式 */
export type TeamRouterConfig = { dispatch: 'leader' | 'sequential' | 'parallel', max_rounds: number, parallelism: number, checkpoints: string[], handoff_format: string, escalate_to_human: string[] }
export type LeaderMemory = {
  team_id: string
  /** Leader 可以是某个人的个人专家智能体，也可以是组织专家智能体 */
  leader: { id: string, name: string, kind: 'personal' | 'org', owner: string }
  skills: LeaderSkill[]
  router: TeamRouterConfig
  config: LeaderMemoryConfig
  layers: { assistants: LayerSummary[], agents: LayerSummary[] }
  entries: TeamMemory[]
  evaluation: LeaderEvaluation
}
export type DistillDraft = { name: string, role: string, skills: string[], memory_ids: string[], reviewer: string, note: string }

/* ---------------- 个人记忆 ---------------- */
/** GET /memory/personal 个人记忆列表（kind、status、q 可选） */
export const listPersonalMemory = (q: { kind?: MemoryKind | '', status?: PersonalStatus | '', q?: string } = {}) =>
  request<{ data: PersonalMemory[], consumers: Consumer[] }>({ method: 'GET', path: '/memory/personal', query: q }, () => db.listPersonal(q))
/** POST /memory/personal 手动新增一条（直接为已启用） */
export const createPersonalMemory = (b: Pick<PersonalMemory, 'kind' | 'content' | 'consumers' | 'valid_until'>) =>
  request<PersonalMemory>({ method: 'POST', path: '/memory/personal', body: b }, () => db.createPersonal(b))
/** PATCH /memory/personal/{id} 编辑、纠错、暂停 / 恢复 */
export const updatePersonalMemory = (id: string, b: Partial<Pick<PersonalMemory, 'kind' | 'content' | 'consumers' | 'valid_until' | 'status'>>) =>
  request<PersonalMemory>({ method: 'PATCH', path: `/memory/personal/${id}`, body: b }, () => db.updatePersonal(id, b))
/** POST /memory/personal/{id}/confirm 确认候选（可带修改后的内容） */
export const confirmCandidate = (id: string, content?: string) =>
  request<PersonalMemory>({ method: 'POST', path: `/memory/personal/${id}/confirm`, body: { content } }, () => db.confirmPersonal(id, content))
/** DELETE /memory/personal/{id} 删除：停止后续检索并清理索引与缓存 */
export const deletePersonalMemory = (id: string) =>
  request<{ ok: boolean }>({ method: 'DELETE', path: `/memory/personal/${id}` }, () => db.deletePersonal(id))
/** POST /memory/personal/merge 合并重复项 */
export const mergePersonalMemory = (ids: string[], content: string) =>
  request<PersonalMemory>({ method: 'POST', path: '/memory/personal/merge', body: { ids, content } }, () => db.mergePersonal(ids, content))
/** POST /memory/personal/{id}/share 提交分享到团队（进入待审查） */
export const sharePersonalMemory = (id: string, b: { team: string, title: string, content: string, scope: TeamMemory['scope'] }) =>
  request<ReviewItem>({ method: 'POST', path: `/memory/personal/${id}/share`, body: b }, () => db.sharePersonal(id, b))

/* ---------------- 团队记忆与审查 ---------------- */
/** GET /memory/team 我所在团队的团队记忆 */
export const listTeamMemory = (q: { team?: string, status?: TeamStatus | '' } = {}) =>
  request<{ data: TeamMemory[], teams: string[] }>({ method: 'GET', path: '/memory/team', query: q }, () => db.listTeam(q))
/** POST /memory/team/{id}/revoke 撤回或紧急停用 */
export const revokeTeamMemory = (id: string, reason: string) =>
  request<TeamMemory>({ method: 'POST', path: `/memory/team/${id}/revoke`, body: { reason } }, () => db.revokeTeam(id))
/** POST /memory/team/{id}/feedback 使用反馈：有用 / 有误 */
export const feedbackTeamMemory = (id: string, up: boolean) =>
  request<TeamMemory>({ method: 'POST', path: `/memory/team/${id}/feedback`, body: { up } }, () => db.feedbackTeam(id, up))
/** GET /memory/reviews 待我审查 */
export const listMemoryReviews = () =>
  request<{ data: ReviewItem[] }>({ method: 'GET', path: '/memory/reviews' }, () => db.listReviews())
/** POST /memory/reviews/{id}/decision 通过 / 退回修改 / 拒绝（退回和拒绝必须写原因） */
export const decideMemoryReview = (id: string, decision: ReviewDecision, reason: string) =>
  request<{ ok: boolean, entry: TeamMemory }>({ method: 'POST', path: `/memory/reviews/${id}/decision`, body: { decision, reason } }, () => db.decideReview(id, decision))

/* ---------------- 体检、优化与策略 ---------------- */
/** GET /memory/health 记忆体检：重复、冲突、即将过期、长期未用、可沉淀为 Skill */
export const getMemoryHealth = () =>
  request<MemoryHealth>({ method: 'GET', path: '/memory/health' }, () => db.health())
/** POST /memory/optimize 按建议执行优化（合并、归档、转待我确认、生成 Skill 草稿） */
export const applyMemoryOptimize = (ids: string[]) =>
  request<{ applied: number, health: MemoryHealth }>({ method: 'POST', path: '/memory/optimize', body: { suggestion_ids: ids } }, () => db.optimize(ids))
/** GET /memory/policy 个人记忆策略 */
export const getMemoryPolicy = () =>
  request<{ policy: MemoryPolicy, consumers: Consumer[] }>({ method: 'GET', path: '/memory/policy' }, () => db.getPolicy())
/** PUT /memory/policy 保存个人记忆策略 */
export const saveMemoryPolicy = (policy: MemoryPolicy) =>
  request<{ policy: MemoryPolicy }>({ method: 'PUT', path: '/memory/policy', body: policy }, () => db.savePolicy(policy))

/* ---------------- 专家团队 Leader 记忆 ---------------- */
/** GET /team/{team_id}/leader-memory Leader 记忆：配置、三层记忆概览、团队条目与最近一次复盘 */
export const getLeaderMemory = (teamId: string) =>
  request<LeaderMemory>({ method: 'GET', path: `/team/${teamId}/leader-memory` }, () => db.leader(teamId))
/** PUT /team/{team_id}/leader-memory/config 保存 Leader 记忆配置 */
export const saveLeaderMemoryConfig = (teamId: string, config: LeaderMemoryConfig) =>
  request<LeaderMemory>({ method: 'PUT', path: `/team/${teamId}/leader-memory/config`, body: config }, () => db.saveLeaderConfig(teamId, config))
/** POST /team/{team_id}/leader-memory/evaluate Leader 复盘：按最近的运行评价协作效果并给出优化建议 */
export const evaluateLeaderMemory = (teamId: string, range: '7d' | '30d' | '90d') =>
  request<LeaderEvaluation>({ method: 'POST', path: `/team/${teamId}/leader-memory/evaluate`, body: { range } }, () => db.evaluate(teamId, range))
/** POST /team/{team_id}/leader-memory/proposals/{id} 采纳（提交审查）或忽略 Leader 的建议 */
export const decideLeaderProposal = (teamId: string, proposalId: string, action: 'submit' | 'dismiss') =>
  request<LeaderMemory>({ method: 'POST', path: `/team/${teamId}/leader-memory/proposals/${proposalId}`, body: { action } }, () => db.decideProposal(teamId, proposalId, action))
/** PATCH /team/{team_id}/leader-memory/entries/{id} 编辑或停用团队条目（发布后的修改重新审查） */
export const updateLeaderEntry = (teamId: string, entryId: string, b: { content?: string, status?: TeamStatus }) =>
  request<LeaderMemory>({ method: 'PATCH', path: `/team/${teamId}/leader-memory/entries/${entryId}`, body: b }, () => db.updateLeaderEntry(teamId, entryId, b))
/** PUT /team/{team_id}/leader-skills Leader 使用的技能（启停、版本） */
export const saveLeaderSkills = (teamId: string, skills: LeaderSkill[]) =>
  request<LeaderMemory>({ method: 'PUT', path: `/team/${teamId}/leader-skills`, body: { skills } }, () => db.saveLeaderSkills(teamId, skills))
/** PUT /team/{team_id}/leader-router 团队 Router：分派方式、轮次、人工确认点、交接格式 */
export const saveTeamRouter = (teamId: string, router: TeamRouterConfig) =>
  request<LeaderMemory>({ method: 'PUT', path: `/team/${teamId}/leader-router`, body: router }, () => db.saveTeamRouter(teamId, router))
/** POST /team/{team_id}/leader-memory/distill 由 Leader 提炼多智能体协同经验，生成岗位专家智能体草稿并提交发布审批 */
export const distillExpertAgent = (teamId: string, draft: DistillDraft) =>
  request<{ agent_draft_id: string, approval_id: string }>({ method: 'POST', path: `/team/${teamId}/leader-memory/distill`, body: draft }, () => db.distill(teamId, draft))

/* ---------------- 文案 ---------------- */
export const KIND_LABEL: Record<TeamMemory['kind'], string> = { preference: '偏好', background: '背景', experience: '工作经验', context: '业务上下文', sop: 'SOP', handoff: '交接规则', role: '参与角色', feedback: '协作反馈' }
export const PERSONAL_STATUS: Record<PersonalStatus, [string, 'volt' | 'mint' | 'amber' | 'neutral' | 'rose']> = { candidate: ['候选 · 待确认', 'amber'], active: ['已启用', 'mint'], paused: ['已暂停', 'neutral'], expired: ['已过期', 'rose'] }
export const TEAM_STATUS: Record<TeamStatus, [string, 'volt' | 'mint' | 'amber' | 'neutral' | 'rose']> = { draft: ['草稿', 'neutral'], reviewing: ['待审查', 'amber'], published: ['已发布', 'mint'], returned: ['已退回', 'amber'], rejected: ['已拒绝', 'rose'], expired: ['已过期', 'neutral'], revoked: ['已撤回', 'neutral'] }
export const SOURCE_LABEL: Record<SourceType, string> = { manual: '手动添加', chat: '对话中「记住」', task: '任务中提取', collab: '协作产出', leader: 'Leader 复盘' }
export const LEADER_SOURCE_LABEL: Record<LeaderSource, [string, string]> = {
  run_logs: ['运行记录', '每次运行的分派、结果与耗时'],
  handoffs: ['交接轨迹', '谁把什么交给了谁、是否被退回'],
  human_review: ['人工确认结果', '「待我确认」里的确认、修改与退回'],
  member_feedback: ['成员反馈', '成员助手与 Agent 对协作的评价'],
  agent_memory_digest: ['专家 Agent 记忆摘要', '只读各 Agent 已发布记忆的摘要，不读私人记忆'],
}
