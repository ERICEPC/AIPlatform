/* 数据来源、触发器、Agent 策略、扩展端点、自定义端点（API 扩展）mock */
import type {
  AgentStrategyProvider, ApiBasedExtension, CredentialFormSchema, DatasourceAuth, DatasourceCredential, FormValues, I18nText, PluginEndpoint,
  TriggerCredentialType, TriggerLog, TriggerOAuthConfig, TriggerProvider, TriggerSubscription,
} from '../../integrations/types'
import { ApiError, mockId, nowIso } from '../../http'
import { installedOf, pluginById } from './catalog'

const zh = (zh_Hans: string, en_US = zh_Hans): I18nText => ({ zh_Hans, en_US })
const f = (variable: string, label: string, type: CredentialFormSchema['type'] = 'text-input', required = true, extra: Partial<CredentialFormSchema> = {}): CredentialFormSchema => ({ variable, name: variable, label: zh(label), type, required, ...extra })

/* ---------------- 数据来源 ---------------- */
const dsCreds: Record<string, DatasourceCredential[]> = {
  'langgenius/feishu_wiki': [
    { id: 'ds-1', name: '售前知识库（叶源）', type: 'oauth2', is_default: true, credential: {}, avatar_url: '' },
    { id: 'ds-2', name: '翼飞客服文档', type: 'api-key', is_default: false, credential: { app_id: 'cli_a5f0e2b7c9' } },
  ],
}
const dsSchemas: Record<string, CredentialFormSchema[]> = {
  'langgenius/feishu_wiki': [f('app_id', 'App ID'), f('app_secret', 'App Secret', 'secret-input')],
  'langgenius/firecrawl_datasource': [f('api_key', 'API Key', 'secret-input'), f('base_url', '服务地址', 'text-input', false, { placeholder: zh('私有部署时填写，例如 https://crawl.internal') })],
}
const withOAuth = new Set(['langgenius/feishu_wiki', 'langgenius/notion_datasource', 'langgenius/google_drive'])
const dsOf = (pid: string): DatasourceAuth => {
  const p = pluginById(pid)!
  return {
    author: p.declaration.author, provider: p.name, plugin_id: pid, plugin_unique_identifier: p.plugin_unique_identifier, icon: p.declaration.icon, name: p.name,
    label: p.declaration.label, description: p.declaration.description,
    credential_schema: dsSchemas[pid] ?? [f('api_key', 'API Key', 'secret-input')],
    oauth_schema: withOAuth.has(pid) ? { client_schema: [f('client_id', 'Client ID'), f('client_secret', 'Client Secret', 'secret-input')], credentials_schema: [], is_oauth_custom_client_enabled: false, is_system_oauth_params_exists: true, redirect_uri: `${location.origin}/console/api/oauth/plugin/${pid}/datasource/callback` } : undefined,
    credentials_list: dsCreds[pid] ?? [],
  }
}
const dsList = (key: string) => {
  const pid = key.split('/').slice(0, 2).join('/')
  return (dsCreds[pid] ??= [])
}

