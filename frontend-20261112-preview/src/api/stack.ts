/*
  技术栈（用户端）接口层：开发者使用 X 平台 AI 技术栈的入口、配置项与监控。
  普通开发者不配置组件本身（例如 PostgreSQL 连接），只使用业务空间分配给自己的资源，
  查看和配置自己做的智能体、Buddy 应用与工程；组件连接由超级管理员在管理后台配置。
  ProjectBuddy 也能直接完成这些配置，更详细的状态与监控在这里看（相当于开发者使用 ProjectBuddy 的后台）。
  mock 见 ./mock/stack.ts；接口清单见 docs/api/stack.md。
*/
import type { Health } from '@/components/console'
import { request } from './http'
import * as db from './mock/stack'

export type ComponentStatus = { id: string, name: string, product: string, category: string, status: Health, user_side: string }
export type DataResource = {
  id: string
  kind: 'schema' | 'vector' | 'bucket' | 'cache'
  name: string
  space: string
  purpose: string
  owner: string
  usage: number
  quota: number
  unit: string
  status: Health
  objects: { name: string, detail: string }[]
  /** 给应用使用的连接信息（只读、密码不回显；由平台按业务空间签发） */
  access: { label: string, value: string }[]
}
export type ModelItem = { id: string, name: string, kind: 'chat' | 'light' | 'reasoning' | 'embedding' | 'rerank', provider: string, available: boolean, note: string }
export type ModelQuota = { space: string, monthly: number, used: number, unit: string, by_object: { name: string, used: number }[] }
export type ModelDefaults = { chat: string, light: string, reasoning: string, by_task: boolean }
export type BuddyApp = {
  id: string
  name: string
  base: string
  space: string
  owner: string
  framework: string
  latest: string
  parts: string[]
  capabilities: string[]
  build: Health
  deploy_url: string
  via: 'ProjectBuddy' | 'CLI'
  release: 'draft' | 'pending' | 'approved'
  updated_at: string
}
export type FrameworkLayer = { area: string, path: string, desc: string }
/** 脚手架模板；available_in_projectbuddy ＝ 发布到 ProjectBuddy「脚手架模板」，普通开发者在那里直接用它新建 Buddy 应用（2026-11-08） */
export type Template = { id: string, kind: 'buddy-app' | 'expert-agent' | 'skill' | 'mcp-service' | 'workflow-team', name: string, desc: string, files: string[], fields: { key: string, label: string, placeholder: string }[], version?: string, components?: string[], available_in_projectbuddy?: boolean, used_by?: number }
export type MonitorData = {
  period: string
  calls: number
  success: number
  p95_ms: number
  tokens: number
  by_source: { name: string, calls: number }[]
  by_object: { name: string, kind: string, calls: number, success: number, p95_ms: number, last_error?: string }[]
  daily: number[]
  errors: { time: string, object: string, source: string, message: string }[]
}

/** GET /stack/status 技术栈组件状态（用户端只读） */
export const getStackStatus = () => request<{ data: ComponentStatus[] }>({ method: 'GET', path: '/stack/status' }, () => db.status())
/** GET /stack/data 我可用的数据资源（业务空间分配的 schema、向量集合、对象存储目录） */
export const listDataResources = () => request<{ data: DataResource[] }>({ method: 'GET', path: '/stack/data' }, () => db.data())
/** POST /stack/data 在已授权的业务空间配额内新建资源（如新的 schema 表空间或目录） */
export const createDataResource = (b: { kind: DataResource['kind'], name: string, space: string, purpose: string }) => request<DataResource>({ method: 'POST', path: '/stack/data', body: b }, () => db.createData(b))
/** GET /stack/models 可用模型、额度与默认模型 */
export const getModels = () => request<{ models: ModelItem[], quotas: ModelQuota[], defaults: ModelDefaults }>({ method: 'GET', path: '/stack/models' }, () => db.models())
/** PUT /stack/models/defaults 我的默认模型（个人助手与我创建的智能体） */
export const saveModelDefaults = (d: ModelDefaults) => request<{ defaults: ModelDefaults }>({ method: 'PUT', path: '/stack/models/defaults', body: d }, () => db.saveDefaults(d))
/** GET /stack/accelerator Buddy 加速器：框架层与我的 Buddy 应用 */
export const getAccelerator = () => request<{ version: string, layers: FrameworkLayer[], apps: BuddyApp[], sdk: { name: string, desc: string }[] }>({ method: 'GET', path: '/stack/accelerator' }, () => db.accelerator())
/** POST /stack/accelerator/apps/{id}/sync 把应用的框架层同步到最新版本（生成合并请求，不直接覆盖业务代码） */
export const syncBuddyApp = (id: string) => request<BuddyApp>({ method: 'POST', path: `/stack/accelerator/apps/${id}/sync` }, () => db.syncApp(id))
/** GET /stack/scaffold/templates 脚手架模板 */
export const listTemplates = () => request<{ data: Template[], cli: string }>({ method: 'GET', path: '/stack/scaffold/templates' }, () => db.templates())
/** PATCH /stack/scaffold/templates/{id} 维护模板：是否在 ProjectBuddy 中可用（两个系统同一账号与权限，模板只在 X 平台维护一份） */
export const updateTemplate = (id: string, b: { available_in_projectbuddy: boolean }) => request<Template>({ method: 'PATCH', path: `/stack/scaffold/templates/${id}`, body: b }, () => db.updateTemplate(id, b))
/** POST /stack/scaffold/generate 生成工程（返回命令、配置与文件清单；也可在 ProjectBuddy 里一键生成） */
export const generateProject = (b: { template: string, values: Record<string, string> }) => request<{ command: string, config: string, files: string[] }>({ method: 'POST', path: '/stack/scaffold/generate', body: b }, () => db.generate(b))
/** GET /stack/monitor 我的对象被调用的情况（来源：SalesBuddy、ProjectBuddy、Web、API、消息渠道） */
export const getMonitor = (period: '24h' | '7d' | '30d') => request<MonitorData>({ method: 'GET', path: '/stack/monitor', query: { period } }, () => db.monitor(period))
