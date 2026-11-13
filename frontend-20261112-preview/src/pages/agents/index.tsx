import { useEffect } from 'react'
import type { ListTab } from './list'
import AgentDetailPage from './detail'
import AgentList, { lastTab, LIST_TABS } from './list'

export type ModuleProps = { param?: string, sub?: string, go: (path: string) => void, theme: 'dark' | 'light' }

// 路由：#agents 列表（恢复上次分组，默认企服）；#agents/enterprise[/<sales|project|hr|service>] 企服、#agents/mine 我的
// #agents/builtin/<id> 旧地址：企服内置 Agent 现在和「我的」共用详情页 #agents/<id>
// #agents/<id>[/configure|access|logs|monitoring] 详情
export default function AgentsModule({ param, sub, go }: ModuleProps) {
  if (!param)
    return <AgentList tab={lastTab()} go={go} />
  if ((LIST_TABS as string[]).includes(param))
    return <AgentList tab={param as ListTab} sub={param === 'enterprise' ? sub : undefined} go={go} />
  if (param === 'builtin')
    return sub ? <Redirect to={`agents/${sub}`} go={go} /> : <AgentList tab="enterprise" go={go} />
  return <AgentDetailPage key={param} id={param} sub={sub} go={go} />
}

function Redirect({ to, go }: { to: string, go: (path: string) => void }) {
  useEffect(() => { go(to) }, [to, go])
  return null
}
