/* MCP 连接器市场 mock：目录快照 + 连接状态；连接时真正写入 MCP 服务列表（tools.ts 的 toolDb） */
import type { ConnectPayload, Connector, ConnectorCategory, ConnectorList, ConnectorQuery, ConnectorSource, ConnectorSourceMeta } from '../../integrations/connectors'
import type { ConnectorDef } from './connectors-kit'
import type { McpPayload, ToolAction, ToolCollection } from '../../integrations/types'
import { connectorFields, fillTemplate } from '../../integrations/connectors'
import { ApiError } from '../../http'
import { awesomeCode, awesomeData, awesomeDev, awesomeOffice } from './connectors-data-awesome'
import { awesomeMisc, awesomeOps, awesomeWeb } from './connectors-data-awesome-2'
import { volcConnectors } from './connectors-data-volc'
import { toolDb } from './tools'

const tag = (source: ConnectorSource) => (d: ConnectorDef) => ({ ...d, source })
const catalog: (ConnectorDef & { source: ConnectorSource })[] = [
  ...[...awesomeOffice, ...awesomeDev, ...awesomeCode, ...awesomeData, ...awesomeWeb, ...awesomeOps, ...awesomeMisc].map(tag('awesome')),
  ...volcConnectors.map(tag('volcengine')),
].sort((a, b) => b.popularity - a.popularity)

const sourceMeta: Omit<ConnectorSourceMeta, 'total'>[] = [
  { id: 'awesome', name: 'awesome-mcp-servers', url: 'https://github.com/punkpeye/awesome-mcp-servers', synced_at: Date.parse('2026-11-05T03:00:00+08:00') / 1000, commit: '29f2d49' },
  { id: 'volcengine', name: '火山引擎 MCP Server', url: 'https://github.com/volcengine/mcp-server', synced_at: Date.parse('2026-11-05T03:00:00+08:00') / 1000, commit: 'b77ed85' },
]
const CATEGORY_IDS: ConnectorCategory[] = ['office', 'devtools', 'code', 'database', 'data', 'search', 'browser', 'cloud', 'design', 'life', 'finance', 'ai', 'security', 'other']

/** 连接器 id → 创建的 MCP 服务 id；服务在「已接入」被移除后自动视为未连接 */
const links = new Map<string, string>()
let seeded = false

function providerOf(id: string) {
  const pid = links.get(id)
  if (pid && toolDb.mcpList().some(m => m.id === pid))
    return pid
  links.delete(id)
  return null
}
const withState = (d: ConnectorDef & { source: ConnectorSource }): Connector => {
  const pid = providerOf(d.id)
  return { ...d, connected: !!pid, provider_id: pid }
}

const matches = (d: ConnectorDef, kw: string) => {
  if (!kw)
    return true
  const pub = d.publisher === 'official' ? '官方' : d.publisher === 'volcengine' ? '火山引擎' : '社区'
  return `${d.id} ${d.name} ${d.description} ${d.tags.join(' ')} ${pub}`.toLowerCase().includes(kw.toLowerCase())
}