/* ---------------- 触发器 ---------------- */
const triggerExtra: Record<string, Partial<TriggerProvider>> = {
  'langgenius/github_trigger': {
    supported_creation_methods: ['APIKEY', 'OAUTH', 'MANUAL'],
    subscription_constructor: { credentials_schema: [f('access_token', 'Personal Access Token', 'secret-input')], parameters: [f('repository', '仓库', 'text-input', true, { placeholder: zh('owner/repo，例如 sensetime/raccoonx') }), f('events', '订阅事件', 'select', true, { options: [{ label: zh('Push'), value: 'push' }, { label: zh('Pull Request'), value: 'pull_request' }, { label: zh('Issue'), value: 'issues' }] })] },
    events: [
      { name: 'push', identity: { label: zh('代码推送') }, description: zh('有人向仓库推送提交时触发'), parameters: [], output_schema: { ref: 'string', commits: 'array' } },
      { name: 'pull_request', identity: { label: zh('Pull Request 变更') }, description: zh('PR 打开、合并、关闭时触发'), parameters: [], output_schema: { action: 'string', number: 'number' } },
      { name: 'issues', identity: { label: zh('Issue 变更') }, description: zh('Issue 创建、关闭、被评论时触发'), parameters: [], output_schema: { action: 'string' } },
    ],
  },
  'langgenius/feishu_trigger': {
    supported_creation_methods: ['OAUTH', 'MANUAL'],
    subscription_constructor: { credentials_schema: [], parameters: [f('chat_id', '群聊 ID', 'text-input', false)] },
    events: [
      { name: 'im.message.receive_v1', identity: { label: zh('收到消息') }, description: zh('机器人所在群收到新消息'), parameters: [], output_schema: { text: 'string', sender: 'object' } },
      { name: 'approval.instance', identity: { label: zh('审批状态变更') }, description: zh('审批通过、拒绝或撤回时触发'), parameters: [], output_schema: { status: 'string' } },
    ],
  },
}
const subs: Record<string, TriggerSubscription[]> = {
  'langgenius/github_trigger': [
    { id: 'sub-1', name: 'raccoonx 主仓 PR', provider: 'langgenius/github_trigger/github', credential_type: 'api-key', credentials: { access_token: 'ghp_••••' }, endpoint: `${location.origin}/triggers/plugin/sub-1`, parameters: { repository: 'sensetime/raccoonx', events: 'pull_request' }, properties: {}, workflows_in_use: 3 },
    { id: 'sub-2', name: '前端仓推送', provider: 'langgenius/github_trigger/github', credential_type: 'unauthorized', credentials: {}, endpoint: `${location.origin}/triggers/plugin/sub-2`, parameters: {}, properties: { webhook_secret: 'whsec_••••' }, workflows_in_use: 0 },
  ],
}
const builders: Record<string, TriggerSubscription & { verified?: boolean, logs: TriggerLog[], started: number }> = {}
const tOAuth: Record<string, TriggerOAuthConfig> = {}
const triggerOf = (pid: string): TriggerProvider => {
  const p = pluginById(pid)!
  const extra = triggerExtra[pid] ?? {}
  return {
    plugin_id: pid, plugin_unique_identifier: p.plugin_unique_identifier, name: `${pid}/${p.name.replace('_trigger', '')}`, author: p.declaration.author, label: p.declaration.label, description: p.declaration.description, icon: p.declaration.icon, tags: p.declaration.tags,
    events: extra.events ?? [{ name: 'webhook', identity: { label: zh('收到回调') }, description: zh('外部系统调用回调地址时触发'), parameters: [], output_schema: { body: 'object' } }],
    supported_creation_methods: extra.supported_creation_methods ?? ['MANUAL'],
    subscription_constructor: extra.subscription_constructor ?? { credentials_schema: [], parameters: [] },
    subscription_schema: [f('webhook_secret', '签名密钥', 'secret-input', false)],
  }
}
const pidOfTrigger = (provider: string) => provider.split('/').slice(0, 2).join('/')

/* ---------------- Agent 策略 ---------------- */
const strategies: Record<string, AgentStrategyProvider['declaration']['strategies']> = {
  'langgenius/agent': [
    {
      identity: { name: 'function_calling', label: zh('Function Calling'), author: 'langgenius' }, description: zh('模型原生的工具调用能力，速度快、格式稳定，适合支持工具调用的模型。'),
      parameters: [
        { name: 'model', label: zh('模型'), type: 'model-selector', required: true, help: zh('需支持 tool-call 能力') },
        { name: 'tools', label: zh('工具列表'), type: 'array[tools]', required: false },
        { name: 'instruction', label: zh('指令'), type: 'string', required: true, help: zh('Agent 的角色与目标') },
        { name: 'query', label: zh('用户输入'), type: 'string', required: true },
        { name: 'maximum_iterations', label: zh('最大迭代次数'), type: 'number', required: true, default: 5 },
      ],
      output_schema: { text: { type: 'string', description: '最终回答' }, usage: { type: 'object', description: '用量统计' } },
    },
    {
      identity: { name: 'ReAct', label: zh('ReAct'), author: 'langgenius' }, description: zh('思考 → 行动 → 观察的循环推理，适合不支持原生工具调用的模型。'),
      parameters: [
        { name: 'model', label: zh('模型'), type: 'model-selector', required: true },
        { name: 'tools', label: zh('工具列表'), type: 'array[tools]', required: false },
        { name: 'instruction', label: zh('指令'), type: 'string', required: true },
        { name: 'maximum_iterations', label: zh('最大迭代次数'), type: 'number', required: true, default: 5 },
      ],
      output_schema: { text: { type: 'string', description: '最终回答' } },
    },
  ],
}
const agentOf = (pid: string): AgentStrategyProvider => {
  const p = pluginById(pid)!
  return {
    provider: `${pid}/${p.name}`, plugin_id: pid, plugin_unique_identifier: p.plugin_unique_identifier,
    declaration: {
      identity: { name: p.name, author: p.declaration.author, label: p.declaration.label, description: p.declaration.description, icon: p.declaration.icon, tags: p.declaration.tags },
      strategies: strategies[pid] ?? [{ identity: { name: 'default', label: zh(p.declaration.label.zh_Hans ?? p.name), author: p.declaration.author }, description: p.declaration.description, parameters: [{ name: 'model', label: zh('模型'), type: 'model-selector', required: true }, { name: 'query', label: zh('用户输入'), type: 'string', required: true }], output_schema: { text: { type: 'string' } } }],
    },
  }
}

