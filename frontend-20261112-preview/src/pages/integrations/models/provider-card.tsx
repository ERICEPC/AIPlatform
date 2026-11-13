/* 模型供应商卡片：凭据状态、使用优先级、⋯ 菜单，展开后是模型列表 */
import type { ModelItem, ModelProvider } from '@/api/integrations'
import { RiAddLine, RiArrowDownSLine, RiDeleteBinLine, RiKey2Line, RiScales3Line, RiSettings3Line } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { listProviderModels, removeCustomModel, setPreferredProviderType, toggleModel, tr } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Menu } from '@/components/ui/menu'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { authorName, errMsg, PluginTile, SourceBadge } from '../kit'
import { hasUpdate, usePluginActions } from '../plugin-actions'
import { AddModelDialog, CredentialsDialog } from './credentials'
import { LoadBalancingDialog } from './load-balancing'
import { featureLabel, fmtContext, modelTypeLabel } from './shared'

function ModelRow({ provider, m, onChanged, onLoadBalance }: { provider: ModelProvider, m: ModelItem, onChanged: () => void, onLoadBalance: () => void }) {
  const toast = useToast()
  const [on, setOn] = useState(m.status === 'active')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const custom = m.fetch_from === 'customizable-model'
  return (
    <div className={cn('group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover', !on && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium">{tr(m.label)}</span>
          {tr(m.label) !== m.model && <span className="font-mono text-[11.5px] text-ink-3">{m.model}</span>}
          <Badge className="h-[18px] px-1.5 text-[10.5px] tracking-wide">{modelTypeLabel[m.model_type]}</Badge>
          {m.model_properties.context_size && <Badge className="h-[18px] px-1.5 text-[10.5px]">{fmtContext(m.model_properties.context_size)}</Badge>}
          {m.deprecated && <Badge tone="amber" className="h-[18px] px-1.5 text-[10.5px]">已弃用</Badge>}
          {m.load_balancing_enabled && (
            <button type="button" onClick={onLoadBalance} className="cursor-pointer">
              <Badge tone="cyan" className="h-[18px] px-1.5 text-[10.5px]"><RiScales3Line className="size-3" />负载均衡</Badge>
            </button>
          )}
          {m.has_invalid_load_balancing_configs && <Badge tone="rose" className="h-[18px] px-1.5 text-[10.5px]">有失效的 Key</Badge>}
        </p>
        {!!m.features?.length && (
          <p className="mt-0.5 text-[11.5px] text-ink-3">{m.features.map(f => featureLabel[f]).join(' · ')}</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Tip label="负载均衡"><Button variant="ghost" size="icon-small" aria-label="负载均衡" onClick={onLoadBalance}><RiScales3Line className="size-4" /></Button></Tip>
        {custom && <Tip label="移除模型"><Button variant="ghost" size="icon-small" tone="destructive" aria-label="移除模型" onClick={() => setConfirm(true)}><RiDeleteBinLine className="size-4" /></Button></Tip>}
      </div>
      <Switch
        aria-label={`${on ? '停用' : '启用'} ${m.model}`}
        checked={on}
        onCheckedChange={async (c) => {
          setOn(c)
          try {
            await toggleModel(provider.provider, { model: m.model, model_type: m.model_type }, c)
          }
          catch (e) {
            setOn(!c)
            toast(errMsg(e), 'info')
          }
        }}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        danger
        title={`移除模型 ${m.model}？`}
        description="使用这个模型的 Agent需要改选其他模型。"
        confirmText="移除"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          try {
            await removeCustomModel(provider.provider, { model: m.model, model_type: m.model_type })
            toast(`已移除 ${m.model}`)
            setConfirm(false)
            onChanged()
          }
          catch (e) {
            toast(errMsg(e), 'info')
          }
          finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}

function ModelList({ provider, onCount }: { provider: ModelProvider, onCount: (n: number) => void }) {
  const { data, error, loading, reload, refresh } = useQuery(() => listProviderModels(provider.provider).then((r) => { onCount(r.data.length); return r }), [provider.provider])
  const [lb, setLb] = useState<ModelItem | null>(null)
  if (error)
    return <div className="p-4"><ErrorBar error={error} onRetry={reload} /></div>
  if (loading && !data)
    return <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}</div>
  if (!data?.data.length)
    return <p className="px-4 py-6 text-center text-[13px] text-ink-3">还没有模型。{provider.configurate_methods.includes('customizable-model') ? '点击「添加模型」接入第一个。' : '配置凭据后会自动列出。'}</p>
  return (
    <div className="divide-y divide-line">
      {data.data.map(m => <ModelRow key={`${m.model_type}:${m.model}`} provider={provider} m={m} onChanged={refresh} onLoadBalance={() => setLb(m)} />)}
      <LoadBalancingDialog provider={provider} model={lb} onClose={() => { setLb(null); refresh() }} />
    </div>
  )
}

export function ProviderCard({ provider: p, onChanged }: { provider: ModelProvider, onChanged: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [dlg, setDlg] = useState<'creds' | 'add' | null>(null)
  const [listKey, setListKey] = useState(0)
  const [pref, setPref] = useState(p.preferred_provider_type)
  const customizable = p.configurate_methods.includes('customizable-model')
  const configured = p.custom_configuration.status === 'active'
  const actions = usePluginActions({
    installation_id: p.installation_id, plugin_id: p.plugin_id, plugin_unique_identifier: p.plugin_unique_identifier, version: p.version, latest_version: p.latest_version,
    source: p.source, label: p.label, icon: p.icon_small, author: p.author, category: 'model',
  }, { removeHint: '使用该供应商模型的 Agent 和知识库将无法调用，需要改选其他模型。' })
  const quota = p.system_configuration.quota_configurations[0]

  return (
    <div className="glass-2 glass-edge overflow-hidden rounded-[22px]">
      <div className="flex items-start gap-4 p-5">
        <PluginTile icon={p.icon_small} size={46} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[16px] font-semibold tracking-[-0.01em]">{tr(p.label)}</p>
            <span className="font-mono text-[12px] text-ink-3">{p.version}</span>
            {hasUpdate(p) && <Badge tone="volt" className="h-5 px-2 text-[11px]">可更新到 {p.latest_version}</Badge>}
            <SourceBadge source={p.source} />
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-3">{authorName(p.author)}{p.description ? ` · ${tr(p.description)}` : ''}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {p.supported_model_types.map(t => <Badge key={t} className="h-5 px-2 text-[10.5px] tracking-wide">{modelTypeLabel[t]}</Badge>)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <div className="flex items-center gap-1.5">
            {configured
              ? <Badge tone="mint" dot>{p.custom_configuration.current_credential_name ?? (customizable ? '按模型配置' : '已配置')}</Badge>
              : <Badge tone="amber">未配置凭据</Badge>}
            <Menu items={actions.items} />
          </div>
          {p.system_configuration.enabled && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-3">优先使用</span>
              <Segmented
                size="small"
                value={pref}
                aria-label="使用优先级"
                onValueChange={async (v) => {
                  setPref(v)
                  try {
                    await setPreferredProviderType(p.provider, v)
                    toast(v === 'system' ? '已改为优先使用系统额度' : '已改为优先使用自有 API Key')
                  }
                  catch (e) {
                    setPref(pref)
                    toast(errMsg(e), 'info')
                  }
                }}
                options={[{ value: 'system', label: '系统额度' }, { value: 'custom', label: '自有 Key' }]}
              />
            </div>
          )}
          {quota && pref === 'system' && <span className="text-[11.5px] text-ink-3 tabular-nums">额度已用 {(quota.quota_used / 10000).toFixed(1)} / {(quota.quota_limit / 10000).toFixed(0)} 万 tokens</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-line bg-hover/60 px-3 py-2">
        <Button variant="ghost" size="small" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <RiArrowDownSLine className={cn('size-4 transition-transform', open && 'rotate-180')} />
          {open ? '收起模型' : `显示模型${count !== null ? `（${count}）` : ''}`}
        </Button>
        <span className="flex-1" />
        {!customizable && <Button variant="ghost" size="small" onClick={() => setDlg('creds')}><RiKey2Line className="size-4" />管理凭据</Button>}
        {customizable && <Button variant="ghost" size="small" onClick={() => setDlg('creds')}><RiSettings3Line className="size-4" />凭据</Button>}
        {customizable && <Button variant="ghost-accent" size="small" onClick={() => setDlg('add')}><RiAddLine className="size-4" />添加模型</Button>}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: ease.out }} className="overflow-hidden border-t border-line">
            <ModelList key={listKey} provider={p} onCount={setCount} />
          </motion.div>
        )}
      </AnimatePresence>
      <CredentialsDialog open={dlg === 'creds'} provider={p} onClose={() => { setDlg(null); onChanged() }} />
      <AddModelDialog open={dlg === 'add'} provider={p} onClose={(added) => { setDlg(null); if (added) { setOpen(true); setListKey(k => k + 1) } }} />
      {actions.dialogs}
    </div>
  )
}
