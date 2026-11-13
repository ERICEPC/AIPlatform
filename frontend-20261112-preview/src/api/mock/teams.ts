/*
  Agent Teams 的有状态内存 mock。
  - 团队 / 版本 / Key / 渠道：增删改即时可见，修改类操作校验 revision（不一致 409）。
  - 运行引擎：创建任务时生成一份「执行计划」（每一步的开始/结束时间），读取时按当前时间推进：
    排队 → 团长规划第 1 轮 → 专家按并行数分批执行 → 第 2 轮复核 → 团长汇总 → 已完成（Markdown 答复）。
    轮询 GET runs/{id} 就能看到步骤逐个出现、状态逐个变化。停止任务会在约 0.8 秒后进入「已取消」。
*/
import type { Agent, ChannelKind, Config, CreateRunBody, Metrics, RunDetail, RunsQuery, RunState, RunSummary, Team, TeamAvatarValue, Version } from '../teams'
import { teams as seedTeams } from '@/mock'
import { ApiError } from '../http'
import { db as agentsDb } from './agents'

const now = () => Date.now() / 1000
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
const conflict = (msg = '团队已被更新，请刷新后再操作') => new ApiError(msg, 409)
const bad = (msg: string) => new ApiError(msg, 400)
const missing = (msg = '团队不存在或已删除') => new ApiError(msg, 404)
// 固定种子，保证示例历史记录每次刷新一致
let seed = 20261105
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = <T>(list: readonly T[], r = Math.random) => list[Math.floor(r() * list.length)]

/* ---------------- 名册 Agent ----------------
  可加入团队的 Agent = 当前工作空间里已发布（至少有一个版本）的 Agent。
  除团队种子里的示例成员外，直接读取 Agents 模块 mock（只读），这样在 Agents 里发布的 Agent 会出现在团队的「添加 Agent」里。
*/
const rosterSeed: [string, string, string][] = [
  ['ag-presales-lead', '售前协调者', '拆分售前任务、检查各 Agent 的意见并汇总成方案包'],
  ['ag-cs-lead', '升级协调者', '判断升级问题的处理路径，安排诊断、检索和通知'],
  ['ag-weekly-lead', '周报协调者', '安排记录收集与汇总，统稿团队周报'],
  ...seedTeams.flatMap(t => t.members.map(m => [`ag-${m.id}`, m.name, m.role] as [string, string, string])),
]
const seedRoster: Agent[] = rosterSeed.map(([id, name, description], i) => ({ id, name, description, snapshot_id: `snap-${id}-${(i % 3) + 1}`, version: (i % 3) + 1 }))
function moduleAgents(): Agent[] {
  return agentsDb.list({ page: 1, limit: 200 }).data.flatMap((a) => {
    const v = agentsDb.versions(a.id).data[0]
    return v ? [{ id: a.id, name: a.name, description: a.description || a.role || '', snapshot_id: v.id, version: v.version }] : []
  })
}
const roster = (): Agent[] => [...moduleAgents(), ...seedRoster]
const agentById = (id: string) => roster().find(a => a.id === id)
const outputs: Record<string, string> = Object.fromEntries(seedTeams.flatMap(t => t.members.map(m => [`ag-${m.id}`, m.output])))

