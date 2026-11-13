/* 插件市场：推荐网格（模型设置等处内嵌）+ 完整的插件市场视图（搜索、分类、安装） */
import type { MarketplacePlugin, PluginCategory } from '@/api/integrations'
import { RiArrowRightLine, RiCheckLine, RiDownloadLine, RiStore2Line, RiVerifiedBadgeFill } from '@remixicon/react'
import { useState } from 'react'
import { installFromMarketplace, listInstalledPlugins, searchMarketplace, tr } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { SpotlightCard } from '@/components/ui/effects'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { authorName, CardsSkeleton, errMsg, fmtCount, GroupTitle, Grid, PluginTile, SearchBox, useIntegrations } from './kit'

export const categoryTabs: { value: PluginCategory, label: string }[] = [
  { value: 'model', label: '模型' },
  { value: 'tool', label: '工具' },
  { value: 'datasource', label: '数据来源' },
  { value: 'trigger', label: '触发器' },
  { value: 'agent-strategy', label: 'Agent 策略' },
  { value: 'extension', label: '扩展' },
]

// 跨卡片共享「安装中」状态，切换分区回来仍能看到；安装任务全部结束时清空
const installing = new Set<string>()
export const clearInstalling = () => installing.clear()

export function MarketCard({ item, installed, compact }: { item: MarketplacePlugin, installed?: boolean, compact?: boolean }) {
  const { watchTasks } = useIntegrations()
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const busy = pending || installing.has(item.plugin_id)
  const install = async () => {
    setPending(true)
    try {
      await installFromMarketplace([item.latest_package_identifier])
      installing.add(item.plugin_id)
      watchTasks()
      toast(`开始安装 ${tr(item.label)}`)
    }
    catch (e) {
      toast(errMsg(e), 'info')
    }
    finally {
      setPending(false)
    }
  }
  if (installed)
    installing.delete(item.plugin_id)
  return (
    <SpotlightCard>
      <div className={compact ? 'flex h-full flex-col p-4' : 'flex h-full min-h-[168px] flex-col p-5'}>
        <div className="flex items-start gap-3">
          <PluginTile icon={`${import.meta.env.VITE_MARKETPLACE_API || "https://marketplace.dify.ai/api/v1"}/plugins/${encodeURIComponent(item.org)}/${encodeURIComponent(item.name)}/icon`} size={compact ? 38 : 44} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[14.5px] font-semibold">
              {tr(item.label)}
              {item.verified && <RiVerifiedBadgeFill className="size-3.5 shrink-0 text-cyan" aria-label="已认证" />}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
              <span>{authorName(item.org)}</span>
              <span aria-hidden>·</span>
              <RiDownloadLine className="size-3" />
              <span className="tabular-nums">{fmtCount(item.install_count)}</span>
            </p>
          </div>
        </div>
        <p className={compact ? 'mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2' : 'mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-2'}>{tr(item.brief)}</p>
        <div className="mt-auto flex items-center gap-2 pt-3.5">
          {!compact && item.tags.slice(0, 2).map(t => <Badge key={t.name} className="h-5 px-2 text-[11px]">{t.name}</Badge>)}
          <span className="flex-1" />
          {installed
            ? <Badge tone="mint"><RiCheckLine className="size-3.5" />已安装</Badge>
            : <Button size="small" variant={busy ? 'secondary' : 'outline'} loading={busy} onClick={install}>{busy ? '安装中' : '安装'}</Button>}
        </div>
      </div>
    </SpotlightCard>
  )
}

/** 分区底部的「从插件市场安装」推荐网格，只显示未安装的 */
export function MarketplaceGrid({ category, title, limit = 9 }: { category: PluginCategory, title: string, limit?: number }) {
  const { version, openMarketplace } = useIntegrations()
  const [q, setQ] = useState('')
  const { data, error, loading, reload } = useQuery(() => searchMarketplace({ category, query: q, page_size: limit, exclude_installed: true }), [category, q, version])
  return (
    <section className="mt-10">
      <GroupTitle
        aside={(
          <div className="flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="搜索插件市场" className="w-[200px]" />
            <Button variant="ghost-accent" size="small" onClick={() => openMarketplace(category)}>在插件市场发现更多<RiArrowRightLine className="size-3.5" /></Button>
          </div>
        )}
      >
        {title}
      </GroupTitle>
      {error
        ? <ErrorBar error={error} onRetry={reload} />
        : loading && !data
          ? <CardsSkeleton count={3} height="h-[140px]" />
          : !data?.data.plugins.length
              ? <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">{q ? `插件市场里没有找到「${q}」` : '这一类插件都已安装'}</p>
              : <Grid min={260}>{data.data.plugins.map(p => <MarketCard key={p.plugin_id} item={p} compact />)}</Grid>}
    </section>
  )
}

/** 完整插件市场视图（#integrations/marketplace/<category>）；categories 只有一项时不显示分类切换，actions 放在搜索框右侧 */
export function MarketplaceView({ category, onCategory, categories = categoryTabs, actions }: {
  category: PluginCategory
  onCategory: (c: PluginCategory) => void
  categories?: { value: PluginCategory, label: string }[]
  actions?: React.ReactNode
}) {
  const { version } = useIntegrations()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const size = 12
  const market = useQuery(() => searchMarketplace({ category, query: q, page: 1, page_size: page * size }), [category, q, page])
  const installedList = useQuery(() => listInstalledPlugins(category), [category, version])
  const installedIds = new Set(installedList.data?.plugins.map(p => p.plugin_id))
  const list = market.data?.data.plugins ?? []
  const total = market.data?.data.total ?? 0
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {categories.length > 1 && <Segmented value={category} onValueChange={(c) => { onCategory(c); setPage(1) }} options={categories} aria-label="插件分类" />}
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="搜索插件名称、作者、用途" className="w-[300px]" />
        <span className="flex-1" />
        {actions}
      </div>
      {market.error
        ? <ErrorBar error={market.error} onRetry={market.reload} />
        : market.loading && !market.data
          ? <CardsSkeleton count={9} height="h-[168px]" />
          : !list.length
              ? <EmptyState icon={<RiStore2Line className="size-5" />} title={q ? `没有找到「${q}」` : '这一类暂时没有插件'} hint="换个关键词，或从 GitHub、本地插件包安装。" />
              : (
                  <>
                    <Rise><Grid>{list.map(p => <MarketCard key={p.plugin_id} item={p} installed={installedIds.has(p.plugin_id)} />)}</Grid></Rise>
                    {list.length < total && (
                      <div className="mt-6 flex justify-center">
                        <Button variant="secondary" loading={market.loading} onClick={() => setPage(p => p + 1)}>加载更多（还有 {total - list.length} 个）</Button>
                      </div>
                    )}
                  </>
                )}
    </>
  )
}
