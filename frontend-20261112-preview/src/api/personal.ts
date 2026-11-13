/*
 * 个人助手生产接口。
 * 页面只负责展示状态；配置、会话、运行任务和交付物均由 API + DeepSeek
 * Harness 持久化和执行。这样切换页面或刷新时不会把会话退化为浏览器本地
 * 演示数据，也不会把内部执行轨迹误当成用户回复。
 */
import { request, requestBlob } from './http'

export type ResourceKind = 'agents' | 'kb' | 'skills' | 'mcps'
export type Resource = { id: string, name: string, hint: string, available: boolean, version?: string }
export type Resources = Record<ResourceKind, Resource[]> & { models: { id: string, provider: string, name: string, available: boolean }[] }
export type PersonalConfig = { desktopDeviceId?: string, desktopWorkspaceId?: string, workspacePath?: string, name: string, role: string, instructions: string, provider: string, model: string, maxTokens: number, agents: string[], kb: string[], skills: string[], mcps: string[], collaborationEnabled?: boolean, memoryEnabled: boolean, memory: string, executionEnabled: boolean }
export type PersonalState = { scope?: { account_id: string, tenant_id: string }, config: PersonalConfig, revision: number, applied_revision: number }
export type PersonalFile = { name: string, data: string }
export type ExecutionStep = { label: string, status: 'done' | 'error' | 'unknown', duration?: number | null }
export type Artifact = { id: string, name: string, size: number, cloud_saved?: boolean, data?: string, sync_error?: string }
export type PersonalTurn = { review_id?: string; q: string, a: string, status?: string, duration?: number, steps?: ExecutionStep[], artifacts?: Artifact[] }
export type PersonalSession = { session_id: string, workspace_path?: string, title: string, run_state?: string, revision: number, updated_at: string, archived_at?: string | null }
type AssistantResult = { answer: string, sessionId: string, finishReason: string, duration?: number, steps?: ExecutionStep[], artifacts?: Artifact[] }

const liveOnly = (name: string): never => { throw new Error(`${name} 需要连接 Raccoon X 服务端`) }
export const loadPersonal = () => request<PersonalState>({ method: 'GET', path: '/personal-assistant/config' }, () => liveOnly('个人助手配置'))
export const personalResources = () => request<Resources>({ method: 'GET', path: '/personal-assistant/resources' }, () => liveOnly('平台能力目录'))
export const savePersonal = (state: PersonalState) => request<PersonalState>({ method: 'PUT', path: '/personal-assistant/config', body: state }, () => liveOnly('保存个人助手配置'))
export const applyPersonal = () => request<PersonalState>({ method: 'POST', path: '/personal-assistant/apply' }, () => liveOnly('应用个人助手配置'))
export const sendPersonal = (prompt: string, sessionId?: string, files: PersonalFile[] = [], newSessionId?: string, workspacePath?: string) => request<AssistantResult>({ method: 'POST', path: '/personal-assistant/messages', body: { prompt, sessionId, files, newSessionId, workspacePath } }, () => liveOnly('个人助手问答'))
export const listPersonalSessions = (offset = 0) => request<{ data: PersonalSession[], has_more: boolean }>({ method: 'GET', path: '/personal-assistant/sessions', query: { offset } }, () => liveOnly('历史对话'))
export const getPersonalSession = (id: string) => request<PersonalSession & { turns: PersonalTurn[], can_continue: boolean }>({ method: 'GET', path: `/personal-assistant/sessions/${id}` }, () => liveOnly('历史对话详情'))
export const updatePersonalSession = (id: string, body: { title?: string, archived?: boolean }) => request<{ ok: boolean }>({ method: 'PATCH', path: `/personal-assistant/sessions/${id}`, body }, () => liveOnly('历史对话更新'))
export const deletePersonalSession = (id: string) => request<{ ok: boolean }>({ method: 'DELETE', path: `/personal-assistant/sessions/${id}` }, () => liveOnly('历史对话删除'))
export const downloadPersonalFile = (sessionId: string, fileId: string) => requestBlob({ method: 'GET', path: `/personal-assistant/sessions/${sessionId}/files/${encodeURIComponent(fileId)}` }, () => liveOnly('文件下载'))

export const deleteAllPersonalSessions = () => request<{ ok: boolean, deleted: number }>({ method: 'DELETE', path: '/personal-assistant/sessions' }, () => liveOnly('清空历史对话'))

export const choosePersonalWorkspace = () => request<{ workspacePath?: string, cancelled?: boolean }>({ method: "POST", path: "/personal-assistant/workspace/choose" }, () => liveOnly("选择本机文件夹"))

export const previewPersonalFile = (sessionId: string, fileId: string) => requestBlob({ method: 'GET', path: `/personal-assistant/sessions/${sessionId}/files/${encodeURIComponent(fileId)}`, query: { preview: '1' } }, () => liveOnly('文件预览'))
