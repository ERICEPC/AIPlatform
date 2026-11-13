/*
  发布申请（开发者侧）。2026-11-08 起：新建的智能体、由个人助手复制出的专家智能体、智能体团队、Skill 包，
  发布都要先提交申请，由对应范围的普通管理员（或超级管理员）审批通过后才发布，其他用户才能看到。
  审批中的版本继续作为草稿，不替换正在使用的版本；「允许发布」和「允许公开」是两个独立决定。
  管理员侧审批接口见 ./admin.ts。mock 与管理员审批共用同一份数据（./mock/admin.ts）。
*/
import { request } from './http'
import * as db from './mock/admin'

export type ReleaseKind = 'agent' | 'assistant_copy' | 'team' | 'skill' | 'buddy_app' | 'expert_team' | 'resource_share'
export type Visibility = 'private' | 'department' | 'org' | 'public'
export type ReleaseState = 'draft' | 'pending' | 'approved' | 'returned' | 'rejected' | 'withdrawn'
export type ReleaseRequest = {
  resource_share?: { resource_kind: import('./resource-sharing').ResourceKind }
  expert_team?: { group_id: string, group_name: string, config: import('./teams').Config, member_mapping: { source: string, agent_id: string }[], team_id?: string }
  id: string
  kind: ReleaseKind
  object_id: string
  name: string
  version: string
  note: string
  visibility: Visibility
  scope: string
  applicant: string
  submitted_at: string
  state: ReleaseState
  approver?: string
  decided_at?: string
  comment?: string
  /** 自动检查：模型、工具授权、知识库权限、测试样例、依赖 */
  checks: { level: 'ok' | 'warn' | 'risk', text: string }[]
  /** 资源依赖：发布后这些资源的可见范围不会自动扩大 */
  dependencies: string[]
  /** 版本变化摘要 */
  changes: string[]
  test_summary: string
}
export type CopyAssistantBody = { name: string, desc: string, include_instructions: boolean, include_skills: string[], include_memory: 'none' | 'confirmed_experience' | 'selected', memory_ids: string[], visibility: Visibility, scope: string }

/** GET /releases/mine 我提交的发布申请 */
export const listMyReleases = () => request<{ data: ReleaseRequest[] }>({ method: 'GET', path: '/releases/mine' }, () => db.myReleases())
/** POST /releases 提交发布申请（智能体、智能体团队、Skill、Buddy 应用） */
export const submitRelease = (b: { kind: ReleaseKind, object_id: string, name: string, version_note: string, visibility: Visibility, scope: string, test_summary: string }) =>
  request<ReleaseRequest>({ method: 'POST', path: '/releases', body: b }, () => db.submitRelease(b))
/** POST /releases/{id}/withdraw 撤回尚未审批的申请 */
export const withdrawRelease = (id: string) => request<ReleaseRequest>({ method: 'POST', path: `/releases/${id}/withdraw` }, () => db.withdrawRelease(id))
/** POST /personal-assistant/copy-as-agent 把个人助手复制为专家智能体草稿，并提交发布审批 */
export const copyAssistantAsAgent = (b: CopyAssistantBody) =>
  request<{ agent_id: string, release: ReleaseRequest }>({ method: 'POST', path: '/personal-assistant/copy-as-agent', body: b }, () => db.copyAssistant(b))

export const KIND_TEXT: Record<ReleaseKind, string> = { resource_share: '资源共享沉淀', expert_team: '协同沉淀专家团', agent: '智能体', assistant_copy: '助手复制的专家智能体', team: '智能体团队', skill: 'Skill 包', buddy_app: 'Buddy 应用' }
export const VIS_TEXT: Record<Visibility, string> = { private: '仅自己', department: '部门内', org: '组织内', public: '公开（含外部访问）' }
export const STATE_TEXT: Record<ReleaseState, [string, 'neutral' | 'amber' | 'mint' | 'rose' | 'volt']> = { draft: ['草稿', 'neutral'], pending: ['审批中', 'amber'], approved: ['已通过', 'mint'], returned: ['已退回', 'rose'], rejected: ['已退回', 'rose'], withdrawn: ['已撤回', 'neutral'] }

/** Submit an immutable collaboration snapshot. The server must create the team atomically only on approval. */
export type ExpertTeamBody = { config: import('./teams').Config, member_mapping: { source: string, agent_id: string }[], scope: string }
export const submitExpertTeam = (groupId: string, body: ExpertTeamBody) => request<ReleaseRequest>({ method: 'POST', path: `/collab/groups/${groupId}/expert-team-requests`, body }, () => db.submitExpertTeam(groupId, body))
export const getExpertTeamRequest = (groupId: string) => request<{ request: ReleaseRequest | null }>({ method: 'GET', path: `/collab/groups/${groupId}/expert-team-requests/latest` }, () => db.latestExpertTeam(groupId))