/* ---------------- 团队 ---------------- */
type TeamRec = Omit<Team, 'versions' | 'published_version'> & { deleted?: boolean }
type VersionRec = Version & { team_id: string, config: Config }
const DAY = 86400
const t0 = now()
const leaders: Record<string, string> = { 'presales': 'ag-presales-lead', 'cs-escalation': 'ag-cs-lead', 'weekly': 'ag-weekly-lead' }
const avatars: Record<string, string> = { 'presales': '028-planning', 'cs-escalation': '006-support', 'weekly': '035-project' }
const goals: Record<string, [string, string, string]> = {
  'presales': ['根据客户提供的需求材料，输出一份可直接给客户的售前方案包：需求清单、技术方案要点、报价和合规风险。', '需求分析先整理需求；方案撰写和报价测算基于需求清单并行；合规检查最后审阅方案和报价。', '按「需求清单 / 方案要点 / 报价 / 风险与待确认」四段输出，不确定内容标记为待确认。'],
  'cs-escalation': ['处理一线客服升级上来的问题：判断问题类型和紧急程度，查历史工单，给出处理建议并通知值班同事。', '问题诊断和工单检索可以并行；诊断为高紧急度时再安排值班通知。', '输出：问题判断、相关历史、处理建议、已通知人员。'],
  'weekly': ['每周五汇总各成员助手的工作记录，按项目整理进展、风险和下周计划，生成团队周报草稿。', '记录收集 → 进展汇总 → 周报撰写，按顺序接力。', '三段式：本周进展、风险与求助、下周计划。每个项目一段，不超过 5 行。'],
}
const teamsDb: TeamRec[] = seedTeams.map((t, i) => {
  const [goal, division, output] = goals[t.id]
  const config: Config = {
    avatar: { type: 'emoji', icon: avatars[t.id] },
    name: t.name,
    description: t.desc,
    goal: `${goal}\n\n【分工方式】\n${division}`,
    leader_id: leaders[t.id],
    members: t.members.map(m => ({ agent_id: `ag-${m.id}`, responsibility: m.role, input_hint: '' })),
    output,
    parallelism: 2,
    max_calls: Math.max(4, t.members.length + 1),
    max_rounds: 2,
    timeout: 120,
  }
  return { id: t.id, name: t.name, revision: 3 + i, config, published_id: null, updated_at: t0 - DAY * (i * 2 + 0.2), created_at: t0 - DAY * (40 - i * 6), created_by: t.id === 'weekly' ? 'yy' : 'lpc' }
})
const versionsDb: VersionRec[] = []
function seedVersion(teamId: string, version: number, ago: number) {
  const t = teamsDb.find(x => x.id === teamId)!
  const v: VersionRec = { id: uid('tsnap'), team_id: teamId, version, revision: t.revision - 1, created_at: t0 - ago, config: structuredClone(t.config) }
  versionsDb.push(v)
  t.published_id = v.id
}
seedVersion('presales', 1, DAY * 20)
seedVersion('presales', 2, DAY * 3)
seedVersion('cs-escalation', 1, DAY * 9)
// 客服升级处理：已发布后又改了草稿
teamsDb[1].config.output += '\n处理建议要写明预计时效。'
teamsDb[1].revision += 1

function find(id: string) {
  const t = teamsDb.find(x => x.id === id && !x.deleted)
  if (!t)
    throw missing()
  return t
}
function view(t: TeamRec, withVersions = false): Team {
  const vs = versionsDb.filter(v => v.team_id === t.id).sort((a, b) => b.version - a.version)
  const { deleted: _d, ...rest } = t
  return {
    ...rest,
    published_version: vs.find(v => v.id === t.published_id)?.version,
    ...(withVersions ? { versions: vs.map(({ id, version, revision, created_at }) => ({ id, version, revision, created_at })) } : {}),
  }
}
function checkRevision(t: TeamRec, revision: unknown) {
  if (revision !== t.revision)
    throw conflict()
}
function validate(c: Config) {
  if (!c.name?.trim() || c.name.length > 80)
    throw bad('团队名称必填，最多 80 个字')
  if (!c.goal?.trim() || c.goal.length > 6000)
    throw bad('请填写团队任务（最多 6000 字）')
  if (!c.members?.length || c.members.length > 8)
    throw bad('参与的 Agent 需要 1–8 个')
  for (const id of [c.leader_id, ...c.members.map(m => m.agent_id)]) {
    if (!agentById(id))
      throw bad('团长和参与的 Agent 都必须是当前工作空间内已发布的 Agent，请刷新后重新选择')
  }
  if (c.members.some(m => !m.responsibility?.trim()))
    throw bad('请为每个参与的 Agent 写明负责什么')
}

