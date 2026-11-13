import type { KbAccessPolicy, KbMaterial } from '@/api/knowledge'
import { Popover } from '@base-ui/react/popover'
import { RiFileExcel2Line, RiFilePdf2Line, RiFilePpt2Line, RiFileTextLine, RiFileWord2Line, RiImageLine, RiMarkdownLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { KB_APP_URL } from '@/api/http'
import { cn } from '@/lib/cn'

export type Go = (path: string) => void

/* ---------- hash 查询参数：#kb/<lib>?doc=xxx ---------- */
function readQuery() {
  return new URLSearchParams(location.hash.split('?')[1] ?? '')
}
/** 读当前 hash 的 ?query（随 hashchange 更新） */
export function useHashQuery() {
  const [q, setQ] = useState(readQuery)
  useEffect(() => {
    const on = () => setQ(readQuery())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return q
}
/** 只改 query，保留 hash 路径 */
export function setHashQuery(patch: Record<string, string | null | undefined>) {
  const [path] = location.hash.slice(1).split('?')
  const q = readQuery()
  for (const [k, v] of Object.entries(patch)) {
    if (v)
      q.set(k, v)
    else
      q.delete(k)
  }
  const s = q.toString()
  location.hash = s ? `${path}?${s}` : path
}

/* ---------- 材料展示字段（对应知识库 materialPresentation） ---------- */
const textValues = (v: unknown) => [...new Set([v].flat().filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()))]

export function presentation(m: Partial<KbMaterial>) {
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(m.metadataJson || '{}')
  }
  catch {}
  return {
    title: m.documentName || m.originalFileName || '未命名材料',
    product: textValues(meta.product).join('、'),
    category: textValues(meta.category).join('、'),
    usageScopes: textValues([meta.usage_scope, meta.sourceScope].flat()),
    sourceTitle: textValues(meta.sourceTitle).join('、'),
    notes: textValues(meta.sourceNotes).join('、'),
    owner: textValues(meta.owner).join('、'),
    department: textValues(meta.department).join('、'),
    sourceStatus: textValues(meta.sourceStatus).join('、'),
    format: m.fileTypeName || '文件',
  }
}

/** 解析和索引都完成才能问答 */
export const isReady = (m: Pick<KbMaterial, 'parseStatus' | 'indexStatus'>) => m.parseStatus === '3' && m.indexStatus === '3'
export const isFailed = (m: Pick<KbMaterial, 'parseStatus' | 'indexStatus'>) => m.parseStatus === '4' || m.indexStatus === '4'

/* ---------- 格式图标 ---------- */
const FORMAT_STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>, tone: string }> = {
  PDF: { icon: RiFilePdf2Line, tone: 'bg-rose-soft text-rose' },
  Word: { icon: RiFileWord2Line, tone: 'bg-cyan-soft text-cyan' },
  Excel: { icon: RiFileExcel2Line, tone: 'bg-mint-soft text-mint' },
  PPT: { icon: RiFilePpt2Line, tone: 'bg-amber-soft text-amber' },
  Markdown: { icon: RiMarkdownLine, tone: 'bg-volt-soft text-volt-text' },
  图片: { icon: RiImageLine, tone: 'bg-cyan-soft text-cyan' },
}
export function formatStyle(format: string) {
  return FORMAT_STYLE[format] ?? { icon: RiFileTextLine, tone: 'bg-hover text-ink-2' }
}
export function FileGlyph({ format, size = 40, className }: { format: string, size?: number, className?: string }) {
  const { icon: Icon, tone } = formatStyle(format)
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl', tone, className)} style={{ width: size, height: size }}>
      <Icon className="size-[46%]" />
    </span>
  )
}
/** 文件扩展名 → 格式名（上传列表用） */
export function formatOfName(name: string) {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf')
    return 'PDF'
  if (['doc', 'docx'].includes(ext))
    return 'Word'
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return 'Excel'
  if (['ppt', 'pptx'].includes(ext))
    return 'PPT'
  if (['md', 'markdown'].includes(ext))
    return 'Markdown'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext))
    return '图片'
  return '文件'
}

/** 封面占位：没有缩略图接口时，用格式色块 + 标题做封面 */
export function CoverPlaceholder({ format, title, className }: { format: string, title: string, className?: string }) {
  const { icon: Icon, tone } = formatStyle(format)
  return (
    <div className={cn('relative grid place-items-center overflow-hidden rounded-2xl border border-line', tone, className)}>
      <div aria-hidden className="rx-dots absolute inset-0 opacity-40" />
      <div className="relative flex flex-col items-center gap-2 px-4 text-center">
        <Icon className="size-9" />
        <p className="line-clamp-2 text-[12.5px] font-medium text-ink">{title}</p>
      </div>
    </div>
  )
}

/* ---------- 格式化 ---------- */
export function fmtTime(iso?: string) {
  if (!iso)
    return '未提供'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return iso
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)
    return '刚刚'
  if (diff < 3_600_000)
    return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000)
    return `${Math.floor(diff / 3_600_000)} 小时前`
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
export function fmtSize(bytes?: string | number) {
  const n = Number(bytes)
  if (!n)
    return ''
  if (n < 1024 * 1024)
    return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** 浏览器下载 Blob */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---------- 跳转到完整知识库（未移植的功能） ---------- */
export const kbAppUrl = (path: string) => {
  if (!KB_APP_URL) return ''
  if (/^https:\/\//.test(path)) return path
  if (path.startsWith('/kb/')) return `${new URL(KB_APP_URL).origin}${path}`
  return `${KB_APP_URL.replace(/\/$/, '')}${path}`
}
export const KB_APP_HINT = '待配置完整知识库地址（VITE_KB_APP_URL）'

/* ---------- 范围词表 ---------- */
/** 对外使用范围标注（与上传表单的选项一致） */
export const USAGE_SCOPES = ['待确认', '仅内部', '仅总代', '可对伙伴', '可对客', '可公开'] as const
/** 材料的内部可见范围（access/mode） */
export const ACCESS_META: Record<KbAccessPolicy['accessMode'], { label: string, desc: string }> = {
  PRIVATE: { label: '仅自己', desc: '只有你能看到、检索和引用' },
  INHERIT: { label: '跟随知识库', desc: '与所在知识库的成员一致' },
  TENANT: { label: '公司内可见', desc: '同组织成员都能看到和检索' },
  CUSTOM: { label: '指定成员', desc: '只对单独授权的成员可见' },
}

/* ---------- 弹出层（列头筛选、范围编辑） ---------- */
export function Pop({ trigger, children, open, onOpenChange, align = 'start', className }: {
  trigger: React.ReactElement
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (o: boolean) => void
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <Popover.Root open={open} onOpenChange={o => onOpenChange?.(o)}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align={align} sideOffset={8} className="z-[74]">
          <Popover.Popup className={cn('glass-3 w-[260px] rounded-[24px] p-2 shadow-float outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0', className)}>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
