import type { ModelItem, ModelProviderGroup, ModelSettings, ParameterRule } from '@/api/agents'
import { RiArrowDownSLine, RiCheckLine, RiCloseLine, RiCpuLine, RiEqualizerLine, RiSearchLine, RiShieldCheckLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { getParameterRules } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'
import { AddButton, ConfigCard, IconBtn, tx } from '../shared'
import { useConfig } from './context'

const STATUS: Record<ModelItem['status'], string | null> = { 'active': null, 'no-configure': '未配置凭据', 'quota-exceeded': '额度已用完', 'disabled': '已停用' }

export function findModel(models: ModelProviderGroup[], provider?: string, model?: string) {
  const g = models.find(m => m.provider === provider)
  return { group: g, item: g?.models.find(m => m.model === model) }
}

function ModelLabel({ provider, model }: { provider: string, model: string }) {
  const { models } = useConfig()
  const { group, item } = findModel(models, provider, model)
  return (
    <span className="min-w-0">
      <span className="block truncate text-[13.5px] font-medium">{item ? tx(item.label) : model}</span>
      <span className="block truncate text-[12px] text-ink-3">{group ? tx(group.label) : provider}{item?.model_properties?.context_size ? ` · ${Math.round(item.model_properties.context_size / 1000)}K 上下文` : ''}</span>
    </span>
  )
}

const summary = (s?: ModelSettings) => [s?.temperature != null && `温度 ${s.temperature}`, s?.max_tokens != null && `最长 ${s.max_tokens}`].filter(Boolean).join(' · ')

export function ModelSection() {
  const { soul, update, changed, models } = useConfig()
  const [pick, setPick] = useState<'main' | 'fallback' | null>(null)
  const [params, setParams] = useState<'main' | 'fallback' | null>(null)
  const m = soul.model
  const fb = m?.fallback

  return (
    <ConfigCard id="sec-model" icon={RiCpuLine} title="模型" changed={changed.has('model')} hint={m ? undefined : '先选一个模型，Agent 才能回答。'}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPick('main')} className={cn('flex h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl border px-3.5 text-left transition-colors hover:bg-hover', m ? 'border-line' : 'border-dashed border-amber/60 bg-amber-soft/40')}>
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-volt-soft text-volt-text"><RiCpuLine className="size-4" /></span>
            {m ? <ModelLabel provider={m.model_provider} model={m.model} /> : <span className="text-[13.5px] text-ink-2">选择模型</span>}
            <RiArrowDownSLine className="ml-auto size-4 shrink-0 text-ink-3" />
          </button>
          {m && (
            <Button variant="secondary" className="h-14 rounded-2xl" onClick={() => setParams('main')}>
              <RiEqualizerLine className="size-4" />
              <span className="flex flex-col items-start leading-tight"><span>参数</span><span className="text-[11px] font-normal text-ink-3">{summary(m.model_settings) || '默认'}</span></span>
            </Button>
          )}
        </div>

        {m && (fb
          ? (
              <div className="flex items-center gap-2 rounded-2xl border border-line px-3.5 py-2">
                <RiShieldCheckLine className="size-4 shrink-0 text-cyan" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-ink-3">备用模型</p>
                  <button type="button" className="cursor-pointer text-left hover:text-volt-text" onClick={() => setPick('fallback')}><ModelLabel provider={fb.model_provider} model={fb.model} /></button>
                </div>
                <IconBtn label="备用模型参数" onClick={() => setParams('fallback')}><RiEqualizerLine className="size-4" /></IconBtn>
                <IconBtn label="移除备用模型" danger onClick={() => update(s => ({ ...s, model: s.model && { ...s.model, fallback: null } }))}><RiCloseLine className="size-4" /></IconBtn>
              </div>
            )
          : (
              <div className="flex items-center justify-between gap-2 pl-1">
                <p className="text-[12px] text-ink-3">主模型输出前出错或 8 秒内无响应时，会切换一次备用模型。</p>
                <AddButton onClick={() => setPick('fallback')}>备用模型</AddButton>
              </div>
            ))}
      </div>

      <ModelPicker
        open={!!pick}
        onOpenChange={o => !o && setPick(null)}
        models={models}
        current={pick === 'fallback' ? fb : m}
        exclude={pick === 'fallback' && m ? `${m.model_provider}/${m.model}` : undefined}
        title={pick === 'fallback' ? '选择备用模型' : '选择模型'}
        onPick={(provider, model) => {
          update(s => pick === 'fallback'
            ? { ...s, model: s.model && { ...s.model, fallback: { model, model_provider: provider, plugin_id: models.find(g => g.provider === provider)?.plugin_id || provider.split('/').slice(0, -1).join('/'), model_settings: {}, first_chunk_timeout: 8 } } }
            : { ...s, model: { ...s.model, model, model_provider: provider, plugin_id: models.find(g => g.provider === provider)?.plugin_id || provider.split('/').slice(0, -1).join('/'), model_settings: s.model?.model_settings ?? { temperature: 0.7 }, fallback: s.model?.fallback && `${s.model.fallback.model_provider}/${s.model.fallback.model}` === `${provider}/${model}` ? null : s.model?.fallback ?? null } })
          setPick(null)
        }}
      />
      {params && (m || fb) && (
        <ParamsDialog
          open
          onOpenChange={o => !o && setParams(null)}
          provider={(params === 'fallback' ? fb : m)!.model_provider}
          model={(params === 'fallback' ? fb : m)!.model}
          value={(params === 'fallback' ? fb : m)!.model_settings ?? {}}
          onSave={v => update(s => params === 'fallback' ? { ...s, model: s.model && { ...s.model, fallback: s.model.fallback && { ...s.model.fallback, model_settings: v } } } : { ...s, model: s.model && { ...s.model, model_settings: v } })}
        />
      )}
    </ConfigCard>
  )
}