/* ---------------- 扩展端点 ---------------- */
const epDecl: Record<string, PluginEndpoint['declaration']> = {
  'langgenius/feishu_bot': { settings: [f('app_id', 'App ID'), f('app_secret', 'App Secret', 'secret-input'), f('app', '绑定应用', 'select', true, { options: [{ label: zh('翼飞客服助手'), value: 'app-yifei' }, { label: zh('售前方案助手'), value: 'app-presales' }] })], endpoints: [{ path: '/feishu/event', method: 'POST' }, { path: '/feishu/card', method: 'POST' }] },
  'langgenius/oaicompat': { settings: [f('api_key', '访问密钥', 'secret-input'), f('app', '绑定应用', 'select', true, { options: [{ label: zh('商机周报'), value: 'app-weekly' }, { label: zh('翼飞客服助手'), value: 'app-yifei' }] })], endpoints: [{ path: '/v1/chat/completions', method: 'POST' }, { path: '/v1/models', method: 'GET' }] },
}
const endpoints: PluginEndpoint[] = [
  { id: 'ep-1', created_at: nowIso(), name: '翼飞客服群机器人', enabled: true, url: 'https://hooks.raccoonx.sensetime.com/e/8f2c1a', hook_id: '8f2c1a', settings: { app_id: 'cli_a5f0e2b7c9', app_secret: '••••', app: 'app-yifei' }, plugin_id: 'langgenius/feishu_bot', declaration: epDecl['langgenius/feishu_bot'] },
  { id: 'ep-2', created_at: nowIso(), name: '售前测试群', enabled: false, url: 'https://hooks.raccoonx.sensetime.com/e/3d90be', hook_id: '3d90be', settings: { app_id: 'cli_b19d0e', app_secret: '••••', app: 'app-presales' }, plugin_id: 'langgenius/feishu_bot', declaration: epDecl['langgenius/feishu_bot'] },
  { id: 'ep-3', created_at: nowIso(), name: '周报接口', enabled: true, url: 'https://hooks.raccoonx.sensetime.com/e/a71f02', hook_id: 'a71f02', settings: { api_key: '••••', app: 'app-weekly' }, plugin_id: 'langgenius/oaicompat', declaration: epDecl['langgenius/oaicompat'] },
]
export function syncEndpointCounts() {
  for (const p of installedOf('extension')) {
    const list = endpoints.filter(e => e.plugin_id === p.plugin_id)
    p.endpoints_setups = list.length
    p.endpoints_active = list.filter(e => e.enabled).length
    p.declaration.endpoint = epDecl[p.plugin_id] ?? { settings: [f('secret', '签名密钥', 'secret-input')], endpoints: [{ path: '/callback', method: 'POST' }] }
  }
}
syncEndpointCounts()
const epById = (id: string) => {
  const e = endpoints.find(x => x.id === id)
  if (!e)
    throw new ApiError('端点不存在', 404)
  return e
}

