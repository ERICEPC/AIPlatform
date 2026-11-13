/* 插件「⋯」菜单的通用动作：版本、检查更新、插件信息、在插件市场查看、查看 README、移除 */
import type { I18nText, PluginCategory, PluginDetail, PluginMeta, PluginSource } from '@/api/integrations'
import type { MenuItem } from '@/components/ui/menu'
import { RiArrowUpCircleLine, RiBookOpenLine, RiDeleteBinLine, RiInformationLine, RiPriceTag3Line, RiRefreshLine, RiStore2Line } from '@remixicon/react'
import { useState } from 'react'
import { fetchMarketplaceLatest, fetchPluginReadme, tr, uninstallPlugin, upgradeFromMarketplace } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { authorName, errMsg, PluginTile, SourceBadge, useIntegrations } from './kit'

export type PluginRef = {
  installation_id: string
  plugin_id: string
  plugin_unique_identifier: string
  version: string
  latest_version?: string
  source: PluginSource
  meta?: PluginMeta
  label: I18nText
  icon: string
  author: string
  category: PluginCategory
}

export const refOf = (p: PluginDetail): PluginRef => ({
  installation_id: p.installation_id,
  plugin_id: p.plugin_id,
  plugin_unique_identifier: p.plugin_unique_identifier,
  version: p.version,
  latest_version: p.latest_version,
  source: p.source,
  meta: p.meta,
  label: p.declaration.label,
  icon: p.declaration.icon,
  author: p.declaration.author,
  category: p.declaration.category,
})

const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0))
      return (pa[i] ?? 0) > (pb[i] ?? 0)
  }
  return false
}
export const hasUpdate = (p: { version: string, latest_version?: string, source: PluginSource }) => p.source === 'marketplace' && !!p.latest_version && newer(p.latest_version, p.version)
const pkgName = (s: string) => s.replace(/\.difypkg$/i, '.pkg').replace(/\.difybndl$/i, '.bundle')