/** 浅色品牌色上白字看不清，接入后的服务图标换成深灰底 */
function tileColor(hex = '#64748b') {
  const n = Number.parseInt(hex.slice(1), 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.68 ? '#334155' : hex
}
/** 图标短字：名称里有两个以上大写字母时取前两个（GitHub → GH），否则取前两个字母 / 汉字 */
function monoOf(d: ConnectorDef) {
  if (d.mono)
    return d.mono
  const caps = d.name.match(/[A-Z]/g) ?? []
  return caps.length >= 2 ? caps.slice(0, 2).join('') : d.name.replace(/[^A-Z0-9一-龥]/gi, '').slice(0, 2).toUpperCase()
}
/** 返回给页面的地址 / 参数里，密钥值脱敏（后端保存原值） */
const maskSecrets = (s: string, secrets: string[]) => secrets.reduce((acc, v) => acc.split(v).join(v.length < 6 ? '****' : `${v.slice(0, 2)}****${v.slice(-2)}`), s)

function toolsOf(d: ConnectorDef): ToolAction[] {
  return d.capabilities.map((cap) => {
    const [name, ...rest] = cap.split(' ')
    const desc = rest.join(' ') || cap
    return { name, author: d.name, label: { zh_Hans: name, en_US: name }, description: { zh_Hans: desc, en_US: desc }, parameters: [] }
  })
}

function seed() {
  if (seeded)
    return
  seeded = true
  // 演示：Context7 已经接入
  try {
    const it = connectorDb.connect('context7', { name: 'Context7', transport: 'streamable_http' })
    it.updated_at = Date.now() / 1000 - 86400 * 3
  }
  catch {}
}

function find(id: string) {
  const d = catalog.find(x => x.id === id)
  if (!d)
    throw new ApiError('连接器不存在或已下架', 404)
  return d
}

export const connectorDb = {
  list(q: ConnectorQuery): ConnectorList {
    seed()
    const kw = (q.keyword ?? '').trim()
    const byKw = catalog.filter(d => matches(d, kw))
    const bySource = byKw.filter(d => !q.source || d.source === q.source)
    const rows = bySource.filter(d => (!q.category || d.category === q.category) && (!q.featured || d.featured))
    return {
      data: rows.map(withState),
      total: rows.length,
      categories: CATEGORY_IDS.map(id => ({ id, count: bySource.filter(d => d.category === id).length })),
      sources: sourceMeta.map(s => ({ ...s, total: byKw.filter(d => d.source === s.id).length })),
    }
  },

  get(id: string): Connector {
    seed()
    return withState(find(id))
  },

  oauthUrl(id: string) {
    const d = find(id)
    if (d.auth !== 'oauth' || !d.remote)
      throw new ApiError('这个连接器不需要 OAuth 授权', 400)
    return { authorization_url: `${new URL(d.remote.url).origin}/authorize?client_id=raccoonx&state=${id}` }
  },

  connect(id: string, body: ConnectPayload): ToolCollection {
    const d = find(id)
    if (providerOf(id))
      throw new ApiError(`${d.name} 已经接入，可在「已接入」里管理`, 409)
    const name = body.name.trim()
    if (!name)
      throw new ApiError('请填写服务名称', 400)
    const remote = body.transport !== 'stdio'
    if (remote ? !d.remote : !d.local)
      throw new ApiError(`${d.name} 不支持${remote ? '远程' : '本地命令'}方式`, 400)
    const vals = Object.fromEntries(Object.entries(body.credentials ?? {}).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
    const missing = connectorFields(d, body.transport).find(f => f.required && !vals[f.key])
    if (missing)
      throw new ApiError(`请填写「${missing.label}」`, 400)
    const oauth = remote && d.auth === 'oauth'
    if (oauth && !body.authorization_code)
      throw new ApiError('请先完成授权', 400)

    const used = new Set(toolDb.mcpList().map(m => m.server_identifier))
    const base = d.id.slice(0, 21)
    let ident = base
    for (let n = 2; used.has(ident); n++)
      ident = `${base}-${n}`

    const payload: McpPayload = {
      name,
      transport: body.transport,
      icon_type: 'emoji',
      icon: `tile:${monoOf(d)}:${tileColor(d.color)}`,
      server_identifier: ident,
      timeout: 30,
      sse_read_timeout: 300,
      authentication: null,
      is_dynamic_registration: oauth,
      identity_mode: 'off',
    }
    if (remote) {
      payload.server_url = fillTemplate(body.server_url?.trim() || d.remote!.url, vals)
      payload.headers = d.remote!.auth_header && d.auth === 'api_key' && connectorFields(d, body.transport).some(f => vals[f.key])
        ? { [d.remote!.auth_header.name]: fillTemplate(d.remote!.auth_header.value, vals) }
        : {}
    }
    else {
      payload.command = body.command?.trim() || d.local!.command
      payload.args = (body.args ?? d.local!.args).map(a => fillTemplate(a, vals))
      payload.env = vals
    }
    const it = toolDb.createMcp(payload)
    const secrets = d.fields.filter(f => f.secret && vals[f.key]).map(f => vals[f.key])
    Object.assign(it, {
      description: { zh_Hans: d.description, en_US: d.description },
      is_team_authorization: true,
      tools: toolsOf(d),
      server_url: it.server_url && maskSecrets(it.server_url, secrets),
      args: it.args?.map(a => maskSecrets(a, secrets)),
    })
    links.set(id, it.id)
    return it
  },
}
