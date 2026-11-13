/*
  Agent Teams 接口层（控制台前缀 /console/api）。
  路径、字段与原 RaccoonX team_hub / channel_hub 后端一致；mock 见 ./mock/teams.ts。
  所有修改类接口都带 revision，版本不一致时后端返回 409「团队已被更新，请刷新后再操作」。
  时间字段均为 Unix 秒。
*/
import { request } from './http'
import * as db from './mock/teams'

/* ---------------- 类型 ---------------- */
/** 当前工作空间内已发布的 Agent（来自 Agents 模块，可作为团长或参与的 Agent） */
export type Agent = { id: string, name: string, description: string, snapshot_id: string, version: number }
/** 参与的 Agent。responsibility = 页面上的「负责什么」；input_hint = 「输入说明」（选填） */
export type Member = { agent_id: string, responsibility: string, input_hint: string }
export type TeamAvatarValue = { type: 'emoji' | 'image', icon: string, background?: string }
export type Config = {
  avatar?: TeamAvatarValue | null
  name: string
  description?: string
  /** 团队任务；「分工方式」以 DIVISION_MARKER 拼接在 goal 末尾 */
  goal: string
  /** 团长 Agent */
  leader_id: string
  /** 参与的 Agent（1–MAX_MEMBERS 个） */
  members: Member[]
  output: string
  parallelism: number
  max_calls: number
  max_rounds: number
  timeout: number
}
export type Version = { id: string, version: number, revision: number, created_at: number }
export type Team = {
  id: string
  name: string
  revision: number
  config: Config
  published_id: string | null
  published_version?: number
  versions?: Version[]
  updated_at: number
  created_at: number
  created_by: string
}

export type RunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'interrupted' | 'cancelled'
export type RunSource = 'console' | 'api' | 'channel' | 'preview' | 'other'
export type RunSummary = {
  id: string
  snapshot_id: string
  source: RunSource | string
  query: string
  state: RunState
  error_code: string
  created_at: number
  started_at: number | null
  finished_at: number | null
  expert_calls: number
  published_version: number | null
}
export type RunStep = {
  id: string
  kind: 'director' | 'expert'
  agent_id: string
  snapshot_id: string
  round: number
  task: string
  state: RunState
  result: string
  error_code: string
  started_at: number
  finished_at: number | null
}
export type RunDetail = Omit<RunSummary, 'expert_calls' | 'published_version'> & {
  answer: string
  cancelled: boolean
  config: { agents: Record<string, { name: string }> }
  steps: RunStep[]
  /** 对话接口里返回的步骤数（steps 为空时用） */
  step_count?: number
  conversation_id?: string
}
export type Metrics = {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  timed_out: number
  interrupted: number
  cancelled: number
  model_calls: number
  expert_calls: number
  recorded_calls: number
  total_tokens: number | null
  /** 0–100 */
  success_rate: number | null
  /** 秒 */
  avg_latency: number | null
  avg_queue: number | null
}
export type Statistics = { summary: Metrics, daily: (Metrics & { date: string })[], timezone: string }
export type TeamKey = { id: string, label: string, suffix: string, created_at: number }

export type ChannelKind = 'wecom' | 'feishu' | 'dingtalk'
export type Channel = {
  id: string
  agent_id: string
  kind: ChannelKind
  name: string
  enabled: boolean
  revision: number
  /** connecting / online / offline / stopped / error / unbound */
  status: string
  status_label: string
  error: string
  account_id: string
  created_at: number
  updated_at: number
}
export type ChannelEvent = { id: string, state: string, error_code: string, duration: number, created_at: number, description: string, sender_id: string, chat_id: string }

export type RunsQuery = {
  period: 'last7days' | 'last30days' | 'allTime'
  source?: string
  state?: string
  keyword?: string
  page: number
  limit: number
  sort_by: 'created_at' | 'finished_at'
  sort_order: 'asc' | 'desc'
}

