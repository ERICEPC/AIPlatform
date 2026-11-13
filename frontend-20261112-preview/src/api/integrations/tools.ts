/* 工具接口：工具插件与授权、MCP、工作流即工具、API 即工具 */
import type {
  ApiParamSchema, ApiTestPayload, ApiToolProvider, CredentialFormSchema, CredentialInfo, CredentialType, CredentialVisibility, FormValues, McpPayload,
  OAuthClientSchema, OAuthUrl, ToolAction, ToolCollection, ToolPluginList, WorkflowToolDetail,
} from './types'
import { request } from '../http'
import { toolDb } from '../mock/integrations/tools'

/* ---------- 工具插件 ---------- */

/** GET /workspaces/current/plugin/tool/list?page&page_size&query&tags[] 工具插件列表（含内置工具集合） */
export const listToolPlugins = (q: { page?: number, page_size?: number, query?: string, tags?: string[] } = {}) =>
  request<ToolPluginList>({ method: 'GET', path: '/workspaces/current/plugin/tool/list', query: { page: 1, page_size: 100, ...q } }, () => toolDb.pluginList(q.query, q.tags))

const B = (provider: string) => `/workspaces/current/tool-provider/builtin/${provider}`

/** GET /workspaces/current/tool-provider/builtin/{provider}/tools 工具插件提供的动作 */
export const listBuiltinTools = (provider: string) =>
  request<ToolAction[]>({ method: 'GET', path: `${B(provider)}/tools` }, () => toolDb.tools(provider))

/** GET /workspaces/current/tool-provider/builtin/{provider}/credential/info 授权信息：支持的方式 + 凭据列表 */
export const getToolCredentialInfo = (provider: string) =>
  request<CredentialInfo>({ method: 'GET', path: `${B(provider)}/credential/info` }, () => toolDb.credentialInfo(provider))

/** GET /workspaces/current/tool-provider/builtin/{provider}/credential/schema/{type} 凭据表单 */
export const getToolCredentialSchema = (provider: string, type: CredentialType = 'api-key') =>
  request<CredentialFormSchema[]>({ method: 'GET', path: `${B(provider)}/credential/schema/${type}` }, () => toolDb.schema(provider))

/** POST /workspaces/current/tool-provider/builtin/{provider}/add 新增凭据；visibility 为 RaccoonX 扩展：only_me | all_team_members */
export const addToolCredential = (provider: string, body: { credentials: FormValues, type: CredentialType, name?: string, visibility?: CredentialVisibility }) =>
  request<{ result: string }>({ method: 'POST', path: `${B(provider)}/add`, body }, () => toolDb.addCredential(provider, body))

/** POST /workspaces/current/tool-provider/builtin/{provider}/update 改名、改凭据或改可见范围 */
export const updateToolCredential = (provider: string, body: { credential_id: string, credentials?: FormValues, name?: string, visibility?: CredentialVisibility }) =>
  request<{ result: string }>({ method: 'POST', path: `${B(provider)}/update`, body }, () => toolDb.updateCredential(provider, body))

/** POST /workspaces/current/tool-provider/builtin/{provider}/delete 删除凭据 */
export const deleteToolCredential = (provider: string, credential_id: string) =>
  request<{ result: string }>({ method: 'POST', path: `${B(provider)}/delete`, body: { credential_id } }, () => toolDb.deleteCredential(provider, credential_id))

/** POST /workspaces/current/tool-provider/builtin/{provider}/default-credential 设为默认 */
export const setDefaultToolCredential = (provider: string, id: string) =>
  request<{ result: string }>({ method: 'POST', path: `${B(provider)}/default-credential`, body: { id } }, () => toolDb.setDefault(provider, id))

/** GET /oauth/plugin/{provider}/tool/authorization-url 获取 OAuth 授权地址（新窗口打开） */
export const getToolOAuthUrl = (provider: string, visibility?: CredentialVisibility) =>
  request<OAuthUrl>({ method: 'GET', path: `/oauth/plugin/${provider}/tool/authorization-url`, query: { visibility } }, () => toolDb.oauthUrl(provider, visibility))

/** GET /workspaces/current/tool-provider/builtin/{provider}/oauth/client-schema OAuth 客户端设置 */
export const getToolOAuthClientSchema = (provider: string) =>
  request<OAuthClientSchema>({ method: 'GET', path: `${B(provider)}/oauth/client-schema` }, () => toolDb.oauthClientSchema(provider))

/** POST /workspaces/current/tool-provider/builtin/{provider}/oauth/custom-client 保存自定义 OAuth 客户端 */
export const setToolOAuthClient = (provider: string, body: { client_params: FormValues, enable_oauth_custom_client: boolean }) =>
  request<{ result: string }>({ method: 'POST', path: `${B(provider)}/oauth/custom-client`, body }, () => toolDb.setOauthClient(provider, body.client_params, body.enable_oauth_custom_client))

/* ---------- MCP ---------- */

/** GET /workspaces/current/tools/mcp MCP 服务列表 */
export const listMcp = () =>
  request<ToolCollection[]>({ method: 'GET', path: '/workspaces/current/tools/mcp' }, () => toolDb.mcpList())

/** POST /workspaces/current/tool-provider/mcp 添加 MCP 服务；identity_mode 为 RaccoonX 扩展：idp_token 转发用户身份 */
export const createMcp = (body: McpPayload) =>
  request<ToolCollection>({ method: 'POST', path: '/workspaces/current/tool-provider/mcp', body: {...body, configuration: {timeout:body.timeout, sse_read_timeout:body.sse_read_timeout}, icon_background:body.icon_background || ''} }, () => toolDb.createMcp(body))

