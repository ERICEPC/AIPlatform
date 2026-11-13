/*
  集成模块类型。字段名与原 RaccoonX 控制台接口一致（/console/api 下的 workspaces/current/... 等）。
  多语言文本沿用原接口的 I18nText（zh_Hans / en_US），页面用 tr() 取中文。
*/

export type I18nText = { zh_Hans?: string, en_US: string }
export const tr = (t?: I18nText | string | null) => (typeof t === 'string' ? t : t?.zh_Hans || t?.en_US || '')

/* ---------------- 插件通用 ---------------- */
export type PluginCategory = 'model' | 'tool' | 'datasource' | 'trigger' | 'agent-strategy' | 'extension'
export type PluginSource = 'marketplace' | 'github' | 'package' | 'remote'
export type PermissionLevel = 'everyone' | 'admins' | 'noone'

export type PluginPermission = { install_permission: PermissionLevel, debug_permission: PermissionLevel }
export type DebugKey = { host: string, key: string, port: number }

/** 插件图标：本前端不加载外部图片，用字母 + 底色块表示（live 模式下 icon 为后端返回的地址） */
export type PluginIcon = string

export type PluginDeclaration = {
  plugin_unique_identifier: string
  version: string
  author: string
  icon: PluginIcon
  name: string
  category: PluginCategory
  label: I18nText
  description: I18nText
  created_at: string
  tags: string[]
  verified?: boolean
  /** 扩展插件：端点设置项 */
  endpoint?: { settings: CredentialFormSchema[], endpoints: { path: string, method: string, hidden?: boolean }[] }
  /** 工具插件：动作数 */
  tool?: { identity: { name: string } }
}

export type PluginMeta = { repo: string, version: string, package: string }

export type PluginDetail = {
  id: string
  created_at: string
  updated_at: string
  name: string
  plugin_id: string
  plugin_unique_identifier: string
  declaration: PluginDeclaration
  installation_id: string
  tenant_id: string
  endpoints_setups: number
  endpoints_active: number
  version: string
  latest_version: string
  latest_unique_identifier: string
  source: PluginSource
  meta?: PluginMeta
  status: 'active' | 'deleted'
  deprecated_reason: string
  alternative_plugin_id: string
}

/** 插件市场条目 */
export type MarketplacePlugin = {
  type: 'plugin' | 'bundle'
  category: PluginCategory
  org: string
  name: string
  plugin_id: string
  version: string
  latest_version: string
  latest_package_identifier: string
  icon: PluginIcon
  label: I18nText
  brief: I18nText
  install_count: number
  tags: { name: string }[]
  verified: boolean
}

export type InstallResponse = { all_installed: boolean, task_id: string }

export type TaskStatus = 'running' | 'success' | 'failed'
export type PluginTaskItem = {
  plugin_unique_identifier: string
  plugin_id: string
  status: TaskStatus
  message: string
  icon: PluginIcon
  labels: I18nText
}
export type PluginTask = {
  id: string
  created_at: string
  updated_at: string
  status: TaskStatus
  total_plugins: number
  completed_plugins: number
  plugins: PluginTaskItem[]
}

export type UploadResponse = { unique_identifier: string, manifest: PluginDeclaration }

export type AutoUpgradeStrategy = 'disabled' | 'fix_only' | 'latest'
export type AutoUpgradeMode = 'all' | 'exclude' | 'partial'
export type AutoUpgradeSetting = {
  strategy_setting: AutoUpgradeStrategy
  /** UTC 当天的秒数 */
  upgrade_time_of_day: number
  upgrade_mode: AutoUpgradeMode
  exclude_plugins: string[]
  include_plugins: string[]
}

