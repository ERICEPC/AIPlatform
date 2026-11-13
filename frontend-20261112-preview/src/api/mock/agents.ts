/*
  Agents 模块 mock：内存状态，增删改、发布、开关都会立即反映到后续读取。
  只模拟后端返回，不含页面逻辑。
*/
import type {
  AgentAppPartial, AgentDetail, BuiltinAgentItem, AgentInfoPayload, AgentListQuery, AgentSoul, ApiKey, AppImportPayload, AppImportResponse, AppSite, AppSitePayload,
  ChatPayload, ComposerResponse, ConfigFileRef, Dataset, EnterpriseAgent, LibrarySkill, LogConversation, LogMessage, LogQuery, LogSource, MessageChannel,
  ModelProviderGroup, Paged, ParameterRule, ReferencingWorkflow, SandboxEntry, SkillFilePreview, SnapshotSummary, StatChartsRaw, StatPoint, Tag, ToolCatalogKind, ToolProvider,
} from '../agents'
import { mockId, mockTextStream } from '../http'
import { builtinSeeds } from './builtin-agents'

const ME = 'acc-lpc'
const NAMES: Record<string, string> = { 'acc-lpc': '李鹏程', 'acc-yy': '叶源', 'acc-zw': '周玮', 'acc-jl': '蒋磊' }
const now = () => Math.floor(Date.now() / 1000)
const H = 3600
const D = 86400
const icon = (n: string) => `/raccoon-emoji-v1/${n}.webp`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const clone = <T>(v: T): T => structuredClone(v)
const notFound = () => { throw new Error('Agent 不存在或已被删除') }

/* ---------- 种子数据 ---------- */
const features = (opening: string, qs: string[]) => ({
  opening_statement: opening,
  suggested_questions: qs,
  suggested_questions_after_answer: { enabled: true },
  text_to_speech: { enabled: false },
  speech_to_text: { enabled: true },
  file_upload: { enabled: true, allowed_file_types: ['image', 'document'], allowed_file_upload_methods: ['local_file'], number_limits: 3 },
  retriever_resource: { enabled: true },
})
const sensenova = { model: 'SenseNova-V6-Pro', model_provider: 'sensenova', model_settings: { temperature: 0.4, top_p: 0.9, max_tokens: 2048, presence_penalty: 0, frequency_penalty: 0 } }

const souls: Record<string, AgentSoul> = {
  yifei: {
    prompt: { system_prompt: '你是翼飞的售后客服，语气耐心、专业。\n\n1. 先确认用户的设备型号和购买渠道。\n2. 查询产品问题时使用 [§knowledge:ks-manual:产品手册检索§]，涉及退换货先查 [§knowledge:ks-policy:售后政策检索§]。\n3. 用户需要人工跟进时，调用 [§tool:yifei_ticket/create_ticket:创建工单§] 并把工单号告诉用户。\n4. 回复格式遵循 [§file:回复规范.md:回复规范.md§]，问题分类用 [§skill:售后工单分类:售后工单分类§]。\n\n不确定的信息不要编造，直接说明会转人工核实。' },
    model: { ...sensenova, fallback: { model: 'deepseek-v3', model_provider: 'deepseek', model_settings: { temperature: 0.4 }, first_chunk_timeout: 8 } },
    app_features: features('你好，我是翼飞售后小助手。请告诉我设备型号和遇到的问题，我来帮你处理。', ['X3 路由器无法开机', '退货多久到账', '帮我建个维修工单']),
    config_skills: [{ name: '售后工单分类', description: '按故障现象把工单分到硬件、网络、账号、物流四类', skill_id: 'sk-ticket' }],
    config_files: [
      { name: '回复规范.md', file_kind: 'upload_file', file_id: 'f-reply', mime_type: 'text/markdown', size: 3120, knowledge_base_id: 'kb-yifei', knowledge_base_name: '翼飞产品资料' },
      { name: 'build_note.md', file_kind: 'tool_file', file_id: 'f-note', mime_type: 'text/markdown', size: 1480, generated: true },
    ],
    config_files_kb: [{ knowledge_base_id: 'kb-yifei', name: '翼飞产品资料' }],
    tools: {
      dify_tools: [
        { provider_type: 'api', provider_id: 'yifei_ticket', tool_name: 'create_ticket', name: '创建工单', credential_type: 'api-key', enabled: true, runtime_parameters: { priority: 'normal' } },
        { provider_type: 'api', provider_id: 'yifei_ticket', tool_name: 'query_ticket', name: '查询工单', credential_type: 'api-key', enabled: true, runtime_parameters: {} },
        { provider_type: 'builtin', provider_id: 'feishu_doc', tool_name: 'read_doc', name: '读取飞书文档', credential_type: 'unauthorized', enabled: true, runtime_parameters: {} },
      ],
      cli_tools: [{ id: 'cli-jq', name: 'jq', install_command: 'apt-get install -y jq', enabled: true, env: { variables: [] } }],
    },
    knowledge: {
      sets: [
        { id: 'ks-manual', name: '产品手册检索', datasets: [{ id: 'ds-manual', name: '翼飞产品手册' }], query: { mode: 'generated_query' }, retrieval: { mode: 'multiple', top_k: 4, score_threshold: 0.5, reranking_enable: true, reranking_model: { provider: 'bge', model: 'bge-reranker-v2-m3' } }, metadata_filtering: { mode: 'disabled' } },
        { id: 'ks-policy', name: '售后政策检索', datasets: [{ id: 'ds-policy', name: '退换货政策' }], query: { mode: 'user_query' }, retrieval: { mode: 'single', top_k: 3 }, metadata_filtering: { mode: 'manual', logical_operator: 'and', conditions: [{ name: 'region', comparison_operator: 'is', value: '华东' }] } },
      ],
    },
    env: { variables: [{ key: 'TICKET_API_BASE', value: 'https://ticket.yifei.example.com' }, { key: 'TICKET_TOKEN', value: 'tk_9f2c1a7b3e' }] },
    config_note: '',
  },
  sales: {
    prompt: { system_prompt: '你是销售团队的商机管理助理。根据销售提供的拜访记录，用 [§tool:crm/update_stage:更新商机阶段§] 更新 CRM，并每周五生成商机周报，格式参考 [§skill:商机周报生成:商机周报生成§]。' },
    model: { model: 'qwen-max', model_provider: 'tongyi', model_settings: { temperature: 0.3, max_tokens: 4096 }, fallback: null },
    app_features: features('把拜访记录发给我，我来更新商机。', ['整理本周商机周报', '东区有哪些商机卡在方案阶段']),
    config_skills: [{ name: '商机周报生成', description: '按区域汇总商机阶段变化，输出周报', skill_id: 'sk-weekly' }],
    config_files: [],
    tools: { dify_tools: [{ provider_type: 'api', provider_id: 'crm', tool_name: 'update_stage', name: '更新商机阶段', credential_type: 'api-key', enabled: true }, { provider_type: 'api', provider_id: 'crm', tool_name: 'query_opportunity', name: '查询商机', credential_type: 'api-key', enabled: true }], cli_tools: [] },
    knowledge: { sets: [{ id: 'ks-weekly', name: '历史周报', datasets: [{ id: 'ds-weekly', name: '商机周报' }], query: { mode: 'generated_query' }, retrieval: { mode: 'single', top_k: 3 }, metadata_filtering: { mode: 'automatic' } }] },
    env: { variables: [] },
  },
  review: {
    prompt: { system_prompt: '你是售前方案评审专家。对照 [§skill:方案评审清单:方案评审清单§] 逐项检查方案，引用 [§knowledge:ks-solution:方案库检索§] 中的同类案例，给出风险和修改建议。' },
    model: { ...sensenova, fallback: null },
    app_features: features('上传方案文档，我会按评审清单逐项检查。', ['帮我评审这份智慧园区方案']),
    config_skills: [{ name: '方案评审清单', description: '售前方案 32 项评审要点', skill_id: 'sk-review' }],
    config_files: [{ name: '评审模板.docx', file_kind: 'upload_file', file_id: 'f-tpl', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 48200 }],
    tools: { dify_tools: [], cli_tools: [] },
    knowledge: { sets: [{ id: 'ks-solution', name: '方案库检索', datasets: [{ id: 'ds-solution', name: '售前方案库' }], query: { mode: 'generated_query' }, retrieval: { mode: 'multiple', top_k: 5, score_threshold: 0.6, reranking_enable: false }, metadata_filtering: { mode: 'disabled' } }] },
    env: { variables: [] },
  },
  meeting: {
    prompt: { system_prompt: '把会议转写整理成纪要：结论、待办（负责人 + 截止时间）、风险。使用 [§skill:会议纪要整理:会议纪要整理§]。' },
    model: { model: 'SenseNova-V6-Turbo', model_provider: 'sensenova', model_settings: { temperature: 0.2 }, fallback: null },
    app_features: features('把会议转写贴进来，或上传录音文字稿。', []),
    config_skills: [{ name: '会议纪要整理', description: '从转写中提取结论、待办和风险', skill_id: 'sk-minutes' }],
    config_files: [], tools: { dify_tools: [], cli_tools: [] }, knowledge: { sets: [] }, env: { variables: [] },
  },
  contract: {
    prompt: { system_prompt: '检查合同条款，标出付款、违约、知识产权、保密四类风险。' },
    model: { model: 'deepseek-r1', model_provider: 'deepseek', model_settings: { temperature: 0.1 }, fallback: null },
    app_features: features('', []),
    config_skills: [], config_files: [], tools: { dify_tools: [], cli_tools: [] },
    knowledge: { sets: [{ id: 'ks-contract', name: '合同模板库', datasets: [{ id: 'ds-contract', name: '合同模板库' }], query: { mode: 'generated_query' }, retrieval: { mode: 'single', top_k: 3 }, metadata_filtering: { mode: 'disabled' } }] },
    env: { variables: [] },
  },
  test: { prompt: { system_prompt: '' }, model: null, app_features: features('', []), config_skills: [], config_files: [], tools: { dify_tools: [], cli_tools: [] }, knowledge: { sets: [] }, env: { variables: [] } },
}