/* ---------------- 自定义端点 ---------------- */
let exts: Required<ApiBasedExtension>[] = [
  { id: 'ext-1', name: '敏感词审查', api_endpoint: 'https://moderation.sensetime.internal/api/check', api_key: 'mod-8a1f••••c09d' },
  { id: 'ext-2', name: '翼飞航班查询', api_endpoint: 'https://flight.yifei.example.com/raccoon/ext', api_key: 'yf-ext-••••77e1' },
]

export const otherDb = {
  /* 数据来源 */
  dsList: () => installedOf('datasource').map(p => dsOf(p.plugin_id)),
  dsAdd(key: string, body: { credentials: FormValues, type: 'api-key' | 'oauth2', name?: string }) {
    const list = dsList(key)
    list.push({ id: mockId('ds'), name: body.name || `${body.type === 'oauth2' ? '授权' : 'API Key'} ${list.length + 1}`, type: body.type, is_default: list.length === 0, credential: body.credentials })
    return { result: 'success' }
  },
  dsDefault(key: string, id: string) {
    dsList(key).forEach(c => (c.is_default = c.id === id))
    return { result: 'success' }
  },
  dsRename(key: string, id: string, name: string) {
    const c = dsList(key).find(x => x.id === id)
    if (c)
      c.name = name
    return { result: 'success' }
  },
  dsUpdate(key: string, id: string, credentials: FormValues, name?: string) {
    const c = dsList(key).find(x => x.id === id)
    if (c)
      Object.assign(c, { credential: credentials, ...(name ? { name } : {}) })
    return { result: 'success' }
  },
  dsDelete(key: string, id: string) {
    const list = dsList(key)
    list.splice(list.findIndex(x => x.id === id), 1)
    if (list.length && !list.some(x => x.is_default))
      list[0].is_default = true
    return { result: 'success' }
  },
  dsOAuth(key: string) {
    setTimeout(() => otherDb.dsAdd(key, { credentials: {}, type: 'oauth2', name: '叶源的授权' }), 2600)
    return { authorization_url: 'https://accounts.example.com/oauth/authorize', state: mockId('st'), context_id: mockId('ctx') }
  },

  /* 触发器 */
  triggers: () => installedOf('trigger').map(p => triggerOf(p.plugin_id)),
  triggerInfo: (provider: string) => triggerOf(pidOfTrigger(provider)),
  subs: (provider: string) => subs[pidOfTrigger(provider)] ?? [],
  builderCreate(provider: string, credential_type: TriggerCredentialType) {
    const id = mockId('sb')
    builders[id] = { id, name: '', provider, credential_type, credentials: {}, endpoint: `${location.origin}/triggers/plugin/${id}`, parameters: {}, properties: {}, workflows_in_use: 0, logs: [], started: Date.now() }
    return { subscription_builder: builders[id] }
  },
  builderUpdate(id: string, body: Partial<TriggerSubscription>) {
    const b = builders[id]
    if (!b)
      throw new ApiError('订阅草稿已过期，请重新创建', 404)
    Object.assign(b, body)
    return b
  },
  builderVerify(id: string, credentials: FormValues) {
    const b = builders[id]
    const ok = Object.values(credentials).some(v => typeof v === 'string' && v.length >= 6)
    if (!ok)
      throw new ApiError('凭据校验失败：Token 无效或权限不足，请检查后重试', 400)
    b.credentials = credentials
    b.verified = true
    return { verified: true }
  },
  builderBuild(id: string, body: { name?: string, parameters?: FormValues }) {
    const b = builders[id]
    if (!b)
      throw new ApiError('订阅草稿已过期，请重新创建', 404)
    const pid = pidOfTrigger(b.provider)
    const { logs: _l, started: _s, verified: _v, ...rest } = b
    ;(subs[pid] ??= []).push({ ...rest, name: body.name || b.name || '未命名订阅', parameters: body.parameters ?? b.parameters })
    delete builders[id]
    return { result: 'success' }
  },
  builderLogs(id: string) {
    const b = builders[id]
    if (!b)
      return { logs: [] }
    // 手动创建时：开始 4 秒后模拟收到第一条回调，之后每 6 秒一条
    const want = Math.max(0, Math.floor((Date.now() - b.started - 4000) / 6000) + 1)
    while (b.logs.length < Math.min(want, 5)) {
      b.logs.unshift({ id: mockId('log'), endpoint: b.endpoint, created_at: nowIso(), request: { method: 'POST', url: b.endpoint, headers: { 'content-type': 'application/json', 'x-github-event': 'push' }, data: JSON.stringify({ ref: 'refs/heads/main', pusher: { name: 'jianglei' } }, null, 2) }, response: { status_code: 200, headers: {}, data: '{"result":"ok"}' } })
    }
    return { logs: b.logs }
  },
  subDelete(id: string) {
    for (const k of Object.keys(subs)) subs[k] = subs[k].filter(s => s.id !== id)
    return { result: 'success' }
  },
  subUpdate(id: string, body: Partial<TriggerSubscription>) {
    const sub = Object.values(subs).flat().find(s => s.id === id)
    if (!sub)
      throw new ApiError('订阅不存在', 404)
    Object.assign(sub, body)
    return { result: 'success' }
  },
  tOAuthGet(provider: string): TriggerOAuthConfig {
    return tOAuth[pidOfTrigger(provider)] ?? { configured: true, custom_configured: false, custom_enabled: false, system_configured: true, redirect_uri: `${location.origin}/console/api/oauth/plugin/${provider}/trigger/callback`, oauth_client_schema: [f('client_id', 'Client ID'), f('client_secret', 'Client Secret', 'secret-input')], params: { client_id: '', client_secret: '' } }
  },
  tOAuthSet(provider: string, client_params: FormValues, enabled: boolean) {
    const cur = otherDb.tOAuthGet(provider)
    tOAuth[pidOfTrigger(provider)] = { ...cur, custom_configured: true, custom_enabled: enabled, params: { client_id: String(client_params.client_id ?? ''), client_secret: String(client_params.client_secret ?? '') } }
    return { result: 'success' }
  },
  tAuthorize(provider: string) {
    const { subscription_builder } = otherDb.builderCreate(provider, 'oauth2')
    subscription_builder.credentials = { access_token: 'oauth-••••' }
    return { authorization_url: 'https://github.com/login/oauth/authorize', subscription_builder }
  },

  /* Agent 策略 */
  agents: () => installedOf('agent-strategy').map(p => agentOf(p.plugin_id)),
  agent: (provider: string) => agentOf(provider.split('/').slice(0, 2).join('/')),

  /* 扩展端点 */
  endpoints: (pid: string) => ({ endpoints: endpoints.filter(e => e.plugin_id === pid), total: endpoints.filter(e => e.plugin_id === pid).length }),
  epCreate(uid: string, settings: FormValues, name: string) {
    const p = installedOf('extension').find(x => x.plugin_unique_identifier === uid)
    if (!p)
      throw new ApiError('插件未安装', 404)
    const hook = Math.random().toString(16).slice(2, 8)
    endpoints.push({ id: mockId('ep'), created_at: nowIso(), name, enabled: true, url: `https://hooks.raccoonx.sensetime.com/e/${hook}`, hook_id: hook, settings, plugin_id: p.plugin_id, declaration: epDecl[p.plugin_id] ?? p.declaration.endpoint! })
    syncEndpointCounts()
    return { result: 'success' }
  },
  epUpdate(id: string, settings: FormValues, name: string) {
    Object.assign(epById(id), { settings, name })
    return { result: 'success' }
  },
  epDelete(id: string) {
    endpoints.splice(endpoints.indexOf(epById(id)), 1)
    syncEndpointCounts()
    return { result: 'success' }
  },
  epToggle(id: string, enabled: boolean) {
    epById(id).enabled = enabled
    syncEndpointCounts()
    return { result: 'success' }
  },

  /* 自定义端点 */
  exts: () => exts,
  ext: (id: string) => {
    const e = exts.find(x => x.id === id)
    if (!e)
      throw new ApiError('自定义端点不存在', 404)
    return e
  },
  extSave(body: ApiBasedExtension) {
    if (body.api_key.length < 5)
      throw new ApiError('API Key 至少 5 个字符', 400)
    if (body.id) {
      const e = otherDb.ext(body.id)
      Object.assign(e, body)
      return e
    }
    const e = { ...body, id: mockId('ext') }
    exts = [e, ...exts]
    return e
  },
  extDelete(id: string) {
    exts = exts.filter(x => x.id !== id)
    return { result: 'success' }
  },
}
