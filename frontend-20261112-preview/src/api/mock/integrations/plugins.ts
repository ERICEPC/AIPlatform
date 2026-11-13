/* 插件通用 mock：权限、调试、安装（插件市场 / GitHub / 本地包）、安装任务、卸载、自动更新、插件市场搜索 */
import type {
  AutoUpgradeSetting, InstallResponse, MarketplacePlugin, PluginCategory, PluginDeclaration, PluginPermission, PluginSource, PluginTask, UploadResponse,
} from '../../integrations/types'
import { ApiError, mockId, nowIso } from '../../http'
import { catalog, declarationFrom, detailFrom, findCatalog, installed, isInstalled } from './catalog'
import { syncEndpointCounts } from './others'

let permission: PluginPermission = { install_permission: 'admins', debug_permission: 'admins' }
const debugKey = { host: 'debug.raccoonx.sensetime.com', port: 5003, key: 'b7e0c2f1-5d4a-49c8-9e3a-6f1d0a2c8e47' }

let tasks: PluginTask[] = []
const uploads: Record<string, { decl: PluginDeclaration, source: PluginSource, meta?: { repo: string, version: string, package: string } }> = {}

const autoUpgrade: Record<string, AutoUpgradeSetting> = {}
const defaultUpgrade = (): AutoUpgradeSetting => ({ strategy_setting: 'fix_only', upgrade_time_of_day: 2 * 3600, upgrade_mode: 'all', exclude_plugins: [], include_plugins: [] })

/** 建一个安装任务：约 2.4 秒后完成，把插件写入已安装列表 */
function startTask(items: { decl: PluginDeclaration, source: PluginSource, meta?: { repo: string, version: string, package: string }, latest?: string }[]): InstallResponse {
  const task: PluginTask = {
    id: mockId('task'),
    created_at: nowIso(),
    updated_at: nowIso(),
    status: 'running',
    total_plugins: items.length,
    completed_plugins: 0,
    plugins: items.map(i => ({ plugin_unique_identifier: i.decl.plugin_unique_identifier, plugin_id: `${i.decl.author}/${i.decl.name}`, status: 'running', message: '', icon: i.decl.icon, labels: i.decl.label })),
  }
  tasks = [task, ...tasks]
  items.forEach((it, idx) => {
    setTimeout(() => {
      const row = task.plugins[idx]
      const pid = `${it.decl.author}/${it.decl.name}`
      // 演示失败：包名里带 broken 的本地包安装失败
      if (it.decl.name.includes('broken')) {
        row.status = 'failed'
        row.message = '插件签名校验失败：该插件包未经验证，请联系管理员在权限里允许安装未签名插件'
      }
      else {
        const existing = installed.findIndex(p => p.plugin_id === pid)
        const detail = detailFrom(it.decl, it.source, it.latest ?? it.decl.version, it.meta)
        if (existing >= 0)
          installed.splice(existing, 1, { ...detail, id: installed[existing].id, installation_id: installed[existing].installation_id })
        else
          installed.push(detail)
        row.status = 'success'
        syncEndpointCounts()
      }
      task.completed_plugins += 1
      task.updated_at = nowIso()
      if (task.completed_plugins === task.total_plugins)
        task.status = task.plugins.some(p => p.status === 'failed') ? 'failed' : 'success'
    }, 1800 + idx * 700 + Math.random() * 600)
  })
  return { all_installed: false, task_id: task.id }
}

