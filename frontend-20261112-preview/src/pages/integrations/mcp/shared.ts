/* MCP 模块内的小工具：连接方式、来源工具的展示名与图标 */
import type { McpImportSource, McpTransport, ToolCollection } from '@/api/integrations'

export const transportLabel: Record<McpTransport, string> = {
  streamable_http: 'Streamable HTTP',
  sse: 'SSE',
  stdio: '命令（stdio）',
}

export const transportOf = (m: Pick<ToolCollection, 'transport' | 'command'>): McpTransport => m.transport ?? (m.command ? 'stdio' : 'streamable_http')

/** 命令 + 参数拼成一行展示；含空格的参数加引号 */
export const commandLine = (m: { command?: string, args?: string[] }) =>
  [m.command ?? '', ...(m.args ?? []).map(a => (/\s/.test(a) ? `"${a}"` : a))].join(' ').trim()

/** 把一行参数拆成数组，支持双引号包住含空格的参数 */
export const splitArgs = (s: string) => (s.match(/"[^"]*"|\S+/g) ?? []).map(a => a.replace(/^"|"$/g, ''))

export const sourceLabel: Record<McpImportSource | 'json', string> = {
  claude_code: 'Claude Code',
  kiro: 'Kiro',
  codex: 'Codex',
  cursor: 'Cursor',
  json: '粘贴的配置',
}

export const sourceIcon: Record<McpImportSource | 'json', string> = {
  claude_code: 'tile:CC:#d97757',
  kiro: 'tile:K:#7c5cff',
  codex: 'tile:Cx:#1f2937',
  cursor: 'tile:Cu:#3f3f46',
  json: 'tile:{}:#0e7490',
}

/** 名称 → 服务标识建议值（小写字母、数字、- 和 _，最多 24 个字符） */
export const toIdentifier = (name: string) => name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