type Version = SnapshotSummary & { soul: AgentSoul }
type AgentState = {
  info: AgentAppPartial
  enable_site: boolean
  enable_api: boolean
  site: AppSite
  soul: AgentSoul
  savedAt: number
  versions: Version[]
  build: { id: string, updated_at: number, soul: AgentSoul } | null
  buildTurns: number
  conversation: string
  keys: ApiKey[]
  channels: MessageChannel[]
}

function mkSite(name: string): AppSite {
  return { access_token: Math.random().toString(36).slice(2, 18), app_base_url: 'https://raccoonx.sensetime.com', title: name, description: '', chat_color_theme: '#1b477f', copyright: '', privacy_policy: '', custom_disclaimer: '', default_language: 'zh-Hans', input_placeholder: '', show_workflow_steps: false, use_icon_as_answer_icon: true }
}

function mkAgent(o: { id: string, name: string, role: string, description: string, icon: string, by: string, created: number, updated: number, soul: AgentSoul, published: number /* 0 未发布，1 已发布且最新，2 已发布但有改动 */, refs: number, site?: boolean, api?: boolean }): AgentState {
  const versions: Version[] = []
  if (o.published) {
    const base = clone(o.soul)
    if (o.published === 2 && base.prompt)
      base.prompt.system_prompt = (base.prompt.system_prompt ?? '').split('，引用')[0]
    versions.push({ id: mockId('ver'), version: 1, display_version: 1, version_note: '首次发布', created_at: o.created + D, created_by: o.by, created_by_name: NAMES[o.by], soul: clone(o.soul) })
    versions.unshift({ id: mockId('ver'), version: 2, display_version: 2, version_note: '补充知识检索和回复规范', created_at: o.updated - 2 * H, created_by: ME, created_by_name: NAMES[ME], soul: base })
  }
  return {
    info: { id: o.id, app_id: `app-${o.id}`, name: o.name, role: o.role, description: o.description, mode: 'agent', icon_type: 'link', icon: icon(o.icon), icon_url: icon(o.icon), icon_background: null, published_reference_count: o.refs, author_name: NAMES[o.by], created_by: o.by, created_at: o.created, updated_at: o.updated },
    enable_site: !!o.site,
    enable_api: !!o.api,
    site: mkSite(o.name),
    soul: clone(o.soul),
    savedAt: o.updated,
    versions,
    build: null,
    buildTurns: 0,
    conversation: mockId('conv'),
    keys: o.api ? [{ id: mockId('key'), token: `app-${Math.random().toString(36).slice(2, 26)}`, created_at: o.created + 2 * D, last_used_at: now() - 3 * H }] : [],
    channels: o.id === 'agt-yifei' ? [{ id: 'ch-wecom', channel_type: 'wecom', name: '翼飞售后群', enabled: true, revision: 3, status: 'connected', bound_account: '翼飞售后机器人', created_at: o.created + 3 * D }] : [],
  }
}

const t = now()
const agents: AgentState[] = [
  mkAgent({ id: 'agt-yifei', name: '翼飞客服 Agent', role: '售后客服', description: '处理翼飞设备的售后咨询、退换货和维修工单，答不了的转人工。', icon: '006-support', by: ME, created: t - 40 * D, updated: t - 2 * H, soul: souls.yifei, published: 1, refs: 2, site: true, api: true }),
  mkAgent({ id: 'agt-sales', name: '商机管理', role: '销售助理', description: '根据拜访记录更新 CRM 商机阶段，每周五自动出东区商机周报。', icon: '007-sales', by: 'acc-jl', created: t - 30 * D, updated: t - D, soul: souls.sales, published: 1, refs: 1, site: true }),
  mkAgent({ id: 'agt-review', name: '方案评审', role: '售前专家', description: '按 32 项评审清单检查售前方案，引用同类案例给出修改建议。', icon: '030-review', by: 'acc-zw', created: t - 21 * D, updated: t - 5 * H, soul: souls.review, published: 2, refs: 0, api: true }),
  mkAgent({ id: 'agt-meeting', name: '会议纪要', role: '会议助理', description: '把会议转写整理成结论、待办和风险，自动@负责人。', icon: '034-meeting', by: 'acc-yy', created: t - 14 * D, updated: t - 3 * D, soul: souls.meeting, published: 1, refs: 0, site: true }),
  mkAgent({ id: 'agt-contract', name: '合同条款检查', role: '法务助理', description: '', icon: '010-legal', by: ME, created: t - 6 * D, updated: t - 26 * H, soul: souls.contract, published: 0, refs: 0 }),
  mkAgent({ id: 'agt-test', name: 'test', role: '', description: '', icon: '045-testing', by: 'acc-yy', created: t - 2 * D, updated: t - 2 * D, soul: souls.test, published: 0, refs: 0 }),
]

