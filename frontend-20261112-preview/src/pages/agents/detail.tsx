import type { AgentDetail } from '@/api/agents'
import { RiBarChart2Line, RiFileList3Line, RiGlobalLine, RiSettings4Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { getAgent, getComposer } from '@/api/agents'
import { useQuery } from '@/api/hooks'
import { DetailShell } from '@/components/detail-shell'
import { Page } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import AccessSection from './access'
import ConfigureSection from './configure'
import { useAgentActions } from './dialogs'
import LogsSection from './logs'
import MonitoringSection from './monitoring'
import { AgentIcon } from './shared'

export type Section = 'configure' | 'access' | 'logs' | 'monitoring'
export type PublishState = { published: boolean, everPublished: boolean }

/** 各分区共用的上下文 */
export type AgentCtx = {
  agent: AgentDetail
  setAgent: (a: AgentDetail) => void
  reloadAgent: () => void
  publish: PublishState
  setPublish: (p: PublishState) => void
  go: (path: string) => void
}

const SECTIONS = [
  { id: 'configure' as const, label: '配置', icon: RiSettings4Line },
  { id: 'access' as const, label: '访问', icon: RiGlobalLine },
  { id: 'logs' as const, label: '日志', icon: RiFileList3Line },
  { id: 'monitoring' as const, label: '监控', icon: RiBarChart2Line },
]

export default function AgentDetailPage({ id, sub, go }: { id: string, sub?: string, go: (path: string) => void }) {
  const section: Section = (SECTIONS.some(s => s.id === sub) ? sub : 'configure') as Section
  const q = useQuery(() => getAgent(id), [id])
  const [publish, setPublish] = useState<PublishState>({ published: false, everPublished: false })
  useEffect(() => {
    getComposer(id).then(c => setPublish({ published: c.active_config_is_published, everPublished: !!c.active_config_snapshot })).catch(() => {})
  }, [id])

  const actions = useAgentActions({
    onChanged: a => q.setData(a),
    onCopied: a => go(`agents/${a.id}/configure`),
    onDeleted: () => go('agents'),
  })

  const agent = q.data
  const statusBadge = publish.published
    ? <Badge tone="mint" dot>已发布</Badge>
    : publish.everPublished ? <Badge tone="amber">有未发布的更改</Badge> : <Badge>草稿</Badge>

  const identity = agent
    ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between">
            <AgentIcon agent={agent} size={48} />
            <Menu items={actions.items(agent)} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-[-0.01em]" title={agent.name}>{agent.name}</p>
            <p className="truncate text-[12.5px] text-ink-3">{agent.role || 'Agent'}</p>
          </div>
          <div>{statusBadge}</div>
        </div>
      )
    : <div className="space-y-2"><Skeleton className="size-12 rounded-2xl" /><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16" /></div>

  if (q.error && !agent) {
    return (
      <Page className="items-center justify-center">
        <EmptyState icon={<RiSettings4Line className="size-6" />} title="打不开这个 Agent" hint={q.error.message} action={<div className="flex gap-2"><Button variant="ghost" onClick={() => go('agents')}>返回列表</Button><Button variant="primary" onClick={q.reload}>重试</Button></div>} />
      </Page>
    )
  }

  const ctx: AgentCtx | null = agent ? { agent, setAgent: q.setData, reloadAgent: q.refresh, publish, setPublish, go } : null
  return (
    <Page>
      <DetailShell
        back={agent?.scope === 'roster' ? { label: 'SalesBuddy', onClick: () => go('agents/enterprise/sales') } : { label: 'Agents', onClick: () => go('agents') }}
        identity={identity}
        sections={SECTIONS}
        active={section}
        onSection={s => go(`agents/${id}/${s}`)}
        layoutId="agent-section"
      >
        {!ctx
          ? <div className="space-y-3 p-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
          : section === 'configure'
            ? <ConfigureSection ctx={ctx} />
            : section === 'access'
              ? <AccessSection ctx={ctx} />
              : section === 'logs'
                ? <LogsSection ctx={ctx} />
                : <MonitoringSection ctx={ctx} />}
      </DetailShell>
      {actions.dialogs}
    </Page>
  )
}