/** PUT /workspaces/current/tool-provider/mcp 修改 MCP 服务 */
export const updateMcp = (body: McpPayload & { provider_id: string }) =>
  request<{ result: string }>({ method: 'PUT', path: '/workspaces/current/tool-provider/mcp', body: {...body, configuration:{timeout:body.timeout,sse_read_timeout:body.sse_read_timeout},icon_background:body.icon_background || ''} }, () => toolDb.updateMcp(body))

/** DELETE /workspaces/current/tool-provider/mcp 移除 MCP 服务 */
export const deleteMcp = (provider_id: string) =>
  request<{ result: string }>({ method: 'DELETE', path: '/workspaces/current/tool-provider/mcp', body: { provider_id } }, () => toolDb.deleteMcp(provider_id))

/** POST /workspaces/current/tool-provider/mcp/auth 授权 / 重新授权；需要用户登录时返回 authorization_url */
export const authorizeMcp = (body: { provider_id: string, authorization_code?: string }) =>
  request<{ result?: string, authorization_url?: string }>({ method: 'POST', path: '/workspaces/current/tool-provider/mcp/auth', body }, () => toolDb.authMcp(body.provider_id))

/** GET /workspaces/current/tool-provider/mcp/tools/{provider_id} 获取工具 */
export const fetchMcpTools = (id: string) =>
  request<{ tools: ToolAction[] }>({ method: 'GET', path: `/workspaces/current/tool-provider/mcp/tools/${id}` }, () => toolDb.mcpTools(id))

/** GET /workspaces/current/tool-provider/mcp/update/{provider_id} 从服务端重新拉取工具列表 */
export const refreshMcpTools = (id: string) =>
  request<{ tools: ToolAction[] }>({ method: 'GET', path: `/workspaces/current/tool-provider/mcp/update/${id}` }, () => toolDb.updateMcpTools(id))

/* ---------- 工作流即工具 ---------- */

/** GET /workspaces/current/tools/workflow 已发布为工具的工作流 */
export const listWorkflowTools = () =>
  request<ToolCollection[]>({ method: 'GET', path: '/workspaces/current/tools/workflow' }, () => toolDb.workflowList())

/** GET /workspaces/current/tool-provider/workflow/get?workflow_tool_id= 工作流工具详情 */
export const getWorkflowTool = (workflow_tool_id: string) =>
  request<WorkflowToolDetail>({ method: 'GET', path: '/workspaces/current/tool-provider/workflow/get', query: { workflow_tool_id } }, () => toolDb.workflowGet(workflow_tool_id))

/** POST /workspaces/current/tool-provider/workflow/update 保存工作流工具 */
export const updateWorkflowTool = (body: Pick<WorkflowToolDetail, 'workflow_tool_id' | 'name' | 'label' | 'description' | 'icon' | 'parameters' | 'labels' | 'privacy_policy'>) =>
  request<{ result: string }>({ method: 'POST', path: '/workspaces/current/tool-provider/workflow/update', body }, () => toolDb.workflowUpdate(body))

/** POST /workspaces/current/tool-provider/workflow/delete 删除工作流工具（工作流本身保留） */
export const deleteWorkflowTool = (workflow_tool_id: string) =>
  request<{ result: string }>({ method: 'POST', path: '/workspaces/current/tool-provider/workflow/delete', body: { workflow_tool_id } }, () => toolDb.workflowDelete(workflow_tool_id))

/* ---------- API 即工具 ---------- */

/** GET /workspaces/current/tools/api 自定义 API 工具列表 */
export const listApiTools = () =>
  request<ToolCollection[]>({ method: 'GET', path: '/workspaces/current/tools/api' }, () => toolDb.apiList())

/** GET /workspaces/current/tool-provider/api/get?provider= 读取 API 工具 */
export const getApiTool = (provider: string) =>
  request<ApiToolProvider>({ method: 'GET', path: '/workspaces/current/tool-provider/api/get', query: { provider } }, () => toolDb.apiGet(provider))

/** GET /workspaces/current/tool-provider/api/remote?url= 从 URL 导入 Schema */
export const importApiSchema = (url: string) =>
  request<{ schema: string }>({ method: 'GET', path: '/workspaces/current/tool-provider/api/remote', query: { url } }, () => toolDb.apiRemote(url))

/** POST /workspaces/current/tool-provider/api/schema 解析 Schema，返回可用工具 */
export const parseApiSchema = (schema: string) =>
  request<{ parameters_schema: ApiParamSchema[], schema_type: ApiToolProvider['schema_type'] }>({ method: 'POST', path: '/workspaces/current/tool-provider/api/schema', body: { schema } }, () => toolDb.apiParse(schema))

/** POST /workspaces/current/tool-provider/api/test/pre 保存前试调用一个接口 */
export const testApiTool = (body: ApiTestPayload) =>
  request<{ result?: string, error?: string }>({ method: 'POST', path: '/workspaces/current/tool-provider/api/test/pre', body }, () => toolDb.apiTest(body))

/** POST /workspaces/current/tool-provider/api/add | update 新建 / 保存 API 工具 */
export const saveApiTool = (body: ApiToolProvider, isNew: boolean) =>
  request<{ result: string }>({ method: 'POST', path: `/workspaces/current/tool-provider/api/${isNew ? 'add' : 'update'}`, body }, () => toolDb.apiSave(body, isNew))

/** POST /workspaces/current/tool-provider/api/delete 删除 API 工具 */
export const deleteApiTool = (provider: string) =>
  request<{ result: string }>({ method: 'POST', path: '/workspaces/current/tool-provider/api/delete', body: { provider } }, () => toolDb.apiDelete(provider))
