/* 模型供应商接口 */
import type {
  DefaultModel, DefaultModelSetting, FormValues, ModelCredentialDetail, ModelItem, ModelLoadBalancing, ModelProvider, ModelType, PreferredProviderType,
} from './types'
import { request } from '../http'
import { modelDb } from '../mock/integrations/models'

const P = (provider: string) => `/workspaces/current/model-providers/${provider}`

/** GET /workspaces/current/model-providers 已安装的模型供应商 */
export const listModelProviders = () =>
  request<{ data: ModelProvider[] }>({ method: 'GET', path: '/workspaces/current/model-providers' }, () => modelDb.providers())

/** GET /workspaces/current/model-providers/{provider}/models 供应商下的模型 */
export const listProviderModels = (provider: string) =>
  request<{ data: ModelItem[] }>({ method: 'GET', path: `${P(provider)}/models` }, () => modelDb.models(provider))

/** PATCH /workspaces/current/model-providers/{provider}/models/enable|disable 启用 / 停用模型 */
export const toggleModel = (provider: string, body: { model: string, model_type: ModelType }, enabled: boolean) =>
  request<{ result: string }>({ method: 'PATCH', path: `${P(provider)}/models/${enabled ? 'enable' : 'disable'}`, body }, () => modelDb.toggleModel(provider, body.model, body.model_type, enabled))

/** DELETE /workspaces/current/model-providers/{provider}/models 删除自定义模型 */
export const removeCustomModel = (provider: string, body: { model: string, model_type: ModelType }) =>
  request<{ result: string }>({ method: 'DELETE', path: `${P(provider)}/models`, body }, () => modelDb.removeModel(provider, body.model, body.model_type))

/** GET /workspaces/current/model-providers/{provider}/credentials?credential_id= 读取一条供应商凭据（编辑回填） */
export const getProviderCredential = (provider: string, credential_id?: string) =>
  request<{ credentials: FormValues }>({ method: 'GET', path: `${P(provider)}/credentials`, query: { credential_id } }, () => modelDb.credential(provider, credential_id))

/** POST /workspaces/current/model-providers/{provider}/credentials 新增供应商凭据 */
export const addProviderCredential = (provider: string, body: { credentials: FormValues, name?: string }) =>
  request<{ result: string }>({ method: 'POST', path: `${P(provider)}/credentials`, body }, () => modelDb.addCredential(provider, body.credentials, body.name))

/** PUT /workspaces/current/model-providers/{provider}/credentials 修改供应商凭据 */
export const updateProviderCredential = (provider: string, body: { credential_id: string, credentials: FormValues, name?: string }) =>
  request<{ result: string }>({ method: 'PUT', path: `${P(provider)}/credentials`, body }, () => modelDb.updateCredential(provider, body.credential_id, body.credentials, body.name))

/** DELETE /workspaces/current/model-providers/{provider}/credentials 删除供应商凭据 */
export const deleteProviderCredential = (provider: string, credential_id: string) =>
  request<{ result: string }>({ method: 'DELETE', path: `${P(provider)}/credentials`, body: { credential_id } }, () => modelDb.deleteCredential(provider, credential_id))

/** POST /workspaces/current/model-providers/{provider}/credentials/switch 切换当前使用的凭据 */
export const switchProviderCredential = (provider: string, credential_id: string) =>
  request<{ result: string }>({ method: 'POST', path: `${P(provider)}/credentials/switch`, body: { credential_id } }, () => modelDb.switchCredential(provider, credential_id))

/** POST /workspaces/current/model-providers/{provider}/models/credentials 添加自定义模型（模型名 + 类型 + 凭据） */
export const addCustomModel = (provider: string, body: { model: string, model_type: ModelType, credentials: FormValues, name?: string }) =>
  request<{ result: string }>({ method: 'POST', path: `${P(provider)}/models/credentials`, body }, () => modelDb.addCustomModel(provider, body.model, body.model_type, body.credentials, body.name))

/** GET /workspaces/current/model-providers/{provider}/models/credentials?model=&model_type= 模型凭据与负载均衡配置 */
export const getModelCredential = (provider: string, model: string, model_type: ModelType) =>
  request<ModelCredentialDetail>({ method: 'GET', path: `${P(provider)}/models/credentials`, query: { model, model_type } }, () => modelDb.modelCredential(provider, model, model_type))

/** POST /workspaces/current/model-providers/{provider}/models 保存模型负载均衡 */
export const saveModelLoadBalancing = (provider: string, body: { model: string, model_type: ModelType, load_balancing: ModelLoadBalancing }) =>
  request<{ result: string }>({ method: 'POST', path: `${P(provider)}/models`, body }, () => modelDb.saveLoadBalancing(provider, body.model, body.model_type, body.load_balancing))

/** POST /workspaces/current/model-providers/{provider}/preferred-provider-type 使用优先级：系统额度 / 自有凭据 */
export const setPreferredProviderType = (provider: string, preferred_provider_type: PreferredProviderType) =>
  request<{ result: string }>({ method: 'POST', path: `${P(provider)}/preferred-provider-type`, body: { preferred_provider_type } }, () => modelDb.preferred(provider, preferred_provider_type))

/** GET /workspaces/current/default-model?model_type= 某类型的默认模型 */
export const getDefaultModel = (model_type: ModelType) =>
  request<{ data: DefaultModel }>({ method: 'GET', path: '/workspaces/current/default-model', query: { model_type } }, () => modelDb.defaultModel(model_type))

/** POST /workspaces/current/default-model 批量保存默认模型 */
export const saveDefaultModels = (model_settings: DefaultModelSetting[]) =>
  request<{ result: string }>({ method: 'POST', path: '/workspaces/current/default-model', body: { model_settings } }, () => modelDb.setDefaults(model_settings))