export const listing = () => ({ teams: teamsDb.filter(t => !t.deleted).sort((a, b) => b.updated_at - a.updated_at).map(t => view(t)), agents: roster(), workspace_id: 'ws-raccoon-fde' })
export const detail = (id: string) => ({ team: view(find(id), true), agents: roster() })
export function create(c: Config) {
  validate(c)
  const t: TeamRec = { id: uid('team'), name: c.name.trim(), revision: 1, config: structuredClone(c), published_id: null, updated_at: now(), created_at: now(), created_by: 'lpc' }
  teamsDb.push(t)
  return view(t)
}
export function save(id: string, c: Config, revision: number) {
  const t = find(id)
  checkRevision(t, revision)
  validate(c)
  Object.assign(t, { name: c.name.trim(), config: structuredClone(c), revision: t.revision + 1, updated_at: now() })
  return view(t)
}
export function publish(id: string, revision: number) {
  const t = find(id)
  checkRevision(t, revision)
  validate(t.config)
  const version = Math.max(0, ...versionsDb.filter(v => v.team_id === id).map(v => v.version)) + 1
  const v: VersionRec = { id: uid('tsnap'), team_id: id, version, revision: t.revision, created_at: now(), config: structuredClone(t.config) }
  versionsDb.push(v)
  Object.assign(t, { published_id: v.id, revision: t.revision + 1, updated_at: now() })
  return { snapshot_id: v.id, version, revision: t.revision }
}
export function info(id: string, b: { revision: number, name: string, description: string, avatar?: TeamAvatarValue | null }) {
  const t = find(id)
  checkRevision(t, b.revision)
  if (!b.name?.trim() || b.name.length > 80)
    throw bad('团队名称必填，最多 80 个字')
  t.config = { ...t.config, name: b.name.trim(), description: b.description ?? '', ...('avatar' in b ? { avatar: b.avatar } : {}) }
  Object.assign(t, { name: b.name.trim(), revision: t.revision + 1, updated_at: now() })
  return view(t)
}
export function copy(id: string, b: { revision: number, name: string, description: string }) {
  const t = find(id)
  checkRevision(t, b.revision)
  const name = (b.name || `${t.name.slice(0, 75)} 副本`).trim()
  const c: TeamRec = { id: uid('team'), name, revision: 1, config: { ...structuredClone(t.config), name, description: b.description }, published_id: null, updated_at: now(), created_at: now(), created_by: 'lpc' }
  teamsDb.push(c)
  return view(c)
}
export function remove(id: string, revision: number) {
  const t = find(id)
  checkRevision(t, revision)
  if (runsDb.some(r => r.team_id === id && ['queued', 'running'].includes(materialize(r).state)))
    throw conflict('团队仍有排队或运行中的任务，请先在运行日志中取消并等待任务结束，再删除')
  channelsDb.filter(c => c.agent_id === id).forEach(c => Object.assign(c, { enabled: false, status: 'stopped', revision: c.revision + 1 }))
  keysDb[id] = []
  Object.assign(t, { deleted: true, revision: t.revision + 1 })
  return { ok: true as const }
}
function toYaml(v: unknown, ind = ''): string {
  if (Array.isArray(v))
    return v.length ? v.map(x => `\n${ind}- ${toYaml(x, `${ind}  `).trimStart()}`).join('') : ' []'
  if (v && typeof v === 'object')
    return Object.entries(v).map(([k, x]) => `\n${ind}${k}:${typeof x === 'object' && x ? toYaml(x, `${ind}  `) : ` ${toYaml(x, ind)}`}`).join('')
  if (typeof v === 'string')
    return v.includes('\n') ? `|-\n${v.split('\n').map(l => `${ind}  ${l}`).join('\n')}` : JSON.stringify(v)
  return String(v ?? 'null')
}
export function exportDsl(id: string) {
  const t = find(id)
  const c = t.config
  const doc = { kind: 'agent-team', version: '1.0.0', team: c, dependencies: { agent_ids: [...new Set([c.leader_id, ...c.members.map(m => m.agent_id)])] } }
  return { name: t.name, revision: t.revision, data: `${toYaml(doc).trimStart()}\n` }
}

/* ---------------- 运行引擎 ---------------- */
type Spec = { id: string, kind: 'director' | 'expert', agent_id: string, snapshot_id: string, round: number, task: string, result: string, start: number, end: number, fail?: string }
type RunRec = {
  id: string, team_id: string, snapshot_id: string, source: string, query: string, created_at: number, started_at: number, end_at: number
  final: RunState, error_code: string, answer: string, specs: Spec[], cancel_at?: number, conversation_id: string, mine: boolean
  request_id?: string, published_version: number | null, agents: Record<string, { name: string }>, tokens: number
}
const runsDb: RunRec[] = []

