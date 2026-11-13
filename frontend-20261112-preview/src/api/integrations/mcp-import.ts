/*
  MCP 导入接口（RaccoonX 扩展）：从 Claude Code / Kiro / Codex / Cursor 已配置的 MCP 服务器一键导入，或粘贴 mcpServers 配置导入。
  浏览器读不到本机文件，扫描由后端经已连接的 RaccoonX 本机助手读取各工具的配置文件后汇总返回：
    Claude Code  ~/.claude.json（mcpServers）与项目 .mcp.json
    Kiro         ~/.kiro/settings/mcp.json
    Codex        ~/.codex/config.toml（[mcp_servers.<name>]）
    Cursor       ~/.cursor/mcp.json
  密钥类的值（env / headers）只在服务端流转，扫描结果只返回变量名。
*/
import type { McpImportSource, McpTransport, ToolCollection } from './types'
import { request } from '../http'
import { mcpImportDb } from '../mock/integrations/mcp-import'

/** 扫描到的一个 MCP 服务器 */
export type McpImportCandidate = {
  /** 本次扫描内唯一，导入时回传 */
  ref: string
  name: string
  transport: McpTransport
  server_url?: string
  command?: string
  args?: string[]
  /** 只返回变量名，值不回传到浏览器 */
  env_keys?: string[]
  header_keys?: string[]
  /** 工作区里已有相同地址 / 命令的 MCP 服务 */
  imported: boolean
  /** imported 为 true 时对应的已有服务 */
  provider_id?: string
}

/** 一个来源工具的扫描结果 */
export type McpImportSourceResult = {
  source: McpImportSource
  /** 展示名，如 Claude Code */
  label: string
  /** 读取的配置文件 */
  config_path: string
  /** 本机是否装有该工具（找到配置文件） */
  detected: boolean
  servers: McpImportCandidate[]
}

export type McpImportScan = {
  scan_id: string
  /** 秒级时间戳 */
  scanned_at: number
  /** 提供扫描的本机设备名 */
  device?: string
  sources: McpImportSourceResult[]
}

/** 粘贴配置时由前端解析出的服务器 */
export type McpImportSpec = {
  name: string
  /** 不填时后端按名称生成，重名自动加后缀 */
  server_identifier?: string
  transport: McpTransport
  server_url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
}

export type McpImportResult = {
  imported: ToolCollection[]
  skipped: { name: string, reason: string }[]
}

/**
 * POST /workspaces/current/tool-provider/mcp/import/scan 扫描本机工具里已配置的 MCP 服务器。
 * 请求 `{ sources? }`（缺省扫描全部）；本机助手未连接时返回 409，页面引导改用粘贴配置。
 */
export const scanMcpImports = (body: { sources?: McpImportSource[] } = {}) =>
  request<McpImportScan>({ method: 'POST', path: '/workspaces/current/tool-provider/mcp/import/scan', body }, () => mcpImportDb.scan(body.sources))

/**
 * POST /workspaces/current/tool-provider/mcp/import 批量导入 MCP 服务器。
 * 扫描结果传 `{ scan_id, refs }`，粘贴配置传 `{ servers }`；`identity_mode` 对本批全部生效。
 * 已存在的服务进 skipped，其余创建后为「待授权」状态。
 */
export const importMcpServers = (body: { scan_id?: string, refs?: string[], servers?: McpImportSpec[], identity_mode?: 'off' | 'idp_token' }) =>
  request<McpImportResult>({ method: 'POST', path: '/workspaces/current/tool-provider/mcp/import', body }, () => mcpImportDb.import(body))
