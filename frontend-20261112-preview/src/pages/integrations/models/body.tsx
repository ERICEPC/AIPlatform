/* 模型供应商主体：未设置默认模型提示 + 已安装供应商 + 插件市场推荐（页面版与设置内嵌版共用） */
import { RiCpuLine, RiErrorWarningLine } from '@remixicon/react'
import { getDefaultModel, listModelProviders, tr } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { CardsSkeleton, GroupTitle, ListState } from '../kit'
import { MarketplaceGrid } from '../marketplace'
import { ProviderCard } from './provider-card'

/** 是否还没设置系统推理模型（defKey 变化时重取，例如默认模型对话框关闭后） */
export function useNoDefaultModel(version: number, defKey: unknown) {
  const llm = useQuery(() => getDefaultModel('llm'), [version, defKey])
  return !!llm.data && !llm.data.data
}

export function NoDefaultBanner({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-4 flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-amber/40 bg-amber-soft px-4 py-3 text-left text-[13px] text-amber">
      <RiErrorWarningLine className="size-4 shrink-0" />
      <span className="flex-1">还没有设置系统推理模型。生成标题、推荐问题等系统功能会不可用。</span>
      <span className="font-medium">去设置</span>
    </button>
  )
}

export function ModelProviderBody({ q, version, marketLimit = 12 }: { q: string, version: number, marketLimit?: number }) {
  const providers = useQuery(listModelProviders, [version])
  const list = providers.data?.data.filter(p => !q || `${tr(p.label)} ${p.provider}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <GroupTitle aside={providers.data && <span className="text-[12px] text-ink-3">{providers.data.data.length} 个</span>}>已安装</GroupTitle>
      <ListState
        loading={providers.loading}
        error={providers.error}
        data={list}
        onRetry={providers.reload}
        skeleton={<CardsSkeleton count={3} height="h-[132px]" />}
        empty={{ icon: <RiCpuLine className="size-5" />, title: q ? `没有找到「${q}」` : '还没有模型供应商', hint: q ? '换个关键词试试。' : '从下方插件市场安装一个供应商，再填入 API Key。' }}
      >
        {rows => <div className="space-y-3">{rows.map(p => <ProviderCard key={p.provider} provider={p} onChanged={providers.refresh} />)}</div>}
      </ListState>
      <MarketplaceGrid category="model" title="安装模型供应商" limit={marketLimit} />
    </>
  )
}
