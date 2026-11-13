/* 插件通用接口：权限、调试、安装、任务、卸载、升级、自动更新、插件市场 */
import type {
  AutoUpgradeSetting, DebugKey, InstallResponse, MarketplacePlugin, PluginCategory, PluginDetail, PluginPermission, PluginTask, UploadResponse,
} from './types'
import { API_MODE, ApiError, request } from '../http'
import { installedOf } from '../mock/integrations/catalog'
import { pluginDb } from '../mock/integrations/plugins'

/* ---------- 权限 / 调试 ---------- */

/** GET /workspaces/current/plugin/permission/fetch 读取插件安装、调试权限 */
export const fetchPluginPermission = () =>
  request<PluginPermission>({ method: 'GET', path: '/workspaces/current/plugin/permission/fetch' }, () => pluginDb.permission())

/** POST /workspaces/current/plugin/permission/change 修改权限（立即生效） */
export const changePluginPermission = (body: PluginPermission) =>
  request<{ success: boolean }>({ method: 'POST', path: '/workspaces/current/plugin/permission/change', body }, () => pluginDb.setPermission(body))

/** GET /workspaces/current/plugin/debugging-key 远程调试地址与密钥 */
export const fetchDebugKey = () =>
  request<DebugKey>({ method: 'GET', path: '/workspaces/current/plugin/debugging-key' }, () => pluginDb.debugKey())

/* ---------- 已安装插件（按分类） ---------- */

/** GET /workspaces/current/plugin/{category}/list 按分类列出已安装插件（RaccoonX：分类化列表） */
export const listInstalledPlugins = (category: PluginCategory, query: { page?: number, page_size?: number, query?: string, tags?: string[] } = {}) =>
  request<{ plugins: PluginDetail[], has_more: boolean }>(
    { method: 'GET', path: `/workspaces/current/plugin/${category}/list`, query: { page: 1, page_size: 100, ...query } },
    () => {
      const q = (query.query ?? '').toLowerCase()
      return { plugins: installedOf(category).filter(p => !q || `${p.name}${p.declaration.label.zh_Hans}`.toLowerCase().includes(q)), has_more: false }
    },
  )

/* ---------- 安装 ---------- */

/** POST /workspaces/current/plugin/install/marketplace 从插件市场安装 */
export const installFromMarketplace = (plugin_unique_identifiers: string[]) =>
  request<InstallResponse>({ method: 'POST', path: '/workspaces/current/plugin/install/marketplace', body: { plugin_unique_identifiers } }, () => pluginDb.installMarketplace(plugin_unique_identifiers))

/** POST /workspaces/current/plugin/upload/github 拉取 GitHub Release 里的插件包并解析 */
export const uploadGithub = (body: { repo: string, version: string, package: string }) =>
  request<UploadResponse>({ method: 'POST', path: '/workspaces/current/plugin/upload/github', body }, () => pluginDb.uploadGithub(body.repo, body.version, body.package))

/** POST /workspaces/current/plugin/install/github 安装已解析的 GitHub 插件包 */
export const installFromGithub = (body: { repo: string, version: string, package: string, plugin_unique_identifier: string }) =>
  request<InstallResponse>({ method: 'POST', path: '/workspaces/current/plugin/install/github', body }, () => pluginDb.installUploaded([body.plugin_unique_identifier]))

/** POST /workspaces/current/plugin/upload/pkg 上传本地插件包（multipart，字段 pkg） */
export const uploadPackage = (file: File) => {
  const form = new FormData()
  form.append('pkg', file)
  return request<UploadResponse>({ method: 'POST', path: '/workspaces/current/plugin/upload/pkg', form }, () => pluginDb.uploadPkg(file))
}

/** POST /workspaces/current/plugin/install/pkg 安装已上传的插件包 */
export const installFromPackage = (plugin_unique_identifiers: string[]) =>
  request<InstallResponse>({ method: 'POST', path: '/workspaces/current/plugin/install/pkg', body: { plugin_unique_identifiers } }, () => pluginDb.installUploaded(plugin_unique_identifiers))

/** POST /workspaces/current/plugin/upgrade/marketplace 升级到插件市场上的新版本 */
export const upgradeFromMarketplace = (body: { original_plugin_unique_identifier: string, new_plugin_unique_identifier: string }) =>
  request<InstallResponse>({ method: 'POST', path: '/workspaces/current/plugin/upgrade/marketplace', body }, () => pluginDb.upgradeMarketplace(body.original_plugin_unique_identifier, body.new_plugin_unique_identifier))

