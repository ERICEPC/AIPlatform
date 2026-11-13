/* 工具 mock：工具插件（含授权凭据）、MCP、工作流即工具、API 即工具 */
import type {
  ApiParamSchema, ApiTestPayload, ApiToolProvider, CredentialFormSchema, CredentialInfo, CredentialType, CredentialVisibility, FormValues, I18nText,
  McpPayload, OAuthClientSchema, PluginCredential, ToolAction, ToolCollection, ToolPluginList, WorkflowToolDetail,
} from '../../integrations/types'
import { ApiError, mockId } from '../../http'
import { installedOf } from './catalog'

const zh = (zh_Hans: string, en_US = zh_Hans): I18nText => ({ zh_Hans, en_US })
const act = (author: string, name: string, label: string, desc: string, params: [string, string, boolean][] = []): ToolAction => ({
  name,
  author,
  label: zh(label),
  description: zh(desc),
  parameters: params.map(([n, l, r]) => ({ name: n, label: zh(l), type: 'string', required: r, form: 'llm', human_description: zh(l) })),
})

const actions: Record<string, ToolAction[]> = {
  'langgenius/feishu': [
    act('langgenius', 'send_message', '发送消息', '向指定群或个人发送文本、富文本消息', [['receive_id', '接收方 ID', true], ['content', '消息内容', true]]),
    act('langgenius', 'create_document', '创建云文档', '在指定文件夹创建飞书文档并写入内容', [['title', '标题', true], ['content', '正文 Markdown', false]]),
    act('langgenius', 'search_calendar', '查询日程', '按时间范围查询日历日程', [['start_time', '开始时间', true], ['end_time', '结束时间', true]]),
    act('langgenius', 'add_bitable_records', '写入多维表格', '向多维表格追加记录', [['app_token', '表格 Token', true], ['records', '记录 JSON', true]]),
  ],
  'langgenius/tavily': [act('langgenius', 'tavily_search', '网络搜索', '返回带来源链接的搜索结果', [['query', '搜索词', true]]), act('langgenius', 'tavily_extract', '网页提取', '提取指定网页的正文', [['urls', '网址', true]])],
  'langgenius/time': [act('langgenius', 'current_time', '当前时间', '按时区返回当前时间', [['timezone', '时区', false]]), act('langgenius', 'weekday', '星期计算', '计算某天是星期几', [['date', '日期', true]])],
  'langgenius/jina': [act('langgenius', 'jina_reader', '读取网页', '把网页转成 Markdown', [['url', '网址', true]])],
}

const needsAuth: Record<string, CredentialType[]> = { 'langgenius/feishu': ['oauth2', 'api-key'], 'langgenius/tavily': ['api-key'], 'langgenius/jina': ['api-key'] }
const apiKeySchemas: Record<string, CredentialFormSchema[]> = {
  'langgenius/feishu': [
    { variable: 'app_id', name: 'app_id', label: zh('App ID'), type: 'text-input', required: true, placeholder: zh('飞书开放平台应用的 App ID') },
    { variable: 'app_secret', name: 'app_secret', label: zh('App Secret'), type: 'secret-input', required: true, placeholder: zh('应用凭证里的 App Secret') },
  ],
}
const defaultKeySchema: CredentialFormSchema[] = [{ variable: 'api_key', name: 'api_key', label: zh('API Key'), type: 'secret-input', required: true, placeholder: zh('粘贴服务商提供的 API Key'), url: 'https://example.com/keys' }]

const creds: Record<string, PluginCredential[]> = {
  'langgenius/feishu': [
    { id: 'tc-1', name: '叶源的飞书授权', provider: 'feishu', credential_type: 'oauth2', is_default: true, visibility: 'only_me', created_by: '叶源' },
    { id: 'tc-2', name: '翼飞客服机器人', provider: 'feishu', credential_type: 'api-key', is_default: false, visibility: 'all_team_members', created_by: '李鹏程', credentials: { app_id: 'cli_a5f0e2b7c9', app_secret: '••••••••' } },
  ],
  'langgenius/tavily': [{ id: 'tc-3', name: '团队搜索 Key', provider: 'tavily', credential_type: 'api-key', is_default: true, visibility: 'all_team_members', created_by: '周玮', credentials: { api_key: 'tvly-••••••••' } }],
}
const oauthClients: Record<string, { enabled: boolean, params: FormValues }> = {}

