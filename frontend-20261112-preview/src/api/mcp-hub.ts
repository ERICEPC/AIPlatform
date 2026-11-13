/*
  平台 MCP（一切皆 MCP）接口层。
  X 平台把自己的每项能力都以 MCP 服务开放（Streamable HTTP，经 MCP 网关统一鉴权与审计）：
    智能体 · 智能体团队 · 知识库 · 记忆 · Skills · 业务数据 · 模型 · 待我确认 · 桌面连接器 · 开发套件。
  三类调用方用同一套 MCP：
    - DeepSeek Harness（个人助理）：个人 Router 选好执行方后，通过 MCP 客户端调用这些工具；
    - 编排引擎（智能体团队的 Leader 与成员）：按团队 Router 派发时调用；
    - xBuddy（SalesBuddy、ProjectBuddy 等）：用应用凭据 ＋ 最终用户身份（代表用户调用）连接，只能用应用接入里开放的工具。
  每个工具标注风险（只读 / 写入 / 对外），写入与对外动作按策略转「待我确认」；每次调用按最终用户权限重新校验并记审计。
  mock 见 ./mock/mcp-hub.ts；接口清单见 docs/api/v4-新增接口.md。
*/
import type { Health } from '@/components/console'
import { request } from './http'
import * as db from './mock/mcp-hub'

export type Risk = 'read' | 'write' | 'external'
export type McpTool = { name: string, title: string, desc: string, risk: Risk, args: { name: string, type: string, required?: boolean, desc: string }[], example: Record<string, unknown> }
export type Consumer = 'harness' | 'orchestrator' | 'salesbuddy' | 'projectbuddy' | 'kefu' | 'hr'
export type McpServer = {
  id: string
  name: string
  desc: string
  endpoint: string
  transport: 'streamable-http'
  status: Health
  /** 依赖的技术栈组件（管理后台「AI 技术栈组件」里的 id） */
  backed_by: string[]
  consumers: Consumer[]
  tools: McpTool[]
  calls_7d: number
}
export type TryResult = { ok: boolean, latency_ms: number, result: unknown, audit_id: string, note?: string }

/** GET /mcp-hub/servers 平台开放的 MCP 服务与工具 */
export const listMcpServers = () => request<{ data: McpServer[], gateway: string }>({ method: 'GET', path: '/mcp-hub/servers' }, () => db.servers())
/** POST /mcp-hub/servers/{id}/tools/{tool}/try 用当前账号试调用（写入与对外工具只做预演，不真正执行） */
export const tryMcpTool = (server: string, tool: string, args: Record<string, unknown>) =>
  request<TryResult>({ method: 'POST', path: `/mcp-hub/servers/${server}/tools/${tool}/try`, body: { args } }, () => db.tryTool(server, tool, args))
/** GET /mcp-hub/client-config?consumer= 生成 MCP 客户端配置（Harness、xBuddy 用；令牌以占位符给出） */
export const getMcpClientConfig = (consumer: Consumer) =>
  request<{ json: string, note: string }>({ method: 'GET', path: '/mcp-hub/client-config', query: { consumer } }, () => db.clientConfig(consumer))

export const RISK: Record<Risk, [string, 'mint' | 'amber' | 'rose']> = { read: ['只读', 'mint'], write: ['写入', 'amber'], external: ['对外', 'rose'] }
export const CONSUMER: Record<Consumer, string> = { harness: '个人助理（DeepSeek Harness）', orchestrator: '编排引擎（智能体团队）', salesbuddy: 'SalesBuddy', projectbuddy: 'ProjectBuddy', kefu: '客服小浣熊', hr: 'HR 小浣熊' }
