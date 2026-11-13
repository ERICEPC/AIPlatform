/*
  Skills 模块接口层：类型 + 请求函数。
  三类技能：
    原生 native  平台内置的基础办公能力，始终启用
    本地 local   用户自己的技能：上传文件、从 GitHub 导入、从技能市场安装
    市场 market  SkillHub，内容同步自 SenseNova-Skills（github.com/OpenSenseNova/SenseNova-Skills）
  每个技能遵循 Agent Skills 规范：一个目录 + SKILL.md（front matter 声明 name / description）。
  前缀 /console/api 由 http.ts 添加；时间戳均为 Unix 秒。
  这是 RaccoonX 新增模块，原控制台没有对应契约，路径为新前端约定，后端接入时需确认。
*/
import { request } from './http'
import { db } from './mock/skills'

/* ================= 通用 ================= */
export type SkillFile = { path: string, size: number }

/* ================= 原生 ================= */
export type NativeSkillGroup = 'document' | 'data' | 'productivity'

export type NativeSkill = {
  id: string
  name: string
  /** 一行说明 */
  description: string
  group: NativeSkillGroup
  /** 图标 key，前端映射到图标 */
  icon: string
  /** 原生技能始终启用，后端仍返回该字段便于将来按租户关闭 */
  enabled: boolean
  /** 能做的事（详情抽屉） */
  capabilities: string[]
  /** 对助手说的示例 */
  examples: string[]
  /** 支持的文件类型，例如 .docx */
  file_types?: string[]
}

/* ================= 本地 ================= */
export type LocalSkillSource = 'upload' | 'github' | 'market'

export type LocalSkill = {
  id: string
  /** SKILL.md 中的 name，同一工作区唯一 */
  name: string
  description: string
  source: LocalSkillSource
  version: string
  enabled: boolean
  installed_at: number
  updated_at: number
  /** 上传：原始文件名 */
  file_name?: string | null
  /** GitHub / 市场：仓库目录地址 */
  source_url?: string | null
  /** GitHub：分支或标签 */
  ref?: string | null
  /** 远端有新版本（GitHub / 市场来源） */
  has_update?: boolean
  files: SkillFile[]
  /** 安装人 */
  installed_by?: string | null
}

export type UploadSkillResponse = LocalSkill

export type GithubResolvePayload = { url: string }
export type GithubResolveResult = {
  url: string
  owner: string
  repo: string
  ref: string
  /** 仓库内目录，空字符串表示仓库根目录 */
  path: string
  name: string
  description: string
  version: string
  files: SkillFile[]
  /** 已安装过同名技能时返回其 id，安装会覆盖为新版本 */
  installed_id?: string | null
}
export type GithubInstallPayload = { url: string, ref: string, path: string }

export type LocalSkillPatch = { enabled: boolean }

/* ================= 市场 ================= */
export type MarketCategory = 'image' | 'ppt' | 'data' | 'research' | 'search' | 'video' | 'html' | 'collab' | 'other'

export type MarketSkill = {
  /** 仓库 skills/ 下的目录名，即技能 name */
  name: string
  /** README 中的标签 */
  tag: string
  category: MarketCategory
  description: string
  /** 运行前需要准备的东西：API Key、环境变量、本地依赖 */
  requires: string[]
  /** 依赖的其他市场技能，安装时一并安装 */
  depends_on: string[]
  /** 是否已安装到本地（安装后出现在「本地」，来源为市场） */
  installed: boolean
  local_id?: string | null
}

export type MarketQuery = { category?: MarketCategory, keyword?: string }

export type MarketSource = {
  repo: string
  url: string
  /** 最近一次同步时间 */
  synced_at: number
  /** 同步时的提交 */
  commit?: string | null
}

export type MarketListResponse = {
  source: MarketSource
  /** 各分类数量（不受 category / keyword 过滤影响） */
  categories: { id: MarketCategory, count: number }[]
  data: MarketSkill[]
}

export type MarketInstallResponse = {
  skill: LocalSkill
  /** 随之安装的依赖技能 name */
  installed_dependencies: string[]
}

/* ================= 接口 ================= */

/** GET /skills/native 原生技能列表 */
export const listNativeSkills = () =>
  request<{ data: NativeSkill[] }>({ method: 'GET', path: '/skills/native' }, () => db.listNative())

/** GET /skills/local 本地技能列表（上传 / GitHub / 市场安装） */
export const listLocalSkills = () =>
  request<{ data: LocalSkill[] }>({ method: 'GET', path: '/skills/local' }, () => db.listLocal())

/** GET /skills/local/{id} 本地技能详情（含文件清单） */
export const getLocalSkill = (id: string) =>
  request<LocalSkill>({ method: 'GET', path: `/skills/local/${id}` }, () => db.getLocal(id))

/** POST /skills/local/upload 上传技能（multipart，字段 file：.md SKILL.md / .json / .zip 技能包） */
export const uploadLocalSkill = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request<UploadSkillResponse>({ method: 'POST', path: '/skills/local/upload', form }, () => db.upload(file))
}

/** POST /skills/local/github/resolve 解析 GitHub 仓库或目录地址，返回 SKILL.md 信息与文件清单（不安装） */
export const resolveGithubSkill = (body: GithubResolvePayload) =>
  request<GithubResolveResult>({ method: 'POST', path: '/skills/local/github/resolve', body }, () => db.resolveGithub(body.url))

/** POST /skills/local/github/install 从 GitHub 安装（同名已存在时覆盖为新版本） */
export const installGithubSkill = (body: GithubInstallPayload) =>
  request<LocalSkill>({ method: 'POST', path: '/skills/local/github/install', body }, () => db.installGithub(body))

/** POST /skills/local/{id}/update 从来源（GitHub / 市场）拉取最新版本 */
export const updateLocalSkill = (id: string) =>
  request<LocalSkill>({ method: 'POST', path: `/skills/local/${id}/update` }, () => db.updateLocal(id))

/** PATCH /skills/local/{id} 启用 / 停用 */
export const patchLocalSkill = (id: string, body: LocalSkillPatch) =>
  request<LocalSkill>({ method: 'PATCH', path: `/skills/local/${id}`, body }, () => db.patchLocal(id, body))

/** DELETE /skills/local/{id} 删除本地技能（市场来源删除后可重新安装） */
export const deleteLocalSkill = (id: string) =>
  request<{ result: 'success' }>({ method: 'DELETE', path: `/skills/local/${id}` }, () => db.deleteLocal(id))

/** GET /skills/market 技能市场列表，按 category / keyword 过滤 */
export const listMarketSkills = (query: MarketQuery = {}) =>
  request<MarketListResponse>({ method: 'GET', path: '/skills/market', query }, () => db.listMarket(query))

/** POST /skills/market/{name}/install 从市场安装（连同依赖技能），安装后出现在本地列表 */
export const installMarketSkill = (name: string) =>
  request<MarketInstallResponse>({ method: 'POST', path: `/skills/market/${encodeURIComponent(name)}/install` }, () => db.installMarket(name))
