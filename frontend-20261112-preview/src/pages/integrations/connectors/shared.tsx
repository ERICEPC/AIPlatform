/* 连接器市场的通用小件：分类与发布方、品牌图标块、筛选胶囊、认证提示 */
import type { RemixiconComponentType } from '@remixicon/react'
import type { Connector, ConnectorAuth, ConnectorCategory, ConnectorPublisher, ConnectorSource } from '@/api/integrations'
import {
  RiAlibabaCloudFill, RiAlipayFill, RiAmazonFill, RiApps2Line, RiBaiduFill, RiBankCardLine, RiBarChartBoxLine, RiBrainFill, RiBriefcase4Line,
  RiChromeFill, RiCloudLine, RiCodeSSlashLine, RiDatabase2Line, RiDingdingFill, RiDiscordFill, RiDriveFill, RiFigmaFill, RiFileExcel2Fill,
  RiFireFill, RiFolder3Fill, RiGitBranchFill, RiGiteeFill, RiGithubFill, RiGitlabFill, RiGitRepositoryLine, RiGlobalFill, RiGoogleFill,
  RiKey2Line, RiLoginCircleLine, RiMapPin2Fill, RiMapPin2Line, RiMicrosoftFill, RiNotionFill, RiPaletteLine, RiPaypalFill, RiPerplexityFill,
  RiPlugLine, RiSearchLine, RiShieldKeyholeLine, RiSlackFill, RiSparklingLine, RiSupabaseFill, RiTerminalBoxLine, RiTimeFill, RiVercelFill,
  RiWechatFill, RiWindow2Line, RiYoutubeFill,
} from '@remixicon/react'
import { cn } from '@/lib/cn'

export type Tone = 'volt' | 'cyan' | 'mint' | 'amber' | 'rose' | 'neutral'

export const CATEGORY: Record<ConnectorCategory, { label: string, icon: RemixiconComponentType }> = {
  office: { label: '办公协作', icon: RiBriefcase4Line },
  devtools: { label: '开发工具', icon: RiCodeSSlashLine },
  code: { label: '代码托管', icon: RiGitRepositoryLine },
  database: { label: '数据库', icon: RiDatabase2Line },
  data: { label: '数据与分析', icon: RiBarChartBoxLine },
  search: { label: '搜索与网页', icon: RiSearchLine },
  browser: { label: '浏览器与设备自动化', icon: RiWindow2Line },
  cloud: { label: '云平台与运维', icon: RiCloudLine },
  design: { label: '设计与内容', icon: RiPaletteLine },
  life: { label: '地图与生活', icon: RiMapPin2Line },
  finance: { label: '金融支付', icon: RiBankCardLine },
  ai: { label: 'AI 与知识', icon: RiSparklingLine },
  security: { label: '安全', icon: RiShieldKeyholeLine },
  other: { label: '其他', icon: RiApps2Line },
}
export const CATEGORY_ORDER = Object.keys(CATEGORY) as ConnectorCategory[]

export const PUBLISHER: Record<ConnectorPublisher, { label: string, tone: Tone, hint: string }> = {
  official: { label: '官方', tone: 'cyan', hint: '由服务商官方维护' },
  community: { label: '社区', tone: 'neutral', hint: '开源社区维护，接入前请确认可信' },
  volcengine: { label: '火山引擎', tone: 'volt', hint: '火山引擎官方 MCP Server' },
}

export type SourceFilter = 'all' | ConnectorSource
export const SOURCE_LABEL: Record<SourceFilter, string> = { all: '全部', awesome: '精选社区', volcengine: '火山引擎' }

export const AUTH: Record<ConnectorAuth, { label: string, icon: RemixiconComponentType, tone: Tone }> = {
  oauth: { label: '账号授权（OAuth）', icon: RiLoginCircleLine, tone: 'cyan' },
  api_key: { label: '需要 API Key', icon: RiKey2Line, tone: 'amber' },
  env: { label: '需要填写密钥 / 配置', icon: RiKey2Line, tone: 'amber' },
  none: { label: '无需凭证', icon: RiPlugLine, tone: 'mint' },
}

export const toneCls: Record<Tone, string> = {
  volt: 'bg-volt-soft text-volt-text',
  cyan: 'bg-cyan-soft text-cyan',
  mint: 'bg-mint-soft text-mint',
  amber: 'bg-amber-soft text-amber',
  rose: 'bg-rose-soft text-rose',
  neutral: 'bg-hover text-ink-2',
}

export const fmtPopularity = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('zh-CN'))
export const errText = (e: unknown) => (e instanceof Error ? e.message : '操作失败，请稍后重试')

