/*
  MCP 模块入口（路由 id 仍为 integrations）：
    #integrations                              已接入（默认；旧的 #integrations/<分区> 深链接都落到这里）
    #integrations/marketplace[/<connectorId>]  插件市场 = MCP 连接器市场，带 id 时打开详情抽屉
    #integrations/marketplace/<tool|model>     原插件市场（工具 / 模型插件），个人设置的模型页从这里安装供应商
  模型供应商已移到个人设置（openSettings('models')）。
*/
import type { IntegrationsCtx } from './kit'
import type { PluginCategory } from '@/api/integrations'
import { RiArrowRightUpLine, RiPuzzle2Line } from '@remixicon/react'
import { useCallback, useMemo, useState } from 'react'
import { listMcp } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { SectionHeader } from '@/components/detail-shell'
import { Page } from '@/components/page'
import { openSettings } from '@/components/settings'
import { Segmented } from '@/components/ui/segmented'
import { ConnectorMarket } from './connectors'
import { InstallMenu } from './install'
import { Ctx } from './kit'
import { clearInstalling, MarketplaceView } from './marketplace'
import { McpInstalled } from './mcp/installed'
import { AutoUpgradeButton, TasksIndicator } from './tasks'

export type ModuleProps = { param?: string, sub?: string, go: (path: string) => void, theme: 'dark' | 'light' }

type Tab = 'installed' | 'marketplace'
const pluginCategories: { value: PluginCategory, label: string }[] = [
  { value: 'tool', label: '工具' },
  { value: 'model', label: '模型' },
]
const isPluginCategory = (s?: string): s is PluginCategory => pluginCategories.some(c => c.value === s)

export default function IntegrationsModule({ param, sub, go }: ModuleProps) {
  const tab: Tab = param === 'marketplace' ? 'marketplace' : 'installed'
  /** 插件市场下：sub 为 tool / model 时是原插件市场，其余视为连接器 id */
  const pluginCategory = isPluginCategory(sub) ? sub : 'tool'
  const [version, setVersion] = useState(0)
  const [watching, setWatching] = useState(0)
  const bump = useCallback(() => setVersion(v => v + 1), [])
  const openMarketplace = useCallback((c?: PluginCategory) => go(`integrations/marketplace/${isPluginCategory(c) ? c : 'tool'}`), [go])
  const mcp = useQuery(listMcp, [version])

  const ctx: IntegrationsCtx = useMemo(() => ({ version, bump, go, openMarketplace, watchTasks: () => setWatching(w => w + 1), globalActions: null }), [version, bump, go, openMarketplace])

  return (
    <Ctx.Provider value={ctx}>
      <Page>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[1180px] px-8 pt-7 pb-16">
            <SectionHeader
              title="MCP"
              desc="MCP 服务把外部系统的能力变成工具，接入后 Agent就能调用。"
              actions={(
                <>
                  <button type="button" onClick={() => openSettings('models')} className="flex cursor-pointer items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
                    模型设置已移到个人设置
                    <RiArrowRightUpLine className="size-3.5" />
                  </button>
                  <TasksIndicator watching={watching} onIdle={() => { clearInstalling(); bump() }} onFinished={bump} />
                </>
              )}
            />
            <div className="mt-5 mb-6">
              <Segmented
                value={tab}
                onValueChange={t => go(t === 'installed' ? 'integrations' : 'integrations/marketplace')}
                aria-label="MCP 视图"
                options={[
                  { value: 'installed', label: '已接入', count: mcp.data?.length || undefined },
                  { value: 'marketplace', label: '插件市场' },
                ]}
              />
            </div>
            <div key={tab}>
              {tab === 'installed'
                ? <McpInstalled query={mcp} onMarketplace={() => openMarketplace()} />
                : pluginCategory
                  ? (
                      <>
                        <MarketplaceView
                          category={pluginCategory}
                          categories={pluginCategories}
                          onCategory={c => go(`integrations/marketplace/${c}`)}
                          actions={(
                            <>
                              <AutoUpgradeButton category={pluginCategory} label={pluginCategories.find(c => c.value === pluginCategory)!.label} />
                              <InstallMenu />
                            </>
                          )}
                        />
                      </>
                    )
                  : (
                      <ConnectorMarket
                        detail={sub}
                        go={go}
                        onChanged={bump}
                        extra={(
                          <button type="button" onClick={() => openMarketplace('tool')} className="flex cursor-pointer items-center gap-1 text-ink-3 hover:text-ink">
                            <RiPuzzle2Line className="size-3.5" />
                            工具 / 模型插件
                            <RiArrowRightUpLine className="size-3.5" />
                          </button>
                        )}
                      />
                    )}
            </div>
          </div>
        </div>
      </Page>
    </Ctx.Provider>
  )
}
