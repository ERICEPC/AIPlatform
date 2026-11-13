import type { ExternalKnowledgeSet } from './agent-external-knowledge'
import { SALES_BUILTIN_IDS } from '@/lib/enterprise-catalog'
/*
  Agents 模块接口层：类型 + 请求函数。
  路径与字段沿用原 RaccoonX 控制台（/console/api 前缀由 http.ts 添加），
  类型按页面需要做了裁剪，字段名与 contracts/generated/api/console/agent/types.gen.ts 一致。
  时间戳均为 Unix 秒。
*/
import type { StreamEvent } from './http'
import { request, stream } from './http'
import { db } from './mock/agents'

/* ================= 通用 ================= */
export type IconType = 'emoji' | 'image' | 'link'
export type Paged<T> = { data: T[], has_more: boolean, page: number, limit: number, total: number }
export type I18nText = { zh_Hans?: string, en_US: string }

/* ================= 列表 / 基本信息 ================= */
export type AgentSortBy = 'last_modified' | 'recently_created' | 'earliest_created'

export type AgentAppPartial = {
  id: string
  app_id?: string | null
  name: string
  role?: string | null
  description?: string | null
  mode: string
  icon_type?: IconType | null
  icon?: string | null
  icon_background?: string | null
  icon_url: string | null
  active_config_snapshot?: { display_version?: number | null, version?: number } | null
  active_config_is_published?: boolean
  published_reference_count?: number
  author_name?: string | null
  created_by?: string | null
  created_at?: number | null
  updated_at?: number | null
  /** roster：企服内置 Agent（如 SalesBuddy 名册） */
  scope?: string | null
}

export type AgentListQuery = { page: number, limit?: number, sort_by?: AgentSortBy, name?: string, is_created_by_me?: boolean, /** roster：企业内置（名册）Agent */ scope?: 'roster' }

export type AppSite = {
  access_token: string
  app_base_url: string
  title: string
  description?: string | null
  chat_color_theme?: string | null
  copyright?: string | null
  privacy_policy?: string | null
  custom_disclaimer?: string | null
  default_language: string
  input_placeholder?: string | null
  show_workflow_steps: boolean
  use_icon_as_answer_icon: boolean
}
export type AppSitePayload = Partial<Omit<AppSite, 'access_token' | 'app_base_url'>>

export type AgentDetail = AgentAppPartial & {
  enable_site: boolean
  enable_api: boolean
  access_ready?: boolean
  api_base_url?: string | null
  site?: AppSite | null
  debug_conversation_id?: string | null
  debug_conversation_has_messages?: boolean
}

export type AgentInfoPayload = {
  name: string
  description?: string | null
  role?: string | null
  icon_type?: IconType | null
  icon?: string | null
  icon_background?: string | null
}

export type AppImportPayload = { mode: 'yaml-content' | 'yaml-url', yaml_content?: string, yaml_url?: string, name?: string }
export type AppImportResponse = {
  id: string
  status: 'completed' | 'completed-with-warnings' | 'pending' | 'failed'
  app_id?: string | null
  app_mode?: string | null
  current_dsl_version?: string
  imported_dsl_version?: string
  error?: string
}

/** GET /agent 分页列出 Agent */
export const listAgents = (q: AgentListQuery) =>
  request<Paged<AgentAppPartial>>({ method: 'GET', path: '/agent', query: { limit: 30, ...q } }, () => db.list(q))

/** Personal catalog: filter built-ins before pagination so counts and search stay consistent. */
export async function listPersonalAgents(q: AgentListQuery): Promise<Paged<AgentAppPartial>> {
  const catalog = await request<{ ids: string[] }>({ method: 'GET', path: '/enterprise/salesbuddy/catalog' }, () => ({ ids: [...SALES_BUILTIN_IDS] }))
  const enterpriseIds = new Set(catalog.ids)
  const all: AgentAppPartial[] = []
  for (let page = 1; ; page++) {
    const result = await listAgents({ ...q, page, limit: 100 })
    all.push(...result.data.filter(a => !enterpriseIds.has(a.id)))
    if (!result.has_more || result.data.length === 0) break
  }
  const limit = q.limit || 30
  const offset = (q.page - 1) * limit
  return { data: all.slice(offset, offset + limit), total: all.length, page: q.page, limit, has_more: offset + limit < all.length }
}

/* ---------- 企服 Agent（RaccoonX 扩展） ---------- */
/** online 已上线；onboarding 接入中（还不能对话） */
export type EnterpriseAgentStatus = 'online' | 'onboarding'
/** 企业统一提供的内置 Agent，只读 */
export type EnterpriseAgent = {
  id: string
  name: string
  /** 一句话价值 */
  tagline: string
  description: string
  capabilities: string[]
  status: EnterpriseAgentStatus
  icon_url: string
  owner_team: string
  version: string
  updated_at?: number | null
}

/** GET /agents/enterprise 企服 Agent 列表（RaccoonX 扩展，目前为 mock，后续接入真实服务） */
export const listEnterpriseAgents = () =>
  request<{ data: EnterpriseAgent[] }>({ method: 'GET', path: '/agents/enterprise' }, () => db.enterprise())

