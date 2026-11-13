/* 数据来源、触发器、Agent 策略、扩展端点、自定义端点接口 */
import type {
  AgentStrategyProvider, ApiBasedExtension, DatasourceAuth, FormValues, OAuthUrl, PluginEndpoint, TriggerCredentialType, TriggerLog, TriggerOAuthConfig,
  TriggerProvider, TriggerSubscription,
} from './types'
import { request } from '../http'
import { otherDb } from '../mock/integrations/others'

/* ---------- 数据来源（key = plugin_id/provider） ---------- */
const DS = (key: string) => `/auth/plugin/datasource/${key}`

/** GET /auth/plugin/datasource/list 已安装的数据来源插件及其凭据 */
export const listDatasources = () =>
  request<DatasourceAuth[]>({ method: 'GET', path: '/auth/plugin/datasource/list' }, () => otherDb.dsList())

/** POST /auth/plugin/datasource/{key} 新增 API Key 凭据 */
export const addDatasourceCredential = (key: string, body: { credentials: FormValues, type: 'api-key', name?: string }) =>
  request<{ result: string }>({ method: 'POST', path: DS(key), body }, () => otherDb.dsAdd(key, body))

/** POST /auth/plugin/datasource/{key}/default 设为默认 */
export const setDefaultDatasourceCredential = (key: string, id: string) =>
  request<{ result: string }>({ method: 'POST', path: `${DS(key)}/default`, body: { id } }, () => otherDb.dsDefault(key, id))

/** POST /auth/plugin/datasource/{key}/update-name 重命名 */
export const renameDatasourceCredential = (key: string, credential_id: string, name: string) =>
  request<{ result: string }>({ method: 'POST', path: `${DS(key)}/update-name`, body: { credential_id, name } }, () => otherDb.dsRename(key, credential_id, name))

/** POST /auth/plugin/datasource/{key}/update 修改凭据 */
export const updateDatasourceCredential = (key: string, body: { credential_id: string, credentials: FormValues, name?: string }) =>
  request<{ result: string }>({ method: 'POST', path: `${DS(key)}/update`, body }, () => otherDb.dsUpdate(key, body.credential_id, body.credentials, body.name))

/** POST /auth/plugin/datasource/{key}/delete 删除凭据 */
export const deleteDatasourceCredential = (key: string, credential_id: string) =>
  request<{ result: string }>({ method: 'POST', path: `${DS(key)}/delete`, body: { credential_id } }, () => otherDb.dsDelete(key, credential_id))

/** GET /oauth/plugin/{key}/datasource/get-authorization-url OAuth 授权地址 */
export const getDatasourceOAuthUrl = (key: string) =>
  request<OAuthUrl>({ method: 'GET', path: `/oauth/plugin/${key}/datasource/get-authorization-url` }, () => otherDb.dsOAuth(key))

/* ---------- 触发器 ---------- */
const T = (provider: string) => `/workspaces/current/trigger-provider/${provider}`

/** GET /workspaces/current/triggers 已安装的触发器插件 */
export const listTriggerProviders = () =>
  request<TriggerProvider[]>({ method: 'GET', path: '/workspaces/current/triggers' }, () => otherDb.triggers())

/** GET /workspaces/current/trigger-provider/{provider}/info 触发器详情（事件、创建方式、表单） */
export const getTriggerProvider = (provider: string) =>
  request<TriggerProvider>({ method: 'GET', path: `${T(provider)}/info` }, () => otherDb.triggerInfo(provider))

/** GET /workspaces/current/trigger-provider/{provider}/subscriptions/list 订阅列表 */
export const listSubscriptions = (provider: string) =>
  request<TriggerSubscription[]>({ method: 'GET', path: `${T(provider)}/subscriptions/list` }, () => otherDb.subs(provider))

/** POST /workspaces/current/trigger-provider/{provider}/subscriptions/builder/create 新建订阅草稿 */
export const createSubscriptionBuilder = (provider: string, credential_type: TriggerCredentialType) =>
  request<{ subscription_builder: TriggerSubscription }>({ method: 'POST', path: `${T(provider)}/subscriptions/builder/create`, body: { credential_type } }, () => otherDb.builderCreate(provider, credential_type))

/** POST /workspaces/current/trigger-provider/{provider}/subscriptions/builder/update/{id} 更新草稿（名称、参数、属性） */
export const updateSubscriptionBuilder = (provider: string, id: string, body: { name?: string, parameters?: FormValues, properties?: FormValues, credentials?: FormValues }) =>
  request<TriggerSubscription>({ method: 'POST', path: `${T(provider)}/subscriptions/builder/update/${id}`, body }, () => otherDb.builderUpdate(id, body))

/** POST /workspaces/current/trigger-provider/{provider}/subscriptions/builder/verify-and-update/{id} 校验凭据 */
export const verifySubscriptionBuilder = (provider: string, id: string, credentials: FormValues) =>
  request<{ verified: boolean }>({ method: 'POST', path: `${T(provider)}/subscriptions/builder/verify-and-update/${id}`, body: { credentials } }, () => otherDb.builderVerify(id, credentials))

/** POST /workspaces/current/trigger-provider/{provider}/subscriptions/builder/build/{id} 生成正式订阅 */
export const buildSubscription = (provider: string, id: string, body: { name?: string, parameters?: FormValues }) =>
  request<{ result: string }>({ method: 'POST', path: `${T(provider)}/subscriptions/builder/build/${id}`, body }, () => otherDb.builderBuild(id, body))

/** GET /workspaces/current/trigger-provider/{provider}/subscriptions/builder/logs/{id} 手动创建时收到的回调请求 */
export const getBuilderLogs = (provider: string, id: string) =>
  request<{ logs: TriggerLog[] }>({ method: 'GET', path: `${T(provider)}/subscriptions/builder/logs/${id}` }, () => otherDb.builderLogs(id))

