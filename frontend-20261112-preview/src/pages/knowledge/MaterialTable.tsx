import type { KbMaterial } from '@/api/knowledge'
import { RiArrowDownSLine, RiBookOpenLine, RiChat3Line, RiShareForwardLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useQuery } from '@/api/hooks'
import { queryMaterialOverview } from '@/api/knowledge'
import { Button } from '@/components/ui/button'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { CoverPlaceholder, FileGlyph, fmtTime, isFailed, isReady, presentation } from './shared'

const GRID = 'grid grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_172px] gap-4'

/** 使用范围的颜色：可对客绿、对伙伴/总代青、仅内部琥珀、待确认灰 */
export function ScopeBadge({ scope }: { scope: string }) {
  const tone = scope === '可对客' || scope === '可公开' ? 'mint' : scope === '仅内部' ? 'amber' : scope === '待确认' ? 'neutral' : 'cyan'
  return <Badge tone={tone}>{scope}</Badge>
}

export function StatusBadge({ m }: { m: KbMaterial }) {
  if (isReady(m))
    return null
  if (isFailed(m))
    return <Badge tone="rose">处理失败</Badge>
  return <Badge tone="amber" dot>{m.parseStatus === '3' ? m.indexStatusName : m.parseStatusName}</Badge>
}

type Props = {
  rows: KbMaterial[]
  loading: boolean
  expandedId: string
  activeId?: string | null
  onToggle: (id: string) => void
  onOpen: (m: KbMaterial) => void
  onShare: (m: KbMaterial) => void
  onAsk: (m: KbMaterial) => void
  onRead: (m: KbMaterial) => void
  empty: React.ReactNode
  /** 四个列头（表头即筛选），以及表头上方的「生效中的筛选」条 */
  headers: [React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode]
  toolbar?: React.ReactNode
  /** 自定义「对外使用范围」单元格（我的视图里可点击修改范围） */
  renderScope?: (m: KbMaterial) => React.ReactNode
}

/** 材料表格：一次只展开一行，展开后才加载封面和简介（与知识库工作台一致） */
export function MaterialTable({ rows, loading, expandedId, activeId, onToggle, onOpen, onShare, onAsk, onRead, empty, headers, toolbar, renderScope }: Props) {
  return (
    <div className="glass-2 glass-edge rounded-[22px]" aria-busy={loading}>
      {toolbar}
      <div role="row" className={cn(GRID, 'items-center border-b border-line bg-hover px-5 py-2 text-[12px] text-ink-3', !toolbar && 'rounded-t-[22px]')}>
        {headers.map((h, i) => <div key={i} role="columnheader" className="min-w-0">{h}</div>)}
      </div>
      <div className="overflow-hidden rounded-b-[22px]">
      {loading
        ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={cn(GRID, 'items-center border-b border-line px-5 py-4 last:border-b-0')}>
              <div className="flex items-center gap-3"><Skeleton className="size-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))
        : rows.length === 0
          ? empty
          : rows.map((m) => {
              const p = presentation(m)
              const open = expandedId === m.documentId
              const ready = isReady(m)
              return (
                <div key={m.documentId} className={cn('border-b border-line last:border-b-0', activeId === m.documentId && 'bg-press')}>
                  <div className={cn(GRID, 'group items-start px-5 py-3.5 transition-colors hover:bg-hover')}>
                    <div className="flex min-w-0 items-start gap-3">
                      <FileGlyph format={p.format} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => onOpen(m)} aria-label={`查看${p.title}详情`} className="cursor-pointer text-left text-[14px] leading-snug font-medium text-ink transition-colors hover:text-volt-text">
                          <span className="line-clamp-2 break-words">{p.title}</span>
                        </button>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                          <span className="font-medium text-ink-2">{p.format}</span>
                          <span aria-hidden>·</span>
                          <span className="min-w-0 truncate">{m.knowledgeBaseName || '所属知识库未提供'}</span>
                          <StatusBadge m={m} />
                          <span className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                            <button type="button" onClick={() => onShare(m)} className="flex h-6 cursor-pointer items-center gap-1 rounded-full px-2 hover:bg-press hover:text-ink"><RiShareForwardLine className="size-3.5" />分享</button>
                            <button type="button" disabled={!ready} title={ready ? undefined : '材料处理完成后才能提问'} onClick={() => onAsk(m)} className="flex h-6 cursor-pointer items-center gap-1 rounded-full px-2 hover:bg-press hover:text-volt-text disabled:cursor-not-allowed disabled:opacity-40"><RiChat3Line className="size-3.5" />问一问</button>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="truncate text-[13px] text-ink">{p.product || '未标注'}</p>
                      {p.category && <p className="mt-0.5 truncate text-[12px] text-ink-3">{p.category}</p>}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5 pt-0.5">
                      {renderScope
                        ? renderScope(m)
                        : p.usageScopes.length ? p.usageScopes.map(s => <ScopeBadge key={s} scope={s} />) : <span className="text-[12px] text-ink-3">未标注</span>}
                    </div>
                    <div className="flex items-start justify-between gap-2 pt-0.5">
                      <time dateTime={m.editTime} className="text-[12.5px] text-ink-3 tabular-nums">{fmtTime(m.editTime)}</time>
                      <Button
                        variant="ghost"
                        size="icon-small"
                        className="-mt-1"
                        aria-expanded={open}
                        aria-label={`${open ? '收起' : '展开'}${p.title}的封面和简介`}
                        onClick={() => onToggle(m.documentId)}
                      >
                        <RiArrowDownSLine className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} />
                      </Button>
                    </div>
                  </div>
                  {open && <RowSummary m={m} onOpen={() => onOpen(m)} onRead={() => onRead(m)} />}
                </div>
              )
            })}
      </div>
    </div>
  )
}

function RowSummary({ m, onOpen, onRead }: { m: KbMaterial, onOpen: () => void, onRead: () => void }) {
  const p = presentation(m)
  const ov = useQuery(() => queryMaterialOverview(m.documentId), [m.documentId])
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: ease.out }}
      className="flex gap-5 bg-hover/60 px-5 pt-1 pb-5 pl-[72px]"
    >
      <CoverPlaceholder format={p.format} title={p.title} className="h-[120px] w-[180px] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-ink-3">简介</p>
        {ov.loading
          ? <div className="mt-2 space-y-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-4/5" /><Skeleton className="h-3.5 w-2/3" /></div>
          : ov.error
            ? <p className="mt-1.5 text-[13px] text-rose">简介暂时加载失败。<button type="button" className="cursor-pointer underline" onClick={ov.reload}>重试</button></p>
            : ov.data?.status !== 'READY'
              ? <p className="mt-1.5 text-[13px] text-ink-3">材料还在处理，处理完成后会生成简介。</p>
              : (
                  <>
                    <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">{ov.data.summary}</p>
                    {ov.data.keyPoints.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {ov.data.keyPoints.map(k => <li key={k} className="max-w-full truncate rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2">{k}</li>)}
                      </ul>
                    )}
                  </>
                )}
        <div className="mt-3 flex gap-2">
          <Button size="small" variant="secondary" onClick={onOpen}>查看详情</Button>
          <Button size="small" variant="ghost" onClick={onRead}><RiBookOpenLine className="size-3.5" />阅读全文</Button>
        </div>
      </div>
    </motion.div>
  )
}
