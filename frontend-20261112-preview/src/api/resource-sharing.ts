import { listMcp } from './integrations/tools'
import { getAgent } from './agents'
import { getTeam } from './teams'
import { request } from './http'
import type { ReleaseRequest } from './releases'
import * as db from './mock/admin'
export type ResourceKind = 'agent' | 'team' | 'knowledge' | 'skill' | 'mcp'
export type ShareBody = { resource_kind: ResourceKind, object_id: string, name: string, reason: string, scope: string }
export const listResourceShares = () => request<{ data: ReleaseRequest[] }>({ method: 'GET', path: '/resource-shares' }, () => db.resourceShares())
export const submitResourceShare = async (body: ShareBody) => {
  if (body.resource_kind === 'agent' && !(await getAgent(body.object_id)).active_config_is_published) throw new Error('草稿不能共享，请先发布智能体')
  if (body.resource_kind === 'team' && !(await getTeam(body.object_id)).team.published_id) throw new Error('草稿不能共享，请先发布智能体团队')
  if (body.resource_kind === 'mcp' && !(await listMcp()).find(m => m.id === body.object_id)?.is_team_authorization) throw new Error('请先完成 MCP 服务授权，再申请共享')
  return request<ReleaseRequest>({ method: 'POST', path: '/resource-shares', body }, () => db.submitResourceShare(body))
}
export const RESOURCE_NAMES: Record<ResourceKind, string> = { agent: '智能体', team: '智能体团队', knowledge: '知识库', skill: 'Skills', mcp: 'MCP 与工具' }
export function resourceShareState(rows: ReleaseRequest[], kind: ResourceKind, id: string) {
  const matches = rows.filter(r => (r.resource_share?.resource_kind === kind && r.object_id === id) || (kind === 'team' && r.expert_team?.team_id === id))
  return matches.find(r => r.state === 'approved') ?? matches[0]
}