export const pluginDb = {
  permission: () => permission,
  setPermission(p: PluginPermission) {
    permission = { ...p }
    return { success: true }
  },
  debugKey: () => debugKey,

  tasks: () => ({ tasks }),
  clearTaskPlugin(taskId: string, identifier: string) {
    tasks = tasks.map(t => (t.id === taskId ? { ...t, plugins: t.plugins.filter(p => p.plugin_unique_identifier !== identifier) } : t)).filter(t => t.plugins.length > 0)
    return { success: true }
  },

  installMarketplace(ids: string[]) {
    const items = ids.map((uid) => {
      const pid = uid.split(':')[0]
      const item = findCatalog(pid)
      if (!item)
        throw new ApiError(`插件市场中找不到 ${pid}`, 404)
      const version = uid.split(':')[1]?.split('@')[0] ?? item.version
      return { decl: { ...declarationFrom(item, version), plugin_unique_identifier: uid }, source: 'marketplace' as const, latest: item.latest_version }
    })
    return startTask(items)
  },
  uploadGithub(repo: string, version: string, pkg: string): UploadResponse {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo.replace(/^https:\/\/github\.com\//, '')))
      throw new ApiError('仓库地址格式不对，应为 https://github.com/owner/repo', 400)
    const name = repo.split('/').pop()!.replace(/[-_]?plugin$/, '').replace(/\W/g, '_').toLowerCase() || 'github_plugin'
    const org = repo.replace(/^https:\/\/github\.com\//, '').split('/')[0]
    const decl: PluginDeclaration = { plugin_unique_identifier: `${org}/${name}:${version.replace(/^v/, '')}@${Math.random().toString(16).slice(2, 10)}`, version: version.replace(/^v/, ''), author: org, icon: `tile:${name.slice(0, 2).toUpperCase()}:#24292f`, name, category: 'tool', label: { zh_Hans: name, en_US: name }, description: { zh_Hans: `来自 ${repo} 的插件`, en_US: repo }, created_at: nowIso(), tags: ['utilities'] }
    uploads[decl.plugin_unique_identifier] = { decl, source: 'github', meta: { repo, version, package: pkg } }
    return { unique_identifier: decl.plugin_unique_identifier, manifest: decl }
  },
  uploadPkg(file: File | undefined): UploadResponse {
    if (!file)
      throw new ApiError('没有选择文件', 400)
    const base = file.name.replace(/\.(difypkg|difybndl|pkg)$/i, '').replace(/\W/g, '_').toLowerCase() || 'local_plugin'
    const decl: PluginDeclaration = { plugin_unique_identifier: `sensetime/${base}:0.0.1@${Math.random().toString(16).slice(2, 10)}`, version: '0.0.1', author: 'sensetime', icon: `tile:${base.slice(0, 2).toUpperCase()}:#64748b`, name: base, category: 'tool', label: { zh_Hans: base, en_US: base }, description: { zh_Hans: `本地上传：${file.name}`, en_US: file.name }, created_at: nowIso(), tags: [] }
    uploads[decl.plugin_unique_identifier] = { decl, source: 'package' }
    return { unique_identifier: decl.plugin_unique_identifier, manifest: decl }
  },
  installUploaded(ids: string[]) {
    return startTask(ids.map((id) => {
      const u = uploads[id]
      if (!u)
        throw new ApiError('上传记录已过期，请重新上传', 400)
      return u
    }))
  },
  upgradeMarketplace(_original: string, next: string) {
    return pluginDb.installMarketplace([next])
  },
  uninstall(installationId: string) {
    const i = installed.findIndex(p => p.installation_id === installationId)
    if (i < 0)
      throw new ApiError('插件不存在或已卸载', 404)
    installed.splice(i, 1)
    return { success: true }
  },
  readme(uid: string) {
    const p = installed.find(x => x.plugin_unique_identifier === uid)
    const label = p?.declaration.label.zh_Hans ?? '插件'
    return { readme: `# ${label}\n\n${p?.declaration.description.zh_Hans ?? ''}\n\n## 使用前准备\n\n1. 在服务商控制台创建凭据（API Key 或 OAuth 应用）。\n2. 回到「集成」，在插件卡片上完成授权。\n3. 在 Agent 或工作流里添加该插件提供的能力。\n\n## 常见问题\n\n- **授权后仍提示未授权？** 检查凭据的「谁可以使用」是否包含当前成员。\n- **调用超时？** 内网服务请确认已加入出口白名单。` }
  },
  latestVersion(pid: string) {
    const item = findCatalog(pid)
    if (!item)
      throw new ApiError('该插件不在插件市场，无法检查更新', 404)
    return { data: { plugin: item, version: { version: item.latest_version, unique_identifier: item.latest_package_identifier } } }
  },

  autoUpgrade: (category: string) => ({ auto_upgrade: autoUpgrade[category] ?? defaultUpgrade() }),
  setAutoUpgrade(category: string, s: AutoUpgradeSetting) {
    autoUpgrade[category] = { ...s }
    return { success: true }
  },

  search(body: { category?: PluginCategory, query?: string, page?: number, page_size?: number, exclude_installed?: boolean }) {
    const q = (body.query ?? '').trim().toLowerCase()
    const list = catalog
      .filter(c => !body.category || c.category === body.category)
      .filter(c => !q || `${c.name} ${c.label.zh_Hans} ${c.brief.zh_Hans} ${c.org}`.toLowerCase().includes(q))
      .filter(c => !body.exclude_installed || !isInstalled(c.plugin_id))
      .sort((a, b) => b.install_count - a.install_count)
    const size = body.page_size ?? 40
    const page = body.page ?? 1
    return { data: { plugins: list.slice((page - 1) * size, page * size) as MarketplacePlugin[], total: list.length } }
  },
}