/* ---------------- 凭据表单（模型 / 工具 / 数据来源 / 触发器 / 端点通用） ---------------- */
export type FormFieldType = 'text-input' | 'secret-input' | 'select' | 'radio' | 'boolean' | 'number'
export type ShowOn = { variable: string, value: string }
export type CredentialFormSchema = {
  variable: string
  /** 工具/端点接口使用 name，模型接口使用 variable；mock 两者都给 */
  name?: string
  label: I18nText
  type: FormFieldType
  required: boolean
  default?: string | number | boolean
  options?: { label: I18nText, value: string, show_on?: ShowOn[] }[]
  placeholder?: I18nText
  help?: I18nText
  url?: string
  show_on?: ShowOn[]
  max_length?: number
  min?: number
  max?: number
}
export type FormValues = Record<string, string | number | boolean | undefined>

export type CredentialVisibility = 'only_me' | 'all_team_members'
export type CredentialType = 'api-key' | 'oauth2'
export type PluginCredential = {
  id: string
  name: string
  provider: string
  credential_type: CredentialType
  is_default: boolean
  credentials?: FormValues
  visibility?: CredentialVisibility
  created_by?: string
}
export type CredentialInfo = {
  supported_credential_types: CredentialType[]
  credentials: PluginCredential[]
  is_oauth_custom_client_enabled: boolean
  allow_custom_token?: boolean
}
export type OAuthClientSchema = {
  schema: CredentialFormSchema[]
  is_oauth_custom_client_enabled: boolean
  is_system_oauth_params_exists?: boolean
  client_params?: FormValues
  redirect_uri?: string
}
export type OAuthUrl = { authorization_url: string, state: string, context_id: string }

/* ---------------- 模型供应商 ---------------- */
export type ModelType = 'llm' | 'text-embedding' | 'rerank' | 'speech2text' | 'tts' | 'moderation'
export type ConfigurationMethod = 'predefined-model' | 'customizable-model'
export type PreferredProviderType = 'system' | 'custom'
export type AvailableCredential = { credential_id: string, credential_name: string }

export type ModelProvider = {
  provider: string
  label: I18nText
  description?: I18nText
  icon_small: PluginIcon
  supported_model_types: ModelType[]
  configurate_methods: ConfigurationMethod[]
  provider_credential_schema: { credential_form_schemas: CredentialFormSchema[] }
  model_credential_schema?: { model: { label: I18nText, placeholder: I18nText }, credential_form_schemas: CredentialFormSchema[] }
  preferred_provider_type: PreferredProviderType
  custom_configuration: {
    status: 'active' | 'no-configure'
    current_credential_id?: string
    current_credential_name?: string
    available_credentials?: AvailableCredential[]
  }
  system_configuration: { enabled: boolean, current_quota_type?: string, quota_configurations: { quota_type: string, quota_used: number, quota_limit: number }[] }
  /** RaccoonX：供应商所属插件，用于版本、移除、插件信息 */
  plugin_id: string
  plugin_unique_identifier: string
  installation_id: string
  version: string
  latest_version: string
  source: PluginSource
  author: string
}

export type ModelFeature = 'tool-call' | 'multi-tool-call' | 'agent-thought' | 'stream-tool-call' | 'vision' | 'video' | 'document' | 'audio' | 'structured-output'
export type ModelItem = {
  model: string
  label: I18nText
  model_type: ModelType
  features?: ModelFeature[]
  fetch_from: ConfigurationMethod
  status: 'active' | 'no-configure' | 'quota-exceeded' | 'disabled' | 'credential-removed'
  model_properties: { context_size?: number, mode?: string }
  deprecated?: boolean
  load_balancing_enabled: boolean
  has_invalid_load_balancing_configs?: boolean
}

export type DefaultModel = { model: string, model_type: ModelType, provider: { provider: string, icon_small: PluginIcon, label: I18nText } } | null
export type DefaultModelSetting = { model_type: ModelType, provider: string, model: string }

export type LoadBalancingConfig = { id?: string, name: string, enabled: boolean, credentials?: FormValues, credential_id?: string, in_cooldown?: boolean, ttl?: number }
export type ModelLoadBalancing = { enabled: boolean, configs: LoadBalancingConfig[] }
export type ModelCredentialDetail = { credentials: FormValues, load_balancing: ModelLoadBalancing, available_credentials: AvailableCredential[] }

