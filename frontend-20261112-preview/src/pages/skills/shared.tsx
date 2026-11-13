import type { RemixiconComponentType } from '@remixicon/react'
import type { Variants } from 'motion/react'
import type { LocalSkillSource, MarketCategory } from '@/api/skills'
import {
  RiApps2Line, RiArrowLeftRightLine, RiBarChartBoxLine, RiBrainLine, RiDashboard3Line, RiFileExcel2Line, RiFilePdf2Line, RiFileTransferLine,
  RiFileWord2Line, RiGlobalLine, RiHtml5Line, RiImageLine, RiMicroscopeLine, RiMovie2Line, RiPaletteLine, RiRoadMapLine, RiScan2Line,
  RiSearchEyeLine, RiSearchLine, RiSlideshow2Line, RiTeamLine, RiTimerLine, RiTranslate2,
} from '@remixicon/react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'

/* Skills 模块内的通用小件 */

export type SkillTab = 'native' | 'local' | 'market'
export const TABS: SkillTab[] = ['native', 'local', 'market']
export type Go = (path: string) => void

export const errText = (e: unknown) => (e instanceof Error ? e.message : '操作失败，请稍后重试')

/** Unix 秒 → 「刚刚 / 5 分钟前 / 昨天 / 10月28日」 */
export function fromNow(sec?: number | null) {
  if (!sec)
    return '—'
  const diff = Date.now() / 1000 - sec
  if (diff < 60)
    return '刚刚'
  if (diff < 3600)
    return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400)
    return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 172800)
    return '昨天'
  const d = new Date(sec * 1000)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function dateTime(sec?: number | null) {
  if (!sec)
    return '—'
  const d = new Date(sec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fileSize(n?: number | null) {
  if (n == null)
    return ''
  if (n < 1024)
    return `${n} B`
  if (n < 1024 * 1024)
    return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms)
    return () => clearTimeout(h)
  }, [value, ms])
  return v
}

/* ---------- 动效：分区面板进场 + 子项错峰 ---------- */
export const panelVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.32, ease: ease.out, staggerChildren: 0.025 } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14 } },
}
export const itemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.36, ease: ease.out } },
}

/* ---------- 图标块 ---------- */
type Tone = 'volt' | 'cyan' | 'mint' | 'amber' | 'rose' | 'neutral'
const toneCls: Record<Tone, string> = {
  volt: 'bg-volt-soft text-volt-text',
  cyan: 'bg-cyan-soft text-cyan',
  mint: 'bg-mint-soft text-mint',
  amber: 'bg-amber-soft text-amber',
  rose: 'bg-rose-soft text-rose',
  neutral: 'bg-hover text-ink-2',
}

export function IconTile({ icon: Icon, tone = 'neutral', size = 40, className }: { icon: RemixiconComponentType, tone?: Tone, size?: number, className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-[14px] border border-line', toneCls[tone], className)} style={{ width: size, height: size }}>
      <Icon className="size-[46%]" />
    </span>
  )
}

/** 名称首字母块：本地技能没有图标时用 */
export function Monogram({ name, size = 40 }: { name: string, size?: number }) {
  const tones: Tone[] = ['volt', 'cyan', 'mint', 'amber', 'rose']
  const h = [...name].reduce((s, c) => s + c.charCodeAt(0), 0)
  const ch = name.replace(/^sn-/, '').trim().charAt(0).toUpperCase() || '?'
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-[14px] border border-line font-semibold', toneCls[tones[h % tones.length]])} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {ch}
    </span>
  )
}

