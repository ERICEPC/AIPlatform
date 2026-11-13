/*
  MCP 连接器市场（「插件市场」页签，#integrations/marketplace[/<connectorId>]）
  来源：awesome-mcp-servers 精选 + 火山引擎官方 MCP Server；按分类浏览、搜索，一键连接后出现在「已接入」。
*/
import type { Connector, ConnectorCategory, ToolCollection } from '@/api/integrations'
import type { SourceFilter } from './shared'
import { RiArrowRightLine, RiCheckboxCircleFill, RiCloseLine, RiGithubFill, RiPlugLine, RiSearchLine, RiStarSmileLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listConnectors } from '@/api/integrations'
import { Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { EmptyState, Panel, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/cn'
import { CardSkeleton, ConnectorCard, FeaturedCard } from './card'
import { ConnectDialog } from './connect-dialog'
import { ConnectorDrawer } from './drawer'
import { CATEGORY, CATEGORY_ORDER, Chip, SOURCE_LABEL } from './shared'

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const h = setTimeout(setV, ms, value)
    return () => clearTimeout(h)
  }, [value, ms])
  return v
}

const syncTime = (sec: number) => {
  const d = new Date(sec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const PAGE = 36

export function ConnectorMarket({ detail, go, onChanged, extra }: {
  /** 路由里的连接器 id，有值时打开详情抽屉 */
  detail?: string
  go: (path: string) => void
  /** 连接成功后通知外层刷新「已接入」计数 */
  onChanged?: () => void
  /** 头部右侧的附加入口（如工具 / 模型插件） */
  extra?: React.ReactNode
}) {
  const [source, setSource] = useState<SourceFilter>('all')
  const [category, setCategory] = useState<ConnectorCategory | 'all'>('all')
  const [kw, setKw] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [version, setVersion] = useState(0)
  const [connecting, setConnecting] = useState<Connector | null>(null)
  const [justConnected, setJustConnected] = useState<{ name: string, provider: ToolCollection } | null>(null)
  const keyword = useDebounced(kw.trim())

  const q = useQuery(
    () => listConnectors({ source: source === 'all' ? undefined : source, category: category === 'all' ? undefined : category, keyword: keyword || undefined }),
    [source, category, keyword, version],
  )
  const data = q.data
  const list = data?.data ?? []
  const showFeatured = category === 'all' && !keyword
  const featured = showFeatured ? list.filter(c => c.featured).slice(0, 6) : []
  const rest = showFeatured ? list.filter(c => !featured.includes(c)) : list
  const sourceTotal = (id: SourceFilter) => (id === 'all' ? data?.sources.reduce((s, x) => s + x.total, 0) : data?.sources.find(x => x.id === id)?.total)
  const categoryTotal = data?.categories.reduce((s, c) => s + c.count, 0)

  const open = (id?: string) => go(id ? `integrations/marketplace/${id}` : 'integrations/marketplace')
  const openInstalled = () => go('integrations')
  const pickSource = (s: SourceFilter) => {
    setSource(s)
    setCategory('all')
    setLimit(PAGE)
  }
  const pickCategory = (c: ConnectorCategory | 'all') => {
    setCategory(c)
    setLimit(PAGE)
  }
  const connected = (c: Connector, provider: ToolCollection) => {
    setJustConnected({ name: c.name, provider })
    setVersion(v => v + 1)
    onChanged?.()
  }

  const cardProps = (c: Connector) => ({ c, onOpen: () => open(c.id), onConnect: () => setConnecting(c), onOpenInstalled: openInstalled })

  return (
    <div className="space-y-5">
      {/* 来源与同步时间 */}
      <Panel level={1} radius="md" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[12.5px] text-ink-3">
        <span className="flex items-center gap-1.5 text-ink-2">
          <RiGithubFill className="size-4" />
          来源：
          {(data?.sources ?? [{ id: 'awesome', name: 'awesome-mcp-servers', url: 'https://github.com/punkpeye/awesome-mcp-servers' }, { id: 'volcengine', name: '火山引擎 MCP Server', url: 'https://github.com/volcengine/mcp-server' }]).map((s, i) => (
            <span key={s.id} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-ink-3">+</span>}
              <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-volt-text hover:underline">{s.name}</a>
            </span>
          ))}
        </span>
        {data
          ? <span>同步于 {syncTime(Math.max(...data.sources.map(s => s.synced_at)))} · 提交 <span className="font-mono">{data.sources.map(s => s.commit).filter(Boolean).join(' / ')}</span></span>
          : <Skeleton className="h-3 w-56" />}
        <span className="ml-auto flex items-center gap-3">
          {data && <span>共 {sourceTotal('all')} 个连接器</span>}
          {extra}
        </span>
      </Panel>

      {justConnected && (
        <div className="flex items-center gap-3 rounded-2xl border border-mint/30 bg-mint-soft px-4 py-2.5 text-[13px]">
          <RiCheckboxCircleFill className="size-5 shrink-0 text-mint" />
          <span className="min-w-0 flex-1 text-ink">已接入「{justConnected.provider.name}」，共 {justConnected.provider.tools.length} 个工具，在 Agent 的工具列表里即可选用。</span>
          <Button size="small" variant="secondary" onClick={openInstalled}>去已接入查看<RiArrowRightLine className="size-3.5" /></Button>
          <Button size="icon-small" variant="ghost" aria-label="关闭提示" onClick={() => setJustConnected(null)}><RiCloseLine className="size-4" /></Button>
        </div>
      )}

      {/* 来源 + 搜索 */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={source}
          onValueChange={pickSource}
          aria-label="连接器来源"
          options={(['all', 'awesome', 'volcengine'] as const).map(s => ({ value: s, label: SOURCE_LABEL[s], count: sourceTotal(s) }))}
        />
        <label className="glass-1 ml-auto flex h-9 w-[280px] items-center gap-2 rounded-full px-3.5 text-[13px]">
          <RiSearchLine className="size-4 text-ink-3" />
          <input value={kw} onChange={(e) => { setKw(e.target.value); setLimit(PAGE) }} placeholder="搜索名称、用途或标签，如 飞书、数据库" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
          {kw && <button type="button" aria-label="清空" onClick={() => setKw('')} className="grid size-5 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-hover hover:text-ink"><RiCloseLine className="size-3.5" /></button>}
        </label>
      </div>

      {/* 分类 */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={category === 'all'} onClick={() => pickCategory('all')} label="全部" count={categoryTotal} />
        {CATEGORY_ORDER.map((id) => {
          const n = data?.categories.find(x => x.id === id)?.count
          if (data && !n)
            return null
          const Icon = CATEGORY[id].icon
          return <Chip key={id} active={category === id} onClick={() => pickCategory(id)} label={CATEGORY[id].label} count={n} icon={<Icon className="size-3.5" />} />
        })}
      </div>

      <ErrorBar error={q.error} onRetry={q.reload} />

      {q.loading && !data
        ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">{Array.from({ length: 9 }, (_, i) => <CardSkeleton key={i} />)}</div>
          )
        : data && !list.length
          ? (
              <Panel level={2}>
                <EmptyState
                  icon={<RiPlugLine className="size-5" />}
                  title={keyword ? `没有找到「${keyword}」` : '这个分类下暂时没有连接器'}
                  hint="换个关键词，或切到「全部」看看；市场里没有的服务，可以在「已接入」手动填写地址或命令添加。"
                  action={<Button variant="secondary" onClick={openInstalled}>手动添加 MCP 服务</Button>}
                />
              </Panel>
            )
          : (
              <div className={cn('space-y-7 transition-opacity', q.loading && 'opacity-60')}>
                {featured.length > 0 && (
                  <section>
                    <h3 className="mb-3 flex items-center gap-1.5 text-[14px] font-semibold"><RiStarSmileLine className="size-4 text-volt-text" />精选</h3>
                    <Rise>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
                        {featured.map(c => <FeaturedCard key={c.id} {...cardProps(c)} />)}
                      </div>
                    </Rise>
                  </section>
                )}
                {rest.length > 0 && (
                  <section>
                    {featured.length > 0 && (
                      <h3 className="mb-3 flex items-baseline gap-2 text-[14px] font-semibold">
                        {source === 'volcengine' ? '全部火山引擎服务' : '更多连接器'}
                        <span className="text-[12px] font-normal text-ink-3 tabular-nums">{rest.length}</span>
                      </h3>
                    )}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                      {rest.slice(0, limit).map(c => <ConnectorCard key={c.id} {...cardProps(c)} />)}
                    </div>
                    {rest.length > limit && (
                      <div className="mt-6 flex justify-center">
                        <Button variant="secondary" onClick={() => setLimit(l => l + PAGE)}>显示更多（还有 {rest.length - limit} 个）</Button>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}

      <ConnectorDrawer id={detail} list={data?.data} version={version} onClose={() => open()} onConnect={setConnecting} onOpenInstalled={openInstalled} />
      <ConnectDialog connector={connecting} onClose={() => setConnecting(null)} onConnected={connected} />
    </div>
  )
}
