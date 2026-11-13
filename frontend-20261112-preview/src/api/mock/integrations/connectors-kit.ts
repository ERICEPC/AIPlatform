/* 连接器目录 mock 的书写助手：启动命令、远程地址、凭证字段 */
import type { Connector, ConnectorField, ConnectorLocal, ConnectorRemote } from '../../integrations/connectors'

/** 目录条目（来源、连接状态由 mock 补上） */
export type ConnectorDef = Omit<Connector, 'connected' | 'provider_id' | 'source'>

export const gh = (path: string) => `https://github.com/${path}`
/** modelcontextprotocol/servers 参考实现；archived 为已移到 servers-archived 的 */
export const mcpRef = (name: string, archived = false) => gh(`modelcontextprotocol/servers${archived ? '-archived' : ''}/tree/main/src/${name}`)

export const npx = (pkg: string, ...args: string[]): ConnectorLocal => ({ command: 'npx', args: ['-y', pkg, ...args] })
export const uvx = (pkg: string, ...args: string[]): ConnectorLocal => ({ command: 'uvx', args: [pkg, ...args] })
/** docker run -i --rm -e K1 -e K2 image ...args */
export const docker = (image: string, env: string[] = [], ...args: string[]): ConnectorLocal => ({ command: 'docker', args: ['run', '-i', '--rm', ...env.flatMap(e => ['-e', e]), image, ...args] })
export const cmd = (command: string, ...args: string[]): ConnectorLocal => ({ command, args })

export const http = (url: string, auth_header?: ConnectorRemote['auth_header']): ConnectorRemote => ({ transport: 'streamable_http', url, auth_header })
export const sse = (url: string, auth_header?: ConnectorRemote['auth_header']): ConnectorRemote => ({ transport: 'sse', url, auth_header })
export const bearer = (key: string) => ({ name: 'Authorization', value: `Bearer {${key}}` })

/** 必填密钥 */
export const secret = (key: string, label: string, opt: Partial<ConnectorField> = {}): ConnectorField => ({ key, label, secret: true, required: true, ...opt })
/** 普通配置项（默认必填，不脱敏） */
export const field = (key: string, label: string, opt: Partial<ConnectorField> = {}): ConnectorField => ({ key, label, required: true, ...opt })
/** 可选配置项 */
export const optional = (key: string, label: string, opt: Partial<ConnectorField> = {}): ConnectorField => ({ key, label, required: false, ...opt })