/* ---------------- 常量与工具 ---------------- */
export const DIVISION_MARKER = '\n\n【分工方式】\n'
export const splitGoal = (goal: string): [string, string] => {
  const i = goal.indexOf(DIVISION_MARKER)
  return i < 0 ? [goal, ''] : [goal.slice(0, i), goal.slice(i + DIVISION_MARKER.length)]
}
export const joinGoal = (task: string, division: string) => (division ? `${task}${DIVISION_MARKER}${division}` : task)
export const LIMITS = {
  parallelism: { min: 1, max: 3, label: '最多同时调用 Agent', unit: '位' },
  max_calls: { min: 1, max: 12, label: '单次任务最多调用 Agent', unit: '次' },
  max_rounds: { min: 1, max: 4, label: '最多协作轮数', unit: '轮' },
  timeout: { min: 30, max: 300, label: '单次任务时间上限', unit: '秒' },
} as const
export const MAX_MEMBERS = 8
export const blankConfig = (): Config => ({ name: '', description: '', goal: '', leader_id: '', members: [], output: '', parallelism: 2, max_calls: 4, max_rounds: 2, timeout: 120 })

export const runStates: Record<RunState, string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  timed_out: '超时',
  interrupted: '执行中断',
  cancelled: '已取消',
}
export const runSources: { value: string, name: string }[] = [
  { value: 'console', name: 'Web 运行' },
  { value: 'api', name: '后端服务 API' },
  { value: 'channel', name: '消息渠道' },
  { value: 'preview', name: '草稿预览' },
  { value: 'other', name: '其他' },
]
export const sourceName = (s: string) => runSources.find(x => x.value === s)?.name ?? '其他'
export const runReasons: Record<string, string> = {
  director_failed: '团长调用失败，请检查其模型配置。',
  invalid_plan: '团长未返回有效分工格式，请检查任务后重新发起。',
  unknown_expert: '团长选择了团队以外的 Agent，系统已阻止调用。',
  no_expert_called: '团长没有调用任何参与的 Agent，请补充团队任务和各 Agent 负责什么。',
  context_limit: 'Agent 返回内容过长，请缩小任务范围。',
  runtime_error: '执行失败，请在日志里查看各 Agent 的执行记录。',
  worker_restarted: '执行服务重启，任务已停止，未自动重复调用。',
  queue_expired: '排队超过 5 分钟，请稍后重新发起。',
  timed_out: '超过团队设定的时间上限。',
  cancelled: '任务已取消。',
}
export const isActiveRun = (state: string) => state === 'queued' || state === 'running'
export const runDuration = (r: { created_at: number, finished_at: number | null }) =>
  `${Math.max(0, (r.finished_at ?? Date.now() / 1000) - r.created_at).toFixed(1)} 秒`
export const runVersion = (r: { snapshot_id: string, published_version?: number | null }) =>
  r.snapshot_id.startsWith('draft:') ? `草稿 ${r.snapshot_id.slice(6)}` : r.published_version ? `已发布 v${r.published_version}` : '已发布版本'
export const CONFLICT_MESSAGE = '团队已被更新，请刷新后再操作'
export const channelKinds: Record<ChannelKind, string> = { wecom: '企业微信', feishu: '飞书', dingtalk: '钉钉' }

const B = '/agent-teams'

/* ---------------- 团队 ---------------- */
/** GET /agent-teams 团队列表 + 可选 Agent（已发布名册）+ 工作空间 ID */
export const listTeams = () =>
  request<{ teams: Team[], agents: Agent[], workspace_id: string }>({ method: 'GET', path: B }, () => db.listing())

/** POST /agent-teams 新建团队（请求体为 Config），返回 Team（201） */
export const createTeam = (config: Config) =>
  request<Team>({ method: 'POST', path: B, body: config }, () => db.create(config))

