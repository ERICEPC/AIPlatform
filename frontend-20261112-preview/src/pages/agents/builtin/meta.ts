import type { AgentAppPartial, BuddyId } from '@/api/agents'

/* 企服 Buddy 与内置 Agent 的展示辅助：Buddy 文案、图标映射、名称解析、分组 */

export type BuddyMeta = { id: BuddyId, name: string, icon: string, intro: string }
export const BUDDIES: BuddyMeta[] = [
  { id: 'sales', name: 'SalesBuddy', icon: '/raccoon-emoji-v1/007-sales.webp', intro: '拜访记录、商机经营、客户作战地图、销售周报，一线销售的随身助手。' },
  { id: 'project', name: 'ProjectBuddy', icon: '/raccoon-emoji-v1/035-project.webp', intro: '排期拆解、里程碑跟踪、延期与资源风险预警。' },
  { id: 'hr', name: 'HRBuddy', icon: '/raccoon-emoji-v1/011-hr.webp', intro: '制度问答、入转调离指引、假勤查询。' },
  { id: 'service', name: '客服 Buddy', icon: '/raccoon-emoji-v1/006-support.webp', intro: '工单分类定级、知识检索、回复建议与质检。' },
]
export const buddyMeta = (id: BuddyId) => BUDDIES.find(b => b.id === id) ?? BUDDIES[0]

/** 旧门户的 rx:* 图标名 → 浣熊表情图 */
const RX_ICONS: Record<string, string> = {
  'finance': '009-finance',
  'presentation': '027-presentation',
  'planning': '028-planning',
  'data': '005-data',
  'sales': '007-sales',
  'review': '030-review',
  'note-taking': '025-note-taking',
  'training': '083-training',
  'support': '006-support',
  'meeting': '034-meeting',
  'project': '035-project',
  'hr': '011-hr',
  'legal': '010-legal',
  'research': '026-research',
  'writing': '033-writing',
  'ai': '042-ai',
}
export function rxIconUrl(icon?: string | null) {
  if (icon?.startsWith('/'))
    return icon
  const key = (icon ?? '').replace(/^rx:/, '')
  return `/raccoon-emoji-v1/${RX_ICONS[key] ?? '042-ai'}.webp`
}

/** 给 AgentIcon 用：内置 Agent 的 icon 是 rx:* 名称，统一换成图片 */
export const builtinIcon = (a: Pick<AgentAppPartial, 'name' | 'icon' | 'icon_url'>) => ({
  name: a.name,
  icon_url: a.icon_url || rxIconUrl(a.icon),
  icon_type: 'image' as const,
  icon: null,
  icon_background: null,
})

export type ParsedName = { title: string, tags: string[], beta: boolean }

/**
 * 「销售智助-客户经营建议-V1」→ { title: 客户经营建议, tags: [V1] }
 * 去掉产品前缀（销售智助 / Raccoon SalesBuddy），末尾的 V1 / BETA / 独立验收 / 日期 变成标签
 */
export function parseName(name: string): ParsedName {
  const parts = name.split(/\s*[-—–]+\s*/).map(s => s.trim()).filter(Boolean)
  const core: string[] = []
  const tags: string[] = []
  let beta = false
  parts.forEach((p, i) => {
    if (i === 0 && parts.length > 1 && /^(销售智助|(Raccoon\s+)?SalesBuddy)$/i.test(p))
      return
    if (/^v\d+$/i.test(p))
      tags.push(p.toUpperCase())
    else if (/^beta$/i.test(p)) {
      beta = true
      tags.push('BETA')
    }
    else if (/^\d{8}$/.test(p))
      tags.push(`${p.slice(4, 6)}-${p.slice(6)}`)
    else if (core.length && /验收|测试/.test(p))
      tags.push(p)
    else
      core.push(p)
  })
  return { title: core.join(' · ') || name, tags, beta }
}

export type GroupId = 'visit' | 'opportunity' | 'customer' | 'report' | 'operation'
export const GROUPS: { id: GroupId, label: string, test: RegExp }[] = [
  { id: 'visit', label: '拜访', test: /拜访/ },
  { id: 'opportunity', label: '商机', test: /商机/ },
  { id: 'customer', label: '客户', test: /客户|作战地图/ },
  { id: 'report', label: '周报', test: /周报|工作报告|周会|总结/ },
  { id: 'operation', label: '经营', test: /.*/ },
]
/** 按名称归组：依次匹配，第一个命中的组；都不命中归「经营」（问数、财务、待办、能力复盘） */
export const groupOf = (name: string): GroupId => GROUPS.find(g => g.test.test(name))!.id

export function fullDate(sec?: number | null) {
  if (!sec)
    return '—'
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export const versionLabel = (v?: number | null) => (v == null ? '—' : `v${v}`)
