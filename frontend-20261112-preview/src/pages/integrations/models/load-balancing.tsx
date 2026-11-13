/* 模型负载均衡：多条凭据轮流调用，触发限流的 Key 自动冷却 */
import type { LoadBalancingConfig, ModelItem, ModelLoadBalancing, ModelProvider } from '@/api/integrations'
import { RiAddLine, RiCloseLine, RiErrorWarningLine, RiKey2Line, RiScales3Line, RiTimeLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { getModelCredential, saveModelLoadBalancing, tr } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Menu } from '@/components/ui/menu'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { errMsg } from '../kit'

const INHERIT = '__inherit__'

export function LoadBalancingDialog({ provider, model, onClose }: { provider: ModelProvider, model: ModelItem | null, onClose: () => void }) {
  const toast = useToast()
  const open = !!model
  const { data, error, loading, reload } = useQuery(() => getModelCredential(provider.provider, model!.model, model!.model_type), [model?.model, model?.model_type], { enabled: open })
  const [lb, setLb] = useState<ModelLoadBalancing | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (data && open)
      setLb(data.load_balancing)
  }, [data, open])

  const avail = data?.available_credentials ?? []
  const used = new Set(lb?.configs.map(c => c.credential_id).filter(Boolean))
  const enabledCount = lb?.configs.filter(c => c.enabled).length ?? 0
  const set = (i: number, patch: Partial<LoadBalancingConfig>) => lb && setLb({ ...lb, configs: lb.configs.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  return (
    <Dialog
      open={open}
      onOpenChange={o => !o && onClose()}
      title={<span className="flex items-center gap-2"><RiScales3Line className="size-5 text-cyan" />负载均衡 · {model?.model}</span>}
      description="开启后按顺序轮流使用下列凭据；某条 Key 触发限流时自动冷却 1 分钟再重试，避免单个 Key 被打满。"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!lb || (lb.enabled && enabledCount < 2)}
            onClick={async () => {
              setSaving(true)
              try {
                await saveModelLoadBalancing(provider.provider, { model: model!.model, model_type: model!.model_type, load_balancing: lb! })
                toast(lb!.enabled ? '负载均衡已开启' : '负载均衡已关闭')
                onClose()
              }
              catch (e) {
                toast(errMsg(e), 'info')
              }
              finally {
                setSaving(false)
              }
            }}
          >
            保存
          </Button>
        </>
      )}
    >
      {error && <ErrorBar error={error} onRetry={reload} />}
      {loading || !lb
        ? <div className="space-y-3 pb-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
        : (
            <div className="space-y-4 pb-2">
              <div className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors', lb.enabled ? 'border-cyan/40 bg-cyan-soft' : 'border-line')}>
                <div className="flex-1">
                  <p className="text-[13.5px] font-medium">启用负载均衡</p>
                  <p className="text-[12px] text-ink-3">{lb.enabled ? `${enabledCount} 条凭据参与轮询` : '关闭时只使用供应商当前凭据'}</p>
                </div>
                <Switch aria-label="启用负载均衡" checked={lb.enabled} onCheckedChange={c => setLb({ ...lb, enabled: c })} />
              </div>
              <div className={cn('space-y-2 transition-opacity', !lb.enabled && 'pointer-events-none opacity-50')}>
                {lb.configs.map((c, i) => {
                  const inherit = c.name === INHERIT
                  return (
                    <div key={c.id ?? i} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-2.5">
                      <RiKey2Line className="size-4 text-ink-3" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{inherit ? (provider.custom_configuration.current_credential_name ?? '供应商凭据') : c.name}</p>
                        {inherit && <p className="text-[11.5px] text-ink-3">跟随供应商当前使用的凭据</p>}
                      </div>
                      {c.in_cooldown && <Badge tone="amber"><RiTimeLine className="size-3.5" />冷却中 {c.ttl}s</Badge>}
                      <Switch aria-label="参与轮询" checked={c.enabled} onCheckedChange={v => set(i, { enabled: v })} />
                      {!inherit && <Button variant="ghost" size="icon-small" aria-label="移除" onClick={() => setLb({ ...lb, configs: lb.configs.filter((_, j) => j !== i) })}><RiCloseLine className="size-4" /></Button>}
                    </div>
                  )
                })}
                <Menu
                  align="start"
                  items={avail.filter(a => !used.has(a.credential_id)).length
                    ? avail.filter(a => !used.has(a.credential_id)).map(a => ({ label: a.credential_name, icon: RiKey2Line, onSelect: () => setLb({ ...lb, configs: [...lb.configs, { name: a.credential_name, enabled: true, credential_id: a.credential_id }] }) }))
                    : [{ label: '没有更多凭据，先在「管理凭据」里添加', onSelect: () => {}, disabled: true }]}
                  trigger={<Button variant="ghost-accent" size="small"><RiAddLine className="size-4" />加入凭据</Button>}
                />
              </div>
              {lb.enabled && enabledCount < 2 && (
                <p className="flex items-center gap-2 rounded-2xl bg-amber-soft px-4 py-2.5 text-[12.5px] text-amber">
                  <RiErrorWarningLine className="size-4 shrink-0" />至少需要 2 条启用的凭据，负载均衡才有意义。
                </p>
              )}
              <p className="text-[12px] text-ink-3">模型：{tr(model!.label)} · {provider.provider}</p>
            </div>
          )}
    </Dialog>
  )
}
