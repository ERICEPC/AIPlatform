/*
  企服 Buddy 内置 Agent mock：原 RaccoonX 门户 SalesBuddy 名册下的 18 个内置 Agent，配置原样搬过来
  （data/builtin-agents-full.json：GET /agent?scope=roster、/agent/{id}、/agent/{id}/composer、/agent/{id}/versions/{vid} 的原始返回，
  只去掉了 access_token / credential_ref / secret_refs 等凭据字段）。
*/
import type { AgentSoul, SnapshotSummary } from '../agents'
import raw from './data/builtin-agents-full.json'

type RawVersion = SnapshotSummary & { config_snapshot?: AgentSoul | null }
type RawAgent = {
  list: { id: string, name: string, role?: string | null, description?: string | null, icon?: string | null, icon_background?: string | null, created_at: number, updated_at: number, active_config_is_published?: boolean }
  detail: { enable_site?: boolean, enable_api?: boolean } | null
  composer: { agent_soul: AgentSoul, active_config_is_published?: boolean }
  versions: RawVersion[]
}

const AGENTS = raw as unknown as RawAgent[]

/** 交给 Agent 主存储：内置 Agent 与「我的」共用同一套详情 / 配置 / 发布逻辑 */
export function builtinSeeds() {
  return AGENTS.map(({ list: a, detail, composer, versions }) => ({
    id: a.id,
    name: a.name,
    role: a.role ?? '',
    description: a.description ?? '',
    icon: a.icon ?? '',
    created_at: a.created_at,
    updated_at: a.updated_at,
    published: !!(composer.active_config_is_published ?? a.active_config_is_published),
    enable_site: !!detail?.enable_site,
    enable_api: !!detail?.enable_api,
    soul: composer.agent_soul,
    // 版本按时间倒序；每个版本带当时的完整配置快照
    versions: versions
      .slice()
      .sort((x, y) => (y.created_at ?? 0) - (x.created_at ?? 0))
      .map(({ config_snapshot, ...v }) => ({ ...v, created_by_name: v.created_by_name ?? '企业服务', soul: config_snapshot ?? composer.agent_soul })),
  }))
}