/* ---------- 企服 Buddy 内置 Agent ---------- */
/** 企服 Buddy：路由 #agents/enterprise/<buddy> */
export type BuddyId = 'sales' | 'project' | 'hr' | 'service'
export const BUDDY_IDS: BuddyId[] = ['sales', 'project', 'hr', 'service']
/** Buddy → 企服 Agent 列表里的 id（RaccoonX 扩展） */
export const BUDDY_ENTERPRISE_ID: Record<BuddyId, string> = { sales: 'ent-salesbuddy', project: 'ent-projectbuddy', hr: 'ent-hrbuddy', service: 'ent-servicebuddy' }

/** 内置 Agent 列表项：`GET /agent?scope=roster` 的列表字段（scope / version / version_note 来自原门户导出，接入时确认） */
export type BuiltinAgentItem = AgentAppPartial & {
  scope?: string | null
  /** 当前生效版本的展示版本号（对应快照 display_version） */
  version?: number | null
  version_note?: string | null
}

/**
 * GET /agent?scope=roster&page=1&limit=100 某个 Buddy 的内置 Agent
 * Buddy 与 Agent 的归属是 RaccoonX 扩展：目前所有 scope=roster 的 Agent 都属于 SalesBuddy，其他 Buddy 暂无内置 Agent（不发请求，直接返回空列表）。
 */
export async function listBuiltinAgents(buddy: BuddyId): Promise<Paged<BuiltinAgentItem>> {
  if (buddy !== 'sales')
    return Promise.resolve({ data: [], has_more: false, page: 1, limit: 100, total: 0 })
  const catalog = await request<{ ids: string[] }>({ method: 'GET', path: '/enterprise/salesbuddy/catalog' }, () => ({ ids: [...SALES_BUILTIN_IDS] }))
  const enterpriseIds = new Set(catalog.ids)
  return request<Paged<BuiltinAgentItem>>({ method: 'GET', path: '/agent', query: { page: 1, limit: 100 } }, () => db.list({ page: 1, limit: 100, scope: 'roster' }) as Paged<BuiltinAgentItem>)
    .then(async result => {
      // Explicit catalog identities survive renames; user copies are not built-ins.
      const data = await Promise.all(result.data.filter(a => enterpriseIds.has(a.id)).map(async a => {
        if (a.active_config_snapshot) return a
        try {
          const config = await getComposer(a.id)
          return { ...a, active_config_snapshot: config.active_config_snapshot }
        } catch { return a }
      }))
      return { ...result, data, total: data.length }
    })
}

/** POST /agent 新建空白 Agent */
export const createAgent = (body: AgentInfoPayload) =>
  request<AgentDetail>({ method: 'POST', path: '/agent', body }, () => db.create(body))

/** GET /agent/{agent_id} 读取 Agent 详情（含 Web 应用站点） */
export const getAgent = (id: string) =>
  request<AgentDetail>({ method: 'GET', path: `/agent/${id}` }, () => db.detail(id))

/** PUT /agent/{agent_id} 编辑名称、角色、简介、图标 */
export const updateAgent = (id: string, body: AgentInfoPayload) =>
  request<AgentDetail>({ method: 'PUT', path: `/agent/${id}`, body }, () => db.update(id, body))

/** POST /agent/{agent_id}/copy 复制 Agent */
export const copyAgent = (id: string, body: AgentInfoPayload) =>
  request<AgentDetail>({ method: 'POST', path: `/agent/${id}/copy`, body }, () => db.copy(id, body))

/** DELETE /agent/{agent_id} 删除 Agent */
export const deleteAgent = (id: string) =>
  request<void>({ method: 'DELETE', path: `/agent/${id}` }, () => db.remove(id))

/** GET /apps/{app_id}/export 导出 DSL（YAML） */
export const exportAgentDsl = (appId: string) =>
  request<{ data: string }>({ method: 'GET', path: `/apps/${appId}/export`, query: { include_secret: false } }, () => db.exportDsl(appId))

/** POST /apps/imports 从 DSL 导入 */
export const importDsl = (body: AppImportPayload) =>
  request<AppImportResponse>({ method: 'POST', path: '/apps/imports', body }, () => db.importDsl(body))

/** POST /apps/imports/{import_id}/confirm 版本不一致时确认导入 */
export const confirmImport = (importId: string) =>
  request<AppImportResponse>({ method: 'POST', path: `/apps/imports/${importId}/confirm` }, () => db.confirmImport(importId))

/* ================= 配置（agent_soul） ================= */
export type ModelSettings = { temperature?: number | null, top_p?: number | null, max_tokens?: number | null, presence_penalty?: number | null, frequency_penalty?: number | null, [k: string]: unknown }
export type FallbackModel = { model: string, model_provider: string, plugin_id?: string, model_settings?: ModelSettings, first_chunk_timeout?: number }
export type SoulModel = { model: string, model_provider: string, plugin_id?: string, model_settings?: ModelSettings, fallback?: FallbackModel | null }

export type ToolProviderType = 'builtin' | 'api' | 'workflow' | 'mcp' | 'plugin'
export type RuntimeValue = string | number | boolean | null
export type SoulTool = {
  provider_type: ToolProviderType
  provider_id: string
  provider?: string | null
  tool_name: string
  name?: string | null
  description?: string | null
  runtime_parameters?: Record<string, RuntimeValue>
  credential_type?: 'api-key' | 'oauth2' | 'unauthorized'
  enabled?: boolean
}
export type EnvVariable = { key: string, value: string, type?: string | null, [k: string]: unknown }
export type CliTool = { id?: string | null, name: string, install_command?: string | null, description?: string | null, enabled?: boolean, env?: { variables?: EnvVariable[] } }