const collectionOf = (pluginId: string): ToolCollection => {
  const p = installedOf('tool').find(x => x.plugin_id === pluginId)!
  const types = needsAuth[pluginId] ?? []
  return {
    id: `${pluginId}/${p.name}`,
    name: `${pluginId}/${p.name}`,
    author: p.declaration.author,
    description: p.declaration.description,
    icon: p.declaration.icon,
    label: p.declaration.label,
    type: 'builtin',
    team_credentials: {},
    is_team_authorization: types.length === 0 || (creds[pluginId]?.length ?? 0) > 0,
    allow_delete: types.length > 0,
    labels: p.declaration.tags,
    plugin_id: pluginId,
    tools: actions[pluginId] ?? [act(p.declaration.author, `${p.name}_run`, `${p.declaration.label.zh_Hans ?? p.name}`, '执行插件提供的默认动作', [['input', '输入', true]])],
  }
}
const pidOf = (provider: string) => provider.split('/').slice(0, 2).join('/')

/* ---------------- MCP ---------------- */
const mcpTools = (list: [string, string][]) => list.map(([n, d]) => act('mcp', n, n, d, [['query', '查询内容', true]]))
let mcps: ToolCollection[] = [
  {
    id: 'mcp-crm', name: '销售 CRM', author: '叶源', description: zh('商机、客户、拜访记录查询'), icon: '🧭', label: zh('销售 CRM'), type: 'mcp', team_credentials: {}, is_team_authorization: true, allow_delete: true, labels: [],
    tools: mcpTools([['search_opportunity', '按客户或阶段搜索商机'], ['get_account', '读取客户档案'], ['list_visits', '列出最近拜访记录']]),
    server_url: 'https://mcp.sensetime.internal/crm/sse', transport: 'sse', server_identifier: 'sales-crm', timeout: 30, sse_read_timeout: 300, headers: {}, masked_headers: {}, is_dynamic_registration: true, authentication: null, identity_mode: 'idp_token', updated_at: Date.now() / 1000 - 3600 * 5,
  },
  {
    id: 'mcp-wiki', name: '内部知识检索', author: '周玮', description: zh(''), icon: '📚', label: zh('内部知识检索'), type: 'mcp', team_credentials: {}, is_team_authorization: false, allow_delete: true, labels: [], tools: [],
    server_url: 'https://wiki-mcp.sensetime.com/mcp', transport: 'streamable_http', server_identifier: 'inner-wiki', timeout: 30, sse_read_timeout: 300, headers: { 'X-Tenant': 'raccoon' }, masked_headers: { 'X-Tenant': 'ra****on' }, is_dynamic_registration: false, authentication: { client_id: 'raccoonx-portal', client_secret: '' }, identity_mode: 'off', updated_at: Date.now() / 1000 - 86400 * 2,
  },
]
const maskMap = (m?: Record<string, string>) => Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [k, v.includes('*') || v.length < 6 ? v : `${v.slice(0, 2)}****${v.slice(-2)}`]))
const mcpById = (id: string) => {
  const it = mcps.find(x => x.id === id)
  if (!it)
    throw new ApiError('MCP 服务不存在', 404)
  return it
}

