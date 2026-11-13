/* 内嵌版模型供应商（个人设置 → 模型供应商）。
   集成模块的卡片/插件操作依赖模块上下文（刷新版本、打开插件市场、跟踪安装任务），这里自己提供一份。 */
import type { IntegrationsCtx } from '../kit'
import type { PluginCategory } from '@/api/integrations'
import { useCallback, useMemo, useState } from 'react'
import { Ctx, SearchBox } from '../kit'
import { clearInstalling } from '../marketplace'
import { TasksIndicator } from '../tasks'
import { ModelProviderBody, NoDefaultBanner, useNoDefaultModel } from './body'

export function ModelProviderPanel({ go, onOpenDefault }: {
  /** 跳转到其他页面（例如插件市场）；调用方负责先关掉设置对话框 */
  go: (path: string) => void
  /** 「去设置默认模型」 */
  onOpenDefault: () => void
}) {
  const [q, setQ] = useState('')
  const [version, setVersion] = useState(0)
  const [watching, setWatching] = useState(0)
  const bump = useCallback(() => setVersion(v => v + 1), [])
  const noDefault = useNoDefaultModel(version, 0)

  const ctx: IntegrationsCtx = useMemo(() => ({
    version,
    bump,
    go,
    openMarketplace: (c?: PluginCategory) => go(`integrations/marketplace/${c ?? 'model'}`),
    watchTasks: () => setWatching(w => w + 1),
    globalActions: null,
  }), [version, bump, go])

  return (
    <Ctx.Provider value={ctx}>
      <div className="mb-5 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-3">接入大模型服务商，Agent 和知识库从这里选用模型。</p>
        <TasksIndicator watching={watching} onIdle={() => { clearInstalling(); bump() }} onFinished={bump} />
        <SearchBox value={q} onChange={setQ} placeholder="搜索供应商" className="w-[180px]" />
      </div>
      {noDefault && <NoDefaultBanner onClick={onOpenDefault} />}
      <ModelProviderBody q={q} version={version} marketLimit={6} />
    </Ctx.Provider>
  )
}
