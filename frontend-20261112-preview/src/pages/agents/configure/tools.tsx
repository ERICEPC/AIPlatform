import type { CliTool, EnvVariable, RuntimeValue, SoulTool, ToolAction, ToolProvider } from '@/api/agents'
import { RiAddLine, RiArrowDownSLine, RiCheckLine, RiDeleteBinLine, RiEditLine, RiErrorWarningLine, RiSearchLine, RiTerminalBoxLine, RiToolsLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, NumberInput, Select } from '@/components/ui/form'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { AddButton, ConfigCard, IconBtn, Row, tx } from '../shared'
import { useConfig } from './context'

type Tab = 'all' | 'builtin' | 'workflow' | 'api' | 'mcp'
const TYPE_LABEL: Record<string, string> = { builtin: '插件', plugin: '插件', workflow: '应用', api: '自定义 API', mcp: 'MCP' }
const keyOf = (t: { provider_id: string, tool_name: string }) => `${t.provider_id}/${t.tool_name}`

/** 凭据是否就绪：以工具目录里的授权状态为准，目录没有时看配置里的 credential_type */
export function authorized(t: SoulTool, tools: ToolProvider[]) {
  const p = tools.find(x => x.id === t.provider_id)
  return p ? p.is_team_authorization : t.credential_type !== 'unauthorized'
}

