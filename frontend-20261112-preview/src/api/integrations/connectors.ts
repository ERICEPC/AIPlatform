/*
  MCP 连接器市场（RaccoonX 新增，「插件市场」页签）：类型 + 请求函数。
  目录内容来自两个上游仓库的快照，后端定期同步：
    awesome     github.com/punkpeye/awesome-mcp-servers 中精选的常用服务
    volcengine  github.com/volcengine/mcp-server 的全部官方服务（server/ 目录）
  「连接」= 按连接器的预置配置创建一个 MCP 服务（与「已接入」里手动添加的是同一种对象）。
  原控制台没有对应契约，路径为新前端约定，后端接入时需确认。
*/
import type { McpTransport, ToolCollection } from './types'
import { request } from '../http'
import { connectorDb } from '../mock/integrations/connectors'

export type ConnectorSource = 'awesome' | 'volcengine'
/** official 服务商官方维护 · community 社区维护 · volcengine 火山引擎官方 */
export type ConnectorPublisher = 'official' | 'community' | 'volcengine'
export type ConnectorCategory =
  | 'office' | 'devtools' | 'code' | 'database' | 'data' | 'search' | 'browser'
  | 'cloud' | 'design' | 'life' | 'finance' | 'ai' | 'security' | 'other'
/** oauth 远程服务登录授权 · api_key 填密钥 · env 填多项环境变量（如 AK/SK）· none 无需凭证 */
export type ConnectorAuth = 'oauth' | 'api_key' | 'env' | 'none'

/** 连接时需要填写的凭证 / 配置项；本地方式作为环境变量，远程方式按 remote.auth_header 放进请求头 */
export type ConnectorField = {
  key: string
  label: string
  /** 密钥类：输入框按密码显示、读取时脱敏 */
  secret?: boolean
  required?: boolean
  placeholder?: string
  hint?: string
}

export type ConnectorRemote = {
  transport: Exclude<McpTransport, 'stdio'>
  url: string
  /** 远程服务用 API Key 鉴权时的请求头；value 中的 {KEY} 替换为对应字段值，例如 Bearer {API_KEY} */
  auth_header?: { name: string, value: string }
}
export type ConnectorLocal = { command: string, args: string[] }

export type Connector = {
  id: string
  name: string
  /** 品牌标识，前端据此选品牌图标；没有对应图标时用名称首字母 */
  brand?: string
  /** 品牌色（十六进制），图标底色 */
  color?: string
  /** 图标块上的短字（2–4 个字符），缺省取名称首字母 */
  mono?: string
  publisher: ConnectorPublisher
  source: ConnectorSource
  repo_url: string
  category: ConnectorCategory
  tags: string[]
  description: string
  /** 主要能力（工具名或简述），详情抽屉展示 */
  capabilities: string[]
  remote?: ConnectorRemote
  local?: ConnectorLocal
  auth: ConnectorAuth
  fields: ConnectorField[]
  featured?: boolean
  /** 热度（接入次数），用于排序 */
  popularity: number
  /** 当前工作区是否已连接（已接入列表里还存在对应服务） */
  connected: boolean
  /** 已连接时对应的 MCP 服务 id */
  provider_id?: string | null
}

export type ConnectorSourceMeta = { id: ConnectorSource, name: string, url: string, synced_at: number, commit?: string, total: number }

export type ConnectorList = {
  data: Connector[]
  total: number
  /** 当前来源 + 关键词下各分类数量（不受分类筛选影响） */
  categories: { id: ConnectorCategory, count: number }[]
  /** 各来源数量（受关键词影响，不受来源 / 分类筛选影响） */
  sources: ConnectorSourceMeta[]
}

export type ConnectorQuery = { category?: ConnectorCategory, source?: ConnectorSource, keyword?: string, featured?: boolean }

export type ConnectPayload = {
  /** 服务名称，也用来生成服务标识 */
  name: string
  transport: McpTransport
  /** 远程方式；缺省用连接器预置地址 */
  server_url?: string
  /** 本地方式；缺省用连接器预置命令 */
  command?: string
  args?: string[]
  /** 凭证与配置项（key 同 ConnectorField.key）。本地方式写入 env，远程方式按 auth_header 生成请求头 */
  credentials?: Record<string, string>
  /** OAuth：授权回调拿到的 code（mock 中任意非空字符串） */
  authorization_code?: string
}

/* ---------- 纯函数（页面与 mock 共用，后端按同样规则处理） ---------- */

/** 把 {KEY} 占位符替换为字段值；没填的占位符原样保留 */
export const fillTemplate = (s: string, vals: Record<string, string>) => s.replace(/\{([A-Z0-9_]+)\}/gi, (m, k: string) => vals[k] || m)

const refs = (s?: string) => [...(s ?? '').matchAll(/\{([A-Z0-9_]+)\}/gi)].map(m => m[1])

/**
 * 某种连接方式需要填写的字段：
 * 本地命令 → 全部字段（写入环境变量或替换参数占位符）；
 * 远程 → 只要地址 / 请求头里引用到的字段（OAuth 远程服务通常不需要任何字段）。
 */
export function connectorFields(c: Pick<Connector, 'fields' | 'remote'>, transport: McpTransport): ConnectorField[] {
  if (transport === 'stdio')
    return c.fields
  const used = new Set([...refs(c.remote?.url), ...refs(c.remote?.auth_header?.value)])
  return c.fields.filter(f => used.has(f.key))
}

const P = '/workspaces/current/tool-provider/mcp/connectors'

/** GET /workspaces/current/tool-provider/mcp/connectors?category&source&keyword&featured 连接器目录（按热度排序） */
export const listConnectors = (q: ConnectorQuery = {}) =>
  request<ConnectorList>({ method: 'GET', path: P, query: q }, () => connectorDb.list(q))

/** GET /workspaces/current/tool-provider/mcp/connectors/{id} 连接器详情 */
export const getConnector = (id: string) =>
  request<Connector>({ method: 'GET', path: `${P}/${id}` }, () => connectorDb.get(id))

/** POST /workspaces/current/tool-provider/mcp/connectors/{id}/connect 一键接入：创建 MCP 服务，返回新服务（出现在「已接入」） */
export const connectConnector = (id: string, body: ConnectPayload) =>
  request<ToolCollection>({ method: 'POST', path: `${P}/${id}/connect`, body }, () => connectorDb.connect(id, body))

/** GET /workspaces/current/tool-provider/mcp/connectors/{id}/oauth/authorization-url 远程 OAuth 授权地址（新窗口打开，回调后带 code 调用 connect） */
export const getConnectorOAuthUrl = (id: string) =>
  request<{ authorization_url: string }>({ method: 'GET', path: `${P}/${id}/oauth/authorization-url` }, () => connectorDb.oauthUrl(id))
