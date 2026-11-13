import type { MenuItem } from '@/components/ui/menu'
import type { AgentAppPartial, AgentDetail, AgentInfoPayload } from '@/api/agents'
import { RiDeleteBinLine, RiDownload2Line, RiEditLine, RiFileCopyLine, RiFileUploadLine, RiLink } from '@remixicon/react'
import { useEffect, useRef, useState } from 'react'
import { confirmImport, copyAgent, createAgent, deleteAgent, exportAgentDsl, importDsl, listReferencingWorkflows, updateAgent } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { AgentIcon, downloadText, errText, RACCOON_ICONS } from './shared'

/* ---------- 新建 / 编辑信息 / 复制 ---------- */
type InfoMode = 'create' | 'edit' | 'copy'
const titles: Record<InfoMode, string> = { create: '从空白创建 Agent', edit: '编辑信息', copy: '复制 Agent' }
const actions: Record<InfoMode, string> = { create: '创建', edit: '保存', copy: '复制' }

export function InfoDialog({ open, onOpenChange, mode, agent, onDone }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: InfoMode
  agent?: AgentAppPartial
  onDone: (a: AgentDetail) => void
}) {
  const toast = useToast()
  const [form, setForm] = useState<AgentInfoPayload>({ name: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open)
      return
    setTouched(false)
    setError('')
    setForm(agent
      ? { name: mode === 'copy' ? `${agent.name} 副本` : agent.name, role: agent.role ?? '', description: agent.description ?? '', icon_type: agent.icon_type ?? 'link', icon: agent.icon_url ?? agent.icon ?? RACCOON_ICONS[5], icon_background: agent.icon_background ?? null }
      : { name: '', role: '', description: '', icon_type: 'link', icon: RACCOON_ICONS[5] })
  }, [open, agent, mode])

  const nameErr = !form.name.trim() ? '请填写名称' : form.name.length > 255 ? '名称不能超过 255 个字符' : ''
  const submit = async () => {
    setTouched(true)
    if (nameErr)
      return
    setBusy(true)
    setError('')
    try {
      const body = { ...form, name: form.name.trim() }
      const res = mode === 'create' ? await createAgent(body) : mode === 'edit' ? await updateAgent(agent!.id, body) : await copyAgent(agent!.id, body)
      toast(mode === 'create' ? `已创建「${res.name}」` : mode === 'edit' ? '已保存' : `已复制为「${res.name}」`)
      onOpenChange(false)
      onDone(res)
    }
    catch (e) {
      setError(errText(e))
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={titles[mode]}
      description={mode === 'create' ? '先起个名字，能力配置进入 Agent 后再填。' : undefined}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button variant="primary" loading={busy} onClick={submit}>{actions[mode]}</Button></>}
    >
      <div className="space-y-4">
        <div className="flex gap-4">
          <AgentIcon agent={{ name: form.name || '?', icon: form.icon, icon_url: form.icon ?? null, icon_type: form.icon_type }} size={64} />
          <Field label="名称" required error={touched ? nameErr : undefined} className="flex-1" aside={`${form.name.length}/255`}>
            <Input autoFocus value={form.name} invalid={touched && !!nameErr} maxLength={255} placeholder="例如：翼飞客服 Agent" onChange={e => setForm(f => ({ ...f, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && submit()} />
          </Field>
        </div>
        <Field label="图标">
          <div className="grid max-h-64 grid-cols-8 gap-1.5 overflow-auto sm:grid-cols-12">
            {RACCOON_ICONS.map(src => (
              <button key={src} type="button" aria-label={`选择头像 ${src.split('/').pop()?.replace('.webp', '')}`} onClick={() => setForm(f => ({ ...f, icon: src, icon_type: 'link' }))} className={cn('cursor-pointer rounded-xl border p-0.5 transition-[border-color,transform] hover:scale-105', form.icon === src ? 'border-volt shadow-glow-volt' : 'border-transparent')}>
                <img src={asset(src)} alt="" className="aspect-square w-full rounded-[10px] object-cover" />
              </button>
            ))}
          </div>
        </Field>
        <Field label="角色" hint="一句话说明它在团队里的身份，例如「售后客服」「法务助理」。">
          <Input value={form.role ?? ''} placeholder="售后客服" onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
        </Field>
        <Field label="简介" aside={`${(form.description ?? '').length}/400`}>
          <Textarea rows={3} maxLength={400} value={form.description ?? ''} placeholder="它能做什么、适合谁用。助手和同事会根据简介决定什么时候调用它。" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </Field>
        {error && <p className="text-[12.5px] text-rose">{error}</p>}
      </div>
    </Dialog>
  )
}

/* ---------- 导入 DSL ---------- */
export function ImportDialog({ open, onOpenChange, onDone }: { open: boolean, onOpenChange: (o: boolean) => void, onDone: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState<'file' | 'url'>('file')
  const [file, setFile] = useState<{ name: string, text: string } | null>(null)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ id: string, from?: string, to?: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setUrl('')
      setName('')
      setError('')
      setPending(null)
    }
  }, [open])

  const finish = () => {
    toast('导入成功')
    onOpenChange(false)
    onDone()
  }
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await importDsl(tab === 'file' ? { mode: 'yaml-content', yaml_content: file!.text, name: name || undefined } : { mode: 'yaml-url', yaml_url: url.trim(), name: name || undefined })
      if (res.status === 'pending')
        setPending({ id: res.id, from: res.imported_dsl_version, to: res.current_dsl_version })
      else if (res.status === 'failed')
        setError(res.error || '导入失败，请检查 DSL 内容')
      else
        finish()
    }
    catch (e) {
      setError(errText(e))
    }
    finally {
      setBusy(false)
    }
  }
  const confirm = async () => {
    setBusy(true)
    try {
      await confirmImport(pending!.id)
      finish()
    }
    catch (e) {
      setError(errText(e))
      setPending(null)
    }
    finally {
      setBusy(false)
    }
  }

  const ready = tab === 'file' ? !!file : /^https?:\/\//.test(url.trim())
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="导入 DSL"
      description="从其他环境导出的 .yml 文件或公开地址导入 Agent。"
      footer={pending
        ? <><Button variant="ghost" onClick={() => setPending(null)}>返回</Button><Button variant="primary" loading={busy} onClick={confirm}>继续导入</Button></>
        : <><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button variant="primary" loading={busy} disabled={!ready} onClick={submit}>导入</Button></>}
    >
      {pending
        ? (
            <div className="rounded-2xl border border-amber/40 bg-amber-soft p-4 text-[13.5px] leading-relaxed">
              <p className="font-semibold text-amber">DSL 版本不一致</p>
              <p className="mt-1 text-ink-2">文件版本 {pending.from ?? '未知'}，当前平台版本 {pending.to ?? '未知'}。继续导入可能有部分配置无法识别，导入后请检查模型、工具和知识检索。</p>
            </div>
          )
        : (
            <div className="space-y-4">
              <Segmented value={tab} onValueChange={setTab} options={[{ value: 'file', label: '上传文件' }, { value: 'url', label: '从 URL 导入' }]} />
              {tab === 'file'
                ? (
                    <button
                      type="button"
                      onClick={() => input.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault()
                        const f = e.dataTransfer.files[0]
                        if (f)
                          setFile({ name: f.name, text: await f.text() })
                      }}
                      className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center transition-colors hover:border-volt hover:bg-hover"
                    >
                      <RiFileUploadLine className="size-7 text-ink-3" />
                      {file ? <p className="text-[13.5px] font-medium">{file.name}</p> : <p className="text-[13.5px] text-ink-2">拖入 .yml 文件，或点击选择</p>}
                      <p className="text-[12px] text-ink-3">支持 .yml / .yaml</p>
                      <input
                        ref={input}
                        type="file"
                        accept=".yml,.yaml"
                        hidden
                        onChange={async (e) => {
                          const f = e.target.files?.[0]
                          if (f)
                            setFile({ name: f.name, text: await f.text() })
                          e.target.value = ''
                        }}
                      />
                    </button>
                  )
                : (
                    <Field label="DSL 地址">
                      <div className="relative">
                        <RiLink className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
                        <Input className="pl-10" value={url} placeholder="https://example.com/agent.yml" onChange={e => setUrl(e.target.value)} />
                      </div>
                    </Field>
                  )}
              <Field label="名称" hint="留空则使用 DSL 里的名称。">
                <Input value={name} placeholder="可选" onChange={e => setName(e.target.value)} />
              </Field>
              {error && <p className="text-[12.5px] text-rose">{error}</p>}
            </div>
          )}
    </Dialog>
  )
}