/* 企服内置 Agent（SalesBuddy 名册）：与「我的」同一套状态，详情 / 配置 / 发布 / 日志都走同样的逻辑，只是不出现在「我的」列表 */
const RX_ICONS: Record<string, string> = { 'finance': '009-finance', 'presentation': '027-presentation', 'planning': '028-planning', 'data': '005-data', 'sales': '007-sales', 'review': '030-review', 'note-taking': '025-note-taking', 'training': '083-training' }
const rxIcon = (k: string) => icon(RX_ICONS[k.replace(/^rx:/, '')] ?? '042-ai')
const builtins: AgentState[] = builtinSeeds().map((b) => {
  const a = mkAgent({ id: b.id, name: b.name, role: b.role, description: b.description, icon: '042-ai', by: ME, created: b.created_at, updated: b.updated_at, soul: b.soul, published: 0, refs: 0 })
  Object.assign(a.info, { icon: rxIcon(b.icon), icon_url: rxIcon(b.icon), author_name: '企业服务', scope: 'roster' })
  a.versions = b.versions.map(v => ({ ...v, soul: clone(v.soul) }))
  a.enable_site = b.enable_site
  a.enable_api = b.enable_api
  return a
})
const builtinItem = (a: AgentState): BuiltinAgentItem => ({ ...partial(a), scope: 'roster', version: a.versions[0]?.display_version ?? null, version_note: a.versions[0]?.version_note ?? null })

const find = (id: string) => agents.find(a => a.info.id === id) ?? builtins.find(a => a.info.id === id) ?? notFound()
const byApp = (appId: string) => agents.find(a => a.info.app_id === appId) ?? notFound()
const isPublished = (a: AgentState) => !!a.versions[0] && same(a.versions[0].soul, a.soul)
const partial = (a: AgentState): AgentAppPartial => ({ ...a.info, active_config_is_published: isPublished(a) })
const detail = (a: AgentState): AgentDetail => ({ ...partial(a), enable_site: a.enable_site, enable_api: a.enable_api, access_ready: a.versions.length > 0, api_base_url: 'https://raccoonx.sensetime.com/v1', site: a.site, debug_conversation_id: a.conversation })
const composer = (a: AgentState): ComposerResponse => ({
  agent_soul: a.soul,
  active_config_snapshot: a.versions[0] ? { ...a.versions[0], soul: undefined } as SnapshotSummary : null,
  active_config_is_published: isPublished(a),
  draft: { id: `draft-${a.info.id}`, draft_type: 'draft', updated_at: a.savedAt },
})
const touch = (a: AgentState) => { a.savedAt = now(); a.info.updated_at = a.savedAt }

function newAgent(body: AgentInfoPayload, soul: AgentSoul = clone(souls.test)): AgentState {
  const id = mockId('agt')
  const a = mkAgent({ id, name: body.name, role: body.role ?? '', description: body.description ?? '', icon: '042-ai', by: ME, created: now(), updated: now(), soul, published: 0, refs: 0 })
  Object.assign(a.info, { icon_type: body.icon_type ?? 'link', icon: body.icon ?? a.info.icon, icon_url: body.icon ?? a.info.icon, icon_background: body.icon_background ?? null })
  agents.unshift(a)
  return a
}

/* ---------- 目录类数据 ---------- */
const providers: ModelProviderGroup[] = [
  { provider: 'sensenova', label: { en_US: 'SenseNova', zh_Hans: '日日新' }, status: 'active', models: [
    { model: 'SenseNova-V6-Pro', label: { en_US: 'SenseNova V6 Pro' }, model_type: 'llm', status: 'active', features: ['tool-call', 'vision'], model_properties: { context_size: 128000, mode: 'chat' } },
    { model: 'SenseNova-V6-Turbo', label: { en_US: 'SenseNova V6 Turbo' }, model_type: 'llm', status: 'active', features: ['tool-call'], model_properties: { context_size: 32000, mode: 'chat' } },
  ] },
  { provider: 'deepseek', label: { en_US: 'DeepSeek' }, status: 'active', models: [
    { model: 'deepseek-v3', label: { en_US: 'DeepSeek V3' }, model_type: 'llm', status: 'active', features: ['tool-call'], model_properties: { context_size: 64000, mode: 'chat' } },
    { model: 'deepseek-r1', label: { en_US: 'DeepSeek R1' }, model_type: 'llm', status: 'active', model_properties: { context_size: 64000, mode: 'chat' } },
  ] },
  { provider: 'tongyi', label: { en_US: 'Tongyi', zh_Hans: '通义千问' }, status: 'active', models: [
    { model: 'qwen-max', label: { en_US: 'Qwen Max' }, model_type: 'llm', status: 'active', features: ['tool-call'], model_properties: { context_size: 32000, mode: 'chat' } },
    { model: 'qwen-plus', label: { en_US: 'Qwen Plus' }, model_type: 'llm', status: 'quota-exceeded', model_properties: { context_size: 128000, mode: 'chat' } },
  ] },
]
const rerankers: ModelProviderGroup[] = [{ provider: 'bge', label: { en_US: 'BGE', zh_Hans: '本地推理' }, status: 'active', models: [{ model: 'bge-reranker-v2-m3', label: { en_US: 'bge-reranker-v2-m3' }, model_type: 'rerank', status: 'active' }] }]
const rules: ParameterRule[] = [
  { name: 'temperature', label: { en_US: 'Temperature', zh_Hans: '温度' }, type: 'float', default: 0.7, min: 0, max: 2, precision: 1, help: { en_US: '', zh_Hans: '越高回答越发散，越低越严谨' } },
  { name: 'top_p', label: { en_US: 'Top P' }, type: 'float', default: 1, min: 0, max: 1, precision: 2, help: { en_US: '', zh_Hans: '只从累计概率前 P 的词里采样' } },
  { name: 'max_tokens', label: { en_US: 'Max Tokens', zh_Hans: '最大输出长度' }, type: 'int', default: 2048, min: 1, max: 8192, help: { en_US: '', zh_Hans: '单次回复最多生成的 token 数' } },
  { name: 'presence_penalty', label: { en_US: 'Presence penalty', zh_Hans: '话题新鲜度' }, type: 'float', default: 0, min: -2, max: 2, precision: 1 },
  { name: 'frequency_penalty', label: { en_US: 'Frequency penalty', zh_Hans: '重复惩罚' }, type: 'float', default: 0, min: -2, max: 2, precision: 1 },
]

const skillTags: Tag[] = [{ id: 'tg-sales', name: '销售', type: 'skill' }, { id: 'tg-pre', name: '售前', type: 'skill' }, { id: 'tg-legal', name: '法务', type: 'skill' }, { id: 'tg-common', name: '通用', type: 'skill' }]
const tg = (id: string) => skillTags.filter(x => x.id === id).map(x => ({ id: x.id, name: x.name }))
const library: LibrarySkill[] = [
  { id: 'sk-ticket', name: '售后工单分类', description: '按故障现象把工单分到硬件、网络、账号、物流四类', status: 'published', tags: tg('tg-common'), updated_at: t - 9 * D, author_name: '叶源' },
  { id: 'sk-weekly', name: '商机周报生成', description: '按区域汇总商机阶段变化，输出周报', status: 'published', tags: tg('tg-sales'), updated_at: t - 4 * D, author_name: '蒋磊' },
  { id: 'sk-review', name: '方案评审清单', description: '售前方案 32 项评审要点', status: 'published', tags: tg('tg-pre'), updated_at: t - 12 * D, author_name: '周玮' },
  { id: 'sk-minutes', name: '会议纪要整理', description: '从转写中提取结论、待办和风险', status: 'published', tags: tg('tg-common'), updated_at: t - 6 * D, author_name: '叶源' },
  { id: 'sk-risk', name: '合同风险识别', description: '识别付款、违约、知识产权、保密四类条款风险', status: 'published', tags: tg('tg-legal'), updated_at: t - 2 * D, author_name: '金豫玮' },
  { id: 'sk-compete', name: '竞品对比', description: '按功能、价格、交付周期对比竞品', status: 'draft', tags: tg('tg-pre'), updated_at: t - D, author_name: '周玮' },
  { id: 'sk-pdf', name: 'PDF 表格抽取', description: '从扫描版 PDF 里抽取表格为 CSV', status: 'published', tags: tg('tg-common'), updated_at: t - 20 * D, author_name: '李鹏程' },
  { id: 'sk-quote', name: '报价单校验', description: '核对报价单的折扣、税率和总价', status: 'published', tags: tg('tg-sales'), updated_at: t - 7 * D, author_name: '蒋磊' },
]