export type KnowledgeDatasetRef = { id: string, name: string }
export type MetadataCondition = { name: string, comparison_operator: string, value: string }
export type KnowledgeSet = {
  id: string
  name: string
  description?: string | null
  datasets: KnowledgeDatasetRef[]
  query: { mode: 'generated_query' | 'user_query', value?: string | null }
  retrieval: { mode: 'single' | 'multiple', top_k: number, score_threshold?: number | null, reranking_enable?: boolean, reranking_model?: { provider: string, model: string } | null }
  metadata_filtering?: { mode: 'disabled' | 'automatic' | 'manual', logical_operator?: 'and' | 'or', conditions?: MetadataCondition[] }
}

export type ConfigSkillRef = { name: string, description?: string, file_id?: string, size?: number | null, is_missing?: boolean, skill_id?: string | null }
export type ConfigFileRef = {
  name: string
  file_id?: string
  file_kind: 'tool_file' | 'upload_file'
  mime_type?: string | null
  size?: number | null
  is_missing?: boolean
  generated?: boolean
  /** RaccoonX 扩展：已存入的知识库（由「存入知识库」接口写入） */
  knowledge_base_id?: string | null
  knowledge_base_name?: string | null
}
/** RaccoonX 扩展：配置文件关联的知识库子库（文件存放位置，不参与检索配置） */
export type ConfigFileKbLink = { knowledge_base_id: string, name: string }

export type FileUploadFeature = { enabled?: boolean, allowed_file_types?: string[], allowed_file_upload_methods?: string[], number_limits?: number }
export type AppFeatures = {
  opening_statement?: string | null
  suggested_questions?: string[] | null
  suggested_questions_after_answer?: { enabled?: boolean } | null
  text_to_speech?: { enabled?: boolean, voice?: string | null, language?: string | null, autoPlay?: string | null } | null
  speech_to_text?: { enabled?: boolean } | null
  file_upload?: FileUploadFeature
  retriever_resource?: { enabled?: boolean } | null
}

export type AgentSoul = {
  prompt?: { system_prompt?: string }
  model?: SoulModel | null
  app_features?: AppFeatures
  config_skills?: ConfigSkillRef[]
  config_files?: ConfigFileRef[]
  /** RaccoonX 扩展：「文件」分区关联的知识库子库 */
  config_files_kb?: ConfigFileKbLink[]
  tools?: { dify_tools?: SoulTool[], cli_tools?: CliTool[] }
  knowledge?: { sets?: KnowledgeSet[], external_sets?: ExternalKnowledgeSet[] }
  env?: { variables?: EnvVariable[] }
  /** 对话开始前让用户填写的变量 */
  app_variables?: AppVariable[]
  config_note?: string
}
export type AppVariable = { variable: string, label?: string | null, type?: string | null, required?: boolean, default?: string | null, options?: string[] | null, [k: string]: unknown }

export type DraftSummary = { id: string, draft_type: 'debug_build' | 'draft', base_snapshot_id?: string | null, updated_at?: number | null }
export type SnapshotSummary = { id: string, version: number, display_version?: number | null, version_note?: string | null, summary?: string | null, created_at?: number | null, created_by?: string | null, created_by_name?: string | null }

export type ComposerResponse = {
  agent_soul: AgentSoul
  active_config_snapshot?: SnapshotSummary | null
  active_config_is_published: boolean
  draft?: DraftSummary | null
}

/** GET /agent/{agent_id}/composer 读取当前配置 */
export const getComposer = (id: string) =>
  request<ComposerResponse>({ method: 'GET', path: `/agent/${id}/composer` }, () => db.composer(id))

/** PUT /agent/{agent_id}/composer 自动保存配置到当前版本草稿 */
export const saveComposer = (id: string, agent_soul: AgentSoul) =>
  request<ComposerResponse>({ method: 'PUT', path: `/agent/${id}/composer`, body: { variant: 'agent_app', save_strategy: 'save_to_current_version', agent_soul } }, () => db.saveComposer(id, agent_soul))

/* ---------- 模型 ---------- */
export type ModelItem = { model: string, label: I18nText, model_type: string, features?: string[], status: 'active' | 'no-configure' | 'quota-exceeded' | 'disabled', model_properties?: { context_size?: number, mode?: string } }
export type ModelProviderGroup = { provider: string, plugin_id?: string, label: I18nText, icon_small?: I18nText | null, status: string, models: ModelItem[] }
export type ParameterRule = { name: string, label: I18nText, type: 'float' | 'int' | 'string' | 'boolean', default?: number | string | boolean, min?: number, max?: number, precision?: number, help?: I18nText, required?: boolean }

/** GET /workspaces/current/models/model-types/{type} 可用模型（llm / rerank） */
export const listModels = (type: 'llm' | 'rerank' = 'llm') =>
  request<{ data: ModelProviderGroup[] }>({ method: 'GET', path: `/workspaces/current/models/model-types/${type}` }, () => db.models(type))

/** GET /workspaces/current/model-providers/{provider}/models/parameter-rules 模型参数规则 */
export const getParameterRules = (provider: string, model: string) =>
  request<{ data: ParameterRule[] }>({ method: 'GET', path: `/workspaces/current/model-providers/${provider}/models/parameter-rules`, query: { model } }, () => db.parameterRules())

