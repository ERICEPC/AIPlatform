import type { AgentAppPartial } from '@/api/agents'
import type { Agent } from '@/api/teams'
import { useCallback, useMemo } from 'react'
import { listAgents } from '@/api/agents'
import { useQuery } from '@/api/hooks'
import { cn } from '@/lib/cn'
import { agentAvatar } from './shared'

/*
  团队成员的 Agent 来源 = 侧栏 Agents 模块里的 Agent（只读调用 listAgents）。
  是否可加入、版本号以团队接口返回的已发布名册（GET /agent-teams[/id] 的 agents）为准：
  在名册里 = 已发布，可以加入；不在名册里 = 还没发布，只展示不可选。
*/
export type TeamAgent = {
  id: string
  name: string
  description: string
  role: string
  avatar: string
  /** 已发布版本号；null = 未发布 */
  version: number | null
  /** 创建人（来自 Agents 模块；名册独有的 Agent 没有） */
  author: string | null
  /** 是否在 Agents 模块列表里 */
  inModule: boolean
}

const avatarOf = (a: AgentAppPartial) => (a.icon_type !== 'emoji' && a.icon_url) || agentAvatar(a)

export function useAgentSource(roster: Agent[]) {
  const q = useQuery(() => listAgents({ page: 1, limit: 100, sort_by: 'last_modified' }), [])
  const moduleList = useMemo(() => q.data?.data ?? [], [q.data])
  const rosterById = useMemo(() => new Map(roster.map(a => [a.id, a])), [roster])
  const moduleById = useMemo(() => new Map(moduleList.map(a => [a.id, a])), [moduleList])

  const resolve = useCallback((id: string): TeamAgent => {
    const r = rosterById.get(id)
    const m = moduleById.get(id)
    return {
      id,
      name: m?.name ?? r?.name ?? '已删除的 Agent',
      description: m?.description || r?.description || '',
      role: m?.role ?? '',
      avatar: m ? avatarOf(m) : agentAvatar(r ?? { id, name: id }),
      version: r?.version ?? null,
      author: m?.author_name ?? null,
      inModule: !!m,
    }
  }, [rosterById, moduleById])

  /** 「添加 Agent」/「更换团长」里列出的候选：Agents 模块全部 Agent，已发布的排前面 */
  const candidates = useMemo(
    () => moduleList.map(a => resolve(a.id)).sort((a, b) => Number(b.version != null) - Number(a.version != null)),
    [moduleList, resolve],
  )
  return { candidates, resolve, loading: q.loading, error: q.error, reload: q.reload }
}

export function AgentFace({ agent, size = 40, lead, className }: { agent: Pick<TeamAgent, 'avatar' | 'name'>, size?: number, lead?: boolean, className?: string }) {
  return (
    <img
      src={agent.avatar}
      alt=""
      title={agent.name}
      className={cn('shrink-0 rounded-full border bg-glass-3 object-cover', lead ? 'border-2 border-volt' : 'border-line', className)}
      style={{ width: size, height: size }}
    />
  )
}

/** 新加入的 Agent 默认用它的简介作为「负责什么」，后端要求该字段非空 */
export const defaultDuty = (a: Pick<TeamAgent, 'name' | 'description' | 'role'>) => (a.description || a.role || `${a.name}负责的工作`).slice(0, 1000)

/** 来源标签：Agents 模块里的显示创建人，名册独有的标「工作空间」 */
export const sourceLabel = (a: TeamAgent) => (a.inModule ? (a.author ? `${a.author} 创建` : 'Agents') : '工作空间')