const p = (name: string, zh: string, desc: string, params: ToolProvider['tools'][number]['parameters'] = []) => ({ name, label: { en_US: name, zh_Hans: zh }, description: { en_US: desc, zh_Hans: desc }, parameters: params })
const catalog: Record<ToolCatalogKind, ToolProvider[]> = {
  builtin: [
    { id: 'web_search', name: 'web_search', author: 'RaccoonX', label: { en_US: 'Web Search', zh_Hans: '网页搜索' }, description: { en_US: '', zh_Hans: '搜索公开网页并返回摘要' }, icon: icon('047-network'), type: 'builtin', is_team_authorization: true, tools: [p('search', '搜索网页', '按关键词搜索网页', [{ name: 'count', label: { en_US: 'count', zh_Hans: '返回条数' }, type: 'number', form: 'form', default: 5 }])] },
    { id: 'time', name: 'time', author: 'RaccoonX', label: { en_US: 'Time', zh_Hans: '时间工具' }, description: { en_US: '', zh_Hans: '获取当前时间、时区换算' }, icon: icon('028-planning'), type: 'builtin', is_team_authorization: true, tools: [p('current_time', '当前时间', '获取指定时区当前时间', [{ name: 'timezone', label: { en_US: 'timezone', zh_Hans: '时区' }, type: 'string', form: 'form', default: 'Asia/Shanghai' }])] },
    { id: 'feishu_doc', name: 'feishu_doc', author: 'RaccoonX', label: { en_US: 'Feishu Doc', zh_Hans: '飞书文档' }, description: { en_US: '', zh_Hans: '读取和创建飞书云文档' }, icon: icon('033-writing'), type: 'builtin', is_team_authorization: false, tools: [p('read_doc', '读取飞书文档', '按链接读取文档正文'), p('create_doc', '创建飞书文档', '在指定文件夹创建文档')] },
  ],
  api: [
    { id: 'yifei_ticket', name: 'yifei_ticket', author: '叶源', label: { en_US: 'yifei_ticket', zh_Hans: '翼飞工单系统' }, description: { en_US: '', zh_Hans: '创建、查询售后工单' }, icon: icon('006-support'), type: 'api', is_team_authorization: true, tools: [p('create_ticket', '创建工单', '创建售后工单', [{ name: 'priority', label: { en_US: 'priority', zh_Hans: '优先级' }, type: 'select', form: 'form', default: 'normal', options: [{ value: 'low', label: { en_US: 'low', zh_Hans: '低' } }, { value: 'normal', label: { en_US: 'normal', zh_Hans: '普通' } }, { value: 'high', label: { en_US: 'high', zh_Hans: '紧急' } }] }]), p('query_ticket', '查询工单', '按工单号查询状态')] },
    { id: 'crm', name: 'crm', author: '蒋磊', label: { en_US: 'crm', zh_Hans: '销售 CRM' }, description: { en_US: '', zh_Hans: '查询、更新商机' }, icon: icon('007-sales'), type: 'api', is_team_authorization: true, tools: [p('query_opportunity', '查询商机', '按客户或区域查询商机'), p('update_stage', '更新商机阶段', '更新商机所处阶段')] },
  ],
  workflow: [{ id: 'wf-quote', name: 'quote_generate', author: '蒋磊', label: { en_US: 'quote', zh_Hans: '报价单生成' }, description: { en_US: '', zh_Hans: '根据产品清单生成报价单' }, icon: icon('061-accounting'), type: 'workflow', is_team_authorization: true, tools: [p('quote_generate', '生成报价单', '输入产品清单，输出报价单')] }],
  mcp: [{ id: 'mcp-gitlab', name: 'gitlab', author: '周玮', label: { en_US: 'GitLab MCP', zh_Hans: 'GitLab' }, description: { en_US: '', zh_Hans: '搜索 Issue、创建合并请求' }, icon: icon('004-programming'), type: 'mcp', is_team_authorization: false, tools: [p('search_issues', '搜索 Issue', '按关键词搜索 Issue'), p('create_mr', '创建合并请求', '基于分支创建 MR')] }],
}

const datasets: Dataset[] = [
  { id: 'ds-manual', name: '翼飞产品手册', description: '全系列设备说明书和故障排查', document_count: 86, word_count: 412000, indexing_technique: 'high_quality' },
  { id: 'ds-policy', name: '退换货政策', description: '各渠道退换货、保修条款', document_count: 12, word_count: 38000, indexing_technique: 'high_quality' },
  { id: 'ds-solution', name: '售前方案库', description: '近三年中标方案', document_count: 154, word_count: 1820000, indexing_technique: 'high_quality' },
  { id: 'ds-contract', name: '合同模板库', description: '销售、采购、保密合同模板', document_count: 34, word_count: 260000, indexing_technique: 'economy' },
  { id: 'ds-minutes', name: '会议纪要归档', description: '', document_count: 210, word_count: 640000, indexing_technique: 'high_quality' },
  { id: 'ds-weekly', name: '商机周报', description: '东区、华南商机周报', document_count: 48, word_count: 150000, indexing_technique: 'high_quality' },
]

/* 企服 Agent：企业统一提供，只读；后续接入真实服务 */
const enterprise: EnterpriseAgent[] = [
  { id: 'ent-salesbuddy', name: 'SalesBuddy', tagline: '销售助手：商机跟进、客户画像、周报', description: '连接 CRM 与拜访记录，自动跟进商机阶段、生成客户画像，每周五汇总区域商机周报，提醒卡住的商机。', capabilities: ['商机跟进', '客户画像', '商机周报', '拜访纪要'], status: 'online', icon_url: icon('007-sales'), owner_team: '企业服务', version: 'v2.3.0', updated_at: t - 2 * D },
  { id: 'ent-projectbuddy', name: 'ProjectBuddy', tagline: '项目助手：排期、风险、里程碑跟踪', description: '根据项目计划拆解排期，跟踪里程碑完成情况，识别延期和资源风险，并在周会前生成项目进展。', capabilities: ['排期拆解', '风险识别', '里程碑跟踪', '周会进展'], status: 'onboarding', icon_url: icon('035-project'), owner_team: '企业服务', version: 'v1.8.2', updated_at: t - 5 * D },
  { id: 'ent-hrbuddy', name: 'HRBuddy', tagline: '人事助手：制度问答、入转调离、假勤', description: '回答员工手册和人事制度问题，指引入职、转正、调岗、离职流程，查询假期余额和考勤异常。', capabilities: ['制度问答', '入转调离', '假勤查询', '流程指引'], status: 'onboarding', icon_url: icon('011-hr'), owner_team: '企业服务', version: 'v0.9.0', updated_at: t - 9 * D },
  { id: 'ent-servicebuddy', name: '客服 Buddy', tagline: '客服助手：工单分类、知识检索、回复建议', description: '对进线工单自动分类和定级，检索产品知识与历史案例，给一线客服生成可直接发送的回复建议。', capabilities: ['工单分类', '知识检索', '回复建议', '质检抽查'], status: 'onboarding', icon_url: icon('006-support'), owner_team: '企业服务', version: 'v0.6.1', updated_at: t - 12 * D },
]