/* ---------------- 工具 ---------------- */
export type ToolParameter = { name: string, label: I18nText, type: string, required: boolean, human_description?: I18nText, llm_description?: string, form: 'llm' | 'form' | 'schema' }
export type ToolAction = { name: string, author: string, label: I18nText, description: I18nText, parameters: ToolParameter[], labels?: string[] }

/** 工具集合（builtin / api / workflow / mcp 通用） */
export type ToolCollection = {
  id: string
  name: string
  author: string
  description: I18nText
  icon: PluginIcon
  label: I18nText
  type: 'builtin' | 'api' | 'workflow' | 'mcp'
  team_credentials: FormValues
  is_team_authorization: boolean
  allow_delete: boolean
  labels: string[]
  plugin_id?: string
  tools: ToolAction[]
  updated_at?: number
  /* MCP */
  server_url?: string
  server_identifier?: string
  timeout?: number
  sse_read_timeout?: number
  headers?: Record<string, string>
  masked_headers?: Record<string, string>
  is_dynamic_registration?: boolean
  authentication?: { client_id: string, client_secret: string } | null
  /** RaccoonX：MCP 调用时是否转发用户身份 */
  identity_mode?: 'off' | 'idp_token'
  /** RaccoonX：连接方式；缺省按 server_url 视为 streamable_http */
  transport?: McpTransport
  /** RaccoonX：transport = stdio 时在服务端启动的命令 */
  command?: string
  args?: string[]
  /** RaccoonX：stdio 环境变量，读取时值已脱敏 */
  masked_env?: Record<string, string>
  /** RaccoonX：从哪个工具导入（手动添加时为空） */
  imported_from?: McpImportSource | 'json'
}

/** MCP 连接方式：远程 Streamable HTTP / SSE，或在服务端以命令启动（stdio） */
export type McpTransport = 'streamable_http' | 'sse' | 'stdio'
/** 可导入 MCP 配置的本机工具 */
export type McpImportSource = 'claude_code' | 'kiro' | 'codex' | 'cursor'

export type ToolPluginList = { plugins: PluginDetail[], builtin_tools: ToolCollection[], has_more: boolean }

export type McpPayload = {
  name: string
  /** transport 为 streamable_http / sse 时必填 */
  server_url?: string
  /** RaccoonX 扩展，缺省 streamable_http */
  transport?: McpTransport
  /** transport = stdio 时必填 */
  command?: string
  args?: string[]
  /** stdio 环境变量；编辑时未改动的变量传脱敏值，后端保留原值 */
  env?: Record<string, string>
  icon_type: 'emoji' | 'image'
  icon: string
  icon_background?: string | null
  server_identifier: string
  timeout?: number
  sse_read_timeout?: number
  headers?: Record<string, string>
  authentication?: { client_id: string, client_secret: string } | null
  is_dynamic_registration?: boolean
  identity_mode?: 'off' | 'idp_token'
}

export type WorkflowToolParameter = { name: string, description: string, form: 'llm' | 'form', required: boolean, type: string }
export type WorkflowToolDetail = {
  workflow_app_id: string
  workflow_tool_id: string
  name: string
  label: string
  description: string
  icon: { content: string, background: string }
  parameters: WorkflowToolParameter[]
  output_schema: { type: string, properties: Record<string, { type: string, description?: string }> }
  privacy_policy: string
  labels: string[]
  synced: boolean
}

export type ApiAuthType = 'none' | 'api_key_header' | 'api_key_query'
export type ApiKeyPrefix = 'basic' | 'bearer' | 'custom'
export type ApiCredentials = {
  auth_type: ApiAuthType
  api_key_header?: string
  api_key_value?: string
  api_key_header_prefix?: ApiKeyPrefix
  api_key_query_param?: string
}
export type ApiParamSchema = { operation_id: string, summary: string, server_url: string, method: string, path?: string, parameters: { name: string, type: string, required: boolean, label: I18nText, human_description?: I18nText }[] }
export type ApiToolProvider = {
  provider: string
  original_provider?: string
  credentials: ApiCredentials
  icon: { content: string, background: string }
  schema_type: 'openapi' | 'swagger' | 'openai_plugin' | ''
  schema: string
  privacy_policy: string
  custom_disclaimer: string
  labels: string[]
  tools?: ApiParamSchema[]
}
export type ApiTestPayload = { provider_name: string, tool_name: string, credentials: ApiCredentials, schema_type: string, schema: string, parameters: Record<string, string> }

