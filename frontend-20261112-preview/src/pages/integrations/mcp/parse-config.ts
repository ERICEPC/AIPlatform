/*
  解析粘贴的 MCP 配置（纯前端）。兼容常见写法：
    { "mcpServers": { name: {...} } }        Claude Code / Kiro / Cursor / Claude Desktop
    { "servers": { name: {...} } }           VS Code
    { "mcp_servers": { name: {...} } }       Codex 的 JSON 写法
    { name: {...} }                          直接粘贴服务器表
  单个服务器：command + args + env（stdio），或 url / serverUrl / httpUrl + headers（远程，type 为 sse 时走 SSE）。
*/
import type { McpImportSpec } from '@/api/integrations'

export type ParsedServer = { spec: McpImportSpec, error?: string, disabled?: boolean }
export type ParseResult = { servers: ParsedServer[], error?: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const strMap = (v: unknown) => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string' || typeof x === 'number').map(([k, x]) => [k, String(x)])) : undefined)

function parseOne(name: string, raw: unknown): ParsedServer {
  if (!isObj(raw))
    return { spec: { name, transport: 'stdio' }, error: '不是对象，无法识别' }
  const disabled = raw.disabled === true || raw.enabled === false
  const url = [raw.url, raw.serverUrl, raw.httpUrl].find(x => typeof x === 'string') as string | undefined
  if (url) {
    const type = String(raw.type ?? raw.transport ?? '').toLowerCase()
    const spec: McpImportSpec = { name, transport: type === 'sse' || (!type && /\/sse\/?$/.test(url)) ? 'sse' : 'streamable_http', server_url: url, headers: strMap(raw.headers) }
    return { spec, disabled, error: /^https?:\/\//i.test(url) ? undefined : '地址需要以 http:// 或 https:// 开头' }
  }
  if (typeof raw.command === 'string' && raw.command.trim()) {
    const args = Array.isArray(raw.args) ? raw.args.map(String) : undefined
    return { spec: { name, transport: 'stdio', command: raw.command.trim(), args, env: strMap(raw.env) }, disabled }
  }
  return { spec: { name, transport: 'stdio' }, disabled, error: '缺少 command 或 url' }
}

export function parseMcpConfig(text: string): ParseResult {
  const src = text.trim()
  if (!src)
    return { servers: [] }
  let data: unknown
  try {
    data = JSON.parse(src)
  }
  catch {
    // 常见情况：只复制了 "name": {...} 片段，补一层大括号再试
    try {
      data = JSON.parse(`{${src.replace(/,\s*$/, '')}}`)
    }
    catch (e) {
      return { servers: [], error: `不是有效的 JSON：${e instanceof Error ? e.message : '格式错误'}` }
    }
  }
  if (!isObj(data))
    return { servers: [], error: '需要一个 JSON 对象，例如 { "mcpServers": { ... } }' }
  const table = [data.mcpServers, data.servers, data.mcp_servers].find(isObj) ?? data
  const entries = Object.entries(table)
  if (!entries.length)
    return { servers: [], error: '没有找到服务器配置' }
  // 单个服务器对象（含 command / url）直接粘贴时，没有名字
  if ('command' in table || 'url' in table || 'serverUrl' in table)
    return { servers: [parseOne('mcp-server', table)] }
  return { servers: entries.map(([name, raw]) => parseOne(name, raw)) }
}

export const SAMPLE_CONFIG = `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<你的 Token>" }
    },
    "sales-crm": {
      "type": "sse",
      "url": "https://mcp.sensetime.internal/crm/sse"
    }
  }
}`