/* ---------- Skills ---------- */
export type LibrarySkill = { id: string, name: string, description: string, status: 'published' | 'draft', tags: { id: string, name: string }[], updated_at: number, author_name?: string }
export type Tag = { id: string, name: string, type: string, binding_count?: number }
export type SkillFileEntry = { name: string, path: string, type: 'dir' | 'file', size?: number | null }
export type SkillFilePreview = { path: string, type: 'dir' | 'file', entries?: SkillFileEntry[], text?: string | null, truncated?: boolean }

/** GET /workspaces/current/skills Skill 库 */
export const listLibrarySkills = (q: { page: number, keyword?: string, tag?: string[] }) =>
  request<Paged<LibrarySkill & {latest_published_version_id?:string;created_by_name?:string}>>({ method: 'GET', path: '/workspaces/current/skills', query: { limit: 20, page: q.page, keyword: q.keyword, tag: q.tag } }, () => db.librarySkills(q)).then(r=>({...r,data:r.data.map(s=>({...s,status:(s.latest_published_version_id?'published':s.status || 'draft') as 'published'|'draft',author_name:s.created_by_name||s.author_name}))}))

/** GET /tags?type=skill Skill 标签 */
export const listSkillTags = () =>
  request<Tag[]>({ method: 'GET', path: '/tags', query: { type: 'skill' } }, () => db.skillTags())

/** PUT /workspaces/current/agents/{agent_id}/skills 用 Skill 库条目整体替换 Agent 的 Skills */
export const setAgentSkills = (agentId: string, skill_ids: string[]) =>
  request<{ result: 'success' }>({ method: 'PUT', path: `/workspaces/current/agents/${agentId}/skills`, body: { skill_ids } }, () => db.setLibrarySkills(agentId, skill_ids))

/** POST /agent/{agent_id}/config/skills/upload 上传 skill.zip */
export const uploadSkill = (id: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request<ConfigSkillRef>({ method: 'POST', path: `/agent/${id}/config/skills/upload`, form }, () => db.uploadSkill(id, file.name))
}

/** GET /agent/{agent_id}/config/skills/{name}/files/preview Skill 包内文件预览 */
export const previewSkillFiles = (id: string, name: string, path = '') =>
  request<SkillFilePreview>({ method: 'GET', path: `/agent/${id}/config/skills/${encodeURIComponent(name)}/files/preview`, query: { path } }, () => db.previewSkill(name, path))

/** GET /agent/{agent_id}/config/skills/{name}/download Skill 包下载地址 */
export const downloadSkill = (id: string, name: string) =>
  request<{ url: string }>({ method: 'GET', path: `/agent/${id}/config/skills/${encodeURIComponent(name)}/download` }, () => ({ url: `data:text/plain,${encodeURIComponent(name)}` }))

/** DELETE /agent/{agent_id}/config/skills/{name} 移除 Skill */
export const deleteSkill = (id: string, name: string) =>
  request<void>({ method: 'DELETE', path: `/agent/${id}/config/skills/${encodeURIComponent(name)}` }, () => db.removeSkill(id, name))

/* ---------- 文件 ---------- */
export type UploadedFile = { id: string, name: string, size: number, extension?: string, mime_type?: string }
export type ConfigFilePreview = { text?: string | null, binary: boolean, truncated: boolean, size: number }

/** POST /files/upload 上传文件，返回 upload_file_id */
export const uploadFile = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request<UploadedFile>({ method: 'POST', path: '/files/upload', form }, () => db.uploadFile(file))
}

/** POST /agent/{agent_id}/config/files 把已上传文件加入 Agent 配置 */
export const addConfigFile = (id: string, upload_file_id: string) =>
  request<ConfigFileRef>({ method: 'POST', path: `/agent/${id}/config/files`, body: { upload_file_id } }, () => db.addConfigFile(id, upload_file_id))

/** GET /agent/{agent_id}/config/files/{name}/preview 文件预览 */
export const previewConfigFile = (id: string, name: string) =>
  request<ConfigFilePreview>({ method: 'GET', path: `/agent/${id}/config/files/${encodeURIComponent(name)}/preview` }, () => db.previewFile(id, name))

/** GET /agent/{agent_id}/config/files/{name}/download 文件下载地址 */
export const downloadConfigFile = (id: string, name: string) =>
  request<{ url: string }>({ method: 'GET', path: `/agent/${id}/config/files/${encodeURIComponent(name)}/download` }, () => ({ url: `data:text/plain,${encodeURIComponent(name)}` }))

/** DELETE /agent/{agent_id}/config/files/{name} 删除文件 */
export const deleteConfigFile = (id: string, name: string) =>
  request<void>({ method: 'DELETE', path: `/agent/${id}/config/files/${encodeURIComponent(name)}` }, () => db.removeFile(id, name))

/**
 * POST /agent/{agent_id}/config/files/{name}/save-to-kb 把配置文件存入知识库子库（RaccoonX 扩展）
 * 请求只带 knowledge_base_id；kbName 仅供 mock 回显。返回更新后的文件（含 knowledge_base_id / knowledge_base_name）
 */
export const saveConfigFileToKb = (id: string, name: string, knowledge_base_id: string, kbName: string) =>
  request<ConfigFileRef>({ method: 'POST', path: `/agent/${id}/config/files/${encodeURIComponent(name)}/save-to-kb`, body: { knowledge_base_id } }, () => db.saveFileToKb(id, name, knowledge_base_id, kbName))