/** GET /agent-teams/{id} 团队详情（含 versions）+ 可选 Agent */
export const getTeam = (id: string) =>
  request<{ team: Team, agents: Agent[] }>({ method: 'GET', path: `${B}/${id}` }, () => db.detail(id))

/** POST /agent-teams/{id} 保存草稿（完整 Config + revision） */
export const saveTeam = (id: string, config: Config, revision: number) =>
  request<Team>({ method: 'POST', path: `${B}/${id}`, body: { ...config, revision } }, () => db.save(id, config, revision))

/** POST /agent-teams/{id}/publish 发布：固定团队配置和成员版本 */
export const publishTeam = (id: string, revision: number) =>
  request<{ snapshot_id: string, version: number, revision: number }>({ method: 'POST', path: `${B}/${id}/publish`, body: { revision } }, () => db.publish(id, revision))

/** POST /agent-teams/{id}/info 修改名称、简介、头像 */
export const updateTeamInfo = (id: string, body: { revision: number, name: string, description: string, avatar?: TeamAvatarValue | null }) =>
  request<Team>({ method: 'POST', path: `${B}/${id}/info`, body }, () => db.info(id, body))

/** POST /agent-teams/{id}/copy 复制团队（只复制可编辑配置，不含 Key、渠道、运行记录和发布版本） */
export const copyTeam = (id: string, body: { revision: number, name: string, description: string }) =>
  request<Team>({ method: 'POST', path: `${B}/${id}/copy`, body }, () => db.copy(id, body))

/** POST /agent-teams/{id}/delete 删除团队；有排队/运行中任务时 409 */
export const deleteTeam = (id: string, revision: number) =>
  request<{ ok: true }>({ method: 'POST', path: `${B}/${id}/delete`, body: { revision } }, () => db.remove(id, revision))

/** GET /agent-teams/{id}/export 导出团队 DSL（YAML） */
export const exportTeam = (id: string) =>
  request<{ name: string, revision: number, data: string }>({ method: 'GET', path: `${B}/${id}/export` }, () => db.exportDsl(id))

/* ---------------- 运行 ---------------- */
export type CreateRunBody = { query: string, preview: boolean, request_id: string, conversation: true, conversation_id?: string, snapshot_id?: string }

/** POST /agent-teams/{id}/runs 提交任务（202）；preview=true 使用已保存草稿 */
export const createRun = (id: string, body: CreateRunBody) =>
  request<{ id: string, state: RunState, snapshot_id: string, conversation_id: string }>({ method: 'POST', path: `${B}/${id}/runs`, body }, () => db.createRun(id, body))

/** GET /agent-teams/{id}/conversations?preview= 我的最近对话（每个对话的首轮） */
export const listConversations = (id: string, preview: boolean) =>
  request<{ runs: RunDetail[] }>({ method: 'GET', path: `${B}/${id}/conversations`, query: { preview } }, () => db.conversations(id, preview))

/** GET /agent-teams/{id}/conversations/{cid}?preview= 对话内全部轮次（steps 为空，带 step_count） */
export const getConversation = (id: string, cid: string, preview: boolean) =>
  request<{ runs: RunDetail[] }>({ method: 'GET', path: `${B}/${id}/conversations/${cid}`, query: { preview } }, () => db.conversation(id, cid, preview))

/** GET /agent-teams/{id}/runs 运行日志（分页、筛选、排序） */
export const listRuns = (id: string, q: RunsQuery) =>
  request<{ runs: RunSummary[], total: number, page: number, limit: number }>({ method: 'GET', path: `${B}/${id}/runs`, query: q }, () => db.listRuns(id, q))

/** GET /agent-teams/{id}/runs/{runId} 任务详情（含执行步骤） */
export const getRun = (id: string, runId: string) =>
  request<RunDetail>({ method: 'GET', path: `${B}/${id}/runs/${runId}` }, () => db.getRun(id, runId))