/* ---------- 原生技能图标 ---------- */
export const NATIVE_ICON: Record<string, { icon: RemixiconComponentType, tone: Tone }> = {
  word: { icon: RiFileWord2Line, tone: 'cyan' },
  pdf: { icon: RiFilePdf2Line, tone: 'rose' },
  excel: { icon: RiFileExcel2Line, tone: 'mint' },
  slides: { icon: RiSlideshow2Line, tone: 'amber' },
  convert: { icon: RiFileTransferLine, tone: 'cyan' },
  swap: { icon: RiArrowLeftRightLine, tone: 'volt' },
  ocr: { icon: RiScan2Line, tone: 'neutral' },
  translate: { icon: RiTranslate2, tone: 'cyan' },
  dashboard: { icon: RiDashboard3Line, tone: 'mint' },
  palette: { icon: RiPaletteLine, tone: 'rose' },
  research: { icon: RiSearchEyeLine, tone: 'volt' },
  browser: { icon: RiGlobalLine, tone: 'cyan' },
  memory: { icon: RiBrainLine, tone: 'amber' },
  timer: { icon: RiTimerLine, tone: 'mint' },
  roadmap: { icon: RiRoadMapLine, tone: 'neutral' },
}
export const nativeIcon = (key: string) => NATIVE_ICON[key] ?? { icon: RiApps2Line, tone: 'neutral' as Tone }

/* ---------- 市场分类 ---------- */
export const CATEGORY: Record<MarketCategory, { label: string, icon: RemixiconComponentType, tone: Tone }> = {
  image: { label: '图像与可视化', icon: RiImageLine, tone: 'rose' },
  ppt: { label: '演示文稿（PPT）', icon: RiSlideshow2Line, tone: 'amber' },
  data: { label: '数据分析', icon: RiBarChartBoxLine, tone: 'mint' },
  research: { label: '深度研究', icon: RiMicroscopeLine, tone: 'volt' },
  search: { label: '搜索', icon: RiSearchLine, tone: 'cyan' },
  video: { label: '代码视频创作', icon: RiMovie2Line, tone: 'rose' },
  html: { label: 'HTML 网页', icon: RiHtml5Line, tone: 'amber' },
  collab: { label: '团队协作 / 项目跟踪', icon: RiTeamLine, tone: 'cyan' },
  other: { label: '其他', icon: RiApps2Line, tone: 'neutral' },
}
export const CATEGORY_ORDER: MarketCategory[] = ['image', 'ppt', 'data', 'research', 'search', 'video', 'html', 'collab', 'other']

/* ---------- 来源 ---------- */
export const SOURCE_LABEL: Record<LocalSkillSource, string> = { upload: '上传', github: 'GitHub', market: '市场' }
export function SourceBadge({ source }: { source: LocalSkillSource }) {
  const tone = source === 'market' ? 'cyan' : source === 'github' ? 'neutral' : 'amber'
  return <Badge tone={tone}>{SOURCE_LABEL[source]}</Badge>
}

/* ---------- GitHub 地址校验（客户端） ---------- */
const GH = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([\w.-]+)(?:\/(.*?))?)?\/?$/
export function parseGithubUrl(url: string): { owner: string, repo: string, ref: string, path: string } | null {
  const r = GH.exec(url.trim())
  if (!r)
    return null
  return { owner: r[1], repo: r[2], ref: r[3] ?? 'main', path: (r[4] ?? '').replace(/\/?SKILL\.md$/i, '') }
}
export function githubUrlError(url: string) {
  const v = url.trim()
  if (!v)
    return '请粘贴 GitHub 仓库或技能目录地址'
  if (!/^https:\/\/github\.com\//.test(v))
    return '只支持 https://github.com/ 开头的地址'
  if (!parseGithubUrl(v))
    return '格式不对，示例：https://github.com/owner/repo/tree/main/skills/xxx'
  return ''
}

/* ---------- 分组小标题 ---------- */
export function GroupTitle({ title, count, hint }: { title: string, count?: number, hint?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2 px-1">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      {count !== undefined && <span className="text-[12px] text-ink-3 tabular-nums">{count}</span>}
      {hint && <span className="ml-auto text-[12px] text-ink-3">{hint}</span>}
    </div>
  )
}