/** POST /workspaces/current/plugin/uninstall 移除插件；preserve_credentials 为 RaccoonX 扩展字段，保留已有凭据便于重装 */
export const uninstallPlugin = (plugin_installation_id: string, preserve_credentials = false) =>
  request<{ success: boolean }>({ method: 'POST', path: '/workspaces/current/plugin/uninstall', body: { plugin_installation_id, preserve_credentials } }, () => pluginDb.uninstall(plugin_installation_id))

/* ---------- 安装任务 ---------- */

/** GET /workspaces/current/plugin/tasks?page=1&page_size=100 安装任务列表（进行中时轮询） */
export const fetchPluginTasks = () =>
  request<{ tasks: PluginTask[] }>({ method: 'GET', path: '/workspaces/current/plugin/tasks', query: { page: 1, page_size: 100 } }, () => pluginDb.tasks())

/** POST /workspaces/current/plugin/tasks/{task_id}/delete/{identifier} 清除任务里的一条插件记录 */
export const clearTaskPlugin = (taskId: string, identifier: string) =>
  request<{ success: boolean }>({ method: 'POST', path: `/workspaces/current/plugin/tasks/${taskId}/delete/${encodeURIComponent(identifier)}` }, () => pluginDb.clearTaskPlugin(taskId, identifier))

/* ---------- 插件信息 ---------- */

/** GET /workspaces/current/plugin/readme?plugin_unique_identifier=&language= 插件说明（Markdown） */
export const fetchPluginReadme = (plugin_unique_identifier: string) =>
  request<{ readme: string }>({ method: 'GET', path: '/workspaces/current/plugin/readme', query: { plugin_unique_identifier, language: 'zh_Hans' } }, () => pluginDb.readme(plugin_unique_identifier))

/* ---------- 自动更新 ---------- */

/** GET /workspaces/current/plugin/auto-upgrade/fetch?category= 读取某分类的自动更新策略 */
export const fetchAutoUpgrade = (category: PluginCategory) =>
  request<{ auto_upgrade: AutoUpgradeSetting }>({ method: 'GET', path: '/workspaces/current/plugin/auto-upgrade/fetch', query: { category } }, () => pluginDb.autoUpgrade(category))

/** POST /workspaces/current/plugin/auto-upgrade/change 保存自动更新策略 */
export const changeAutoUpgrade = (category: PluginCategory, auto_upgrade: AutoUpgradeSetting) =>
  request<{ success: boolean }>({ method: 'POST', path: '/workspaces/current/plugin/auto-upgrade/change', body: { category, auto_upgrade } }, () => pluginDb.setAutoUpgrade(category, auto_upgrade))

/* ---------- 插件市场（独立服务，前缀 VITE_MARKETPLACE_API） ---------- */
const MARKETPLACE_API: string = import.meta.env.VITE_MARKETPLACE_API ?? ''
export const MARKETPLACE_URL: string = import.meta.env.VITE_MARKETPLACE_URL ?? ''

async function marketplace<T>(method: 'GET' | 'POST', path: string, body: unknown, mock: () => T): Promise<T> {
  if (API_MODE === 'mock') {
    await new Promise(r => setTimeout(r, 260 + Math.random() * 240))
    return structuredClone(mock())
  }
  const res = await fetch(`${MARKETPLACE_API}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok)
    throw new ApiError(`插件市场暂时无法访问（${res.status}）`, res.status)
  return res.json()
}

/** POST {插件市场}/plugins/search/advanced 搜索插件市场 */
export const searchMarketplace = (body: { category?: PluginCategory, query?: string, page?: number, page_size?: number, sort_by?: string, sort_order?: string, exclude_installed?: boolean }) =>
  marketplace<{ data: { plugins: MarketplacePlugin[], total: number } }>('POST', '/plugins/search/advanced', { sort_by: 'install_count', sort_order: 'DESC', ...body }, () => pluginDb.search(body))

/** GET {插件市场}/plugins/{org}/{name} 读取插件最新版本（检查更新） */
export const fetchMarketplaceLatest = (pluginId: string) =>
  marketplace<{ data: { plugin: MarketplacePlugin, version: { version: string, unique_identifier: string } } }>('GET', `/plugins/${pluginId}`, undefined, () => pluginDb.latestVersion(pluginId))
