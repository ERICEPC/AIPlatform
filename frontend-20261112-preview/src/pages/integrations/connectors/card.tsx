/* 连接器卡片：普通卡片、精选大卡片、骨架、连接按钮 */
import type { Connector } from '@/api/integrations'
import { RiArrowRightUpLine, RiCheckLine, RiFlashlightFill, RiLinkM, RiVerifiedBadgeFill } from '@remixicon/react'
import { Button } from '@/components/ui/button'
import { SpotlightCard } from '@/components/ui/effects'
import { Badge, Panel, Skeleton } from '@/components/ui/primitives'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { AUTH, CATEGORY, ConnectorTile, fmtPopularity, PUBLISHER, toneCls, TransportHints } from './shared'

export function PublisherBadge({ c }: { c: Pick<Connector, 'publisher'> }) {
  const p = PUBLISHER[c.publisher]
  return (
    <Tip label={p.hint}>
      <Badge tone={p.tone} className="h-5 shrink-0 px-2 text-[11px]">
        {c.publisher === 'official' && <RiVerifiedBadgeFill className="size-3" />}
        {p.label}
      </Badge>
    </Tip>
  )
}

export function AuthHint({ c }: { c: Pick<Connector, 'auth'> }) {
  const a = AUTH[c.auth]
  const Icon = a.icon
  return (
    <Tip label={a.label}>
      <span className={cn('grid size-[22px] shrink-0 place-items-center rounded-full', toneCls[a.tone])}><Icon className="size-3" aria-label={a.label} /></span>
    </Tip>
  )
}

/** 连接 / 已连接；已连接时点一下去「已接入」 */
export function ConnectButton({ c, onConnect, onOpenInstalled, size = 'small', className }: {
  c: Connector
  onConnect: () => void
  onOpenInstalled?: () => void
  size?: 'small' | 'large'
  className?: string
}) {
  if (c.connected) {
    return (
      <button
        type="button"
        onClick={onOpenInstalled}
        title="已连接，去「已接入」管理"
        className={cn(
          'group flex cursor-pointer items-center justify-center gap-1 rounded-full bg-mint-soft font-medium text-mint transition-opacity hover:opacity-85',
          size === 'small' ? 'h-7 px-3 text-[12.5px]' : 'h-11 px-6 text-[15px]',
          className,
        )}
      >
        <RiCheckLine className="size-4" />
        已连接
        {onOpenInstalled && <RiArrowRightUpLine className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
      </button>
    )
  }
  return (
    <Button variant="primary" size={size} className={className} onClick={onConnect}>
      <RiLinkM className="size-4" />
      连接
    </Button>
  )
}

type CardProps = { c: Connector, onOpen: () => void, onConnect: () => void, onOpenInstalled: () => void }

export function ConnectorCard({ c, onOpen, onConnect, onOpenInstalled }: CardProps) {
  return (
    <SpotlightCard>
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => e.key === 'Enter' && onOpen()} className="flex h-full min-h-[184px] cursor-pointer flex-col p-5 focus-visible:outline-none">
        <div className="flex items-start gap-3">
          <ConnectorTile c={c} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[14.5px] font-semibold">{c.name}</p>
              <PublisherBadge c={c} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-3">
              <span>{CATEGORY[c.category].label}</span>
              <span aria-hidden>·</span>
              <TransportHints c={c} />
            </p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{c.description}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-4" onClick={e => e.stopPropagation()}>
          {c.tags.slice(0, 2).map(t => <Badge key={t} className="h-5 max-w-[96px] truncate px-2 text-[11px]">{t}</Badge>)}
          <AuthHint c={c} />
          <span className="flex-1" />
          <ConnectButton c={c} onConnect={onConnect} onOpenInstalled={onOpenInstalled} />
        </div>
      </div>
    </SpotlightCard>
  )
}

/** 精选：横向大卡片，品牌色淡淡铺底 */
export function FeaturedCard({ c, onOpen, onConnect, onOpenInstalled }: CardProps) {
  return (
    <SpotlightCard className="h-full">
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => e.key === 'Enter' && onOpen()} className="relative flex h-full min-h-[176px] cursor-pointer flex-col overflow-hidden p-5 focus-visible:outline-none">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full opacity-[0.16] blur-2xl"
          style={{ background: c.publisher === 'volcengine' ? '#1664ff' : c.color }}
        />
        <div className="relative flex items-start gap-3.5">
          <ConnectorTile c={c} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[16px] font-semibold">{c.name}</p>
              <PublisherBadge c={c} />
            </div>
            <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-3">
              <RiFlashlightFill className="size-3.5 text-volt-text" />
              <span className="tabular-nums">{fmtPopularity(c.popularity)}</span> 次接入
            </p>
          </div>
        </div>
        <p className="relative mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{c.description}</p>
        <div className="relative mt-auto flex items-center gap-2 pt-4" onClick={e => e.stopPropagation()}>
          <AuthHint c={c} />
          <TransportHints c={c} className="text-[12px]" />
          <span className="flex-1" />
          <ConnectButton c={c} onConnect={onConnect} onOpenInstalled={onOpenInstalled} />
        </div>
      </div>
    </SpotlightCard>
  )
}

export function CardSkeleton({ featured }: { featured?: boolean }) {
  return (
    <Panel level={2} className={cn('space-y-3 p-5', featured ? 'min-h-[176px]' : 'min-h-[184px]')}>
      <div className="flex gap-3"><Skeleton className="size-[44px] rounded-[13px]" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-3 w-20" /></div></div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex justify-between pt-3"><Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-7 w-16 rounded-full" /></div>
    </Panel>
  )
}