/** POST /workspaces/current/trigger-provider/{subscription_id}/subscriptions/delete 删除订阅 */
export const deleteSubscription = (subscriptionId: string) =>
  request<{ result: string }>({ method: 'POST', path: `/workspaces/current/trigger-provider/${subscriptionId}/subscriptions/delete` }, () => otherDb.subDelete(subscriptionId))

/** POST /workspaces/current/trigger-provider/{subscription_id}/subscriptions/update 修改订阅（名称、属性、参数） */
export const updateSubscription = (subscriptionId: string, body: { name?: string, properties?: FormValues, parameters?: FormValues }) =>
  request<{ result: string }>({ method: 'POST', path: `/workspaces/current/trigger-provider/${subscriptionId}/subscriptions/update`, body }, () => otherDb.subUpdate(subscriptionId, body))

/** GET /workspaces/current/trigger-provider/{provider}/oauth/client OAuth 客户端配置 */
export const getTriggerOAuthClient = (provider: string) =>
  request<TriggerOAuthConfig>({ method: 'GET', path: `${T(provider)}/oauth/client` }, () => otherDb.tOAuthGet(provider))

/** POST /workspaces/current/trigger-provider/{provider}/oauth/client 保存自定义 OAuth 客户端 */
export const setTriggerOAuthClient = (provider: string, body: { client_params: FormValues, enabled: boolean }) =>
  request<{ result: string }>({ method: 'POST', path: `${T(provider)}/oauth/client`, body }, () => otherDb.tOAuthSet(provider, body.client_params, body.enabled))

/** GET /workspaces/current/trigger-provider/{provider}/subscriptions/oauth/authorize 发起 OAuth 授权，返回授权地址与草稿 */
export const authorizeTriggerOAuth = (provider: string) =>
  request<{ authorization_url: string, subscription_builder: TriggerSubscription }>({ method: 'GET', path: `${T(provider)}/subscriptions/oauth/authorize` }, () => otherDb.tAuthorize(provider))

/* ---------- Agent 策略 ---------- */

/** GET /workspaces/current/agent-providers 已安装的 Agent 策略插件 */
export const listAgentProviders = () =>
  request<AgentStrategyProvider[]>({ method: 'GET', path: '/workspaces/current/agent-providers' }, () => otherDb.agents())

/** GET /workspaces/current/agent-provider/{provider} 策略详情（参数、输出） */
export const getAgentProvider = (provider: string) =>
  request<AgentStrategyProvider>({ method: 'GET', path: `/workspaces/current/agent-provider/${provider}` }, () => otherDb.agent(provider))

/* ---------- 扩展端点 ---------- */

/** GET /workspaces/current/endpoints/list/plugin?plugin_id&page=1&page_size=100 插件的端点 */
export const listPluginEndpoints = (plugin_id: string) =>
  request<{ endpoints: PluginEndpoint[] }>({ method: 'GET', path: '/workspaces/current/endpoints/list/plugin', query: { plugin_id, page: 1, page_size: 100 } }, () => otherDb.endpoints(plugin_id))

/** POST /workspaces/current/endpoints/create 新建端点 */
export const createEndpoint = (body: { plugin_unique_identifier: string, settings: FormValues, name: string }) =>
  request<{ result: string }>({ method: 'POST', path: '/workspaces/current/endpoints/create', body }, () => otherDb.epCreate(body.plugin_unique_identifier, body.settings, body.name))

/** POST /workspaces/current/endpoints/update 修改端点 */
export const updateEndpoint = (body: { endpoint_id: string, settings: FormValues, name: string }) =>
  request<{ result: string }>({ method: 'POST', path: '/workspaces/current/endpoints/update', body }, () => otherDb.epUpdate(body.endpoint_id, body.settings, body.name))

/** POST /workspaces/current/endpoints/delete 删除端点 */
export const deleteEndpoint = (endpoint_id: string) =>
  request<{ result: string }>({ method: 'POST', path: '/workspaces/current/endpoints/delete', body: { endpoint_id } }, () => otherDb.epDelete(endpoint_id))

/** POST /workspaces/current/endpoints/enable | disable 启用 / 停用端点 */
export const toggleEndpoint = (endpoint_id: string, enabled: boolean) =>
  request<{ result: string }>({ method: 'POST', path: `/workspaces/current/endpoints/${enabled ? 'enable' : 'disable'}`, body: { endpoint_id } }, () => otherDb.epToggle(endpoint_id, enabled))

/* ---------- 自定义端点（API 扩展） ---------- */

/** GET /api-based-extension 列表 */
export const listApiExtensions = () =>
  request<Required<ApiBasedExtension>[]>({ method: 'GET', path: '/api-based-extension' }, () => otherDb.exts())

/** GET /api-based-extension/{id} 详情 */
export const getApiExtension = (id: string) =>
  request<Required<ApiBasedExtension>>({ method: 'GET', path: `/api-based-extension/${id}` }, () => otherDb.ext(id))

/** POST /api-based-extension（新建） | POST /api-based-extension/{id}（修改） */
export const saveApiExtension = (body: ApiBasedExtension) =>
  request<Required<ApiBasedExtension>>({ method: 'POST', path: body.id ? `/api-based-extension/${body.id}` : '/api-based-extension', body }, () => otherDb.extSave(body))

/** DELETE /api-based-extension/{id} 删除 */
export const deleteApiExtension = (id: string) =>
  request<{ result: string }>({ method: 'DELETE', path: `/api-based-extension/${id}` }, () => otherDb.extDelete(id))
