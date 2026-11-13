/* 模型供应商 mock：供应商随模型插件安装/卸载出现或消失；凭据、模型开关、负载均衡都持久在内存里 */
import type {
  AvailableCredential, CredentialFormSchema, DefaultModel, DefaultModelSetting, FormValues, I18nText, ModelItem, ModelLoadBalancing,
  ModelProvider, ModelType, PreferredProviderType,
} from '../../integrations/types'
import { ApiError, mockId } from '../../http'
import { findCatalog, installed, installedOf } from './catalog'

const zh = (zh_Hans: string, en_US = zh_Hans): I18nText => ({ zh_Hans, en_US })

const apiKey: CredentialFormSchema = { variable: 'api_key', label: zh('API Key'), type: 'secret-input', required: true, placeholder: zh('在服务商控制台创建后粘贴到这里') }
const endpoint: CredentialFormSchema = { variable: 'endpoint_url', label: zh('API 地址'), type: 'text-input', required: false, placeholder: zh('https://api.example.com/v1') }

const compatModelSchema: CredentialFormSchema[] = [
  { variable: 'display_name', label: zh('显示名称'), type: 'text-input', required: false, placeholder: zh('不填则使用模型名称') },
  apiKey,
  { ...endpoint, required: true },
  { variable: 'mode', label: zh('补全模式'), type: 'select', required: true, default: 'chat', show_on: [{ variable: '__model_type', value: 'llm' }], options: [{ label: zh('对话'), value: 'chat' }, { label: zh('补全'), value: 'completion' }] },
  { variable: 'context_size', label: zh('上下文长度'), type: 'number', required: true, default: 32768, show_on: [{ variable: '__model_type', value: 'llm' }] },
  { variable: 'vision_support', label: zh('支持图片理解'), type: 'radio', required: false, default: 'no_support', show_on: [{ variable: '__model_type', value: 'llm' }], options: [{ label: zh('支持'), value: 'support' }, { label: zh('不支持'), value: 'no_support' }] },
  { variable: 'stream_function_calling', label: zh('流式工具调用'), type: 'boolean', required: false, default: false, show_on: [{ variable: '__model_type', value: 'llm' }] },
]

type Store = { provider: ModelProvider, credentials: Record<string, { name: string, values: FormValues }>, models: ModelItem[], lb: Record<string, ModelLoadBalancing> }
const stores: Record<string, Store> = {}

const m = (model: string, model_type: ModelType, extra: Partial<ModelItem> = {}): ModelItem => ({
  model,
  label: zh(model),
  model_type,
  fetch_from: 'predefined-model',
  status: 'active',
  model_properties: model_type === 'llm' ? { context_size: 128000, mode: 'chat' } : {},
  load_balancing_enabled: false,
  features: model_type === 'llm' ? ['tool-call', 'stream-tool-call'] : [],
  ...extra,
})

const presetModels: Record<string, ModelItem[]> = {
  'langgenius/deepseek': [m('deepseek-chat', 'llm', { features: ['tool-call', 'stream-tool-call', 'agent-thought'] }), m('deepseek-reasoner', 'llm', { features: ['agent-thought'] }), m('deepseek-coder', 'llm', { deprecated: true, status: 'disabled' })],
  'sensetime/sensenova': [m('SenseNova-V6-Pro', 'llm', { features: ['tool-call', 'vision', 'agent-thought'], load_balancing_enabled: true }), m('SenseNova-V6-Turbo', 'llm'), m('SenseChat-5', 'llm', { deprecated: true }), m('nova-embedding-stable', 'text-embedding'), m('nova-rerank-v1', 'rerank'), m('nova-asr', 'speech2text'), m('nova-tts', 'tts')],
  'langgenius/openai_api_compatible': [
    m('qwen3-32b', 'llm', { fetch_from: 'customizable-model', features: ['tool-call', 'agent-thought'] }),
    m('bge-m3', 'text-embedding', { fetch_from: 'customizable-model' }),
    m('bge-reranker-v2-m3', 'rerank', { fetch_from: 'customizable-model' }),
    m('whisper-large-v3', 'speech2text', { fetch_from: 'customizable-model' }),
    m('cosyvoice-2', 'tts', { fetch_from: 'customizable-model', status: 'disabled' }),
  ],
  'langgenius/openai': [m('gpt-4o', 'llm', { features: ['tool-call', 'vision', 'structured-output'] }), m('gpt-4.1-mini', 'llm'), m('o3', 'llm', { features: ['agent-thought', 'tool-call'] }), m('text-embedding-3-large', 'text-embedding'), m('whisper-1', 'speech2text'), m('tts-1', 'tts')],
}