/* ---------- 工具 ---------- */
export type ToolParameter = { name: string, label: I18nText, type: 'string' | 'number' | 'boolean' | 'select' | 'secret-input', required?: boolean, form: 'form' | 'llm', default?: RuntimeValue, human_description?: I18nText, options?: { value: string, label: I18nText }[] }
export type ToolAction = { name: string, label: I18nText, description: I18nText, parameters?: ToolParameter[] }
export type ToolProvider = { id: string, name: string, author: string, label: I18nText, description: I18nText, icon: string, type: ToolProviderType, is_team_authorization: boolean, tools: ToolAction[] }
export type ToolCatalogKind = 'builtin' | 'api' | 'workflow' | 'mcp'

/** GET /workspaces/current/tools/{builtin|api|workflow|mcp} 工具目录 */
export const listToolProviders = (kind: ToolCatalogKind) =>
  request<ToolProvider[]>({ method: 'GET', path: `/workspaces/current/tools/${kind}` }, () => db.toolProviders(kind))

/* ---------- 知识库 ---------- */
export type Dataset = { id: string, name: string, description?: string | null, document_count: number, word_count: number, indexing_technique?: string | null }

/** GET /datasets 知识库列表 */
export const listDatasets = (page = 1, limit = 30) =>
  request<Paged<Dataset>>({ method: 'GET', path: '/datasets', query: { page, limit } }, () => db.datasets(page, limit))

/* ================= 构建对话 / 预览对话 ================= */
export type ChatPayload = { query: string, conversation_id?: string | null, inputs?: Record<string, unknown>, files?: unknown[], response_mode: 'streaming', draft_type?: 'debug_build' }
export type BuildDraft = { draft: DraftSummary | null, agent_soul?: AgentSoul | null }

/** POST /agent/{agent_id}/build-draft/checkout 开始一轮构建，签出构建草稿 */
export const checkoutBuildDraft = async (id: string) => {
  const checked = await request<{ draft: DraftSummary, agent_soul?: AgentSoul }>({ method: 'POST', path: `/agent/${id}/build-draft/checkout` }, () => db.checkoutBuild(id))
  // Existing build drafts survive normal configuration edits. Repair only a missing
  // model; preserve the user's pending prompt, files, tools and other changes.
  const build = checked.agent_soul ? checked : await getBuildDraft(id)
  if (build.agent_soul && !build.agent_soul.model) {
    const current = await getComposer(id)
    if (!current.agent_soul.model) throw new Error('请先选择模型并保存，再开始构建。')
    await request<BuildDraft>({ method: 'PUT', path: `/agent/${id}/build-draft`, body: {
      variant: 'agent_app', save_strategy: 'save_to_current_version',
      agent_soul: { ...build.agent_soul, model: current.agent_soul.model },
    } }, () => ({ ...build, agent_soul: { ...build.agent_soul!, model: current.agent_soul.model } }))
  }
  return checked
}

/** GET /agent/{agent_id}/build-draft 读取构建草稿（待应用的配置） */
export const getBuildDraft = (id: string) =>
  request<BuildDraft>({ method: 'GET', path: `/agent/${id}/build-draft` }, () => db.buildDraft(id))

/** DELETE /agent/{agent_id}/build-draft 放弃构建草稿 */
export const discardBuildDraft = (id: string) =>
  request<void>({ method: 'DELETE', path: `/agent/${id}/build-draft` }, () => db.discardBuild(id))

/** POST /agent/{agent_id}/build-chat/finalize 结束构建对话 */
export const finalizeBuildChat = (id: string) =>
  request<{ result: 'success' }>({ method: 'POST', path: `/agent/${id}/build-chat/finalize` }, () => ({ result: 'success' as const }))

/** POST /agent/{agent_id}/build-draft/apply 把构建草稿应用到配置 */
export const applyBuildDraft = (id: string) =>
  request<ComposerResponse>({ method: 'POST', path: `/agent/${id}/build-draft/apply` }, () => db.applyBuild(id))

/** POST /agent/{agent_id}/chat-messages 流式对话（构建时带 draft_type: debug_build） */
export const streamChat = (id: string, body: ChatPayload, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) =>
  stream({ method: 'POST', path: `/agent/${id}/chat-messages`, body, signal }, onEvent, () => db.chatStream(id, body))

/** POST /agent/{agent_id}/chat-messages/{task_id}/stop 停止生成 */
export const stopChat = (id: string, taskId: string) =>
  request<{ result: 'success' }>({ method: 'POST', path: `/agent/${id}/chat-messages/${taskId}/stop` }, () => ({ result: 'success' as const }))

/** GET /agent/{agent_id}/chat-messages/{message_id}/suggested-questions 下一步问题建议 */
export const getSuggestedQuestions = (id: string, messageId: string) =>
  request<{ data: string[] }>({ method: 'GET', path: `/agent/${id}/chat-messages/${messageId}/suggested-questions` }, () => db.suggested(id))

/** POST /agent/{agent_id}/audio-to-text 语音转文字 */
export const audioToText = (id: string, audio: Blob) => {
  const form = new FormData()
  form.append('file', audio, 'voice.webm')
  return request<{ text: string }>({ method: 'POST', path: `/agent/${id}/audio-to-text`, form }, () => ({ text: '帮我查一下 X3 路由器的退换货政策' }))
}