/* ---------- 品牌图标块 ---------- */
const BRAND_ICON: Record<string, RemixiconComponentType> = {
  'github': RiGithubFill,
  'gitlab': RiGitlabFill,
  'gitee': RiGiteeFill,
  'git': RiGitBranchFill,
  'notion': RiNotionFill,
  'slack': RiSlackFill,
  'figma': RiFigmaFill,
  'google': RiGoogleFill,
  'google-drive': RiDriveFill,
  'google-cloud': RiGoogleFill,
  'google-maps': RiMapPin2Fill,
  'microsoft': RiMicrosoftFill,
  'azure': RiMicrosoftFill,
  'excel': RiFileExcel2Fill,
  'discord': RiDiscordFill,
  'dingtalk': RiDingdingFill,
  'wechat': RiWechatFill,
  'alipay': RiAlipayFill,
  'paypal': RiPaypalFill,
  'baidu': RiBaiduFill,
  'aliyun': RiAlibabaCloudFill,
  'aws': RiAmazonFill,
  'supabase': RiSupabaseFill,
  'vercel': RiVercelFill,
  'chrome': RiChromeFill,
  'perplexity': RiPerplexityFill,
  'youtube': RiYoutubeFill,
  'folder': RiFolder3Fill,
  'brain': RiBrainFill,
  'time': RiTimeFill,
  'globe': RiGlobalFill,
  'thinking': RiBrainFill,
}

/** 名称 → 稳定的兜底色 */
const FALLBACK = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899']
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** 浅色品牌色上用深色前景 */
function isLight(hex: string) {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(n))
    return false
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.68
}

export function ConnectorTile({ c, size = 44, className }: { c: Pick<Connector, 'name' | 'brand' | 'color' | 'mono' | 'publisher'>, size?: number, className?: string }) {
  const radius = Math.round(size * 0.3)
  const volc = c.publisher === 'volcengine'
  const color = c.color ?? FALLBACK[hash(c.name) % FALLBACK.length]
  const Icon = !volc && c.brand ? BRAND_ICON[c.brand] : undefined
  const fg = isLight(color) ? '#111827' : '#ffffff'
  const text = c.mono ?? c.name.replace(/[^A-Z0-9一-龥]/gi, '').slice(0, 2).toUpperCase()
  const len = [...text].reduce((n, ch) => n + (/[一-龥]/.test(ch) ? 1.7 : 1), 0)
  return (
    <span
      className={cn('relative grid shrink-0 place-items-center overflow-hidden font-bold shadow-[0_8px_18px_-10px_rgba(0,0,0,0.45)] ring-1 ring-black/5 ring-inset', className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        color: fg,
        background: volc ? 'linear-gradient(140deg, #1664ff 0%, #2f88ff 55%, #00b2ff 100%)' : color,
        fontSize: size * (len > 4 ? 0.22 : len > 3 ? 0.26 : len > 2 ? 0.3 : 0.38),
        letterSpacing: len > 3 ? '-0.02em' : undefined,
      }}
      aria-hidden
    >
      {Icon ? <Icon style={{ width: size * 0.52, height: size * 0.52 }} /> : <span className="leading-none">{text}</span>}
      {volc && <RiFireFill className="absolute right-[7%] bottom-[7%] text-white/70" style={{ width: size * 0.26, height: size * 0.26 }} />}
    </span>
  )
}

/* ---------- 筛选胶囊（与 Skills 市场一致） ---------- */
export function Chip({ active, onClick, label, count, icon }: { active: boolean, onClick: () => void, label: string, count?: number, icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] transition-[background-color,border-color,color] duration-150',
        active ? 'border-transparent bg-volt font-medium text-volt-ink' : 'border-line text-ink-2 hover:border-line-strong hover:bg-hover hover:text-ink',
      )}
    >
      {icon}
      {label}
      {count !== undefined && <span className={cn('tabular-nums', active ? 'opacity-70' : 'text-ink-3')}>{count}</span>}
    </button>
  )
}

/** 连接方式小标：远程 / 本地命令 */
export function TransportHints({ c, className }: { c: Pick<Connector, 'remote' | 'local'>, className?: string }) {
  return (
    <span className={cn('flex items-center gap-1 text-ink-3', className)}>
      {c.remote && <span className="flex items-center gap-0.5"><RiGlobalFill className="size-3" />远程</span>}
      {c.remote && c.local && <span aria-hidden>·</span>}
      {c.local && <span className="flex items-center gap-0.5"><RiTerminalBoxLine className="size-3" />本地</span>}
    </span>
  )
}