const referencing: ReferencingWorkflow[] = [
  { app_id: 'app-wf-1', app_name: '售后工单自动分派', app_mode: 'workflow', app_icon: icon('044-automation'), app_updated_at: t - 3 * D, workflow_id: 'wf-1', workflow_version: '2026-10-28', node_ids: ['n-12'] },
  { app_id: 'app-wf-2', app_name: '客户回访流程', app_mode: 'advanced-chat', app_icon: icon('037-handshake'), app_updated_at: t - 9 * D, workflow_id: 'wf-2', workflow_version: '2026-10-15', node_ids: ['n-3', 'n-7'] },
  { app_id: 'app-wf-3', app_name: '东区商机周报', app_mode: 'workflow', app_icon: icon('005-data'), app_updated_at: t - 2 * D, workflow_id: 'wf-3', workflow_version: '2026-11-01', node_ids: ['n-2'] },
]

/* ---------- 日志 / 统计（按 id 生成稳定的伪随机数据） ---------- */
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296
}
const QUESTIONS = ['X3 路由器无法开机怎么办', '退货多久到账', '帮我建个维修工单', '保修期怎么查', '换货需要寄回原包装吗', '指示灯一直闪红灯', '发票怎么开', '上门维修要收费吗', '固件升级失败', 'App 绑定不上设备']
const logStore = new Map<string, { list: LogConversation[], messages: Map<string, LogMessage[]> }>()
function logsOf(a: AgentState) {
  const hit = logStore.get(a.info.id)
  if (hit)
    return hit
  const r = rng(a.info.id)
  const srcs = sourcesOf(a)
  const n = a.versions.length ? 46 : 3
  const list: LogConversation[] = Array.from({ length: n }, (_, i) => {
    const created = now() - Math.floor(i * 9 * H + r() * 6 * H)
    const status = r() < 0.08 ? 'failed' : 'success'
    return { id: `log-${a.info.id}-${i}`, conversation_id: `conv-${a.info.id}-${i}`, title: QUESTIONS[Math.floor(r() * QUESTIONS.length)], source: srcs[Math.floor(r() * srcs.length)], end_user_id: `eu-${Math.floor(r() * 9000 + 1000)}`, message_count: 1 + Math.floor(r() * 8), user_rate: r() < 0.3 ? (r() < 0.8 ? 1 : 0) : null, operation_rate: r() < 0.15 ? 1 : null, unread: i < 4, status, created_at: created, updated_at: created + Math.floor(r() * 600) }
  })
  const v = { list, messages: new Map<string, LogMessage[]>() }
  logStore.set(a.info.id, v)
  return v
}
function sourcesOf(a: AgentState): LogSource[] {
  const web: LogSource = { id: `src-web-${a.info.id}`, type: 'webapp', app_id: a.info.app_id ?? '', app_name: `${a.info.name} · Web 应用` }
  return a.info.published_reference_count ? [web, ...referencing.slice(0, a.info.published_reference_count).map(w => ({ id: `src-${w.workflow_id}`, type: 'workflow' as const, app_id: w.app_id, app_name: w.app_name, workflow_id: w.workflow_id }))] : [web]
}
const parseDay = (s?: string) => (s ? new Date(s.replace(' ', 'T')).getTime() / 1000 : undefined)

/* ---------- 构建对话的 mock 改动 ---------- */
function buildEdit(a: AgentState, query: string): { soul: AgentSoul, reply: string } {
  const s = clone(a.build?.soul ?? a.soul)
  const turn = a.buildTurns++
  s.prompt ??= {}
  const lines: string[] = []
  if (!s.prompt.system_prompt?.trim()) {
    s.prompt.system_prompt = `你是${a.info.role || a.info.name}。\n\n## 目标\n${query}\n\n## 工作方式\n1. 先确认用户的问题和上下文，信息不足时追问。\n2. 给出结论时注明依据。\n3. 不确定的内容不要编造。`
    lines.push('写好了提示词的角色、目标和工作方式')
  }
  else {
    s.prompt.system_prompt += `\n\n## 补充要求\n- ${query}`
    lines.push('把你的要求补充进提示词')
  }
  const step = turn % 3
  if (step === 0) {
    const sk = library.find(x => x.status === 'published' && !s.config_skills?.some(c => c.name === x.name))
    if (sk) {
      s.config_skills = [...(s.config_skills ?? []), { name: sk.name, description: sk.description, skill_id: sk.id }]
      lines.push(`添加了 Skill「${sk.name}」`)
    }
  }
  else if (step === 1) {
    s.tools ??= {}
    if (!s.tools.dify_tools?.some(x => x.tool_name === 'search')) {
      s.tools.dify_tools = [...(s.tools.dify_tools ?? []), { provider_type: 'builtin', provider_id: 'web_search', tool_name: 'search', name: '搜索网页', credential_type: 'api-key', enabled: true, runtime_parameters: { count: 5 } }]
      lines.push('添加了工具「网页搜索 / 搜索网页」')
    }
  }
  else {
    s.app_features = { ...s.app_features, opening_statement: `你好，我是${a.info.name}，有什么可以帮你？` }
    lines.push('设置了开场白')
  }
  return { soul: s, reply: `好的，我已经按你的描述更新了配置：\n${lines.map(l => `· ${l}`).join('\n')}\n\n右侧会标出改动，确认没问题点「应用」写入左侧配置；还想调整可以继续告诉我。` }
}

const REPLIES = ['收到。先帮你确认一下：设备型号是 X3 还是 X3 Pro？购买渠道是官网还是线下门店？确认后我按对应的售后政策处理。', '根据《退换货政策》第 3 条，官网订单签收 7 天内可无理由退货，退款会在仓库验收后 1–3 个工作日原路退回。需要我帮你发起退货申请吗？', '已为你创建维修工单 **YF-20261105-0342**，工程师会在 24 小时内联系你。你可以随时发工单号给我查询进度。']