/** POST /agent/{agent_id}/debug-conversation/refresh 开启新的调试会话 */
export const refreshDebugConversation = (id: string) =>
  request<{ debug_conversation_id: string }>({ method: 'POST', path: `/agent/${id}/debug-conversation/refresh` }, () => db.refreshConversation(id))

/* ---------- 工作目录（沙箱） ---------- */
export type SandboxEntry = { name: string, type: 'dir' | 'file' | 'other' | 'symlink', size?: number | null, mtime?: number | null }
export type SandboxCaller = { caller_type: 'conversation' | 'build_draft', caller_id: string }

/** GET /agent/{agent_id}/sandbox/files 列出工作目录 */
export const listSandboxFiles = (id: string, caller: SandboxCaller, path: string) =>
  request<{ data: SandboxEntry[] }>({ method: 'GET', path: `/agent/${id}/sandbox/files`, query: { ...caller, path } }, () => db.sandboxList(path))

/** GET /agent/{agent_id}/sandbox/files/read 读取工作目录文件 */
export const readSandboxFile = (id: string, caller: SandboxCaller, path: string) =>
  request<{ content: string, truncated?: boolean, binary?: boolean }>({ method: 'GET', path: `/agent/${id}/sandbox/files/read`, query: { ...caller, path } }, () => db.sandboxRead(path))

/** POST /agent/{agent_id}/sandbox/files/download 下载工作目录文件 */
export const downloadSandboxFile = (id: string, caller: SandboxCaller, path: string) =>
  request<{ url: string }>({ method: 'POST', path: `/agent/${id}/sandbox/files/download`, body: { ...caller, path } }, () => ({ url: `data:text/plain,${encodeURIComponent(path)}` }))

/* ================= 发布 / 版本 ================= */
export type ReferencingWorkflow = { app_id: string, app_name: string, app_mode: string, app_icon?: string | null, app_updated_at?: number | null, workflow_id: string, workflow_version: string, node_ids?: string[] }
export type SnapshotDetail = SnapshotSummary & { config_snapshot: AgentSoul }

/** GET /agent/{agent_id}/referencing-workflows 引用此 Agent 的工作流 */
export const listReferencingWorkflows = (id: string) =>
  request<{ data: ReferencingWorkflow[] }>({ method: 'GET', path: `/agent/${id}/referencing-workflows` }, () => db.referencing(id))

/** POST /agent/{agent_id}/publish 发布当前配置为新版本 */
export const publishAgent = (id: string, version_note: string) =>
  request<{ result: 'success', active_config_snapshot_id: string }>({ method: 'POST', path: `/agent/${id}/publish`, body: { version_note } }, () => db.publish(id, version_note))

/** GET /agent/{agent_id}/versions 版本历史 */
export const listVersions = (id: string) =>
  request<{ data: SnapshotSummary[] }>({ method: 'GET', path: `/agent/${id}/versions` }, () => db.versions(id))

/** GET /agent/{agent_id}/versions/{version_id} 版本详情（只读） */
export const getVersion = (id: string, versionId: string) =>
  request<SnapshotDetail>({ method: 'GET', path: `/agent/${id}/versions/${versionId}` }, () => db.version(id, versionId))

/** POST /agent/{agent_id}/versions/{version_id}/restore 还原到某个版本 */
export const restoreVersion = (id: string, versionId: string) =>
  request<{ result: 'success', active_config_snapshot_id: string }>({ method: 'POST', path: `/agent/${id}/versions/${versionId}/restore` }, () => db.restore(id, versionId))

/* ================= 访问 ================= */
export type ApiAccess = {
  enabled: boolean
  access_ready: boolean
  service_api_base_url: string
  chat_endpoint: string
  stop_endpoint: string
  messages_endpoint: string
  conversations_endpoint: string
  files_upload_endpoint: string
  parameters_endpoint: string
  api_key_count: number
  api_rpm: number
  api_rph: number
  streaming_only?: boolean
}
export type ApiKey = { id: string, token: string, created_at?: number | null, last_used_at?: number | null }

/** POST /apps/{app_id}/site-enable 开关 Web 应用 */
export const setSiteEnabled = (appId: string, enable_site: boolean) =>
  request<{ id: string, enable_site: boolean }>({ method: 'POST', path: `/apps/${appId}/site-enable`, body: { enable_site } }, () => db.siteEnable(appId, enable_site))

/** POST /apps/{app_id}/site/access-token-reset 重新生成访问地址 */
export const resetSiteToken = (appId: string) =>
  request<AppSite>({ method: 'POST', path: `/apps/${appId}/site/access-token-reset` }, () => db.resetToken(appId))

/** POST /apps/{app_id}/site 品牌设置 */
export const updateSite = (appId: string, body: AppSitePayload) =>
  request<AppSite>({ method: 'POST', path: `/apps/${appId}/site`, body }, () => db.updateSite(appId, body))

/** GET /agent/{agent_id}/api-access 后端服务 API 信息 */
export const getApiAccess = (id: string) =>
  request<ApiAccess>({ method: 'GET', path: `/agent/${id}/api-access` }, () => db.apiAccess(id))

/** POST /agent/{agent_id}/api-enable 开关后端服务 API */
export const setApiEnabled = (id: string, enable_api: boolean) =>
  request<{ result: 'success' }>({ method: 'POST', path: `/agent/${id}/api-enable`, body: { enable_api } }, () => db.apiEnable(id, enable_api))