function ModelPicker({ open, onOpenChange, models, current, exclude, title, onPick }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  models: ModelProviderGroup[]
  current?: { model: string, model_provider: string } | null
  exclude?: string
  title: string
  onPick: (provider: string, model: string) => void
}) {
  const [kw, setKw] = useState('')
  useEffect(() => {
    if (open)
      setKw('')
  }, [open])
  const groups = models.map(g => ({ ...g, models: g.models.filter(m => `${g.provider}/${m.model}` !== exclude && (!kw || `${tx(m.label)} ${m.model} ${tx(g.label)}`.toLowerCase().includes(kw.toLowerCase()))) })).filter(g => g.models.length)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} size="md">
      <label className="glass-1 mb-3 flex h-10 items-center gap-2 rounded-full px-4 text-ink-3 focus-within:border-volt">
        <RiSearchLine className="size-4" />
        <input autoFocus value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索模型" className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" />
      </label>
      {models.length === 0 && <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>}
      {models.length > 0 && groups.length === 0 && <p className="py-8 text-center text-[13px] text-ink-3">没有匹配的模型。可以到「集成 · 模型供应商」添加。</p>}
      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.provider}>
            <p className="mb-1 px-1 text-[12px] font-medium text-ink-3">{tx(g.label)}</p>
            {g.models.map((m) => {
              const on = current?.model_provider === g.provider && current.model === m.model
              const block = STATUS[m.status]
              return (
                <button key={m.model} type="button" disabled={!!block} onClick={() => onPick(g.provider, m.model)} className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50', on && 'bg-volt-soft')}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{tx(m.label)}</span>
                    <span className="block text-[12px] text-ink-3">{m.model_properties?.context_size ? `${Math.round(m.model_properties.context_size / 1000)}K 上下文` : m.model}</span>
                  </span>
                  {m.features?.includes('tool-call') && <Badge tone="cyan">工具调用</Badge>}
                  {m.features?.includes('vision') && <Badge tone="cyan">视觉</Badge>}
                  {block && <Badge tone="amber">{block}</Badge>}
                  {on && <RiCheckLine className="size-4 text-volt-text" />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </Dialog>
  )
}

function ParamsDialog({ open, onOpenChange, provider, model, value, onSave }: { open: boolean, onOpenChange: (o: boolean) => void, provider: string, model: string, value: ModelSettings, onSave: (v: ModelSettings) => void }) {
  const [rules, setRules] = useState<ParameterRule[] | null>(null)
  const [error, setError] = useState('')
  const [v, setV] = useState<ModelSettings>(value)
  useEffect(() => {
    setV(value)
    setRules(null)
    getParameterRules(provider, model).then(r => setRules(r.data.filter(x => x.type === 'float' || x.type === 'int'))).catch(e => setError(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, model])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="模型参数"
      description={`${model} · 关闭的参数使用模型默认值`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button variant="primary" onClick={() => { onSave(v); onOpenChange(false) }}>保存</Button></>}
    >
      {error && <p className="text-[13px] text-rose">{error}</p>}
      {!rules && !error && <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>}
      <div className="space-y-4">
        {rules?.map((r) => {
          const cur = v[r.name] as number | null | undefined
          const on = cur != null
          const step = r.type === 'int' ? 1 : 1 / 10 ** (r.precision ?? 1)
          return (
            <div key={r.name}>
              <div className="flex items-center gap-2.5">
                <Switch aria-label={tx(r.label)} checked={on} onCheckedChange={c => setV(x => ({ ...x, [r.name]: c ? (r.default as number ?? r.min ?? 0) : null }))} />
                <span className="text-[13.5px] font-medium">{tx(r.label)}</span>
                {r.help && tx(r.help) && <span className="truncate text-[12px] text-ink-3">{tx(r.help)}</span>}
                <input
                  type="number"
                  disabled={!on}
                  value={on ? cur : ''}
                  min={r.min}
                  max={r.max}
                  step={step}
                  onChange={e => setV(x => ({ ...x, [r.name]: Number(e.target.value) }))}
                  className="ml-auto h-8 w-20 rounded-xl border border-line-strong bg-hover px-2 text-right text-[13px] tabular-nums outline-none focus:border-volt disabled:opacity-40"
                />
              </div>
              <input type="range" aria-label={tx(r.label)} disabled={!on} min={r.min} max={r.max} step={step} value={on ? cur : (r.default as number ?? 0)} onChange={e => setV(x => ({ ...x, [r.name]: Number(e.target.value) }))} className="mt-2 w-full accent-[var(--volt)] disabled:opacity-30" />
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}