/* ================= 导出给接口层 ================= */
export const db = {
  list(q: AgentListQuery): Paged<AgentAppPartial> {
    if (q.scope === 'roster') {
      const rows = builtins.slice().sort((x, y) => (y.info.updated_at ?? 0) - (x.info.updated_at ?? 0)).map(builtinItem)
      return { data: rows, has_more: false, page: 1, limit: 100, total: rows.length }
    }
    let rows = agents.slice()
    if (q.name)
      rows = rows.filter(a => a.info.name.toLowerCase().includes(q.name!.toLowerCase()))
    if (q.is_created_by_me)
      rows = rows.filter(a => a.info.created_by === ME)
    const sort = q.sort_by ?? 'last_modified'
    rows.sort((x, y) => sort === 'last_modified' ? (y.info.updated_at ?? 0) - (x.info.updated_at ?? 0) : sort === 'recently_created' ? (y.info.created_at ?? 0) - (x.info.created_at ?? 0) : (x.info.created_at ?? 0) - (y.info.created_at ?? 0))
    const limit = q.limit ?? 30
    const start = (q.page - 1) * limit
    return { data: rows.slice(start, start + limit).map(partial), has_more: start + limit < rows.length, page: q.page, limit, total: rows.length }
  },
  create: (body: AgentInfoPayload) => detail(newAgent(body)),
  detail: (id: string) => detail(find(id)),
  update(id: string, body: AgentInfoPayload) {
    const a = find(id)
    Object.assign(a.info, { name: body.name, role: body.role ?? '', description: body.description ?? '', icon_type: body.icon_type ?? a.info.icon_type, icon: body.icon ?? a.info.icon, icon_url: body.icon ?? a.info.icon_url, icon_background: body.icon_background ?? null })
    touch(a)
    return detail(a)
  },
  copy(id: string, body: AgentInfoPayload) {
    const src = find(id)
    return detail(newAgent({ ...body, icon: body.icon ?? src.info.icon, icon_type: src.info.icon_type }, clone(src.soul)))
  },
  remove(id: string) {
    const i = agents.findIndex(a => a.info.id === id)
    if (i >= 0)
      agents.splice(i, 1)
  },
  exportDsl(appId: string) {
    const a = byApp(appId)
    return { data: `version: 0.3.0\nkind: app\napp:\n  name: ${a.info.name}\n  mode: agent\n  role: ${a.info.role ?? ''}\n  description: ${a.info.description ?? ''}\nagent_soul:\n  prompt:\n    system_prompt: |\n${(a.soul.prompt?.system_prompt ?? '').split('\n').map(l => `      ${l}`).join('\n')}\n  model:\n    model_provider: ${a.soul.model?.model_provider ?? ''}\n    model: ${a.soul.model?.model ?? ''}\n` }
  },
  pendingImports: new Map<string, AppImportPayload>(),
  importDsl(body: AppImportPayload): AppImportResponse {
    const id = mockId('imp')
    if (body.mode === 'yaml-content' && !/version:\s*0\.3/.test(body.yaml_content ?? '')) {
      db.pendingImports.set(id, body)
      return { id, status: 'pending', current_dsl_version: '0.3.0', imported_dsl_version: (body.yaml_content ?? '').match(/version:\s*([\d.]+)/)?.[1] ?? '未知' }
    }
    return db.finishImport(id, body)
  },
  finishImport(id: string, body: AppImportPayload): AppImportResponse {
    const name = body.name || (body.yaml_content ?? '').match(/name:\s*(.+)/)?.[1]?.trim() || '导入的 Agent'
    const a = newAgent({ name, description: '从 DSL 导入' })
    return { id, status: 'completed', app_id: a.info.app_id, app_mode: 'agent', current_dsl_version: '0.3.0', imported_dsl_version: '0.3.0' }
  },
  confirmImport(id: string) {
    const body = db.pendingImports.get(id)
    if (!body)
      throw new Error('导入任务已过期，请重新上传')
    db.pendingImports.delete(id)
    return db.finishImport(id, body)
  },

  composer: (id: string) => composer(find(id)),
  saveComposer(id: string, soul: AgentSoul) {
    const a = find(id)
    a.soul = clone(soul)
    touch(a)
    return composer(a)
  },
  models: (type: 'llm' | 'rerank') => ({ data: type === 'llm' ? providers : rerankers }),
  parameterRules: () => ({ data: rules }),
  librarySkills(q: { page: number, keyword?: string, tag?: string[] }): Paged<LibrarySkill> {
    let rows = library.filter(s => !q.keyword || s.name.includes(q.keyword) || s.description.includes(q.keyword))
    if (q.tag?.length)
      rows = rows.filter(s => s.tags.some(x => q.tag!.includes(x.id)))
    const start = (q.page - 1) * 20
    return { data: rows.slice(start, start + 20), has_more: start + 20 < rows.length, page: q.page, limit: 20, total: rows.length }
  },
  skillTags: () => skillTags,
  setLibrarySkills(id: string, ids: string[]) {
    const a = find(id)
    const uploaded = (a.soul.config_skills ?? []).filter(s => !s.skill_id)
    a.soul.config_skills = [...uploaded, ...ids.map(sid => library.find(s => s.id === sid)!).filter(Boolean).map(s => ({ name: s.name, description: s.description, skill_id: s.id }))]
    touch(a)
    return { result: 'success' as const }
  },
  uploadSkill(id: string, filename: string) {
    const a = find(id)
    const ref = { name: filename.replace(/\.(zip|skill)$/i, ''), description: '上传的 Skill 包', file_id: mockId('file'), size: 18400 }
    a.soul.config_skills = [...(a.soul.config_skills ?? []).filter(s => s.name !== ref.name), ref]
    touch(a)
    return ref
  },
  previewSkill(name: string, path: string): SkillFilePreview {
    if (!path || path.endsWith('/'))
      return { path, type: 'dir', entries: path === 'scripts/' ? [{ name: 'run.py', path: 'scripts/run.py', type: 'file', size: 2210 }] : [{ name: 'SKILL.md', path: 'SKILL.md', type: 'file', size: 1320 }, { name: 'scripts', path: 'scripts/', type: 'dir' }, { name: 'reference.md', path: 'reference.md', type: 'file', size: 860 }] }
    const text = path === 'SKILL.md' ? `---\nname: ${name}\ndescription: ${library.find(s => s.name === name)?.description ?? '上传的 Skill 包'}\n---\n\n# ${name}\n\n## 何时使用\n用户的问题涉及${name}时使用本 Skill。\n\n## 步骤\n1. 读取输入，提取关键信息。\n2. 运行 scripts/run.py 做结构化处理。\n3. 按 reference.md 的格式输出。` : path.endsWith('.py') ? 'import json, sys\n\ndef main():\n    data = json.load(sys.stdin)\n    print(json.dumps(classify(data), ensure_ascii=False))\n' : '# 输出格式\n\n| 字段 | 说明 |\n| --- | --- |\n| category | 分类 |\n| reason | 依据 |'
    return { path, type: 'file', text, truncated: false }
  },
  removeSkill(id: string, name: string) {
    const a = find(id)
    a.soul.config_skills = (a.soul.config_skills ?? []).filter(s => s.name !== name)
    touch(a)
  },
  uploads: new Map<string, { name: string, size: number, type: string }>(),
  uploadFile(file: File) {
    const id = mockId('upl')
    db.uploads.set(id, { name: file.name, size: file.size, type: file.type })
    return { id, name: file.name, size: file.size, mime_type: file.type, extension: file.name.split('.').pop() }
  },
  addConfigFile(id: string, uploadId: string): ConfigFileRef {
    const a = find(id)
    const u = db.uploads.get(uploadId) ?? { name: `文件-${uploadId}.txt`, size: 1024, type: 'text/plain' }
    const ref: ConfigFileRef = { name: u.name, file_id: uploadId, file_kind: 'upload_file', mime_type: u.type, size: u.size }
    a.soul.config_files = [...(a.soul.config_files ?? []).filter(f => f.name !== u.name), ref]
    touch(a)
    return ref
  },
  previewFile(id: string, name: string) {
    const f = find(id).soul.config_files?.find(x => x.name === name)
    if (!f || /\.(docx|pdf|png|jpe?g|xlsx|zip)$/i.test(name))
      return { binary: true, truncated: false, size: f?.size ?? 0, text: null }
    const text = f.generated ? `# 构建说明\n\n本文件由构建对话自动生成，记录 Agent 的设计意图。\n\n- 面向：翼飞终端用户\n- 主要场景：售后咨询、退换货、维修工单\n- 不处理：价格谈判、渠道合作` : `# ${name.replace(/\.md$/, '')}\n\n1. 先给结论，再给步骤。\n2. 每条回复不超过 200 字。\n3. 涉及金额、时效的信息必须引用政策原文。\n4. 结尾询问用户是否还有其他问题。`
    return { binary: false, truncated: false, size: f.size ?? text.length, text }
  },
  saveFileToKb(id: string, name: string, kbId: string, kbName: string): ConfigFileRef {
    const a = find(id)
    const f = a.soul.config_files?.find(x => x.name === name)
    if (!f)
      throw new Error(`文件「${name}」不存在`)
    f.knowledge_base_id = kbId
    f.knowledge_base_name = kbName
    touch(a)
    return f
  },
  enterprise: () => ({ data: enterprise }),
  removeFile(id: string, name: string) {
    const a = find(id)
    a.soul.config_files = (a.soul.config_files ?? []).filter(f => f.name !== name)
    touch(a)
  },
  toolProviders: (kind: ToolCatalogKind) => catalog[kind],
  datasets: (page: number, limit: number): Paged<Dataset> => ({ data: datasets.slice((page - 1) * limit, page * limit), has_more: page * limit < datasets.length, page, limit, total: datasets.length }),

  checkoutBuild(id: string) {
    const a = find(id)
    a.build ??= { id: mockId('build'), updated_at: now(), soul: clone(a.soul) }
    return { draft: { id: a.build.id, draft_type: 'debug_build' as const, updated_at: a.build.updated_at } }
  },
  buildDraft(id: string) {
    const a = find(id)
    return a.build ? { draft: { id: a.build.id, draft_type: 'debug_build' as const, updated_at: a.build.updated_at }, agent_soul: a.build.soul } : { draft: null, agent_soul: null }
  },
  discardBuild(id: string) {
    const a = find(id)
    a.build = null
  },
  applyBuild(id: string) {
    const a = find(id)
    if (a.build)
      a.soul = a.build.soul
    a.build = null
    touch(a)
    return composer(a)
  },
  chatStream(id: string, body: ChatPayload) {
    const a = find(id)
    const extra = { message_id: mockId('msg'), conversation_id: body.conversation_id || a.conversation, task_id: mockId('task') }
    if (body.draft_type === 'debug_build') {
      const { soul, reply } = buildEdit(a, body.query)
      a.build = { id: a.build?.id ?? mockId('build'), updated_at: now(), soul }
      return mockTextStream(reply, 'message', extra)
    }
    const r = rng(body.query + Date.now())
    return mockTextStream(REPLIES[Math.floor(r() * REPLIES.length)], 'message', extra)
  },
  suggested: (_id: string) => ({ data: ['保修期外维修怎么收费？', '能上门取件吗？', '工单进度怎么查？'] }),
  refreshConversation(id: string) {
    const a = find(id)
    a.conversation = mockId('conv')
    a.build = null
    return { debug_conversation_id: a.conversation }
  },
  sandboxList(path: string): { data: SandboxEntry[] } {
    const m = now()
    const tree: Record<string, SandboxEntry[]> = {
      '~': [{ name: 'memory', type: 'dir', mtime: m - D }, { name: 'preferences.md', type: 'file', size: 640, mtime: m - 2 * D }],
      '~/memory': [{ name: '常见故障.md', type: 'file', size: 2400, mtime: m - D }, { name: '客户偏好.json', type: 'file', size: 380, mtime: m - 3 * H }],
      '.': [{ name: 'output', type: 'dir', mtime: m - 600 }, { name: 'ticket_draft.json', type: 'file', size: 512, mtime: m - 300 }],
      './output': [{ name: '回访记录.csv', type: 'file', size: 4096, mtime: m - 600 }],
    }
    return { data: tree[path.replace(/\/$/, '')] ?? [] }
  },
  sandboxRead: (path: string) => ({ content: path.endsWith('.json') ? '{\n  "device": "X3",\n  "issue": "无法开机",\n  "priority": "normal"\n}' : path.endsWith('.csv') ? '日期,客户,结果\n2026-11-04,王先生,已解决\n2026-11-05,刘女士,待回访' : `# ${path.split('/').pop()}\n\n- 用户偏好简洁回复\n- 优先给出处理步骤`, truncated: false }),

  referencing: (id: string) => ({ data: referencing.slice(0, find(id).info.published_reference_count ?? 0) }),
  publish(id: string, note: string) {
    const a = find(id)
    const v = (a.versions[0]?.version ?? 0) + 1
    a.versions.unshift({ id: mockId('ver'), version: v, display_version: v, version_note: note || null, created_at: now(), created_by: ME, created_by_name: NAMES[ME], soul: clone(a.soul) })
    return { result: 'success' as const, active_config_snapshot_id: a.versions[0].id }
  },
  versions: (id: string) => ({ data: find(id).versions.map(({ soul: _s, ...v }) => v) }),
  version(id: string, vid: string) {
    const v = find(id).versions.find(x => x.id === vid) ?? notFound()
    const { soul, ...rest } = v
    return { ...rest, config_snapshot: soul }
  },
  restore(id: string, vid: string) {
    const a = find(id)
    const v = a.versions.find(x => x.id === vid) ?? notFound()
    a.soul = clone(v.soul)
    touch(a)
    return { result: 'success' as const, active_config_snapshot_id: vid }
  },

  siteEnable(appId: string, on: boolean) {
    const a = byApp(appId)
    a.enable_site = on
    return detail(a)
  },
  resetToken(appId: string) {
    const a = byApp(appId)
    a.site.access_token = Math.random().toString(36).slice(2, 18)
    return a.site
  },
  updateSite(appId: string, body: AppSitePayload) {
    const a = byApp(appId)
    Object.assign(a.site, body)
    return a.site
  },
  apiAccess(id: string) {
    const a = find(id)
    const base = 'https://raccoonx.sensetime.com/v1'
    return { enabled: a.enable_api, access_ready: a.versions.length > 0, service_api_base_url: base, chat_endpoint: `${base}/chat-messages`, stop_endpoint: `${base}/chat-messages/:task_id/stop`, messages_endpoint: `${base}/messages`, conversations_endpoint: `${base}/conversations`, files_upload_endpoint: `${base}/files/upload`, parameters_endpoint: `${base}/parameters`, api_key_count: a.keys.length, api_rpm: 60, api_rph: 3000, streaming_only: true }
  },
  apiEnable(id: string, on: boolean) {
    find(id).enable_api = on
    return { result: 'success' as const }
  },
  apiKeys: (id: string) => ({ data: find(id).keys.map(k => ({ ...k, token: `${k.token.slice(0, 7)}••••••••${k.token.slice(-4)}` })) }),
  createKey(id: string) {
    const k: ApiKey = { id: mockId('key'), token: `app-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`, created_at: now(), last_used_at: null }
    find(id).keys.unshift(k)
    return k
  },
  deleteKey(id: string, kid: string) {
    const a = find(id)
    a.keys = a.keys.filter(k => k.id !== kid)
  },

  channels: (id: string) => ({ data: find(id).channels }),
  createChannel(id: string, body: { channel_type: MessageChannel['channel_type'], name: string }) {
    const c: MessageChannel = { id: mockId('ch'), channel_type: body.channel_type, name: body.name, enabled: false, revision: 1, status: 'pending', created_at: now() }
    find(id).channels.push(c)
    return c
  },
  channelConfigure(id: string, cid: string) {
    const c = find(id).channels.find(x => x.id === cid) ?? notFound()
    Object.assign(c, { status: 'connected', bound_account: `${c.name}机器人`, revision: c.revision + 1 })
    return c
  },
  channelEnable(id: string, cid: string, on: boolean) {
    const c = find(id).channels.find(x => x.id === cid) ?? notFound()
    c.enabled = on
    c.revision += 1
    return c
  },
  deleteChannel(id: string, cid: string) {
    const a = find(id)
    a.channels = a.channels.filter(c => c.id !== cid)
  },
  polls: new Map<string, number>(),
  channelQr: (cid: string) => {
    db.polls.set(cid, 0)
    return { ticket: mockId('qr'), qr_url: `https://raccoonx.sensetime.com/channel-bind/${cid}`, expires_at: now() + 120 }
  },
  channelPoll(id: string, cid: string) {
    const n = (db.polls.get(cid) ?? 0) + 1
    db.polls.set(cid, n)
    if (n < 2)
      return { status: 'waiting' as const }
    if (n < 3)
      return { status: 'scanned' as const }
    const c = find(id).channels.find(x => x.id === cid) ?? notFound()
    Object.assign(c, { status: 'connected', enabled: true, revision: c.revision + 1, bound_account: `${c.name}机器人` })
    return { status: 'confirmed' as const, channel: c }
  },

  logSources(id: string) {
    const s = sourcesOf(find(id))
    return { data: s, groups: [{ type: 'webapp' as const, label: 'Web 应用', sources: s.filter(x => x.type === 'webapp') }, { type: 'workflow' as const, label: '工作流', sources: s.filter(x => x.type === 'workflow') }].filter(g => g.sources.length) }
  },
  logs(id: string, q: LogQuery): Paged<LogConversation> {
    let rows = logsOf(find(id)).list.slice()
    const start = parseDay(q.start)
    if (start)
      rows = rows.filter(r => (r.created_at ?? 0) >= start)
    if (q.keyword)
      rows = rows.filter(r => r.title?.includes(q.keyword!))
    if (q.sources?.length)
      rows = rows.filter(r => r.source && q.sources!.includes(r.source.id))
    const key = q.sort_by ?? 'created_at'
    rows.sort((x, y) => ((y[key] ?? 0) - (x[key] ?? 0)) * (q.sort_order === 'asc' ? -1 : 1))
    const s = (q.page - 1) * q.limit
    return { data: rows.slice(s, s + q.limit), has_more: s + q.limit < rows.length, page: q.page, limit: q.limit, total: rows.length }
  },
  logMessages(id: string, cid: string): Paged<LogMessage> {
    const store = logsOf(find(id))
    const conv = store.list.find(c => c.conversation_id === cid)
    if (conv)
      conv.unread = false
    if (!store.messages.has(cid)) {
      const r = rng(cid)
      const n = Math.min(conv?.message_count ?? 2, 4)
      store.messages.set(cid, Array.from({ length: n }, (_, i) => {
        const failed = conv?.status === 'failed' && i === n - 1
        const mt = 300 + Math.floor(r() * 900)
        const at = failed ? 0 : 120 + Math.floor(r() * 400)
        return { id: `${cid}-m${i}`, message_id: `${cid}-m${i}`, conversation_id: cid, query: i === 0 ? (conv?.title ?? QUESTIONS[0]) : QUESTIONS[Math.floor(r() * QUESTIONS.length)], answer: failed ? '' : REPLIES[i % REPLIES.length], error: failed ? '模型响应超时（30 秒），已切换备用模型仍未返回' : null, status: failed ? 'error' : 'normal', latency: 0.8 + r() * 3, message_tokens: mt, answer_tokens: at, total_tokens: mt + at, total_price: ((mt + at) * 0.000012).toFixed(5), currency: 'RMB', feedbacks: i === 0 && conv?.user_rate === 1 ? [{ rating: 'like', from_source: 'user' }] : [], knowledge_retrieval: r() < 0.6 ? ['翼飞产品手册 · X3 故障排查.pdf', '退换货政策 · 官网渠道.md'] : [], created_at: (conv?.created_at ?? now()) + i * 90 }
      }))
    }
    const data = store.messages.get(cid)!
    return { data, has_more: false, page: 1, limit: 50, total: data.length }
  },
  feedback(id: string, body: { message_id: string, rating: 'like' | 'dislike' | null, content?: string | null }) {
    for (const list of logsOf(find(id)).messages.values()) {
      const m = list.find(x => x.message_id === body.message_id)
      if (m)
        m.feedbacks = [...(m.feedbacks ?? []).filter(f => f.from_source !== 'admin'), ...(body.rating ? [{ rating: body.rating, content: body.content, from_source: 'admin' as const }] : [])]
    }
    return { result: 'success' as const }
  },

  statistics(id: string, q: { start?: string, end?: string, source?: string }) {
    const a = find(id)
    const end = parseDay(q.end) ?? now()
    const start = parseDay(q.start) ?? end - 6 * D
    const days = Math.max(1, Math.min(90, Math.floor((end - start) / D) + 1))
    const scale = a.versions.length ? (q.source && q.source !== 'all' ? 0.45 : 1) : 0.02
    const series = (key: string, base: number, vary: number, dec = 0): StatPoint[] => {
      const r = rng(a.info.id + key + (q.source ?? ''))
      return Array.from({ length: days }, (_, i) => {
        const d = new Date((start + i * D) * 1000)
        const v = Math.max(0, base * (0.75 + 0.5 * r()) + vary * Math.sin(i / 2.3))
        return { date: `${d.getMonth() + 1}/${d.getDate()}`, value: Number(v.toFixed(dec)) }
      })
    }
    const msgs = series('m', 320 * scale, 60 * scale)
    const users = series('u', 85 * scale, 14 * scale)
    const convs = series('c', 120 * scale, 20 * scale)
    const inter = series('i', 2.7, 0.4, 1)
    const tps = series('t', 42, 6, 1)
    const sat = series('s', 0.86, 0.05, 2).map(p => ({ ...p, value: Math.min(1, p.value) }))
    const tok = series('k', 260000 * scale, 30000 * scale)
    const lat = series('r', 1.9, 0.3, 2)
    const sum = (s: StatPoint[]) => s.reduce((x, p) => x + p.value, 0)
    const avg = (s: StatPoint[]) => sum(s) / s.length
    const tokens = sum(tok)
    const charts: StatChartsRaw = {
      daily_messages: msgs.map(p => ({ date: p.date, message_count: p.value })),
      daily_end_users: users.map(p => ({ date: p.date, terminal_count: p.value })),
      daily_conversations: convs.map(p => ({ date: p.date, conversation_count: p.value })),
      average_session_interactions: inter.map(p => ({ date: p.date, interactions: p.value })),
      tokens_per_second: tps.map(p => ({ date: p.date, tps: p.value })),
      user_satisfaction_rate: sat.map(p => ({ date: p.date, rate: p.value })),
      token_usage: tok.map(p => ({ date: p.date, token_count: p.value, total_price: (p.value * 0.000012).toFixed(4), currency: 'RMB' })),
      average_response_time: lat.map(p => ({ date: p.date, latency: p.value })),
    }
    return {
      source: q.source ?? 'all',
      charts,
      summary: { total_messages: sum(msgs), total_end_users: sum(users), total_conversations: sum(convs), average_session_interactions: Number(avg(inter).toFixed(1)), tokens_per_second: Number(avg(tps).toFixed(1)), user_satisfaction_rate: Number(avg(sat).toFixed(3)), total_tokens: tokens, total_price: (tokens * 0.000012).toFixed(2), currency: 'RMB', average_response_time: Number(avg(lat).toFixed(2)) },
    }
  },
}

