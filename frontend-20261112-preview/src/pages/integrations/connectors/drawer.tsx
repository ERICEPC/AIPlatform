/* 连接器详情抽屉：#integrations/marketplace/<connectorId> */
import type { Connector } from '@/api/integrations'
import { RiArrowRightLine, RiCheckLine, RiExternalLinkLine, RiGithubFill, RiGlobalLine, RiKey2Line, RiTerminalBoxLine, RiToolsLine } from '@remixicon/react'
import { getConnector } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { CopyField } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { transportLabel } from '../mcp/shared'
import { ConnectButton, PublisherBadge } from './card'
import { AUTH, CATEGORY, ConnectorTile, fmtPopularity, toneCls } from './shared'

const repoLabel = (url: string) => (url.startsWith('https://github.com/') ? url.replace('https://github.com/', '').split('/tree/')[0] : new URL(url).host)

function Section({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">{icon}{title}</p>
      {children}
    </section>
  )
}

export function ConnectorDrawer({ id, list, version, onClose, onConnect, onOpenInstalled }: {
  id?: string
  /** 当前筛选结果；不在其中时单独查一次（深链接） */
  list?: Connector[]
  version: number
  onClose: () => void
  onConnect: (c: Connector) => void
  onOpenInstalled: () => void
}) {
  const inList = list?.find(c => c.id === id)
  const fallback = useQuery(() => getConnector(id!), [id, version], { enabled: !!id && !!list && !inList })
  const c = inList ?? (fallback.data?.id === id ? fallback.data : undefined)
  const loading = !!id && !c && (fallback.loading || !list)
  const missing = !!id && !c && !loading

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={c
        ? (
            <div className="flex items-center gap-3">
              <ConnectorTile c={c} size={52} />
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold">{c.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <PublisherBadge c={c} />
                  <Badge className="h-5 px-2 text-[11px]">{CATEGORY[c.category].label}</Badge>
                  <span className="text-[12px] text-ink-3 tabular-nums">{fmtPopularity(c.popularity)} 次接入</span>
                </div>
              </div>
            </div>
          )
        : <p className="text-[17px] font-semibold">连接器详情</p>}
      footer={c && (
        c.connected
          ? <Button variant="secondary" size="large" className="flex-1" onClick={onOpenInstalled}><RiCheckLine className="size-4 text-mint" />已连接，去「已接入」管理<RiArrowRightLine className="size-4" /></Button>
          : <ConnectButton c={c} size="large" className="flex-1" onConnect={() => onConnect(c)} />
      )}
    >
      {loading && <div className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-24 w-full" /></div>}
      {missing && <p className="text-[14px] text-ink-3">市场中没有找到「{id}」，可能已下架或改名。</p>}
      {c && (
        <div className="space-y-6 text-[14px]">
          <div>
            <p className="leading-relaxed text-ink-2">{c.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{c.tags.map(t => <Badge key={t} className="h-5 px-2 text-[11px]">{t}</Badge>)}</div>
          </div>

          <Section icon={<RiToolsLine className="size-4 text-cyan" />} title="主要能力">
            <ul className="space-y-1">
              {c.capabilities.map((cap) => {
                const [tool, ...rest] = cap.split(' ')
                const isTool = /^[\w.\-/ ]+$/.test(tool) && /[_.-]|^[a-z]/.test(tool)
                return (
                  <li key={cap} className="flex items-baseline gap-2 rounded-xl px-3 py-1.5 text-[13px] odd:bg-hover">
                    {isTool ? <><span className="shrink-0 font-mono text-[12.5px] text-ink">{tool}</span><span className="text-ink-3">{rest.join(' ')}</span></> : <span className="text-ink-2">{cap}</span>}
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[12px] text-ink-3">实际工具以连接后从服务端拉取的列表为准。</p>
          </Section>

          <Section icon={<RiGlobalLine className="size-4 text-volt-text" />} title="连接方式">
            <div className="space-y-2">
              {c.remote && (
                <div className="rounded-2xl border border-line p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium"><RiGlobalLine className="size-3.5" />远程 · {transportLabel[c.remote.transport]}</p>
                  <CopyField mono value={c.remote.url} />
                </div>
              )}
              {c.local && (
                <div className="rounded-2xl border border-line p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium"><RiTerminalBoxLine className="size-3.5" />本地命令 · stdio</p>
                  <CopyField mono value={[c.local.command, ...c.local.args].join(' ')} />
                </div>
              )}
            </div>
          </Section>

          <Section icon={<RiKey2Line className="size-4 text-amber" />} title="认证与凭证">
            <p className={`mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] ${toneCls[AUTH[c.auth].tone]}`}>{AUTH[c.auth].label}</p>
            {c.fields.length
              ? (
                  <ul className="space-y-1.5">
                    {c.fields.map(f => (
                      <li key={f.key} className="flex items-baseline gap-2 text-[13px]">
                        <span className="font-mono text-[12.5px]">{f.key}</span>
                        <span className="text-ink-3">{f.label}{!f.required && '（可选）'}</span>
                      </li>
                    ))}
                  </ul>
                )
              : <p className="text-[13px] text-ink-3">{c.auth === 'oauth' ? '连接时用服务商账号登录授权即可，不需要填写密钥。' : '不需要额外的密钥或配置。'}</p>}
          </Section>

          <a href={c.repo_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] text-volt-text hover:underline">
            {c.repo_url.startsWith('https://github.com/') ? <RiGithubFill className="size-4" /> : <RiExternalLinkLine className="size-4" />}
            {repoLabel(c.repo_url)}
            <span className="text-ink-3">· 查看源码与使用说明</span>
            <RiExternalLinkLine className="size-3.5" />
          </a>
        </div>
      )}
    </Drawer>
  )
}
