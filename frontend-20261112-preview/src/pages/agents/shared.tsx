import type { AgentAppPartial, I18nText } from '@/api/agents'
import { RiAddLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'

/* Agents 模块内的通用小件 */

export const tx = (t?: I18nText | null) => (t ? t.zh_Hans || t.en_US : '')

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

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms)
    return () => clearTimeout(h)
  }, [value, ms])
  return v
}

export function downloadText(name: string, text: string, type = 'text/yaml') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function openUrl(url: string) {
  window.open(url, '_blank', 'noopener')
}

/* 头像：浣熊表情图；没有图标时显示首字 */
export const RACCOON_ICONS = ["/raccoon-emoji-v1/001-reading.webp", "/raccoon-emoji-v1/002-office.webp", "/raccoon-emoji-v1/003-teamwork.webp", "/raccoon-emoji-v1/004-programming.webp", "/raccoon-emoji-v1/005-data.webp", "/raccoon-emoji-v1/006-support.webp", "/raccoon-emoji-v1/007-sales.webp", "/raccoon-emoji-v1/008-marketing.webp", "/raccoon-emoji-v1/009-finance.webp", "/raccoon-emoji-v1/010-legal.webp", "/raccoon-emoji-v1/011-hr.webp", "/raccoon-emoji-v1/012-education.webp", "/raccoon-emoji-v1/013-healthcare.webp", "/raccoon-emoji-v1/014-science.webp", "/raccoon-emoji-v1/015-manufacturing.webp", "/raccoon-emoji-v1/016-construction.webp", "/raccoon-emoji-v1/017-logistics.webp", "/raccoon-emoji-v1/018-retail.webp", "/raccoon-emoji-v1/019-food.webp", "/raccoon-emoji-v1/020-agriculture.webp", "/raccoon-emoji-v1/021-energy.webp", "/raccoon-emoji-v1/022-travel.webp", "/raccoon-emoji-v1/023-media.webp", "/raccoon-emoji-v1/024-public-service.webp", "/raccoon-emoji-v1/025-note-taking.webp", "/raccoon-emoji-v1/026-research.webp", "/raccoon-emoji-v1/027-presentation.webp", "/raccoon-emoji-v1/028-planning.webp", "/raccoon-emoji-v1/029-brainstorm.webp", "/raccoon-emoji-v1/030-review.webp", "/raccoon-emoji-v1/031-archive.webp", "/raccoon-emoji-v1/032-translation.webp", "/raccoon-emoji-v1/033-writing.webp", "/raccoon-emoji-v1/034-meeting.webp", "/raccoon-emoji-v1/035-project.webp", "/raccoon-emoji-v1/036-leadership.webp", "/raccoon-emoji-v1/037-handshake.webp", "/raccoon-emoji-v1/038-remote-work.webp", "/raccoon-emoji-v1/039-quality.webp", "/raccoon-emoji-v1/040-security.webp", "/raccoon-emoji-v1/041-cloud.webp", "/raccoon-emoji-v1/042-ai.webp", "/raccoon-emoji-v1/043-database.webp", "/raccoon-emoji-v1/044-automation.webp", "/raccoon-emoji-v1/045-testing.webp", "/raccoon-emoji-v1/046-design.webp", "/raccoon-emoji-v1/047-network.webp", "/raccoon-emoji-v1/048-electronics.webp", "/raccoon-emoji-v1/049-robotics.webp", "/raccoon-emoji-v1/050-automotive.webp", "/raccoon-emoji-v1/051-aviation.webp", "/raccoon-emoji-v1/052-rail.webp", "/raccoon-emoji-v1/053-shipping.webp", "/raccoon-emoji-v1/054-warehouse.webp", "/raccoon-emoji-v1/055-delivery.webp", "/raccoon-emoji-v1/056-supply-chain.webp", "/raccoon-emoji-v1/057-procurement.webp", "/raccoon-emoji-v1/058-banking.webp", "/raccoon-emoji-v1/059-insurance.webp", "/raccoon-emoji-v1/060-investment.webp", "/raccoon-emoji-v1/061-accounting.webp", "/raccoon-emoji-v1/062-audit.webp", "/raccoon-emoji-v1/063-real-estate.webp", "/raccoon-emoji-v1/064-architecture.webp", "/raccoon-emoji-v1/065-civil-engineering.webp", "/raccoon-emoji-v1/066-mining.webp", "/raccoon-emoji-v1/067-oil-gas.webp", "/raccoon-emoji-v1/068-wind.webp", "/raccoon-emoji-v1/069-water.webp", "/raccoon-emoji-v1/070-environment.webp", "/raccoon-emoji-v1/071-forestry.webp", "/raccoon-emoji-v1/072-fishery.webp", "/raccoon-emoji-v1/073-livestock.webp", "/raccoon-emoji-v1/074-horticulture.webp", "/raccoon-emoji-v1/075-nursing.webp", "/raccoon-emoji-v1/076-pharmacy.webp", "/raccoon-emoji-v1/077-dentistry.webp", "/raccoon-emoji-v1/078-veterinary.webp", "/raccoon-emoji-v1/079-psychology.webp", "/raccoon-emoji-v1/080-fitness.webp", "/raccoon-emoji-v1/081-sports.webp", "/raccoon-emoji-v1/082-childcare.webp", "/raccoon-emoji-v1/083-training.webp", "/raccoon-emoji-v1/084-library.webp", "/raccoon-emoji-v1/085-laboratory.webp", "/raccoon-emoji-v1/086-biotech.webp", "/raccoon-emoji-v1/087-chemistry.webp", "/raccoon-emoji-v1/088-textile.webp", "/raccoon-emoji-v1/089-beauty.webp", "/raccoon-emoji-v1/090-hospitality.webp", "/raccoon-emoji-v1/091-bakery.webp", "/raccoon-emoji-v1/092-coffee.webp", "/raccoon-emoji-v1/093-tour-guide.webp", "/raccoon-emoji-v1/094-photography.webp", "/raccoon-emoji-v1/095-music.webp", "/raccoon-emoji-v1/096-film.webp", "/raccoon-emoji-v1/097-journalism.webp", "/raccoon-emoji-v1/098-creative-art.webp", "/raccoon-emoji-v1/099-ecommerce.webp", "/raccoon-emoji-v1/100-live-stream.webp", "/raccoon-emoji-v1/101-community.webp", "/raccoon-emoji-v1/102-fire-service.webp", "/raccoon-emoji-v1/103-emergency.webp", "/raccoon-emoji-v1/104-accessibility.webp"]