/** GET /agent/{agent_id}/api-keys API Key 列表 */
export const listApiKeys = (id: string) =>
  request<{ data: ApiKey[] }>({ method: 'GET', path: `/agent/${id}/api-keys` }, () => db.apiKeys(id))

/** POST /agent/{agent_id}/api-keys 新建 API Key（完整密钥只返回这一次） */
export const createApiKey = (id: string) =>
  request<ApiKey>({ method: 'POST', path: `/agent/${id}/api-keys` }, () => db.createKey(id))

/** DELETE /agent/{agent_id}/api-keys/{api_key_id} 删除 API Key */
export const deleteApiKey = (id: string, keyId: string) =>
  request<void>({ method: 'DELETE', path: `/agent/${id}/api-keys/${keyId}` }, () => db.deleteKey(id, keyId))

/* ---------- 消息渠道（RaccoonX 扩展接口） ---------- */
export type ChannelType = 'wecom' | 'feishu' | 'dingtalk' | 'wechat'
export type MessageChannel = { id: string, channel_type: ChannelType, name: string, enabled: boolean, revision: number, status: 'connected' | 'pending' | 'error' | 'stopped', bound_account?: string | null, created_at: number, error?: string }
export type ChannelQr = { ticket: string, qr_url: string, expires_at: number }
export type ChannelQrPoll = { status: 'waiting' | 'scanned' | 'confirmed' | 'expired', channel?: MessageChannel | null }
type RawMessageChannel = { id: string, agent_id?: string, kind?: ChannelType, channel_type?: ChannelType, name: string, enabled: boolean, revision: number, status: string, error?: string, account_id?: string, bound_account?: string | null, created_at: number }
const channelView = (c: RawMessageChannel): MessageChannel => ({ id: c.id, channel_type: c.kind ?? c.channel_type!, name: c.name, enabled: c.enabled, revision: c.revision, status: c.account_id || c.bound_account ? (c.status === 'error' ? 'error' : 'connected') : 'pending', bound_account: c.account_id ?? c.bound_account ?? null, created_at: c.created_at, error: c.error })

/** GET /message-channels/agents/{agent_id} 消息渠道列表 */
export const listChannels = (id: string) =>
  request<{ channels: RawMessageChannel[] }>({ method: 'GET', path: `/message-channels/agents/${id}` }, () => ({ channels: db.channels(id).data as unknown as RawMessageChannel[] })).then(r => ({ data: r.channels.map(channelView) }))

/** POST /message-channels/agents/{agent_id} 新建渠道 */
export const createChannel = (id: string, body: { channel_type: ChannelType, name: string }) =>
  request<{ channel: RawMessageChannel }>({ method: 'POST', path: `/message-channels/agents/${id}`, body: { kind: body.channel_type, name: body.name } }, () => ({ channel: db.createChannel(id, body) as unknown as RawMessageChannel })).then(r => channelView(r.channel))

/** POST /message-channels/agents/{agent_id}/{channel_id} 配置平台凭据和访问范围 */
export const configureChannel = (id: string, cid: string, body: { revision: number, credentials: Record<string, string>, settings: { access: 'restricted' | 'app_members', allowed_users: string[], allowed_groups: string[], groups: boolean } }) =>
  request<{ channel: RawMessageChannel }>({ method: 'POST', path: `/message-channels/agents/${id}/${cid}`, body }, () => ({ channel: db.channelConfigure(id, cid) as unknown as RawMessageChannel })).then(r => channelView(r.channel))

/** POST /message-channels/agents/{agent_id}/{channel_id}/enabled 启用 / 停用渠道 */
export const setChannelEnabled = (id: string, cid: string, body: { revision: number, enabled: boolean }) =>
  request<{ channel: RawMessageChannel }>({ method: 'POST', path: `/message-channels/agents/${id}/${cid}/enabled`, body }, () => ({ channel: db.channelEnable(id, cid, body.enabled) as unknown as RawMessageChannel })).then(r => channelView(r.channel))

/** DELETE /message-channels/agents/{agent_id}/{channel_id} 删除渠道 */
export const deleteChannel = (id: string, cid: string, revision: number) =>
  request<void>({ method: 'DELETE', path: `/message-channels/agents/${id}/${cid}`, body: { revision } }, () => db.deleteChannel(id, cid))

/** POST /message-channels/agents/{agent_id}/{channel_id}/qr 获取微信绑定二维码 */
export const getChannelQr = (id: string, cid: string) =>
  request<{ ticket: string, svg: string, expires_in: number }>({ method: 'POST', path: `/message-channels/agents/${id}/${cid}/qr` }, () => { const q = db.channelQr(cid) as unknown as { ticket: string, svg?: string, qr_url?: string, expires_at?: number }; return { ticket: q.ticket, svg: q.svg ?? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><text x="50" y="54" text-anchor="middle" font-size="8">扫码绑定</text></svg>`, expires_in: Math.max(1, (q.expires_at ?? Date.now() / 1000 + 120) - Date.now() / 1000) } }).then(r => ({ ticket: r.ticket, qr_url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`, expires_at: Date.now() / 1000 + r.expires_in }))