/* ---------------- 工作流即工具 ---------------- */
const wf: WorkflowToolDetail[] = [
  {
    workflow_app_id: 'app-weekly', workflow_tool_id: 'wft-1', name: 'opportunity_weekly', label: '商机周报生成', description: '汇总本周商机变化，生成可直接发群的周报',
    icon: { content: '📈', background: '#E4FBCC' },
    parameters: [{ name: 'region', description: '大区，例如华东', form: 'llm', required: true, type: 'string' }, { name: 'week', description: '周次，默认本周', form: 'form', required: false, type: 'string' }],
    output_schema: { type: 'object', properties: { text: { type: 'string', description: '周报正文' }, files: { type: 'array', description: '附件' }, json: { type: 'object' } } },
    privacy_policy: '', labels: ['productivity'], synced: true,
  },
  {
    workflow_app_id: 'app-solution', workflow_tool_id: 'wft-2', name: 'presales_solution', label: '售前方案初稿', description: '根据客户需求与行业案例生成方案大纲',
    icon: { content: '🧩', background: '#D5F5F6' },
    parameters: [{ name: 'requirement', description: '客户需求描述', form: 'llm', required: true, type: 'paragraph' }],
    output_schema: { type: 'object', properties: { text: { type: 'string' } } },
    privacy_policy: 'https://sensetime.com/privacy', labels: ['business'], synced: false,
  },
]
const wfCollection = (w: WorkflowToolDetail): ToolCollection => ({
  id: w.workflow_tool_id, name: w.name, author: '叶源', description: zh(w.description), icon: w.icon.content, label: zh(w.label), type: 'workflow', team_credentials: {}, is_team_authorization: true, allow_delete: true, labels: w.labels,
  tools: [act('叶源', w.name, w.label, w.description, w.parameters.map(p => [p.name, p.description, p.required]))],
})

/* ---------------- API 即工具 ---------------- */
const petSchema = `openapi: 3.0.1
info:
  title: 翼飞工单
  version: 1.0.0
servers:
  - url: https://ticket.yifei.example.com/api
paths:
  /tickets:
    get:
      operationId: listTickets
      summary: 按状态查询工单
      parameters:
        - name: status
          in: query
          required: false
          schema: { type: string }
    post:
      operationId: createTicket
      summary: 新建客服工单
  /tickets/{id}:
    get:
      operationId: getTicket
      summary: 读取工单详情
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
`
export function parseSchema(schema: string): ApiParamSchema[] {
  const server = schema.match(/url:\s*(\S+)/)?.[1] ?? ''
  const out: ApiParamSchema[] = []
  let path = ''
  let method = ''
  for (const line of schema.split('\n')) {
    const p = line.match(/^ {2}(\/\S*):\s*$/)
    if (p) {
      path = p[1]
      continue
    }
    const mt = line.match(/^ {4}(get|post|put|patch|delete):\s*$/)
    if (mt) {
      method = mt[1]
      out.push({ operation_id: `${method}_${path}`, summary: '', server_url: server, method, path, parameters: [] })
      continue
    }
    const cur = out[out.length - 1]
    const op = line.match(/operationId:\s*(\S+)/)
    if (op && cur)
      cur.operation_id = op[1]
    const sm = line.match(/summary:\s*(.+)/)
    if (sm && cur)
      cur.summary = sm[1].trim()
    const pn = line.match(/- name:\s*(\S+)/)
    if (pn && cur)
      cur.parameters.push({ name: pn[1], type: 'string', required: false, label: zh(pn[1]) })
    if (/required:\s*true/.test(line) && cur?.parameters.length)
      cur.parameters[cur.parameters.length - 1].required = true
  }
  return out
}
let apis: ApiToolProvider[] = [{
  provider: '翼飞工单', credentials: { auth_type: 'api_key_header', api_key_header: 'Authorization', api_key_value: 'yf-••••••', api_key_header_prefix: 'bearer' },
  icon: { content: '🎫', background: '#FFEAD5' }, schema_type: 'openapi', schema: petSchema, privacy_policy: '', custom_disclaimer: '仅限翼飞客服项目使用', labels: ['business'],
}]
const apiCollection = (a: ApiToolProvider): ToolCollection => ({
  id: a.provider, name: a.provider, author: '李鹏程', description: zh(a.custom_disclaimer || 'OpenAPI 工具'), icon: a.icon.content, label: zh(a.provider), type: 'api', team_credentials: {}, is_team_authorization: true, allow_delete: true, labels: a.labels,
  tools: parseSchema(a.schema).map(s => act('李鹏程', s.operation_id, s.operation_id, s.summary)),
})

