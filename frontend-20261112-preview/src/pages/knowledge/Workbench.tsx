import type { FilterChip, SortDir } from './ColumnFilters'
import type { KbScope } from './LibraryNav'
import type { KbLibraryItem, KbMaterial } from '@/api/knowledge'
import type { Go } from './shared'
import { RiArrowRightSLine, RiDatabase2Line, RiFolderOpenLine, RiRefreshLine, RiSearchLine, RiUploadCloud2Line } from '@remixicon/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getProfile, listKnowledgeBases, queryDocumentFilterOptions, queryDocumentPage } from '@/api/knowledge'
import { SectionHeader } from '@/components/detail-shell'
import { Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar, Pager } from '@/components/ui/data'
import { Select } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/primitives'
import { Tip } from '@/components/ui/tooltip'
import { ActiveFilters, FacetHeader, NameHeader, SortHeader } from './ColumnFilters'
import { KbShell } from './KbShell'
import { LibraryNav } from './LibraryNav'
import { LibraryPanel } from './LibraryPanel'
import { MaterialDrawer } from './MaterialDrawer'
import { MaterialTable } from './MaterialTable'
import { ScopeCell } from './ScopeEditor'
import { ACCESS_META, setHashQuery, useHashQuery } from './shared'
import { ShareDialog } from './ShareDialog'
import { LiveUploadPanel as UploadPanel } from './LiveUploadPanel'

type FilterKey = 'usageScope' | 'product' | 'category' | 'accessMode'
const FILTER_LABEL: Record<FilterKey, string> = { product: '产品', category: '内容分类', usageScope: '对外使用范围', accessMode: '谁能看到' }
const PAGE_SIZES = [12, 24, 48, 100]
const EMPTY_FILTERS: Record<FilterKey, string> = { usageScope: '', product: '', category: '', accessMode: '' }
// 「谁能看到」筛选项显示中文，查询时换回代码
const accessCode = (label: string) => (Object.keys(ACCESS_META) as (keyof typeof ACCESS_META)[]).find(k => ACCESS_META[k].label === label) ?? ''

