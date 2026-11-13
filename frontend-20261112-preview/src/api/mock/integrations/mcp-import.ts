/* MCP 导入 mock：模拟本机助手扫描到的各工具配置，导入时写入 tools mock 的 MCP 列表 */
import type { McpImportCandidate, McpImportResult, McpImportScan, McpImportSourceResult, McpImportSpec } from '../../integrations/mcp-import'
import type { McpImportSource, McpPayload, ToolCollection } from '../../integrations/types'
import { ApiError, mockId } from '../../http'
import { toolDb } from './tools'

type Seed = Omit<McpImportCandidate, 'ref' | 'imported' | 'provider_id'> & { env?: Record<string, string>, headers?: Record<string, string> }

const sources: { source: McpImportSource, label: string, config_path: string, detected: boolean, servers: Seed[] }[] = [
  {
    source: 'claude_code',
    label: 'Claude Code',
    config_path: '~/.claude.json',
    detected: true,
    servers: [
      { name: 'github', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env_keys: ['GITHUB_PERSONAL_ACCESS_TOKEN'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxxxxxxxxxxxxxxx' } },
      { name: 'sales-crm', transport: 'sse', server_url: 'https://mcp.sensetime.internal/crm/sse' },
      { name: 'feishu-docs', transport: 'streamable_http', server_url: 'https://mcp.feishu.sensetime.com/docs/mcp', header_keys: ['Authorization'], headers: { Authorization: 'Bearer u-xxxxxxxx' } },
    ],
  },
  {
    source: 'kiro',
    label: 'Kiro',
    config_path: '~/.kiro/settings/mcp.json',
    detected: true,
    servers: [
      { name: 'fetch', transport: 'stdio', command: 'uvx', args: ['mcp-server-fetch'] },
      { name: 'aws-docs', transport: 'stdio', command: 'uvx', args: ['awslabs.aws-documentation-mcp-server@latest'], env_keys: ['FASTMCP_LOG_LEVEL'], env: { FASTMCP_LOG_LEVEL: 'ERROR' } },
    ],
  },
  {
    source: 'codex',
    label: 'Codex',
    config_path: '~/.codex/config.toml',
    detected: true,
    servers: [
      { name: 'context7', transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      { name: 'playwright', transport: 'stdio', command: 'npx', args: ['@playwright/mcp@latest'] },
    ],
  },
  { source: 'cursor', label: 'Cursor', config_path: '~/.cursor/mcp.json', detected: false, servers: [] },
]

const sameTarget = (a: { server_url?: string, command?: string, args?: string[] }, b: ToolCollection) =>
  a.server_url ? a.server_url === b.server_url : !!a.command && a.command === b.command && (a.args ?? []).join(' ') === (b.args ?? []).join(' ')

/** 名称 → 合法且不重复的服务标识 */
const identifierFor = (name: string, taken: Set<string>) => {
  const base = (name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp').slice(0, 20)
  let id = base
  for (let i = 2; taken.has(id); i++)
    id = `${base}-${i}`
  taken.add(id)
  return id
}

const scans = new Map<string, Map<string, Seed & { source: McpImportSource }>>()

export const mcpImportDb = {
  scan(only?: McpImportSource[]): McpImportScan {
    const existing = toolDb.mcpList()
    const scan_id = mockId('scan')
    const refs = new Map<string, Seed & { source: McpImportSource }>()
    const result: McpImportSourceResult[] = sources
      .filter(s => !only?.length || only.includes(s.source))
      .map(s => ({
        source: s.source,
        label: s.label,
        config_path: s.config_path,
        detected: s.detected,
        servers: s.servers.map((seed) => {
          const ref = `${s.source}:${seed.name}`
          refs.set(ref, { ...seed, source: s.source })
          const hit = existing.find(m => sameTarget(seed, m))
          const { env: _e, headers: _h, ...pub } = seed
          return { ...pub, ref, imported: !!hit, provider_id: hit?.id }
        }),
      }))
    scans.set(scan_id, refs)
    return { scan_id, scanned_at: Date.now() / 1000, device: '叶源的 MacBook Pro', sources: result }
  },

  import(body: { scan_id?: string, refs?: string[], servers?: McpImportSpec[], identity_mode?: 'off' | 'idp_token' }): McpImportResult {
    const specs: (McpImportSpec & { from: McpImportSource | 'json' })[] = []
    if (body.refs?.length) {
      const scan = body.scan_id ? scans.get(body.scan_id) : undefined
      if (!scan)
        throw new ApiError('扫描结果已过期，请重新扫描', 410)
      for (const ref of body.refs) {
        const s = scan.get(ref)
        if (s)
          specs.push({ name: s.name, transport: s.transport, server_url: s.server_url, command: s.command, args: s.args, env: s.env, headers: s.headers, from: s.source })
      }
    }
    for (const s of body.servers ?? [])
      specs.push({ ...s, from: 'json' })
    if (!specs.length)
      throw new ApiError('没有选择要导入的服务器', 400)

    const taken = new Set(toolDb.mcpList().map(m => m.server_identifier ?? ''))
    const result: McpImportResult = { imported: [], skipped: [] }
    for (const s of specs) {
      if (toolDb.mcpList().some(m => sameTarget(s, m))) {
        result.skipped.push({ name: s.name, reason: '已接入相同的服务' })
        continue
      }
      const payload: McpPayload = {
        name: s.name,
        transport: s.transport,
        server_url: s.server_url,
        command: s.command,
        args: s.args,
        env: s.env,
        headers: s.headers ?? {},
        icon_type: 'emoji',
        icon: s.transport === 'stdio' ? '🛠️' : '🛰️',
        icon_background: null,
        server_identifier: identifierFor(s.server_identifier || s.name, taken),
        timeout: 30,
        sse_read_timeout: 300,
        is_dynamic_registration: true,
        authentication: null,
        identity_mode: body.identity_mode ?? 'off',
      }
      result.imported.push(toolDb.createMcp(payload, s.from))
    }
    return result
  },
}
