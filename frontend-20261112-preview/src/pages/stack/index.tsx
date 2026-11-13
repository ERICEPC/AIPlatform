import type { Route } from '@/components/shell'
import { DevelopmentAssistant } from './development-assistant'
import { MaasPage } from './maas'
import { AcceleratorPage } from './accelerator'
import { DataPage } from './data'
import { McpHubPage } from './mcp-hub'
import { ModelsPage } from './models'
import { MonitorPage } from './monitor'
import { ScaffoldPage } from './scaffold'

/*
  技术栈（用户端）：#mcphub 平台 MCP · #data 数据库与存储 · #models 模型与额度 · #accelerator Buddy 加速器 · #scaffold 脚手架 · #monitor 调用与监控
  组件本身的连接配置在管理后台「AI 技术栈组件」（超级管理员）。
*/
export default function StackModule({ route, go }: { route: Route, param?: string, go: (p: string) => void }) {
  if (route === 'dev-assistant')
    return <DevelopmentAssistant go={go} />
  if (route === 'maas')
    return <MaasPage />
  if (route === 'mcphub')
    return <McpHubPage go={go} />
  if (route === 'data')
    return <DataPage go={go} />
  if (route === 'models')
    return <ModelsPage />
  if (route === 'accelerator')
    return <AcceleratorPage go={go} />
  if (route === 'scaffold')
    return <ScaffoldPage go={go} />
  return <MonitorPage go={go} />
}