const typesOf: Record<string, ModelType[]> = {
  'langgenius/openai_api_compatible': ['llm', 'rerank', 'text-embedding', 'speech2text', 'tts'],
  'sensetime/sensenova': ['llm', 'text-embedding', 'rerank', 'speech2text', 'tts'],
}

function storeOf(pluginId: string): Store {
  if (stores[pluginId])
    return stores[pluginId]
  const item = findCatalog(pluginId)
  const plugin = installed.find(p => p.plugin_id === pluginId)
  if (!plugin)
    throw new ApiError('模型供应商未安装', 404)
  const customizable = pluginId === 'langgenius/openai_api_compatible' || pluginId === 'langgenius/ollama'
  const models = presetModels[pluginId] ?? [m(`${plugin.name}-pro`, 'llm'), m(`${plugin.name}-lite`, 'llm'), m(`${plugin.name}-embedding`, 'text-embedding')]
  const credentials: Store['credentials'] = {}
  if (pluginId === 'sensetime/sensenova' || pluginId === 'langgenius/deepseek') {
    credentials['cred-main'] = { name: '生产环境 Key', values: { api_key: 'sk-prod-7d1e9a0c45b2f8e1' } }
    if (pluginId === 'sensetime/sensenova')
      credentials['cred-backup'] = { name: '备用 Key（周玮）', values: { api_key: 'sk-bak-03f2a9cc1188d4e0' } }
  }
  const avail: AvailableCredential[] = Object.entries(credentials).map(([id, c]) => ({ credential_id: id, credential_name: c.name }))
  const provider: ModelProvider = {
    provider: `${pluginId}/${plugin.name}`,
    label: plugin.declaration.label,
    description: plugin.declaration.description,
    icon_small: plugin.declaration.icon,
    supported_model_types: typesOf[pluginId] ?? [...new Set(models.map(x => x.model_type))],
    configurate_methods: customizable ? ['customizable-model'] : ['predefined-model'],
    provider_credential_schema: { credential_form_schemas: customizable ? [] : [apiKey, endpoint] },
    model_credential_schema: customizable ? { model: { label: zh('模型名称'), placeholder: zh('与服务端部署的模型名一致，例如 qwen3-32b') }, credential_form_schemas: compatModelSchema } : undefined,
    preferred_provider_type: 'custom',
    custom_configuration: { status: avail.length || customizable ? 'active' : 'no-configure', current_credential_id: avail[0]?.credential_id, current_credential_name: avail[0]?.credential_name, available_credentials: avail },
    system_configuration: { enabled: pluginId === 'sensetime/sensenova', current_quota_type: 'trial', quota_configurations: pluginId === 'sensetime/sensenova' ? [{ quota_type: 'trial', quota_used: 312000, quota_limit: 1000000 }] : [] },
    plugin_id: pluginId,
    plugin_unique_identifier: plugin.plugin_unique_identifier,
    installation_id: plugin.installation_id,
    version: plugin.version,
    latest_version: plugin.latest_version,
    source: plugin.source,
    author: item?.org ?? plugin.declaration.author,
  }
  const lb: Store['lb'] = {}
  if (pluginId === 'sensetime/sensenova')
    lb['llm:SenseNova-V6-Pro'] = { enabled: true, configs: [{ id: '__inherit__', name: '__inherit__', enabled: true }, { id: 'lb-1', name: '备用 Key（周玮）', enabled: true, credential_id: 'cred-backup' }] }
  stores[pluginId] = { provider, credentials, models, lb }
  return stores[pluginId]
}

const byProvider = (provider: string) => {
  const p = installedOf('model').find(x => provider.startsWith(`${x.plugin_id}/`))
  if (!p)
    throw new ApiError('模型供应商未安装', 404)
  return storeOf(p.plugin_id)
}

function syncAvail(s: Store) {
  const avail = Object.entries(s.credentials).map(([id, c]) => ({ credential_id: id, credential_name: c.name }))
  const cc = s.provider.custom_configuration
  cc.available_credentials = avail
  if (!avail.find(a => a.credential_id === cc.current_credential_id)) {
    cc.current_credential_id = avail[0]?.credential_id
    cc.current_credential_name = avail[0]?.credential_name
  }
  else {
    cc.current_credential_name = s.credentials[cc.current_credential_id!].name
  }
  cc.status = avail.length || s.provider.configurate_methods.includes('customizable-model') ? 'active' : 'no-configure'
}

let defaults: DefaultModelSetting[] = [
  { model_type: 'llm', provider: 'sensetime/sensenova/sensenova', model: 'SenseNova-V6-Pro' },
  { model_type: 'text-embedding', provider: 'langgenius/openai_api_compatible/openai_api_compatible', model: 'bge-m3' },
]