function plan(c: Config, query: string, start: number, r: () => number, scale = 1, outcome: { final: RunState, error_code: string } = { final: 'succeeded', error_code: '' }) {
  const name = (id: string) => agentById(id)?.name ?? id
  const specs: Spec[] = []
  const sid = (id: string) => agentById(id)?.snapshot_id ?? ''
  let t = start + (0.8 + r() * 1.2) * scale
  const started = t
  const dir = (round: number, task: string, result: string, dur: number) => {
    specs.push({ id: uid('step'), kind: 'director', agent_id: c.leader_id, snapshot_id: sid(c.leader_id), round, task, result, start: t, end: t + dur * scale })
    t += dur * scale
  }
  const experts = (round: number, list: Config['members']) => {
    for (let i = 0; i < list.length; i += c.parallelism) {
      let batchEnd = t
      for (const m of list.slice(i, i + c.parallelism)) {
        const end = t + (2.2 + r() * 1.8) * scale
        batchEnd = Math.max(batchEnd, end)
        specs.push({ id: uid('step'), kind: 'expert', agent_id: m.agent_id, snapshot_id: sid(m.agent_id), round, task: `${m.responsibility}\n\n用户任务：${query}${m.input_hint ? `\n输入要求：${m.input_hint}` : ''}`, result: `${outputs[m.agent_id] ?? `已按职责完成分派的子任务`}。依据：任务原文与团队知识库相关资料。`, start: t + 0.1 * scale, end })
      }
      t = batchEnd
    }
  }
  const first = c.members.slice(0, Math.min(c.members.length, c.max_calls))
  dir(1, `团队任务：${splitGoal0(c.goal)}\n用户输入：${query}`, `分工决定：第 1 轮安排 ${first.map(m => name(m.agent_id)).join('、')}，独立任务并行执行（最多 ${c.parallelism} 位同时）。`, 2.4)
  experts(1, first)
  let round = 1
  const left = c.max_calls - first.length
  if (c.max_rounds >= 2 && left > 0 && c.members.length > 1) {
    round = 2
    const again = [{ ...c.members[0], responsibility: `复核：结合其他成员结论补充遗漏，并标出相互矛盾的地方。（原职责：${c.members[0].responsibility}）` }]
    dir(2, '检查第 1 轮成员结果是否完整、是否存在冲突。', `第 1 轮结果基本完整，安排「${name(again[0].agent_id)}」复核补充。`, 1.8)
    experts(2, again)
  }
  if (outcome.final === 'succeeded')
    dir(round, '合并各成员结果，按「最终答案要求」整理答复。', '已汇总全部成员意见，生成最终答复。', 2.6)
  else if (outcome.final === 'failed' && specs.length)
    specs[specs.length - 1].fail = outcome.error_code
  const end = outcome.final === 'timed_out' ? start + c.timeout : t + 0.2 * scale
  const answer = outcome.final === 'succeeded' ? answerFor(c, query) : ''
  return { specs, started, end, answer }
}
const splitGoal0 = (g: string) => g.split('\n\n【分工方式】\n')[0]
function answerFor(c: Config, query: string) {
  const lines = c.members.map(m => `- **${agentById(m.agent_id)?.name ?? m.agent_id}**：${outputs[m.agent_id] ?? '已完成分派的子任务'}`)
  return `## 结论\n针对「${query.slice(0, 40)}」，团队已完成分析。整体可推进，有 1 项需要人工确认。\n\n## 各成员意见\n${lines.join('\n')}\n\n## 待确认\n1. 客户是否接受私有化部署周期（约 6 周）\n2. 报价中的运维服务年限\n\n## 下一步\n- 由负责人核对后发出\n- 待确认项在下次沟通时补齐`
}