/* ---------------- 数据来源 ---------------- */
export type DatasourceCredential = { id: string, name: string, type: CredentialType, is_default: boolean, credential: FormValues, avatar_url?: string }
export type DatasourceAuth = {
  author: string
  provider: string
  plugin_id: string
  plugin_unique_identifier: string
  icon: PluginIcon
  name: string
  label: I18nText
  description: I18nText
  credential_schema: CredentialFormSchema[]
  oauth_schema?: { client_schema: CredentialFormSchema[], credentials_schema: CredentialFormSchema[], is_oauth_custom_client_enabled: boolean, is_system_oauth_params_exists: boolean, redirect_uri: string }
  credentials_list: DatasourceCredential[]
}

/* ---------------- 触发器 ---------------- */
export type TriggerCredentialType = 'api-key' | 'oauth2' | 'unauthorized'
export type TriggerCreationMethod = 'APIKEY' | 'OAUTH' | 'MANUAL'
export type TriggerEvent = { name: string, identity: { label: I18nText }, description: I18nText, parameters: ToolParameter[], output_schema: Record<string, unknown> }
export type TriggerProvider = {
  plugin_id: string
  plugin_unique_identifier: string
  name: string
  author: string
  label: I18nText
  description: I18nText
  icon: PluginIcon
  tags: string[]
  events: TriggerEvent[]
  supported_creation_methods: TriggerCreationMethod[]
  subscription_constructor: { credentials_schema: CredentialFormSchema[], parameters: CredentialFormSchema[] }
  subscription_schema: CredentialFormSchema[]
}
export type TriggerSubscription = {
  id: string
  name: string
  provider: string
  credential_type: TriggerCredentialType
  credentials: FormValues
  endpoint: string
  parameters: FormValues
  properties: FormValues
  workflows_in_use: number
}
export type TriggerLog = {
  id: string
  endpoint: string
  request: { method: string, url: string, headers: Record<string, string>, data: string }
  response: { status_code: number, headers: Record<string, string>, data: string }
  created_at: string
}
export type TriggerOAuthConfig = {
  configured: boolean
  custom_configured: boolean
  custom_enabled: boolean
  redirect_uri: string
  oauth_client_schema: CredentialFormSchema[]
  params: { client_id: string, client_secret: string }
  system_configured: boolean
}

/* ---------------- Agent 策略 ---------------- */
export type StrategyParameter = { name: string, label: I18nText, type: string, required: boolean, help?: I18nText, default?: unknown }
export type AgentStrategy = { identity: { name: string, label: I18nText, author: string }, description: I18nText, parameters: StrategyParameter[], output_schema: Record<string, { type: string, description?: string }> }
export type AgentStrategyProvider = {
  provider: string
  plugin_id: string
  plugin_unique_identifier: string
  declaration: { identity: { name: string, author: string, label: I18nText, description: I18nText, icon: PluginIcon, tags: string[] }, strategies: AgentStrategy[] }
}

/* ---------------- 扩展端点 ---------------- */
export type PluginEndpoint = {
  id: string
  created_at: string
  name: string
  enabled: boolean
  url: string
  hook_id: string
  settings: FormValues
  plugin_id: string
  declaration: { settings: CredentialFormSchema[], endpoints: { path: string, method: string, hidden?: boolean }[] }
}

/* ---------------- 自定义端点（API 扩展） ---------------- */
export type ApiBasedExtension = { id?: string, name: string, api_endpoint: string, api_key: string }