export const toolDb = {
  pluginList(query = '', tags: string[] = []): ToolPluginList {
    const q = query.trim().toLowerCase()
    const plugins = installedOf('tool').filter(p => (!q || `${p.name}${p.declaration.label.zh_Hans}${p.declaration.description.zh_Hans}`.toLowerCase().includes(q)) && (!tags.length || tags.some(t => p.declaration.tags.includes(t))))
    return { plugins, builtin_tools: plugins.map(p => collectionOf(p.plugin_id)), has_more: false }
  },
  tools: (provider: string) => collectionOf(pidOf(provider)).tools,
  credentialInfo(provider: string): CredentialInfo {
    const pid = pidOf(provider)
    return { supported_credential_types: needsAuth[pid] ?? [], credentials: creds[pid] ?? [], is_oauth_custom_client_enabled: !!oauthClients[pid]?.enabled, allow_custom_token: false }
  },
  schema: (provider: string) => apiKeySchemas[pidOf(provider)] ?? defaultKeySchema,
  addCredential(provider: string, body: { credentials: FormValues, type: CredentialType, name?: string, visibility?: CredentialVisibility }) {
    const pid = pidOf(provider)
    const list = (creds[pid] ??= [])
    const masked = Object.fromEntries(Object.entries(body.credentials).map(([k, v]) => [k, typeof v === 'string' && v.length > 6 ? `${v.slice(0, 4)}••••••` : v]))
    list.push({ id: mockId('tc'), name: body.name || `${body.type === 'oauth2' ? '授权' : 'API Key'} ${list.length + 1}`, provider: pid.split('/')[1], credential_type: body.type, is_default: list.length === 0, visibility: body.visibility ?? 'only_me', created_by: '叶源', credentials: masked })
    return { result: 'success' }
  },
  updateCredential(provider: string, body: { credential_id: string, credentials?: FormValues, name?: string, visibility?: CredentialVisibility }) {
    const c = (creds[pidOf(provider)] ?? []).find(x => x.id === body.credential_id)
    if (!c)
      throw new ApiError('凭据不存在', 404)
    Object.assign(c, { ...(body.name ? { name: body.name } : {}), ...(body.visibility ? { visibility: body.visibility } : {}), ...(body.credentials ? { credentials: body.credentials } : {}) })
    return { result: 'success' }
  },
  deleteCredential(provider: string, id: string) {
    const pid = pidOf(provider)
    creds[pid] = (creds[pid] ?? []).filter(x => x.id !== id)
    if (creds[pid].length && !creds[pid].some(x => x.is_default))
      creds[pid][0].is_default = true
    return { result: 'success' }
  },
  setDefault(provider: string, id: string) {
    for (const c of creds[pidOf(provider)] ?? []) c.is_default = c.id === id
    return { result: 'success' }
  },
  oauthUrl(provider: string, visibility?: CredentialVisibility) {
    // 模拟：用户在弹窗里完成授权后，后端回调写入一条 OAuth 凭据
    setTimeout(() => toolDb.addCredential(provider, { credentials: {}, type: 'oauth2', name: '叶源的飞书授权（新）', visibility }), 2600)
    return { authorization_url: `https://open.feishu.cn/open-apis/authen/v1/authorize?state=${mockId('st')}`, state: mockId('st'), context_id: mockId('ctx') }
  },
  oauthClientSchema(provider: string): OAuthClientSchema {
    const c = oauthClients[pidOf(provider)]
    return {
      schema: [{ variable: 'client_id', name: 'client_id', label: zh('Client ID'), type: 'text-input', required: true }, { variable: 'client_secret', name: 'client_secret', label: zh('Client Secret'), type: 'secret-input', required: true }],
      is_oauth_custom_client_enabled: !!c?.enabled,
      is_system_oauth_params_exists: true,
      client_params: c?.params ?? {},
      redirect_uri: `${location.origin}/console/api/oauth/plugin/${provider}/tool/callback`,
    }
  },
  setOauthClient(provider: string, client_params: FormValues, enable: boolean) {
    oauthClients[pidOf(provider)] = { enabled: enable, params: client_params }
    return { result: 'success' }
  },

  mcpList: () => mcps,
  createMcp(body: McpPayload, imported_from?: ToolCollection['imported_from']) {
    if (mcps.some(x => x.server_identifier === body.server_identifier))
      throw new ApiError('服务标识已被使用，换一个', 400)
    const { env, ...rest } = body
    const it: ToolCollection = {
      id: mockId('mcp'), author: '叶源', description: zh(''), label: zh(body.name), type: 'mcp', team_credentials: {}, is_team_authorization: false, allow_delete: true, labels: [], tools: [],
      ...rest,
      transport: body.transport ?? 'streamable_http',
      masked_headers: maskMap(body.headers),
      masked_env: maskMap(env),
      imported_from,
      updated_at: Date.now() / 1000,
    }
    mcps = [it, ...mcps]
    return it
  },
  updateMcp(body: McpPayload & { provider_id: string }) {
    const it = mcpById(body.provider_id)
    const { env, provider_id: _, ...rest } = body
    Object.assign(it, { ...rest, label: zh(body.name), masked_headers: maskMap(body.headers), masked_env: maskMap(env), updated_at: Date.now() / 1000 })
    return { result: 'success' }
  },
  deleteMcp(id: string) {
    mcps = mcps.filter(x => x.id !== id)
    return { result: 'success' }
  },
  authMcp(id: string) {
    const it = mcpById(id)
    it.is_team_authorization = true
    if (!it.tools.length)
      it.tools = mcpTools([['search', '全文检索'], ['get_page', '读取页面内容'], ['list_spaces', '列出空间']])
    return { result: 'success' }
  },
  mcpTools: (id: string) => ({ tools: mcpById(id).tools }),
  updateMcpTools(id: string) {
    const it = mcpById(id)
    if (!it.tools.some(t => t.name === 'recent_changes'))
      it.tools = [...it.tools, act('mcp', 'recent_changes', 'recent_changes', '最近 7 天的变更记录', [['days', '天数', false]])]
    it.updated_at = Date.now() / 1000
    return { tools: it.tools }
  },

  workflowList: () => wf.map(wfCollection),
  workflowGet(id: string) {
    const w = wf.find(x => x.workflow_tool_id === id)
    if (!w)
      throw new ApiError('工作流工具不存在', 404)
    return w
  },
  workflowUpdate(body: Partial<WorkflowToolDetail> & { workflow_tool_id: string }) {
    const w = toolDb.workflowGet(body.workflow_tool_id)
    if (body.name && !/^\w+$/.test(body.name))
      throw new ApiError('调用名只能包含字母、数字和下划线', 400)
    Object.assign(w, body)
    return { result: 'success' }
  },
  workflowDelete(id: string) {
    const i = wf.findIndex(x => x.workflow_tool_id === id)
    if (i >= 0)
      wf.splice(i, 1)
    return { result: 'success' }
  },

  apiList: () => apis.map(apiCollection),
  apiGet(provider: string) {
    const a = apis.find(x => x.provider === provider)
    if (!a)
      throw new ApiError('工具不存在', 404)
    return a
  },
  apiRemote(url: string) {
    if (!/^https?:\/\//.test(url))
      throw new ApiError('地址需以 http:// 或 https:// 开头', 400)
    return { schema: petSchema.replace('翼飞工单', '远程导入示例') }
  },
  apiParse(schema: string) {
    const list = parseSchema(schema)
    if (!list.length)
      throw new ApiError('没有解析出接口，请检查 Schema 是否为 OpenAPI 3 / Swagger 2 格式', 400)
    return { parameters_schema: list, schema_type: (/swagger:/.test(schema) ? 'swagger' : 'openapi') as 'swagger' | 'openapi' }
  },
  apiTest(body: ApiTestPayload) {
    if (body.credentials.auth_type !== 'none' && !body.credentials.api_key_value)
      return { error: '缺少 API Key，请先在鉴权方式里填写' }
    return { result: JSON.stringify({ code: 0, data: { tool: body.tool_name, echo: body.parameters, items: [{ id: 'T-20261105-031', status: 'open', title: '退改签规则咨询' }] } }, null, 2) }
  },
  apiSave(body: ApiToolProvider, isNew: boolean) {
    if (isNew && apis.some(x => x.provider === body.provider))
      throw new ApiError('同名工具已存在', 400)
    if (isNew)
      apis = [...apis, body]
    else
      apis = apis.map(x => (x.provider === (body.original_provider ?? body.provider) ? { ...body, original_provider: undefined } : x))
    return { result: 'success' }
  },
  apiDelete(provider: string) {
    apis = apis.filter(x => x.provider !== provider)
    return { result: 'success' }
  },
}