/*
  找材料（材料工作台）。层级：
    模式  找材料 / 问材料（KbShell 顶部）
    范围  我的（默认）/ 全部可访问 —— 路由 #kb = 我的，#kb/all = 全部可访问
    子范围 知识库 —— #kb/<库id>；从全部视图点进我的库时带 ?scope=all，留在全部视图
  我的视图未指定库时，默认打开最近更新的个人库（后端分页接口只支持单个 knowledgeBaseId）。
*/
export function Workbench({ libraryId, allView, go }: { libraryId: string, allView: boolean, go: Go }) {
  const query = useHashQuery()
  const docId = query.get('doc')
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortDir>('desc')
  const [pageNo, setPageNo] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [expanded, setExpanded] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [libsOpen, setLibsOpen] = useState(false)
  const [sharing, setSharing] = useState<KbMaterial | null>(null)

  const profile = useQuery(getProfile, [])
  const libraries = useQuery(listKnowledgeBases, [])
  const libs = libraries.data
  const routeLib = libs?.find(l => l.id === libraryId)
  const scope: KbScope = allView || query.get('scope') === 'all' || (routeLib && !routeLib.ownedByMe) || (libraryId && !libs) ? 'all' : 'mine'
  const defaultMine = libs?.find(l => l.ownedByMe)
  const effectiveId = libraryId || (scope === 'mine' ? defaultMine?.id ?? '' : '')
  const library = libs?.find(l => l.id === effectiveId)
  // 我的视图要等知识库列表回来才知道默认个人库；没有个人库时不查材料
  const ready = scope === 'all' || !!libraryId || (!!libs && !!defaultMine)

  const facets = useQuery(() => queryDocumentFilterOptions(effectiveId || undefined), [effectiveId], { enabled: ready })
  const page = useQuery(
    () => queryDocumentPage({ keyword, knowledgeBaseId: effectiveId, ...filters, accessMode: accessCode(filters.accessMode) || undefined, pageNo, pageSize }),
    [effectiveId, keyword, filters, pageNo, pageSize],
    { enabled: ready },
  )

  // 切换范围或知识库：筛选条件回到初始
  useEffect(() => {
    setDraft('')
    setKeyword('')
    setFilters(EMPTY_FILTERS)
    setPageNo(1)
    setExpanded('')
  }, [effectiveId, scope])
  // 关键词防抖
  useEffect(() => {
    const t = setTimeout(() => {
      setKeyword(draft.trim())
      setPageNo(1)
    }, 300)
    return () => clearTimeout(t)
  }, [draft])

  const total = Number(page.data?.total ?? 0)
  const rows = useMemo(() => {
    const list = page.data?.records ?? []
    return sort === 'desc' ? list : [...list].sort((a, b) => a.editTime.localeCompare(b.editTime))
  }, [page.data, sort])
  const chips: FilterChip[] = [
    ...(draft.trim() ? [{ key: 'keyword', label: '名称', value: draft.trim() }] : []),
    ...(['product', 'category', 'usageScope', 'accessMode'] as const).filter(k => filters[k]).map(k => ({ key: k, label: FILTER_LABEL[k], value: filters[k] })),
  ]
  const hasFilters = chips.length > 0

  const refreshAll = () => Promise.all([
    profile.refresh(), libraries.refresh(),
    ...(ready ? [facets.refresh(), page.refresh()] : []),
  ])
  const refreshRef = useRef(refreshAll)
  refreshRef.current = refreshAll
  useEffect(() => {
    let busy = false
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || busy) return
      busy = true
      try { await refreshRef.current() } finally { busy = false }
    }
    // Changes made in the standalone knowledge site appear on return, and
    // visible long-lived pages refresh without resetting filters or pagination.
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('rx-knowledge-refresh', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('rx-knowledge-refresh', refresh)
    }
  }, [])
  const setFilter = (key: string, value: string) => {
    if (key === 'keyword') {
      setDraft(value)
      return
    }
    setFilters(cur => ({ ...cur, [key]: value }))
    setPageNo(1)
  }
  const clearFilters = () => {
    setDraft('')
    setKeyword('')
    setFilters(EMPTY_FILTERS)
    setPageNo(1)
  }
  const openDoc = (id: string) => setHashQuery({ doc: id })
  const ask = (m: KbMaterial) => go(`kb/ask?doc=${encodeURIComponent(m.documentId)}`)
  const read = (m: KbMaterial) => go(`kb/${effectiveId || 'all'}/reader?doc=${encodeURIComponent(m.documentId)}`)
  const selectLib = (l: KbLibraryItem | null) => {
    if (!l)
      return go('kb/all')
    go(scope === 'all' && l.ownedByMe ? `kb/${l.id}?scope=all` : `kb/${l.id}`)
  }
  const libById = (id: string) => libs?.find(l => l.id === id)

  const scopeLabel = scope === 'mine' ? '我的' : '全部可访问'
  const title = library?.name ?? (effectiveId ? (libraries.loading ? '…' : '所选知识库') : scope === 'all' ? '全部材料' : libraries.loading ? '…' : '我的材料')
  const desc = library?.description
    || (scope === 'mine' ? '整理自己的资料，点击材料的范围标签即可调整谁能看到、能否对外使用。' : '当前账号可访问的全部资料，为下一次沟通做好准备。')

  const aside = (
    <LibraryNav
      scope={scope}
      libraries={libs}
      loading={libraries.loading}
      error={libraries.error}
      onRetry={libraries.reload}
      activeId={effectiveId}
      onScope={s => go(s === 'mine' ? 'kb' : 'kb/all')}
      onSelect={selectLib}
      onManage={() => setLibsOpen(true)}
    />
  )

  const noPersonal = scope === 'mine' && !!libs && !defaultMine && !libraryId

  return (
    <KbShell view="workbench" go={go} aside={aside}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-8 pt-7 pb-14">
          <Rise>
            <p className="mb-3 flex items-center gap-1.5 text-[12px] text-ink-3">
              <span>知识库</span><RiArrowRightSLine className="size-3.5" /><span>找材料</span>
              <RiArrowRightSLine className="size-3.5" /><span className={library ? '' : 'text-ink-2'}>{scopeLabel}</span>
              {library && <><RiArrowRightSLine className="size-3.5" /><span className="text-ink-2">{library.name}</span></>}
            </p>
            <SectionHeader
              title={title}
              desc={desc}
              actions={(
                <>
                  <Tip label="刷新">
                    <Button variant="ghost" size="icon" aria-label="刷新" loading={page.loading && ready} onClick={refreshAll}>{!(page.loading && ready) && <RiRefreshLine className="size-4" />}</Button>
                  </Tip>
                  <Button variant="primary" disabled={libraries.loading || !libs?.length} title={!libs?.length ? "请先创建或获取可访问的知识库" : undefined} onClick={() => setUploadOpen(true)}><RiUploadCloud2Line className="size-4" />上传材料</Button>
                </>
              )}
            />
          </Rise>

          <Rise>
            <div className="mt-6 mb-3 flex items-center justify-between">
              <p className="text-[14px] font-semibold">
                材料
                {ready && !page.loading && !page.error && <span className="ml-1.5 text-[12.5px] font-normal text-ink-3 tabular-nums">{total} 份文件</span>}
              </p>
              <span className="text-[12px] text-ink-3">点列头搜索、筛选或排序{facets.data ? ' · 选项数为当前范围内文件数' : ''}</span>
            </div>
            {noPersonal
              ? (
                  <div className="glass-2 glass-edge rounded-[22px]">
                    <EmptyState icon={<RiDatabase2Line className="size-5" />} title="还没有个人知识库" hint="新建一个私有库，上传的材料默认只有你能看到。" action={<Button variant="primary" size="small" onClick={() => setLibsOpen(true)}>新建私有库</Button>} />
                  </div>
                )
              : page.error
                ? <ErrorBar error={page.error} onRetry={page.reload} />
                : (
                    <MaterialTable
                      rows={rows}
                      loading={page.loading || !ready}
                      expandedId={expanded}
                      activeId={docId}
                      onToggle={id => setExpanded(cur => (cur === id ? '' : id))}
                      onOpen={m => openDoc(m.documentId)}
                      onShare={setSharing}
                      onAsk={ask}
                      onRead={read}
                      toolbar={<ActiveFilters chips={chips} onRemove={k => setFilter(k, '')} onClear={clearFilters} />}
                      headers={[
                        <NameHeader key="name" value={draft} onChange={setDraft} />,
                        <FacetHeader
                          key="pc"
                          label="产品 / 分类"
                          loading={facets.loading}
                          error={facets.error}
                          onRetry={facets.reload}
                          onPick={setFilter}
                          groups={[
                            { key: 'product', title: '产品', options: facets.data?.products, value: filters.product },
                            { key: 'category', title: '内容分类', options: facets.data?.categories, value: filters.category },
                          ]}
                        />,
                        <FacetHeader
                          key="scope"
                          label={scope === 'mine' ? '使用范围' : '对外使用范围'}
                          loading={facets.loading}
                          error={facets.error}
                          onRetry={facets.reload}
                          onPick={setFilter}
                          groups={[
                            ...(scope === 'mine' ? [{ key: 'accessMode', title: '谁能看到', options: facets.data?.accessModes?.map(o => ({ value: ACCESS_META[o.value as keyof typeof ACCESS_META]?.label ?? o.value, count: o.count })), value: filters.accessMode }] : []),
                            { key: 'usageScope', title: scope === 'mine' ? '对外使用范围' : undefined, options: facets.data?.usageScopes, value: filters.usageScope },
                          ]}
                        />,
                        <SortHeader key="time" dir={sort} onToggle={() => setSort(d => (d === 'desc' ? 'asc' : 'desc'))} />,
                      ]}
                      renderScope={scope === 'mine'
                        ? m => <ScopeCell m={m} library={libById(m.knowledgeBaseId)} onChanged={() => { facets.refresh(); page.refresh() }} />
                        : undefined}
                      empty={hasFilters
                        ? <EmptyState icon={<RiSearchLine className="size-5" />} title="没有找到匹配的材料" hint="调整关键词或列头筛选，查看当前范围的其他资料。" action={<Button variant="secondary" size="small" onClick={clearFilters}>清空筛选</Button>} />
                        : <EmptyState icon={<RiFolderOpenLine className="size-5" />} title={effectiveId ? '这个知识库还没有材料' : '暂无可访问的材料'} hint="上传材料后，解析完成就会出现在这里。" action={<Button variant="primary" size="small" onClick={() => setUploadOpen(true)}><RiUploadCloud2Line className="size-4" />上传材料</Button>} />}
                    />
                  )}

            {!noPersonal && (
              <div className="glass-2 mt-3 flex items-center gap-5 rounded-[20px] px-4 py-2.5">
                <span className="flex items-center gap-2 text-[12.5px] text-ink-3">
                  每页
                  <Select size="sm" className="w-[96px]" value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPageNo(1) }} options={PAGE_SIZES.map(s => ({ value: String(s), label: `${s} 条` }))} />
                </span>
                <div className="flex-1"><Pager page={pageNo} total={total} limit={pageSize} onPage={(p) => { setPageNo(p); setExpanded('') }} /></div>
              </div>
            )}
            <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
              {scope === 'mine'
                ? '「仅自己 / 跟随知识库 / 公司内可见」决定内部谁能看到；「对外使用范围」只是标注，决定能否对客分享。'
                : '「对外使用范围」保留来源资料的对外使用说明，与当前账号的内部查看权限分别管理。'}
            </p>
          </Rise>
        </div>
      </div>

      <MaterialDrawer id={docId} onClose={() => setHashQuery({ doc: null })} onAsk={ask} onShare={setSharing} onRead={read} />
      <ShareDialog material={sharing} onClose={() => setSharing(null)} />
      <UploadPanel
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        targetLibrary={effectiveId}
        onChanged={refreshAll}
        onOpenMaterial={(id) => { setUploadOpen(false); openDoc(id) }}
      />
      <LibraryPanel open={libsOpen} onClose={() => setLibsOpen(false)} onChanged={refreshAll} />
    </KbShell>
  )
}