export function ToolsSection({ go }: { go: (p: string) => void }) {
  const { soul, update, changed, tools: catalog } = useConfig()
  const list = soul.tools?.dify_tools ?? []
  const cli = soul.tools?.cli_tools ?? []
  const [picker, setPicker] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<SoulTool | null>(null)
  const [cliEdit, setCliEdit] = useState<{ index: number, tool: CliTool } | null>(null)

  const groups = useMemo(() => {
    const m = new Map<string, SoulTool[]>()
    list.forEach(t => m.set(t.provider_id, [...(m.get(t.provider_id) ?? []), t]))
    return [...m.entries()]
  }, [list])

  const setPlatformTools = (fn: (l: SoulTool[]) => SoulTool[]) => update(s => ({ ...s, tools: { ...s.tools, dify_tools: fn(s.tools?.dify_tools ?? []) } }))
  const setCli = (fn: (l: CliTool[]) => CliTool[]) => update(s => ({ ...s, tools: { ...s.tools, cli_tools: fn(s.tools?.cli_tools ?? []) } }))
  const unauth = groups.filter(([, ts]) => !authorized(ts[0], catalog)).length

  return (
    <ConfigCard
      id="sec-tools"
      icon={RiToolsLine}
      title="工具"
      count={list.length + cli.length}
      changed={changed.has('tools')}
      hint={list.length + cli.length ? (unauth ? <span className="text-amber">{unauth} 个工具未授权，发布前需要完成授权。</span> : undefined) : '让 Agent 能查询系统、调用工具、执行命令。'}
      actions={(
        <>
          <Button variant="ghost" size="small" onClick={() => setCliEdit({ index: -1, tool: { name: '', install_command: '', env: { variables: [] }, enabled: true } })}><RiTerminalBoxLine className="size-3.5" />CLI 工具</Button>
          <AddButton onClick={() => setPicker(true)} />
        </>
      )}
    >
      <div className="space-y-1.5">
        {groups.map(([pid, ts]) => {
          const p = catalog.find(x => x.id === pid)
          const ok = authorized(ts[0], catalog)
          const expanded = open === pid
          return (
            <div key={pid} className="rounded-2xl border border-line">
              <div role="button" tabIndex={0} onClick={() => setOpen(expanded ? null : pid)} onKeyDown={e => e.key === 'Enter' && setOpen(expanded ? null : pid)} className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                {p ? <img src={asset(p.icon)} alt="" className="size-8 rounded-lg border border-line object-cover" /> : <span className="grid size-8 place-items-center rounded-lg bg-hover"><RiToolsLine className="size-4" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13.5px] font-medium">{p ? tx(p.label) : pid}<span className="text-[11.5px] font-normal text-ink-3">{TYPE_LABEL[ts[0].provider_type]}</span></p>
                  <p className="truncate text-[12px] text-ink-3">{ts.map(t => t.name || t.tool_name).join('、')}</p>
                </div>
                {ok
                  ? <Badge tone="mint">已授权</Badge>
                  : <button type="button" onClick={(e) => { e.stopPropagation(); go('integrations/tools') }} className="cursor-pointer"><Badge tone="amber"><RiErrorWarningLine className="size-3.5" />未授权 · 去授权</Badge></button>}
                <RiArrowDownSLine className={cn('size-4 text-ink-3 transition-transform', expanded && 'rotate-180')} />
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                    <div className="space-y-0.5 border-t border-line p-1.5">
                      {ts.map(t => (
                        <Row
                          key={keyOf(t)}
                          title={t.name || t.tool_name}
                          sub={Object.entries(t.runtime_parameters ?? {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${v}`).join(' · ') || '默认参数'}
                          right={(
                            <>
                              <Switch aria-label="启用" checked={t.enabled !== false} onCheckedChange={c => setPlatformTools(l => l.map(x => (keyOf(x) === keyOf(t) ? { ...x, enabled: c } : x)))} />
                              <IconBtn label="编辑参数" onClick={() => setEdit(t)}><RiEditLine className="size-4" /></IconBtn>
                              <IconBtn label="移除" danger onClick={() => setPlatformTools(l => l.filter(x => keyOf(x) !== keyOf(t)))}><RiDeleteBinLine className="size-4" /></IconBtn>
                            </>
                          )}
                        />
                      ))}
                      <div className="flex justify-end px-1 pt-1">
                        <Button variant="ghost" size="small" tone="destructive" onClick={() => setPlatformTools(l => l.filter(x => x.provider_id !== pid))}>移除全部</Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
        {cli.map((c, i) => (
          <Row
            key={c.id ?? `${c.name}-${i}`}
            className="rounded-2xl border border-line"
            icon={<RiTerminalBoxLine className="size-4 text-ink-2" />}
            title={<span className="flex items-center gap-2">{c.name}<span className="text-[11.5px] text-ink-3">CLI 工具</span></span>}
            sub={<span className="font-mono">{c.install_command || '无需安装'}</span>}
            onClick={() => setCliEdit({ index: i, tool: c })}
            right={<IconBtn label="移除" danger onClick={() => setCli(l => l.filter((_, j) => j !== i))}><RiDeleteBinLine className="size-4" /></IconBtn>}
          />
        ))}
      </div>

      <ToolPicker open={picker} onOpenChange={setPicker} added={new Set(list.map(keyOf))} onAdd={add => setPlatformTools(l => [...l, ...add])} />
      {edit && <ParamsDialog tool={edit} onClose={() => setEdit(null)} onSave={v => setPlatformTools(l => l.map(x => (keyOf(x) === keyOf(edit) ? { ...x, runtime_parameters: v } : x)))} />}
      {cliEdit && (
        <CliDialog
          value={cliEdit.tool}
          isNew={cliEdit.index < 0}
          onClose={() => setCliEdit(null)}
          onSave={t => setCli(l => (cliEdit.index < 0 ? [...l, { ...t, id: `cli-${Date.now().toString(36)}` }] : l.map((x, j) => (j === cliEdit.index ? t : x))))}
        />
      )}
    </ConfigCard>
  )
}

function ToolPicker({ open, onOpenChange, added, onAdd }: { open: boolean, onOpenChange: (o: boolean) => void, added: Set<string>, onAdd: (t: SoulTool[]) => void }) {
  const { tools } = useConfig()
  const [tab, setTab] = useState<Tab>('all')
  const [kw, setKw] = useState('')
  const [sel, setSel] = useState<Map<string, SoulTool>>(new Map())
  const [exp, setExp] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setSel(new Map())
      setKw('')
    }
  }, [open])

  const shown = tools.filter(p => (tab === 'all' || p.type === tab) && (!kw || `${tx(p.label)} ${p.tools.map(t => tx(t.label)).join(' ')}`.toLowerCase().includes(kw.toLowerCase())))
  const make = (p: ToolProvider, a: ToolAction): SoulTool => ({
    provider_type: p.type,
    provider_id: p.id,
    provider: p.name,
    tool_name: a.name,
    name: tx(a.label),
    enabled: true,
    credential_type: p.is_team_authorization ? 'api-key' : 'unauthorized',
    runtime_parameters: Object.fromEntries((a.parameters ?? []).filter(x => x.form === 'form').map(x => [x.name, x.default ?? null])),
  })
  const toggle = (p: ToolProvider, a: ToolAction) => setSel((m) => {
    const n = new Map(m)
    const k = `${p.id}/${a.name}`
    if (n.has(k))
      n.delete(k)
    else
      n.set(k, make(p, a))
    return n
  })
  const count = (tab2: Tab) => tools.filter(p => tab2 === 'all' || p.type === tab2).length

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="添加工具"
      footer={(
        <>
          <span className="mr-auto self-center text-[12.5px] text-ink-3">已选 <b className="text-ink tabular-nums">{sel.size}</b> 个动作</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" disabled={!sel.size} onClick={() => { onAdd([...sel.values()]); onOpenChange(false) }}>添加</Button>
        </>
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Segmented size="small" value={tab} onValueChange={setTab} options={(['all', 'builtin', 'workflow', 'api', 'mcp'] as Tab[]).map(v => ({ value: v, label: v === 'all' ? '全部' : TYPE_LABEL[v], count: count(v) }))} />
        <label className="glass-1 ml-auto flex h-9 w-[200px] items-center gap-2 rounded-full px-3.5 text-ink-3 focus-within:border-volt">
          <RiSearchLine className="size-4" />
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索工具" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
        </label>
      </div>
      {tools.length === 0 && <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14" />)}</div>}
      {tools.length > 0 && shown.length === 0 && <p className="py-10 text-center text-[13px] text-ink-3">没有匹配的工具。可以到「集成 · 工具」接入新的工具。</p>}
      <div className="space-y-1.5">
        {shown.map((p) => {
          const picked = p.tools.filter(a => sel.has(`${p.id}/${a.name}`)).length
          const isOpen = exp === p.id || !!kw
          return (
            <div key={p.id} className="rounded-2xl border border-line">
              <button type="button" onClick={() => setExp(isOpen && !kw ? null : p.id)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left">
                <img src={asset(p.icon)} alt="" className="size-8 rounded-lg border border-line object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium">{tx(p.label)}<span className="text-[11.5px] font-normal text-ink-3">{TYPE_LABEL[p.type]} · {p.author}</span></span>
                  <span className="block truncate text-[12px] text-ink-3">{tx(p.description)}</span>
                </span>
                {!p.is_team_authorization && <Badge tone="amber">未授权</Badge>}
                {picked > 0 && <Badge tone="volt">已选 {picked}</Badge>}
                <span className="text-[12px] text-ink-3">{p.tools.length} 个动作</span>
                <RiArrowDownSLine className={cn('size-4 text-ink-3 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="grid grid-cols-2 gap-1.5 border-t border-line p-2">
                  {p.tools.map((a) => {
                    const k = `${p.id}/${a.name}`
                    const has = added.has(k)
                    const on = has || sel.has(k)
                    return (
                      <button key={k} type="button" disabled={has} onClick={() => toggle(p, a)} className={cn('flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-default disabled:opacity-55', on ? 'border-volt/60 bg-volt-soft' : 'border-transparent hover:bg-hover')}>
                        <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded border', on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong')}>{on && <RiCheckLine className="size-3" />}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium">{tx(a.label)}{has && <span className="ml-1.5 text-[11.5px] font-normal text-ink-3">已添加</span>}</span>
                          <span className="line-clamp-1 block text-[12px] text-ink-3">{tx(a.description)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}

function ParamsDialog({ tool, onClose, onSave }: { tool: SoulTool, onClose: () => void, onSave: (v: Record<string, RuntimeValue>) => void }) {
  const { tools } = useConfig()
  const action = tools.find(p => p.id === tool.provider_id)?.tools.find(a => a.name === tool.tool_name)
  const params = (action?.parameters ?? []).filter(p => p.form === 'form')
  const [v, setV] = useState<Record<string, RuntimeValue>>(tool.runtime_parameters ?? {})
  return (
    <Dialog
      open
      onOpenChange={o => !o && onClose()}
      title={`编辑参数 · ${tool.name || tool.tool_name}`}
      description="这里设置的是固定参数；其余参数由 Agent 在调用时根据对话推断。"
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={() => { onSave(v); onClose() }}>保存</Button></>}
    >
      {params.length === 0 && <p className="py-6 text-center text-[13px] text-ink-3">这个动作没有需要固定的参数，全部由 Agent 推断。</p>}
      <div className="space-y-4">
        {params.map(p => (
          <Field key={p.name} label={tx(p.label)} required={p.required} hint={p.human_description ? tx(p.human_description) : undefined}>
            {p.type === 'select'
              ? <Select value={String(v[p.name] ?? '')} onValueChange={x => setV(o => ({ ...o, [p.name]: x }))} options={(p.options ?? []).map(o => ({ value: o.value, label: tx(o.label) }))} />
              : p.type === 'boolean'
                ? <Switch aria-label={tx(p.label)} checked={!!v[p.name]} onCheckedChange={c => setV(o => ({ ...o, [p.name]: c }))} />
                : p.type === 'number'
                  ? <NumberInput value={Number(v[p.name] ?? 0)} onChange={n => setV(o => ({ ...o, [p.name]: n }))} />
                  : <Input type={p.type === 'secret-input' ? 'password' : 'text'} value={String(v[p.name] ?? '')} onChange={e => setV(o => ({ ...o, [p.name]: e.target.value }))} />}
          </Field>
        ))}
      </div>
    </Dialog>
  )
}

function CliDialog({ value, isNew, onClose, onSave }: { value: CliTool, isNew: boolean, onClose: () => void, onSave: (t: CliTool) => void }) {
  const [t, setT] = useState<CliTool>(value)
  const [touched, setTouched] = useState(false)
  const vars = t.env?.variables ?? []
  const setVars = (fn: (l: EnvVariable[]) => EnvVariable[]) => setT(x => ({ ...x, env: { ...x.env, variables: fn(x.env?.variables ?? []) } }))
  const err = !t.name.trim() ? '请填写工具名称' : !/^[\w.-]+$/.test(t.name.trim()) ? '只能包含字母、数字、下划线、点和短横线' : ''
  return (
    <Dialog
      open
      onOpenChange={o => !o && onClose()}
      title={isNew ? '添加 CLI 工具' : '编辑 CLI 工具'}
      description="在 Agent 的运行环境里安装命令行工具，Agent 可以直接调用。"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => { setTouched(true); if (!err) { onSave({ ...t, name: t.name.trim(), env: { variables: vars.filter(x => x.key.trim()) } }); onClose() } }}>{isNew ? '添加' : '保存'}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label="名称" required error={touched ? err : undefined}>
          <Input value={t.name} placeholder="例如 jq" invalid={touched && !!err} onChange={e => setT(x => ({ ...x, name: e.target.value }))} />
        </Field>
        <Field label="安装命令" hint="留空表示运行环境已自带。">
          <Input className="font-mono text-[13px]" value={t.install_command ?? ''} placeholder="apt-get install -y jq" onChange={e => setT(x => ({ ...x, install_command: e.target.value }))} />
        </Field>
        <Field label="环境变量" aside={<button type="button" className="cursor-pointer text-volt-text hover:underline" onClick={() => setVars(l => [...l, { key: '', value: '' }])}><RiAddLine className="inline size-3.5" />添加</button>}>
          {vars.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[12.5px] text-ink-3">没有环境变量</p>}
          <div className="space-y-2">
            {vars.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="h-9 font-mono text-[13px]" placeholder="KEY" value={x.key} onChange={e => setVars(l => l.map((y, j) => (j === i ? { ...y, key: e.target.value } : y)))} />
                <Input className="h-9 font-mono text-[13px]" placeholder="value" value={x.value} onChange={e => setVars(l => l.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} />
                <IconBtn label="删除" danger onClick={() => setVars(l => l.filter((_, j) => j !== i))}><RiDeleteBinLine className="size-4" /></IconBtn>
              </div>
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  )
}
