import { ResourceVisibility } from '@/components/resource-visibility'
/* 「已接入」：三种添加方式 + MCP 服务卡片 + 详情抽屉 */
import type { ToolCollection } from '@/api/integrations'
import { RiAddLine, RiArrowRightLine, RiFileCodeLine, RiFingerprintLine, RiRadarLine, RiServerLine, RiShieldCheckLine, RiStore2Line, RiTerminalBoxLine } from '@remixicon/react'
import { useState } from 'react'
import { tr } from '@/api/integrations'
import { Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { SpotlightCard } from '@/components/ui/effects'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { fmtTime, GroupTitle, Grid, ListState, PluginTile, SearchBox } from '../kit'
import { McpDialog } from './dialog'
import { McpDrawer } from './drawer'
import { ImportDialog } from './import-dialog'
import { PasteDialog } from './paste-dialog'
import { commandLine, sourceIcon, sourceLabel, transportOf } from './shared'

export type McpListQuery = {
  data?: ToolCollection[]
  error: Error | null
  loading: boolean
  reload: () => void
  refresh: () => void
}

function AddCard({ icon, title, desc, children, accent }: { icon: React.ReactNode, title: string, desc: React.ReactNode, children: React.ReactNode, accent?: boolean }) {
  return (
    <div className={cn('glass-2 glass-edge flex flex-col rounded-[22px] border p-5', accent ? 'border-volt/40 shadow-glow-volt' : 'border-line')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-[14px]', accent ? 'bg-volt-soft text-volt-text' : 'bg-hover text-ink-2')}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{title}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{desc}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">{children}</div>
    </div>
  )
}

export function McpInstalled({ query, onMarketplace }: { query: McpListQuery, onMarketplace: () => void }) {
  const [q, setQ] = useState('')
  const [dlg, setDlg] = useState<{ editing?: ToolCollection } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [importing, setImporting] = useState<'scan' | 'paste' | null>(null)
  const { data, error, loading, reload, refresh } = query
  const rows = data?.filter(m => !q || `${m.name} ${m.server_url ?? ''} ${commandLine(m)}`.toLowerCase().includes(q.toLowerCase()))
  const open = data?.find(m => m.id === openId)

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <AddCard icon={<RiAddLine className="size-5" />} title="手动添加" desc="填写远程 MCP 服务地址（Streamable HTTP / SSE）。">
          <Button variant="secondary" onClick={() => setDlg({})}><RiAddLine className="size-4" />添加</Button>
        </AddCard>
        <AddCard accent icon={<RiRadarLine className="size-5" />} title="从其他工具导入" desc="本地配置扫描与批量导入接口尚未部署，请使用手动添加。">
          <Button variant="primary" disabled title="当前后端未提供本地扫描接口" onClick={() => setImporting('scan')}><RiRadarLine className="size-4" />扫描</Button>
          <Button variant="ghost" disabled title="当前后端未提供批量导入接口" onClick={() => setImporting('paste')}><RiFileCodeLine className="size-4" />粘贴配置 JSON</Button>
        </AddCard>
        <AddCard icon={<RiStore2Line className="size-5" />} title="从插件市场安装" desc="浏览真实工具和模型插件，安装后按服务要求授权。">
          <Button variant="secondary" onClick={onMarketplace}>去插件市场<RiArrowRightLine className="size-4" /></Button>
        </AddCard>
      </div>

      <section className="mt-9">
        <GroupTitle aside={!!data?.length && <SearchBox value={q} onChange={setQ} placeholder="搜索名称、地址或命令" className="w-[220px]" />}>
          已接入的服务 {!!data?.length && <span className="ml-1 font-normal text-ink-3">{data.length}</span>}
        </GroupTitle>
        <ListState
          loading={loading}
          error={error}
          data={rows}
          onRetry={reload}
          empty={{
            icon: <RiServerLine className="size-5" />,
            title: q ? `没有找到「${q}」` : '还没有接入 MCP 服务',
            hint: q ? '换个关键词试试。' : '点击上方添加，填写远程 MCP 服务地址。',
            action: !q && <Button variant="primary" disabled title="当前后端未提供本地扫描接口" onClick={() => setImporting('scan')}><RiRadarLine className="size-4" />扫描本机配置</Button>,
          }}
        >
          {list => (
            <Rise>
              <Grid>
                {list.map((m) => {
                  const stdio = transportOf(m) === 'stdio'
                  return (
                    <SpotlightCard key={m.id} role="button" tabIndex={0} onClick={() => setOpenId(m.id)} onKeyDown={e => e.key === 'Enter' && setOpenId(m.id)} className="cursor-pointer">
                      <div className="flex h-full min-h-[150px] flex-col p-5">
                        <div className="flex items-start gap-3">
                          <PluginTile icon={m.icon} size={42} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold">{tr(m.label) || m.name}</p>
                            <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[11.5px] text-ink-3">
                              {stdio && <RiTerminalBoxLine className="size-3.5 shrink-0" />}
                              <span className="truncate">{stdio ? commandLine(m) : m.server_url}</span>
                            </p>
                          </div>
                          {m.imported_from && (
                            <span title={`从 ${sourceLabel[m.imported_from]} 导入`}><PluginTile icon={sourceIcon[m.imported_from]} size={22} /></span>
                          )}
                        </div>
                        <ResourceVisibility kind="mcp" id={m.id} />
                        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                          {m.is_team_authorization
                            ? <Badge tone="mint" className="h-5 px-2 text-[11px]"><RiShieldCheckLine className="size-3" />已授权 · {m.tools.length} 个工具</Badge>
                            : <Badge tone="amber" className="h-5 px-2 text-[11px]">待授权</Badge>}
                          {m.identity_mode === 'idp_token' && <Badge tone="cyan" className="h-5 px-2 text-[11px]"><RiFingerprintLine className="size-3" />转发身份</Badge>}
                          <span className="flex-1" />
                          <span className="text-[11.5px] text-ink-3">{fmtTime(m.updated_at)} 更新</span>
                        </div>
                      </div>
                    </SpotlightCard>
                  )
                })}
              </Grid>
            </Rise>
          )}
        </ListState>
      </section>

      <McpDrawer mcp={open} onClose={() => setOpenId(null)} onEdit={m => setDlg({ editing: m })} onChanged={refresh} />
      <McpDialog open={!!dlg} editing={dlg?.editing} onClose={() => setDlg(null)} onSaved={refresh} />
      <ImportDialog open={importing === 'scan'} onClose={() => setImporting(null)} onImported={refresh} onPaste={() => setImporting('paste')} />
      <PasteDialog open={importing === 'paste'} onClose={() => setImporting(null)} onImported={refresh} />
    </>
  )
}