/** POST /agent-teams/{id}/runs/{runId}/cancel 停止任务 */
export const cancelRun = (id: string, runId: string) =>
  request<{ ok: true }>({ method: 'POST', path: `${B}/${id}/runs/${runId}/cancel`, body: {} }, () => db.cancelRun(id, runId))

/** GET /agent-teams/{id}/statistics 监控统计（start/end 为 YYYY-MM-DD，跨度 ≤ 30 天） */
export const getStatistics = (id: string, q: { start: string, end: string, timezone: string, source: string }) =>
  request<Statistics>({ method: 'GET', path: `${B}/${id}/statistics`, query: q }, () => db.statistics(id, q))

/* ---------------- API Key ---------------- */
/** GET /agent-teams/{id}/keys 团队 API Key 列表（只返回尾号） */
export const listKeys = (id: string) =>
  request<{ keys: TeamKey[] }>({ method: 'GET', path: `${B}/${id}/keys` }, () => db.keys(id))

/** POST /agent-teams/{id}/keys 创建 Key；完整 token 只返回这一次 */
export const createKey = (id: string, label: string) =>
  request<{ id: string, token: string }>({ method: 'POST', path: `${B}/${id}/keys`, body: { label } }, () => db.createKey(id, label))

/** DELETE /agent-teams/{id}/keys/{keyId} 撤销 Key */
export const revokeKey = (id: string, keyId: string) =>
  request<{ ok: true }>({ method: 'DELETE', path: `${B}/${id}/keys/${keyId}` }, () => db.revokeKey(id, keyId))

/* ---------------- 消息渠道 ---------------- */
const C = '/message-channels/teams'

/** GET /message-channels/teams/{id} 团队绑定的消息渠道 */
export const listChannels = (id: string) =>
  request<{ channels: Channel[] }>({ method: 'GET', path: `${C}/${id}` }, () => db.channels(id))

/** POST /message-channels/teams/{id} 新建渠道 {kind} */
export const createChannel = (id: string, kind: ChannelKind) =>
  request<{ channel: Channel }>({ method: 'POST', path: `${C}/${id}`, body: { kind } }, () => db.createChannel(id, kind))

/** POST /message-channels/teams/{id}/{cid}/enabled 启用 / 暂停渠道 */
export const setChannelEnabled = (id: string, cid: string, revision: number, enabled: boolean) =>
  request<{ channel: Channel }>({ method: 'POST', path: `${C}/${id}/${cid}/enabled`, body: { revision, enabled } }, () => db.channelEnabled(id, cid, revision, enabled))

/** GET /message-channels/teams/{id}/{cid}/events 最近 30 条渠道事件 */
export const channelEvents = (id: string, cid: string) =>
  request<{ events: ChannelEvent[] }>({ method: 'GET', path: `${C}/${id}/${cid}/events` }, () => db.channelEvents(id, cid))

/** DELETE /message-channels/teams/{id}/{cid} 删除渠道（需先暂停） */
export const deleteChannel = (id: string, cid: string, revision: number) =>
  request<{ ok: true }>({ method: 'DELETE', path: `${C}/${id}/${cid}`, body: { revision } }, () => db.deleteChannel(id, cid, revision))

/** POST /message-channels/teams/{id}/{cid}/qr 生成扫码授权二维码 */
export const startChannelQr = (id: string, cid: string) =>
  request<{ ticket: string, svg: string, expires_in: number }>({ method: 'POST', path: `${C}/${id}/${cid}/qr` }, () => db.qrStart(id, cid))

/** POST /message-channels/teams/{id}/{cid}/qr/poll 轮询扫码状态 wait / scaned / confirmed / expired */
export const pollChannelQr = (id: string, cid: string, ticket: string, verify_code = '') =>
  request<{ status: 'wait' | 'scaned' | 'confirmed' | 'expired' }>({ method: 'POST', path: `${C}/${id}/${cid}/qr/poll`, body: { ticket, verify_code } }, () => db.qrPoll(id, cid, ticket))