/* ---------- 卡片 / 详情页共用的「⋯」操作 ---------- */
export function useAgentActions({ onChanged, onCopied, onDeleted }: { onChanged: (a: AgentDetail) => void, onCopied: (a: AgentDetail) => void, onDeleted: (id: string) => void }) {
  const toast = useToast()
  const [target, setTarget] = useState<AgentAppPartial | null>(null)
  const [mode, setMode] = useState<'edit' | 'copy' | 'delete' | null>(null)
  const [refs, setRefs] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const open = (a: AgentAppPartial, m: 'edit' | 'copy' | 'delete') => {
    setTarget(a)
    setMode(m)
    if (m === 'delete') {
      setRefs(null)
      listReferencingWorkflows(a.id).then(r => setRefs(r.data.length)).catch(() => setRefs(a.published_reference_count ?? 0))
    }
  }
  const doExport = async (a: AgentAppPartial) => {
    try {
      const { data } = await exportAgentDsl(a.app_id ?? a.id)
      downloadText(`${a.name}.yml`, data)
      toast(`已导出「${a.name}.yml」`)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
  }
  const doDelete = async () => {
    if (!target)
      return
    setBusy(true)
    try {
      await deleteAgent(target.id)
      toast(`已删除「${target.name}」`)
      setMode(null)
      onDeleted(target.id)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(false)
    }
  }

  const items = (a: AgentAppPartial): MenuItem[] => [
    { label: '编辑信息', icon: RiEditLine, onSelect: () => open(a, 'edit') },
    { label: '复制', icon: RiFileCopyLine, onSelect: () => open(a, 'copy') },
    { label: '导出 DSL', icon: RiDownload2Line, onSelect: () => doExport(a) },
    'separator',
    { label: '删除', icon: RiDeleteBinLine, danger: true, onSelect: () => open(a, 'delete') },
  ]

  const dialogs = (
    <>
      <InfoDialog
        open={mode === 'edit' || mode === 'copy'}
        onOpenChange={o => !o && setMode(null)}
        mode={mode === 'copy' ? 'copy' : 'edit'}
        agent={target ?? undefined}
        onDone={a => (mode === 'copy' ? onCopied(a) : onChanged(a))}
      />
      <ConfirmDialog
        open={mode === 'delete'}
        onOpenChange={o => !o && setMode(null)}
        danger
        loading={busy}
        title={`删除「${target?.name ?? ''}」？`}
        description={(
          <span className="block leading-relaxed">
            删除后不可恢复。它的 Web 应用、后端服务 API 会立即停止服务
            {refs ? <>，<b className="text-rose">{refs} 个引用它的应用</b>也会无法运行</> : refs === null ? '，正在检查引用它的应用…' : ''}
            。
          </span>
        )}
        confirmText="删除"
        onConfirm={doDelete}
      />
    </>
  )
  return { items, dialogs }
}
