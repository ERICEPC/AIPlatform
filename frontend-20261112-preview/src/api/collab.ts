/*
  智能体协同（群聊）接口层（控制台前缀 /console/api）。
  一个群 = 若干位同事的助手 + 若干个 Agent（来自 Agents 模块：企服 / 我的）+ 群里的人；
  成员之间互相分派任务、交接，需要人核对的结论以卡片形式出现。
  mock 见 ./mock/collab.ts。时间字段均为 Unix 秒。
*/
import { request } from './http'
import * as db from './mock/collab'

/* ---------------- 类型 ---------------- */
export type CollabGroupId = string

/** 群图标（前端映射为图标与配色） */
export type GroupIcon = 'node' | 'presales' | 'support' | 'bank' | 'report' | 'team'

/** 成员状态：忙碌 / 空闲 / 离线（Agent 接入中或已下线也算离线） */
export type CollabMemberStatus = 'busy' | 'idle' | 'offline'

/** 同事的个人助手。id 即助手 id（见 src/data.ts 的 Assistant.id） */
export type CollabAssistantMember = {
  kind: 'assistant'
  id: string
  /** 展示名，例如「叶源的助手」 */
  name: string
  /** 助手主人 */
  owner: string
  /** 主人的岗位 */
  role: string
  avatar: string
  status: CollabMemberStatus
  /** 状态说明，例如「正在做效果评测」 */
  status_text: string
}

/** Agents 模块里的 Agent。source=enterprise 为企服 Agent（id 形如 ent-xxx），mine 为平台上搭建的 Agent（id 形如 agt-xxx） */
export type CollabAgentMember = {
  kind: 'agent'
  id: string
  name: string
  avatar: string
  source: 'enterprise' | 'mine'
  /** 一句话说明 */
  description: string
  status: CollabMemberStatus
  status_text: string
}

export type CollabMember = CollabAssistantMember | CollabAgentMember

/** 委派关系：from 把 task 交给 to（双方均为成员 id，可以是助手也可以是 Agent） */
export type CollabDelegation = { from: string, to: string, task: string }

export type CollabGroup = {
  router_id?: string | null
  kind?: 'group' | 'direct'
  id: CollabGroupId
  name: string
  icon: GroupIcon
  /** 群目标 / 说明 */
  description: string
  /** 群成员：同事的助手 + Agent；当前用户自己的助手总在第一位 */
  members: CollabMember[]
  /** 进行中的任务数 */
  running_tasks: number
  /** 当前用户未读消息数 */
  unread: number
  last_message: { author: string, text: string, created_at: number } | null
  /** 群内成员之间的委派关系（右侧协同网络使用） */
  delegations: CollabDelegation[]
  created_at: number
  updated_at: number
}

/** 消息正文片段：普通文字 / @ 提及（成员 id：助手或 Agent）/ 强调数字 */
export type Seg = string | { at: string } | { em: string }

export type SubtaskState = 'running' | 'done' | 'review'
export type TaskCard = {
  kind: 'task'
  title: string
  /** 截止说明，例如「11 月 11 日截止，还剩 8 天」 */
  due: string
  subtasks: { title: string, assignee_id: string, progress: number, state: SubtaskState }[]
}
export type ReviewState = 'pending' | 'confirmed' | 'rejected'
export type ReviewCard = {
  kind: 'review'
  id: string
  /** 核对类型，例如「对外承诺」「报价」 */
  label: string
  text: string
  reviewer_id: string
  state: ReviewState
}
export type FileCard = { kind: 'file', artifact_id: string, name: string, size: string }
export type MessageCard = TaskCard | ReviewCard | FileCard

export type CollabMessage =
  | { id: string, kind: 'user', author: string, content: Seg[], created_at: number }
  | { id: string, kind: 'assistant', assistant_id: string, content: Seg[], card?: MessageCard, created_at: number }
  /** Agent 的发言（页面带「Agent」标记） */
  | { id: string, kind: 'agent', agent_id: string, content: Seg[], card?: MessageCard, created_at: number }
  | { id: string, kind: 'handoff', from: string, to: string, task: string, created_at: number }