function materialize(r: RunRec, at = now()): RunDetail & { expert_calls: number } {
  const stop = r.cancel_at !== undefined && r.cancel_at < r.end_at ? r.cancel_at + 0.8 : undefined
  const finish = stop ?? r.end_at
  const final: RunState = stop !== undefined ? 'cancelled' : r.final
  const done = at >= finish
  const steps = r.specs.filter(s => s.start <= Math.min(at, stop ?? Infinity)).map((s) => {
    const cut = stop !== undefined && s.end > stop
    const ended = cut ? at >= stop! : at >= s.end
    const state: RunState = !ended ? 'running' : cut ? 'cancelled' : s.fail ? 'failed' : 'succeeded'
    return {
      id: s.id, kind: s.kind, agent_id: s.agent_id, snapshot_id: s.snapshot_id, round: s.round, task: s.task,
      state, result: state === 'succeeded' ? s.result : '', error_code: state === 'failed' ? s.fail! : state === 'cancelled' ? 'cancelled' : '',
      started_at: s.start, finished_at: ended ? (cut ? stop! : s.end) : null,
    }
  })
  const state: RunState = done ? final : at < r.started_at ? 'queued' : 'running'
  return {
    id: r.id, snapshot_id: r.snapshot_id, source: r.source, query: r.query, state, error_code: done ? (final === 'cancelled' ? 'cancelled' : r.error_code) : '',
    created_at: r.created_at, started_at: at >= r.started_at ? r.started_at : null, finished_at: done ? finish : null,
    answer: done && final === 'succeeded' ? r.answer : '', cancelled: r.cancel_at !== undefined, config: { agents: r.agents }, steps,
    conversation_id: r.conversation_id, expert_calls: steps.filter(s => s.kind === 'expert').length,
  }
}
const summary = (r: RunRec): RunSummary => {
  const m = materialize(r)
  return { id: m.id, snapshot_id: m.snapshot_id, source: m.source, query: m.query, state: m.state, error_code: m.error_code, created_at: m.created_at, started_at: m.started_at, finished_at: m.finished_at, expert_calls: m.expert_calls, published_version: r.published_version }
}
const agentsOf = (c: Config) => Object.fromEntries([c.leader_id, ...c.members.map(m => m.agent_id)].map(id => [id, { name: agentById(id)?.name ?? id }]))

// 示例历史：每个团队过去 30 天的任务
const queries: Record<string, string[]> = {
  'presales': ['华东某银行智能客服私有化需求，请出一版方案包', '某省政务热线知识库项目，客户关心数据不出域', '制造业客户设备巡检助手，预算 80 万以内', '帮我把上次方案改成 SaaS 部署的报价', '保险公司理赔助手，要求 3 个月上线'],
  'cs-escalation': ['用户反馈翼飞 X3 充电后仍无法开机，已重启无效', '工单 #20931 超过 48 小时未处理，客户投诉', '批量用户反映 App 登录验证码收不到', '翼飞 Pro 屏幕闪烁，用户要求换新'],
  'weekly': ['汇总本周 FDE 团队周报', '只汇总华东区项目进展'],
}
const outcomes: [RunState, string, number][] = [['succeeded', '', 0.8], ['failed', 'runtime_error', 0.06], ['timed_out', 'timed_out', 0.04], ['cancelled', 'cancelled', 0.05], ['interrupted', 'worker_restarted', 0.05]]
for (const t of teamsDb) {
  const versions = versionsDb.filter(v => v.team_id === t.id)
  const count = t.id === 'cs-escalation' ? 46 : t.id === 'presales' ? 34 : 12
  for (let i = 0; i < count; i++) {
    const created = t0 - rand() * DAY * 29 - 600
    let x = rand()
    const [final, error_code] = outcomes.find(o => (x -= o[2]) <= 0) ?? outcomes[0]
    const v = versions.filter(v => v.created_at < created).at(-1)
    const source = v ? pick(['console', 'console', 'api', 'api', 'channel', 'preview'] as const, rand) : 'preview'
    const c = source !== 'preview' && v ? v.config : t.config
    const q = pick(queries[t.id], rand)
    const p = plan(c, q, created, rand, 4, { final: final === 'cancelled' ? 'succeeded' : final, error_code })
    const rec: RunRec = {
      id: uid('run'), team_id: t.id, snapshot_id: source === 'preview' || !v ? `draft:${t.revision - 1}` : v.id, source, query: q, created_at: created, started_at: p.started,
      end_at: p.end, final: final === 'cancelled' ? 'succeeded' : final, error_code, answer: p.answer || answerFor(c, q), specs: p.specs, conversation_id: '', mine: source === 'console' || source === 'preview',
      published_version: source === 'preview' || !v ? null : v.version, agents: agentsOf(c), tokens: Math.round(3000 + rand() * 9000),
    }
    if (final === 'cancelled')
      rec.cancel_at = p.started + (p.end - p.started) * 0.5
    rec.conversation_id = rec.id
    runsDb.push(rec)
  }
}

