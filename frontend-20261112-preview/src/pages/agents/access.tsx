import type { AgentCtx } from './detail'
import type { ApiAccess, ReferencingWorkflow } from '@/api/agents'
import { RiBrushLine, RiCodeSSlashLine, RiExternalLinkLine, RiGitBranchLine, RiGlobalLine, RiKey2Line, RiRefreshLine, RiServerLine } from '@remixicon/react'
import { useState } from 'react'
import { getAgent, getApiAccess, listReferencingWorkflows, resetSiteToken, setApiEnabled, setSiteEnabled } from '@/api/agents'
import { useQuery } from '@/api/hooks'
import { SectionHeader } from '@/components/detail-shell'
import { Page, Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { CopyField, DataTable, ErrorBar } from '@/components/ui/data'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Badge, Panel, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { asset } from '@/lib/asset'
import { ApiKeysDialog, ApiReferenceDialog, BrandDialog, EmbedDialog } from './access-dialogs'
import { ChannelsSection } from './channels'
import { errText, fromNow, openUrl } from './shared'

function CardHead({ icon: Icon, title, desc, on, right }: { icon: React.ComponentType<{ className?: string }>, title: string, desc: string, on: boolean, right: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={on ? 'grid size-10 place-items-center rounded-2xl bg-volt-soft text-volt-text' : 'grid size-10 place-items-center rounded-2xl bg-hover text-ink-3'}><Icon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-semibold">{title}{on ? <Badge tone="mint" dot>服务中</Badge> : <Badge>已停用</Badge>}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-3">{desc}</p>
      </div>
      {right}
    </div>
  )
}

export default function AccessSection({ ctx }: { ctx: AgentCtx }) {
  const { agent, setAgent, publish } = ctx
  const toast = useToast()
  const ready = publish.everPublished || !!agent.access_ready
  const site = agent.site
  const url = site ? `${site.app_base_url}/agent/${site.access_token}` : ''
  const appId = agent.app_id ?? agent.id

  const api = useQuery(() => getApiAccess(agent.id), [agent.id])
  const refs = useQuery(() => listReferencingWorkflows(agent.id), [agent.id])
  const [dialog, setDialog] = useState<'embed' | 'brand' | 'keys' | 'ref' | 'reset' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const toggleSite = async (on: boolean) => {
    setBusy('site')
    try {
      await setSiteEnabled(appId, on)
      // Apps endpoints return App ids, not Agent ids. Reload the canonical Agent.
      setAgent(await getAgent(agent.id))
      toast(on ? 'Web 应用已开启' : 'Web 应用已停用', on ? 'ok' : 'info')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(null)
    }
  }
  const toggleApi = async (on: boolean) => {
    setBusy('api')
    try {
      await setApiEnabled(agent.id, on)
      api.setData(a => a && { ...a, enabled: on })
      setAgent({ ...agent, enable_api: on })
      toast(on ? '后端服务 API 已开启' : '后端服务 API 已停用', on ? 'ok' : 'info')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(null)
    }
  }
  const reset = async () => {
    setBusy('reset')
    try {
      const s = await resetSiteToken(appId)
      setAgent({ ...agent, site: s })
      setDialog(null)
      toast('访问地址已刷新，旧地址已失效')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(null)
    }
  }

  const a: ApiAccess | undefined = api.data
  return (
    <Page className="overflow-auto">
      <div className="space-y-6 px-8 pt-8 pb-16">
        <Rise><SectionHeader title="访问" desc="把 Agent 交给用户和系统使用：网页对话、后端 API、消息渠道。" /></Rise>
        {!ready && (
          <Rise className="rounded-2xl border border-amber/40 bg-amber-soft px-4 py-3 text-[13px] text-amber">
            还没有发布过。发布后才能开启 Web 应用和后端服务 API。
            <button type="button" className="ml-2 cursor-pointer font-medium underline" onClick={() => ctx.go(`agents/${agent.id}/configure`)}>去发布</button>
          </Rise>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Rise>
            <Panel level={2} className="h-full p-5">
              <CardHead
                icon={RiGlobalLine}
                title="Web 应用"
                desc="用浏览器打开就能对话，也可以嵌入到你的网站。"
                on={agent.enable_site}
                right={<Switch aria-label="Web 应用" checked={agent.enable_site} disabled={!ready || busy === 'site'} onCheckedChange={toggleSite} />}
              />
              <div className="mt-4">
                {site ? <CopyField value={url} mono /> : <Skeleton className="h-10" />}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="small" variant="secondary" disabled={!agent.enable_site} onClick={() => openUrl(url)}><RiExternalLinkLine className="size-3.5" />打开</Button>
                <Button size="small" variant="secondary" disabled={!site} onClick={() => setDialog('embed')}><RiCodeSSlashLine className="size-3.5" />嵌入</Button>
                <Button size="small" variant="secondary" disabled={!site} onClick={() => setDialog('brand')}><RiBrushLine className="size-3.5" />品牌设置</Button>
                <Button size="small" variant="ghost" disabled={!site} onClick={() => setDialog('reset')}><RiRefreshLine className="size-3.5" />刷新访问地址</Button>
              </div>
            </Panel>
          </Rise>

          <Rise>
            <Panel level={2} className="h-full p-5">
              <CardHead
                icon={RiServerLine}
                title="后端服务 API"
                desc="从你自己的系统里调用，按 API Key 鉴权。"
                on={!!a?.enabled}
                right={<Switch aria-label="后端服务 API" checked={!!a?.enabled} disabled={!a || !ready || busy === 'api'} onCheckedChange={toggleApi} />}
              />
              <ErrorBar error={api.error} onRetry={api.reload} />
              <div className="mt-4">{a ? <CopyField value={a.service_api_base_url} mono /> : <Skeleton className="h-10" />}</div>
              <div className="mt-3 flex items-center gap-4 text-[12.5px] text-ink-3">
                <span><b className="text-ink tabular-nums">{a?.api_key_count ?? '—'}</b> 个 API Key</span>
                <span>限流 <b className="text-ink tabular-nums">{a?.api_rpm ?? '—'}</b> 次/分钟 · <b className="text-ink tabular-nums">{a?.api_rph ?? '—'}</b> 次/小时</span>
                {a?.streaming_only && <Badge tone="cyan">仅流式</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="small" variant="secondary" disabled={!a} onClick={() => setDialog('keys')}><RiKey2Line className="size-3.5" />API Key</Button>
                <Button size="small" variant="secondary" disabled={!a} onClick={() => setDialog('ref')}><RiCodeSSlashLine className="size-3.5" />API 参考</Button>
              </div>
            </Panel>
          </Rise>
        </div>

        <ChannelsSection agentId={agent.id} ready={ready} />

        <Rise>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[16px] font-semibold">应用引用</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">这些应用调用此 Agent，发布新版本会同步影响它们。</p>
            </div>
          </div>
          <ErrorBar error={refs.error} onRetry={refs.reload} />
          <DataTable<ReferencingWorkflow>
            loading={refs.loading}
            rows={refs.data?.data ?? []}
            rowKey={r => r.workflow_id}
            empty="还没有应用引用这个 Agent。在应用里添加 Agent 节点即可引用。"
            columns={[
              { key: 'name', title: '应用', render: r => <span className="flex items-center gap-2.5">{r.app_icon ? <img src={asset(r.app_icon)} alt="" className="size-7 rounded-lg border border-line" /> : <RiGitBranchLine className="size-4" />}<span className="truncate font-medium">{r.app_name}</span></span> },
              { key: 'mode', title: '类型', width: '120px', render: r => <Badge tone="cyan">{r.app_mode === 'workflow' ? '应用' : '对话应用'}</Badge> },
              { key: 'nodes', title: '引用节点', width: '100px', align: 'right', render: r => <span className="tabular-nums">{r.node_ids?.length ?? 1}</span> },
              { key: 'ver', title: '版本', width: '130px', render: r => <span className="text-ink-2">{r.workflow_version}</span> },
              { key: 'upd', title: '更新', width: '110px', align: 'right', render: r => <span className="text-ink-3">{fromNow(r.app_updated_at)}</span> },
            ]}
          />
        </Rise>
      </div>

      {site && <EmbedDialog open={dialog === 'embed'} onOpenChange={o => setDialog(o ? 'embed' : null)} url={url} token={site.access_token} base={site.app_base_url} />}
      {site && <BrandDialog open={dialog === 'brand'} onOpenChange={o => setDialog(o ? 'brand' : null)} appId={appId} site={site} onSaved={s => setAgent({ ...agent, site: s })} />}
      <ApiKeysDialog open={dialog === 'keys'} onOpenChange={o => setDialog(o ? 'keys' : null)} agentId={agent.id} onCount={n => api.setData(x => x && { ...x, api_key_count: n })} />
      {a && <ApiReferenceDialog open={dialog === 'ref'} onOpenChange={o => setDialog(o ? 'ref' : null)} access={a} />}
      <ConfirmDialog open={dialog === 'reset'} onOpenChange={o => setDialog(o ? 'reset' : null)} danger title="刷新访问地址？" description="会生成新的访问地址，旧地址和已嵌入的代码会立即失效，需要重新分发。" confirmText="刷新" loading={busy === 'reset'} onConfirm={reset} />
    </Page>
  )
}