export type ArtifactType = 'doc' | 'data' | 'decision' | 'task'
export type ArtifactStatus = 'draft' | 'final' | 'exported' | ReviewState | 'running' | 'done'
export type CollabArtifact = {
  id: string
  type: ArtifactType
  title: string
  /** 文件扩展名（文档/数据类） */
  ext?: 'docx' | 'pdf' | 'xlsx' | 'csv' | 'md' | 'pptx'
  size?: string
  /** 下载地址（文档/数据类；mock 下为空，页面给出提示） */
  url?: string
  /** 产出者（成员 id：助手或 Agent） */
  author_id: string
  /** 关联任务 */
  task: string
  /** 来源消息，用于「跳转到消息」 */
  message_id: string
  status: ArtifactStatus
  /** 决策类：核对人 */
  reviewer_id?: string
  /** 任务类：整体进度与子任务 */
  progress?: number
  subtasks?: { title: string, assignee_id: string, progress: number }[]
  /** 预览：文档为分段文字，数据为表格 */
  preview: { paragraphs?: string[], table?: { columns: string[], rows: string[][] } }
  created_at: number
}

export type CreateGroupBody = {
  router_id?: string | null
  kind?: 'group' | 'direct'
  name: string
  /** 同事的助手 id（自己的助手由后端自动加入） */
  assistant_ids: string[]
  /** Agent id（企服 ent-xxx / 我的 agt-xxx，须已上线 / 已发布） */
  agent_ids: string[]
  description?: string
}
export type AddMembersBody = { router_id?: string, assistant_ids: string[], agent_ids: string[] }
export type SendMessageBody = { content: string, request_key?: string, steps?: string[] }

/* ---------------- 接口 ---------------- */
/** GET /collab/groups 当前用户所在的全部群聊（按最近活跃倒序） */
export const listGroups = () =>
  request<{ data: CollabGroup[] }>({ method: 'GET', path: '/collab/groups' }, () => db.listGroups())

/** POST /collab/groups 新建群聊，返回新群 */
export const createGroup = (body: CreateGroupBody) =>
  request<CollabGroup>({ method: 'POST', path: '/collab/groups', body }, () => db.createGroup(body))

/** DELETE /collab/groups/{id} 解散当前用户创建的群聊 */
export const dissolveGroup = (id: CollabGroupId) =>
  request<{ deleted: boolean, id: CollabGroupId }>({ method: 'DELETE', path: `/collab/groups/${id}` }, () => ({ deleted: true, id }))

/** POST /collab/groups/{id}/members 往已有群里添加成员（助手 / Agent），返回更新后的群 */
export const addMembers = (id: CollabGroupId, body: AddMembersBody) =>
  request<CollabGroup>({ method: 'POST', path: `/collab/groups/${id}/members`, body }, () => db.addMembers(id, body))

/** GET /collab/groups/{id}/messages 群消息（按时间正序）；读取后该群未读清零 */
export const listMessages = (id: CollabGroupId) =>
  request<{ data: CollabMessage[] }>({ method: 'GET', path: `/collab/groups/${id}/messages` }, () => db.listMessages(id))

/** POST /collab/groups/{id}/messages 在群里发言（可含 @某某的助手 / @Agent 名称），返回发出的消息；被 @ 的成员稍后回复 */
export const sendMessage = (id: CollabGroupId, body: SendMessageBody) =>
  request<CollabMessage>({ method: 'POST', path: `/collab/groups/${id}/messages`, body }, () => db.sendMessage(id, body))

/** GET /collab/groups/{id}/artifacts 群内助手与 Agent 产出的文档、数据、决策与任务 */
export const listArtifacts = (id: CollabGroupId) =>
  request<{ data: CollabArtifact[] }>({ method: 'GET', path: `/collab/groups/${id}/artifacts` }, () => db.listArtifacts(id))

export type CollabTask = { routing?: { leader: string, phase: 'planning' | 'executing', assignment: string, rounds: number } | null, id: string, prompt: string, state: 'queued' | 'running' | 'ready' | 'completed' | 'failed' | 'needs_input' | 'cancelled', cursor: number, steps: string[], error?: string }
export const listMembers = () => request<{ data: (CollabMember & { available: boolean })[] }>({ method: 'GET', path: '/collab/members' }, () => ({ data: [] }))
export const listTasks = (id: string) => request<{ data: CollabTask[] }>({ method: 'GET', path: `/collab/groups/${id}/tasks` }, () => ({ data: [] }))
export const taskAction = (id: string, action: 'accept' | 'cancel') => request<{ state: string }>({ method: 'POST', path: `/collab/tasks/${id}/${action}` }, () => ({ state: 'cancelled' }))

export const replaceMembers = (id: CollabGroupId, body: AddMembersBody) => request<CollabGroup>({method: 'PUT', path: `/collab/groups/${id}/members`, body}, () => { throw new Error('需要连接服务器') })