/** POST /message-channels/agents/{agent_id}/{channel_id}/qr/poll 轮询微信扫码结果 */
export const pollChannelQr = (id: string, cid: string, ticket: string) =>
  request<{ status: 'wait' | 'scaned' | 'confirmed' | 'expired' }>({ method: 'POST', path: `/message-channels/agents/${id}/${cid}/qr/poll`, body: { ticket } }, () => db.channelPoll(id, cid) as unknown as { status: 'wait' | 'scaned' | 'confirmed' | 'expired' }).then(r => ({ status: (r.status === 'wait' ? 'waiting' : r.status === 'scaned' ? 'scanned' : r.status) as ChannelQrPoll['status'] }))

/* ================= 日志 ================= */
export type LogSource = { id: string, type: 'webapp' | 'workflow', app_id: string, app_name: string, workflow_id?: string | null, node_id?: string | null }
export type LogConversation = {
  id: string
  conversation_id: string
  title?: string | null
  source?: LogSource | null
  end_user_id?: string | null
  message_count: number
  user_rate?: number | null
  operation_rate?: number | null
  unread: boolean
  status: 'failed' | 'paused' | 'success'
  created_at?: number | null
  updated_at?: number | null
}
export type LogFeedback = { rating: 'like' | 'dislike', content?: string | null, from_source: 'admin' | 'user' }
export type LogMessage = {
  id: string
  message_id: string
  conversation_id: string
  query: string
  answer: string
  error?: string | null
  status: string
  latency: number
  message_tokens: number
  answer_tokens: number
  total_tokens: number
  total_price: string
  currency: string
  feedbacks?: LogFeedback[]
  knowledge_retrieval?: string[]
  created_at?: number | null
}
export type LogQuery = { page: number, limit: number, keyword?: string, sources?: string[], start?: string, end?: string, sort_by?: 'created_at' | 'updated_at', sort_order?: 'asc' | 'desc' }

/** GET /agent/{agent_id}/log-sources 日志来源（Web 应用 / 工作流） */
export const listLogSources = (id: string) =>
  request<{ data: LogSource[], groups: { type: 'webapp' | 'workflow', label: string, sources: LogSource[] }[] }>({ method: 'GET', path: `/agent/${id}/log-sources` }, () => db.logSources(id))

/** GET /agent/{agent_id}/logs 会话日志 */
export const listLogs = (id: string, q: LogQuery) =>
  request<Paged<LogConversation>>({ method: 'GET', path: `/agent/${id}/logs`, query: q }, () => db.logs(id, q))

/** GET /agent/{agent_id}/logs/{conversation_id}/messages 会话消息 */
export const listLogMessages = (id: string, conversationId: string, page = 1, limit = 50) =>
  request<Paged<LogMessage>>({ method: 'GET', path: `/agent/${id}/logs/${conversationId}/messages`, query: { page, limit } }, () => db.logMessages(id, conversationId))

/** POST /agent/{agent_id}/feedbacks 管理员标注（赞 / 踩 / 备注） */
export const sendFeedback = (id: string, body: { message_id: string, rating: 'like' | 'dislike' | null, content?: string | null }) =>
  request<{ result: 'success' }>({ method: 'POST', path: `/agent/${id}/feedbacks`, body }, () => db.feedback(id, body))

/* ================= 监控 ================= */
export type StatPoint = { date: string, value: number }
export type StatSummary = {
  total_messages: number
  total_end_users: number
  total_conversations: number
  average_session_interactions: number
  tokens_per_second: number
  user_satisfaction_rate: number
  total_tokens: number
  total_price: string
  currency: string
  average_response_time: number
}
export type StatKey = 'daily_messages' | 'daily_end_users' | 'daily_conversations' | 'average_session_interactions' | 'tokens_per_second' | 'user_satisfaction_rate' | 'token_usage' | 'average_response_time'
/** 页面使用的统一形状 */
export type StatCharts = Partial<Record<StatKey, StatPoint[]>>
/** 契约原始形状：每个图表的数值字段名不同 */
export type StatChartsRaw = {
  daily_messages?: { date: string, message_count: number }[]
  daily_end_users?: { date: string, terminal_count: number }[]
  daily_conversations?: { date: string, conversation_count: number }[]
  average_session_interactions?: { date: string, interactions: number }[]
  tokens_per_second?: { date: string, tps: number }[]
  user_satisfaction_rate?: { date: string, rate: number }[]
  token_usage?: { date: string, token_count: number, total_price: string, currency: string }[]
  average_response_time?: { date: string, latency: number }[]
}
const VALUE_FIELD: Record<StatKey, string> = { daily_messages: 'message_count', daily_end_users: 'terminal_count', daily_conversations: 'conversation_count', average_session_interactions: 'interactions', tokens_per_second: 'tps', user_satisfaction_rate: 'rate', token_usage: 'token_count', average_response_time: 'latency' }
const normalizeCharts = (raw: StatChartsRaw): StatCharts => Object.fromEntries(
  (Object.keys(VALUE_FIELD) as StatKey[]).filter(k => raw[k]).map(k => [k, (raw[k] as Record<string, unknown>[]).map(p => ({ date: String(p.date), value: Number(p[VALUE_FIELD[k]] ?? 0) }))]),
)

/** GET /agent/{agent_id}/statistics/summary 监控汇总与每日趋势（charts 在这里统一成 {date, value}） */
export const getStatistics = (id: string, q: { start?: string, end?: string, source?: string }) =>
  request<{ summary: StatSummary, charts: StatChartsRaw, source: string }>({ method: 'GET', path: `/agent/${id}/statistics/summary`, query: q }, () => db.statistics(id, q))
    .then(r => ({ ...r, charts: normalizeCharts(r.charts) }))