function Readme({ uid }: { uid: string }) {
  const { data, error, loading, reload } = useQuery(() => fetchPluginReadme(uid), [uid])
  if (error)
    return <ErrorBar error={error} onRetry={reload} />
  if (loading || !data)
    return <div className="space-y-2">{[80, 60, 90, 70].map(w => <Skeleton key={w} className="h-4" />)}</div>
  // 轻量 Markdown：标题、列表、粗体
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed text-ink-2">
      {data.readme.split('\n').filter(Boolean).map((line, i) => {
        const html = line.replace(/\*\*(.+?)\*\*/g, '<b class="text-ink">$1</b>')
        if (line.startsWith('# '))
          return <h3 key={i} className="pt-1 text-[17px] font-semibold text-ink">{line.slice(2)}</h3>
        if (line.startsWith('## '))
          return <h4 key={i} className="pt-2 text-[14px] font-semibold text-ink">{line.slice(3)}</h4>
        if (/^(- |\d+\. )/.test(line))
          return <p key={i} className="pl-4 -indent-3" dangerouslySetInnerHTML={{ __html: `· ${html.replace(/^(- |\d+\. )/, '')}` }} />
        return <p key={i} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </div>
  )
}

export function usePluginActions(p: PluginRef | undefined, opts: { onRemoved?: () => void, removeHint?: string } = {}) {
  const { bump, openMarketplace, watchTasks } = useIntegrations()
  const toast = useToast()
  const [dlg, setDlg] = useState<'info' | 'readme' | 'remove' | 'update' | null>(null)
  const [checking, setChecking] = useState(false)
  const [latest, setLatest] = useState<{ version: string, uid: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [keepCreds, setKeepCreds] = useState(true)

  if (!p)
    return { items: [] as MenuItem[], dialogs: null, checkUpdate: () => {}, checking }

  const checkUpdate = async () => {
    setChecking(true)
    try {
      const r = await fetchMarketplaceLatest(p.plugin_id)
      if (newer(r.data.version.version, p.version)) {
        setLatest({ version: r.data.version.version, uid: r.data.version.unique_identifier })
        setDlg('update')
      }
      else {
        toast(`${tr(p.label)} 已是最新版本 ${p.version}`, 'info')
      }
    }
    catch (e) {
      toast(errMsg(e), 'info')
    }
    finally {
      setChecking(false)
    }
  }

  const items: MenuItem[] = [
    { label: `版本 ${p.version}`, icon: RiPriceTag3Line, onSelect: () => {}, disabled: true, hint: hasUpdate(p) ? `可更新到 ${p.latest_version}` : undefined },
    { label: '检查更新', icon: RiRefreshLine, onSelect: checkUpdate, disabled: p.source !== 'marketplace', hint: p.source !== 'marketplace' ? '仅插件市场来源' : undefined },
    { label: '插件信息', icon: RiInformationLine, onSelect: () => setDlg('info') },
    ...(p.source === 'marketplace' ? [{ label: '在插件市场查看', icon: RiStore2Line, onSelect: () => openMarketplace(p.category) }] : []),
    { label: '查看 README', icon: RiBookOpenLine, onSelect: () => setDlg('readme') },
    'separator',
    { label: '移除', icon: RiDeleteBinLine, danger: true, onSelect: () => setDlg('remove') },
  ]

  const dialogs = (
    <>
      <Dialog
        open={dlg === 'info'}
        onOpenChange={o => !o && setDlg(null)}
        title="插件信息"
        size="sm"
        footer={<Button variant="secondary" onClick={() => setDlg(null)}>关闭</Button>}
      >
        <div className="flex items-center gap-3 pb-4">
          <PluginTile icon={p.icon} size={44} />
          <div className="min-w-0">
            <p className="font-semibold">{tr(p.label)}</p>
            <p className="text-[12.5px] text-ink-3">{authorName(p.author)} · {p.plugin_id}</p>
          </div>
        </div>
        <dl className="divide-y divide-line rounded-2xl border border-line text-[13px]">
          {([
            ['来源', <SourceBadge key="s" source={p.source} />],
            ['当前版本', p.version],
            ...(p.latest_version && p.source === 'marketplace' ? [['最新版本', p.latest_version]] : []),
            ...(p.meta ? [['仓库', p.meta.repo], ['Release', p.meta.version], ['插件包', pkgName(p.meta.package)]] : []),
            ['唯一标识', <span key="u" className="font-mono text-[11.5px] break-all">{p.plugin_unique_identifier}</span>],
          ] as [string, React.ReactNode][]).map(([k, v]) => (
            <div key={k} className="flex gap-4 px-4 py-2.5">
              <dt className="w-16 shrink-0 text-ink-3">{k}</dt>
              <dd className="min-w-0 flex-1">{v}</dd>
            </div>
          ))}
        </dl>
      </Dialog>

      <Dialog open={dlg === 'readme'} onOpenChange={o => !o && setDlg(null)} title={`${tr(p.label)} · README`} size="lg">
        {dlg === 'readme' && <Readme uid={p.plugin_unique_identifier} />}
      </Dialog>

      <Dialog
        open={dlg === 'update'}
        onOpenChange={o => !o && setDlg(null)}
        title="发现新版本"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setDlg(null)}>稍后</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await upgradeFromMarketplace({ original_plugin_unique_identifier: p.plugin_unique_identifier, new_plugin_unique_identifier: latest!.uid })
                  watchTasks()
                  toast(`正在更新 ${tr(p.label)}，完成后自动生效`)
                  setDlg(null)
                }
                catch (e) {
                  toast(errMsg(e), 'info')
                }
                finally {
                  setBusy(false)
                }
              }}
            >
              <RiArrowUpCircleLine className="size-4" />更新到 {latest?.version}
            </Button>
          </>
        )}
      >
        <p className="text-[13.5px] text-ink-2">
          {tr(p.label)} 当前 <b className="text-ink">{p.version}</b>，插件市场最新 <b className="text-volt-text">{latest?.version}</b>。更新不影响已有凭据和使用它的 Agent。
        </p>
      </Dialog>

      <ConfirmDialog
        open={dlg === 'remove'}
        onOpenChange={o => !o && setDlg(null)}
        danger
        title={`移除 ${tr(p.label)}？`}
        description={(
          <span className="block space-y-3">
            <span className="block">{opts.removeHint ?? '使用它的 Agent会无法调用这个插件，需要重新安装后才能恢复。'}</span>
            <span className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-2.5 text-ink">
              <span className="text-[13px]">保留已配置的凭据，重装后直接可用</span>
              <Switch aria-label="保留凭据" checked={keepCreds} onCheckedChange={setKeepCreds} />
            </span>
          </span>
        )}
        confirmText="移除"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          try {
            await uninstallPlugin(p.installation_id, keepCreds)
            toast(`已移除 ${tr(p.label)}`)
            setDlg(null)
            opts.onRemoved?.()
            bump()
          }
          catch (e) {
            toast(errMsg(e), 'info')
          }
          finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
  return { items, dialogs, checkUpdate, checking }
}