export function AgentIcon({ agent, size = 52, className }: { agent: Pick<AgentAppPartial, 'icon' | 'icon_url' | 'icon_type' | 'name' | 'icon_background'>, size?: number, className?: string }) {
  const legacyIcon = agent.icon?.startsWith('rx:') ? (RACCOON_ICONS.find(path => path.endsWith(`-${(agent.icon || '').slice(3)}.webp`)) || RACCOON_ICONS[41]) : null
  const src = legacyIcon || agent.icon_url || (agent.icon_type !== 'emoji' ? agent.icon : null)
  const style = { width: size, height: size, borderRadius: size * 0.32 }
  if (src)
    return <img src={asset(src)} alt="" style={style} className={cn('shrink-0 border border-line bg-glass-3 object-cover', className)} />
  return (
    <span style={{ ...style, background: agent.icon_background ?? undefined, fontSize: size * 0.42 }} className={cn('grid shrink-0 place-items-center border border-line bg-glass-3 font-semibold', className)}>
      {agent.icon_type === 'emoji' && agent.icon && Array.from(agent.icon).length <= 4 ? agent.icon : agent.name.slice(0, 1)}
    </span>
  )
}

/* 配置分区卡片：标题 + 数量 + 操作；changed 时显示「构建改动」标记 */
export function ConfigCard({ id, icon: Icon, title, count, hint, actions, changed, children, className }: {
  id?: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  count?: number
  hint?: React.ReactNode
  actions?: React.ReactNode
  changed?: boolean
  children?: React.ReactNode
  className?: string
}) {
  return (
    <Rise id={id} className={cn('glass-2 glass-edge relative rounded-[20px] p-4', changed && 'border-cyan/50 shadow-[0_0_0_1px_var(--cyan-soft)]', className)}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-hover text-ink-2"><Icon className="size-4" /></span>
        <p className="text-[14px] font-semibold">{title}</p>
        {count !== undefined && <span className="rounded-full bg-hover px-1.5 text-[11.5px] text-ink-3 tabular-nums">{count}</span>}
        {changed && <span className="flex items-center gap-1 text-[11.5px] text-cyan"><i className="breathe-dot size-1.5 rounded-full bg-cyan" />待应用</span>}
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </div>
      {hint && <p className="mt-1.5 pl-[38px] text-[12.5px] text-ink-3">{hint}</p>}
      {children && <div className="mt-3">{children}</div>}
    </Rise>
  )
}

export function AddButton({ children = '添加', ...props }: React.ComponentProps<typeof Button>) {
  return <Button variant="ghost-accent" size="small" {...props}><RiAddLine className="size-3.5" />{children}</Button>
}

/** 列表行：左图标 + 主次文字 + 右侧操作（悬停显示） */
export function Row({ icon, title, sub, right, onClick, tone, className }: { icon?: React.ReactNode, title: React.ReactNode, sub?: React.ReactNode, right?: React.ReactNode, onClick?: () => void, tone?: 'warn', className?: string }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => onClick && e.key === 'Enter' && onClick()}
      className={cn('group/row flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-hover', onClick && 'cursor-pointer', tone === 'warn' && 'bg-amber-soft/40', className)}
    >
      {icon && <span className="grid size-7 shrink-0 place-items-center">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px]">{title}</p>
        {sub && <p className="truncate text-[12px] text-ink-3">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>{right}</div>}
    </div>
  )
}

/** 小号图标按钮 */
export function IconBtn({ label, onClick, children, danger, disabled }: { label: string, onClick?: () => void, children: React.ReactNode, danger?: boolean, disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={cn('grid size-7 cursor-pointer place-items-center rounded-lg text-ink-3 transition-colors hover:bg-press disabled:cursor-not-allowed disabled:opacity-40', danger ? 'hover:text-rose' : 'hover:text-ink')}>
      {children}
    </button>
  )
}

/** 带标签的选项卡片（单选） */
export function ChoiceCard({ on, title, desc, onClick }: { on: boolean, title: string, desc?: string, onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex-1 cursor-pointer rounded-2xl border p-3 text-left transition-colors', on ? 'border-volt bg-volt-soft' : 'border-line hover:bg-hover')}>
      <p className={cn('text-[13.5px] font-medium', on && 'text-volt-text')}>{title}</p>
      {desc && <p className="mt-0.5 text-[12px] text-ink-3">{desc}</p>}
    </button>
  )
}

/** 统一处理 mutation 错误：toast 不支持错误色，用 info 调提示 */
export function errText(e: unknown) {
  return e instanceof Error ? e.message : '操作失败，请稍后重试'
}