export const modelDb = {
  providers: () => ({
    data: installedOf('model').map((p) => {
      const s = storeOf(p.plugin_id)
      // 升级 / 重装后同步插件版本信息
      Object.assign(s.provider, { version: p.version, latest_version: p.latest_version, installation_id: p.installation_id, plugin_unique_identifier: p.plugin_unique_identifier, source: p.source })
      return s.provider
    }),
  }),
  models: (provider: string) => ({ data: byProvider(provider).models }),
  toggleModel(provider: string, model: string, model_type: ModelType, enabled: boolean) {
    const it = byProvider(provider).models.find(x => x.model === model && x.model_type === model_type)
    if (it)
      it.status = enabled ? 'active' : 'disabled'
    return { result: 'success' }
  },
  removeModel(provider: string, model: string, model_type: ModelType) {
    const s = byProvider(provider)
    s.models = s.models.filter(x => !(x.model === model && x.model_type === model_type))
    return { result: 'success' }
  },
  credential(provider: string, id?: string) {
    const s = byProvider(provider)
    const c = id ? s.credentials[id] : undefined
    return { credentials: c?.values ?? {} }
  },
  addCredential(provider: string, credentials: FormValues, name?: string) {
    const s = byProvider(provider)
    const id = mockId('cred')
    s.credentials[id] = { name: name || `API Key ${Object.keys(s.credentials).length + 1}`, values: credentials }
    if (!s.provider.custom_configuration.current_credential_id)
      s.provider.custom_configuration.current_credential_id = id
    syncAvail(s)
    return { result: 'success' }
  },
  updateCredential(provider: string, credential_id: string, credentials: FormValues, name?: string) {
    const s = byProvider(provider)
    if (!s.credentials[credential_id])
      throw new ApiError('凭据不存在', 404)
    s.credentials[credential_id] = { name: name || s.credentials[credential_id].name, values: credentials }
    syncAvail(s)
    return { result: 'success' }
  },
  deleteCredential(provider: string, credential_id: string) {
    const s = byProvider(provider)
    delete s.credentials[credential_id]
    syncAvail(s)
    return { result: 'success' }
  },
  switchCredential(provider: string, credential_id: string) {
    const s = byProvider(provider)
    s.provider.custom_configuration.current_credential_id = credential_id
    syncAvail(s)
    return { result: 'success' }
  },
  addCustomModel(provider: string, model: string, model_type: ModelType, credentials: FormValues, name?: string) {
    const s = byProvider(provider)
    if (s.models.some(x => x.model === model && x.model_type === model_type))
      throw new ApiError(`模型 ${model} 已存在，换个名称或直接编辑它`, 400)
    s.models.unshift(m(model, model_type, { fetch_from: 'customizable-model', label: zh(String(credentials.display_name || model)) }))
    s.credentials[mockId('cred')] = { name: name || `${model} 凭据`, values: credentials }
    return { result: 'success' }
  },
  modelCredential(provider: string, model: string, model_type: ModelType) {
    const s = byProvider(provider)
    const lb = s.lb[`${model_type}:${model}`] ?? { enabled: false, configs: [{ id: '__inherit__', name: '__inherit__', enabled: true }] }
    return { credentials: {}, load_balancing: lb, available_credentials: s.provider.custom_configuration.available_credentials ?? [] }
  },
  saveLoadBalancing(provider: string, model: string, model_type: ModelType, load_balancing: ModelLoadBalancing) {
    const s = byProvider(provider)
    s.lb[`${model_type}:${model}`] = { ...load_balancing, configs: load_balancing.configs.map(c => ({ ...c, id: c.id ?? mockId('lb') })) }
    const it = s.models.find(x => x.model === model && x.model_type === model_type)
    if (it)
      it.load_balancing_enabled = load_balancing.enabled
    return { result: 'success' }
  },
  preferred(provider: string, t: PreferredProviderType) {
    byProvider(provider).provider.preferred_provider_type = t
    return { result: 'success' }
  },
  defaultModel(model_type: ModelType): { data: DefaultModel } {
    const d = defaults.find(x => x.model_type === model_type)
    if (!d)
      return { data: null }
    try {
      const s = byProvider(d.provider)
      return { data: { model: d.model, model_type, provider: { provider: d.provider, icon_small: s.provider.icon_small, label: s.provider.label } } }
    }
    catch {
      return { data: null }
    }
  },
  setDefaults(settings: DefaultModelSetting[]) {
    for (const st of settings) {
      defaults = defaults.filter(x => x.model_type !== st.model_type)
      if (st.provider && st.model)
        defaults.push(st)
    }
    return { result: 'success' }
  },
}