export function createRun(teamId: string, b: CreateRunBody) {
  const t = find(teamId)
  if (!b.query?.trim() || b.query.length > 32000)
    throw bad('请输入任务内容（最多 32000 字）')
  const prev = runsDb.find(r => r.team_id === teamId && r.request_id === b.request_id)
  if (prev)
    return { id: prev.id, state: materialize(prev).state, snapshot_id: prev.snapshot_id, conversation_id: prev.conversation_id }
  let config: Config
  let snapshot: string
  let version: number | null = null
  const head = b.conversation_id ? runsDb.find(r => r.id === b.conversation_id && r.team_id === teamId) : undefined
  if (b.conversation_id && !head)
    throw missing('对话不存在')
  if (head) {
    if (runsDb.some(r => r.conversation_id === head.id && ['queued', 'running'].includes(materialize(r).state)))
      throw conflict('上一轮任务尚未结束，请等待完成或停止后再发送')
    snapshot = head.snapshot_id
    version = head.published_version
    config = versionsDb.find(v => v.id === snapshot)?.config ?? t.config
  }
  else if (b.preview) {
    validate(t.config)
    config = t.config
    snapshot = `draft:${t.revision}`
  }
  else {
    const v = versionsDb.find(v => v.id === (b.snapshot_id || t.published_id))
    if (!v)
      throw bad('团队尚未发布，请先发布后再运行')
    config = v.config
    snapshot = v.id
    version = v.version
  }
  const created = now()
  const p = plan(config, b.query.trim(), created, Math.random)
  const rec: RunRec = {
    id: uid('run'), team_id: teamId, snapshot_id: snapshot, source: b.preview ? 'preview' : 'console', query: b.query.trim(), created_at: created, started_at: p.started, end_at: p.end,
    final: 'succeeded', error_code: '', answer: p.answer, specs: p.specs, conversation_id: '', mine: true, request_id: b.request_id, published_version: version,
    agents: agentsOf(config), tokens: Math.round(2000 + Math.random() * 6000),
  }
  rec.conversation_id = head?.id ?? rec.id
  runsDb.push(rec)
  return { id: rec.id, state: 'queued' as RunState, snapshot_id: snapshot, conversation_id: rec.conversation_id }
}
const mineOf = (teamId: string, preview: boolean) => runsDb.filter(r => r.team_id === teamId && r.mine && (r.source === 'preview') === preview)
export function conversations(teamId: string, preview: boolean) {
  find(teamId)
  const list = mineOf(teamId, preview)
  return {
    runs: list.filter(r => r.id === r.conversation_id).sort((a, b) => b.created_at - a.created_at).slice(0, 30).map((head) => {
      const last = list.filter(r => r.conversation_id === head.id).sort((a, b) => b.created_at - a.created_at)[0]
      return { ...materialize(head), state: materialize(last).state, steps: [] }
    }),
  }
}
export function conversation(teamId: string, cid: string, preview: boolean) {
  const runs = mineOf(teamId, preview).filter(r => r.conversation_id === cid).sort((a, b) => a.created_at - b.created_at)
  if (!runs.length)
    throw missing('对话不存在')
  return { runs: runs.map((r) => { const m = materialize(r); return { ...m, steps: [], step_count: m.steps.length } }) }
}
export function getRun(teamId: string, runId: string) {
  const r = runsDb.find(x => x.id === runId && x.team_id === teamId)
  if (!r)
    throw missing('任务不存在')
  const { expert_calls: _e, ...rest } = materialize(r)
  return rest
}
export function cancelRun(teamId: string, runId: string) {
  const r = runsDb.find(x => x.id === runId && x.team_id === teamId)
  if (!r)
    throw missing('任务不存在')
  if (['queued', 'running'].includes(materialize(r).state) && r.cancel_at === undefined)
    r.cancel_at = now()
  return { ok: true as const }
}
export function listRuns(teamId: string, q: RunsQuery) {
  find(teamId)
  const since = q.period === 'last7days' ? now() - 7 * DAY : q.period === 'last30days' ? now() - 30 * DAY : 0
  const kw = (q.keyword ?? '').trim().toLowerCase()
  const dir = q.sort_order === 'asc' ? 1 : -1
  const all = runsDb.filter(r => r.team_id === teamId && r.created_at >= since).map(summary)
    .filter(r => (!q.source || q.source === 'all' || r.source === q.source) && (!q.state || q.state === 'all' || r.state === q.state) && (!kw || r.query.toLowerCase().includes(kw) || r.id.includes(kw)))
    .sort((a, b) => dir * (((a[q.sort_by] ?? Infinity) as number) - ((b[q.sort_by] ?? Infinity) as number)))
  return { runs: all.slice((q.page - 1) * q.limit, q.page * q.limit), total: all.length, page: q.page, limit: q.limit }
}
const dayKey = (sec: number) => { const d = new Date(sec * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function metrics(list: RunRec[]): Metrics {
  const m = list.map(r => ({ r, d: materialize(r) }))
  const count = (s: RunState) => m.filter(x => x.d.state === s).length
  const ended = m.filter(x => ['succeeded', 'failed', 'timed_out', 'interrupted'].includes(x.d.state))
  const ok = m.filter(x => x.d.state === 'succeeded')
  const startedRuns = m.filter(x => x.d.started_at)
  const avg = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null)
  const model = m.reduce((s, x) => s + x.d.steps.length, 0)
  return {
    total: m.length, queued: count('queued'), running: count('running'), succeeded: count('succeeded'), failed: count('failed'), timed_out: count('timed_out'), interrupted: count('interrupted'), cancelled: count('cancelled'),
    model_calls: model, expert_calls: m.reduce((s, x) => s + x.d.expert_calls, 0), recorded_calls: Math.max(0, model - Math.floor(m.length / 6)),
    total_tokens: m.length ? m.reduce((s, x) => s + (x.d.finished_at ? x.r.tokens : 0), 0) : null,
    success_rate: ended.length ? +((ok.length / ended.length) * 100).toFixed(1) : null,
    avg_latency: avg(ok.map(x => x.d.finished_at! - x.d.created_at)), avg_queue: avg(startedRuns.map(x => x.d.started_at! - x.d.created_at)),
  }
}
export function statistics(teamId: string, q: { start: string, end: string, timezone: string, source: string }) {
  find(teamId)
  const days: string[] = []
  for (let d = new Date(`${q.start}T00:00:00`); dayKey(d.getTime() / 1000) <= q.end && days.length < 31; d.setDate(d.getDate() + 1))
    days.push(dayKey(d.getTime() / 1000))
  const list = runsDb.filter(r => r.team_id === teamId && (q.source === 'all' || r.source === q.source) && days.includes(dayKey(r.created_at)))
  return { summary: metrics(list), daily: days.map(date => ({ date, ...metrics(list.filter(r => dayKey(r.created_at) === date)) })), timezone: q.timezone }
}

/* ---------------- API Key ---------------- */
const keysDb: Record<string, { id: string, label: string, suffix: string, created_at: number }[]> = {
  'presales': [{ id: uid('key'), label: '业务系统', suffix: 'h3Qa', created_at: t0 - DAY * 2.5 }],
}
export const keys = (id: string) => (find(id), { keys: keysDb[id] ?? [] })
export function createKey(id: string, label: string) {
  const t = find(id)
  if (!t.published_id)
    throw bad('请先发布团队，再创建 API Key')
  const token = `team-${uid('').slice(1)}${Math.random().toString(36).slice(2, 12)}`
  const k = { id: uid('key'), label: label || '业务系统', suffix: token.slice(-4), created_at: now() }
  keysDb[id] = [...(keysDb[id] ?? []), k]
  return { id: k.id, token }
}
export function revokeKey(id: string, keyId: string) {
  keysDb[id] = (keysDb[id] ?? []).filter(k => k.id !== keyId)
  return { ok: true as const }
}

/* ---------------- 消息渠道 ---------------- */
type ChannelRec = { id: string, agent_id: string, kind: ChannelKind, name: string, enabled: boolean, revision: number, status: string, account_id: string, created_at: number, updated_at: number }
const kindNames: Record<ChannelKind, string> = { wecom: '企业微信', feishu: '飞书', dingtalk: '钉钉' }
const statusLabels: Record<string, string> = { online: '运行中', connecting: '连接中', offline: '连接中断', stopped: '已暂停', unbound: '待授权', error: '异常' }
const channelsDb: ChannelRec[] = [{ id: uid('ch'), agent_id: 'presales', kind: 'feishu', name: '飞书', enabled: true, revision: 4, status: 'online', account_id: 'cli_a7f2e9c1d0b3', created_at: t0 - DAY * 2, updated_at: t0 - DAY }]
const chView = (c: ChannelRec) => ({ ...c, status: c.enabled ? c.status : c.account_id ? 'stopped' : 'unbound', status_label: statusLabels[c.enabled ? c.status : c.account_id ? 'stopped' : 'unbound'], error: '' })
const chFind = (id: string, cid: string) => {
  const c = channelsDb.find(x => x.id === cid && x.agent_id === id)
  if (!c)
    throw missing('渠道不存在')
  return c
}
export const channels = (id: string) => (find(id), { channels: channelsDb.filter(c => c.agent_id === id).map(chView) })
export function createChannel(id: string, kind: ChannelKind) {
  if (!find(id).published_id)
    throw bad('请先发布团队，再绑定消息渠道')
  const c: ChannelRec = { id: uid('ch'), agent_id: id, kind, name: kindNames[kind], enabled: false, revision: 1, status: 'unbound', account_id: '', created_at: now(), updated_at: now() }
  channelsDb.push(c)
  return { channel: chView(c) }
}
export function channelEnabled(id: string, cid: string, revision: number, enabled: boolean) {
  const c = chFind(id, cid)
  if (c.revision !== revision)
    throw conflict('配置已更新，请刷新后重试')
  if (enabled && !c.account_id)
    throw bad('请先扫码完成授权，再启用渠道')
  Object.assign(c, { enabled, status: enabled ? 'online' : 'stopped', revision: c.revision + 1, updated_at: now() })
  return { channel: chView(c) }
}
export function channelEvents(id: string, cid: string) {
  const c = chFind(id, cid)
  if (!c.account_id)
    return { events: [] }
  const senders = ['叶源', '周玮', '蒋磊', '金豫玮']
  return {
    events: Array.from({ length: 6 }, (_, i) => ({
      id: `${cid}-ev${i}`, state: i === 2 ? 'failed' : 'done', error_code: i === 2 ? 'timed_out' : '', duration: +(8 + i * 3.7).toFixed(1),
      created_at: c.updated_at - i * 3600 * 3, description: i === 2 ? '超过渠道任务执行上限（150 秒）' : '', sender_id: senders[i % 4], chat_id: i % 2 ? '售前项目群' : '私聊',
    })),
  }
}
export function deleteChannel(id: string, cid: string, revision: number) {
  const c = chFind(id, cid)
  if (c.enabled || c.revision !== revision)
    throw conflict('请先暂停渠道并刷新配置')
  channelsDb.splice(channelsDb.indexOf(c), 1)
  return { ok: true as const }
}
const tickets: Record<string, number> = {}
function fakeQr(ticket: string) {
  let h = [...ticket].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const cells: string[] = []
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17)
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      h = (h * 1103515245 + 12345) >>> 0
      const ring = (a: number, b: number) => { const dx = x - a; const dy = y - b; return Math.max(Math.abs(dx), Math.abs(dy)) !== 2 && Math.max(Math.abs(dx), Math.abs(dy)) <= 3 }
      const on = finder(x, y) ? ring(3, 3) || ring(21, 3) || ring(3, 21) : (h >> 16) % 2 === 0
      if (on)
        cells.push(`M${x} ${y}h1v1h-1z`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 29 29"><rect x="-2" y="-2" width="29" height="29" fill="#fff"/><path d="${cells.join('')}" fill="#111"/></svg>`
}
export function qrStart(id: string, cid: string) {
  const c = chFind(id, cid)
  if (c.enabled)
    throw bad('请先暂停渠道')
  const ticket = uid('qr')
  tickets[ticket] = 0
  return { ticket, svg: fakeQr(ticket), expires_in: 300 }
}
export function qrPoll(id: string, cid: string, ticket: string) {
  const c = chFind(id, cid)
  if (!(ticket in tickets))
    return { status: 'expired' as const }
  const n = ++tickets[ticket]
  if (n >= 5) {
    delete tickets[ticket]
    Object.assign(c, { account_id: `${c.kind}_${Math.random().toString(36).slice(2, 12)}`, revision: c.revision + 1, updated_at: now() })
    return { status: 'confirmed' as const }
  }
  return { status: n >= 3 ? 'scaned' as const : 'wait' as const }
}
