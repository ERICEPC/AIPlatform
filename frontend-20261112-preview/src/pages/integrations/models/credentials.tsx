/* 模型供应商凭据管理（列表 / 新增 / 编辑 / 删除 / 切换）+ 添加自定义模型 */
import type { FormValues, ModelProvider, ModelType } from '@/api/integrations'
import { RiAddLine, RiArrowLeftLine, RiCheckLine, RiDeleteBinLine, RiEditLine, RiKey2Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import {
  addCustomModel, addProviderCredential, deleteProviderCredential, getProviderCredential, listModelProviders, switchProviderCredential, tr, updateProviderCredential,
} from '@/api/integrations'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { errMsg, PluginTile } from '../kit'
import { initialValues, pickVisible, SchemaForm, validate } from '../schema-form'
import { modelTypeName } from './shared'

const schemaOf = (p: ModelProvider) => p.provider_credential_schema?.credential_form_schemas?.length
  ? p.provider_credential_schema.credential_form_schemas
  : (p.model_credential_schema?.credential_form_schemas ?? []).filter(s => s.variable !== 'display_name')

export function CredentialsDialog({ open, provider: initial, onClose }: { open: boolean, provider: ModelProvider, onClose: () => void }) {
  const toast = useToast()
  const [provider, setProvider] = useState(initial)
  const [view, setView] = useState<{ mode: 'list' } | { mode: 'add' } | { mode: 'edit', id: string }>({ mode: 'list' })
  const [name, setName] = useState('')
  const [values, setValues] = useState<FormValues>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadingForm, setLoadingForm] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const schema = schemaOf(provider)
  const ctx = { __model_type: 'llm' }
  const creds = provider.custom_configuration.available_credentials ?? []
  const current = provider.custom_configuration.current_credential_id
  useEffect(() => {
    if (open)
      setProvider(initial)
  }, [open, initial])

  const refresh = async () => {
    const { data } = await listModelProviders()
    const next = data.find(x => x.provider === provider.provider)
    if (next)
      setProvider(next)
  }
  const openForm = async (mode: 'add' | 'edit', id?: string, credName = '') => {
    setErrors({})
    setError(null)
    setName(mode === 'add' ? '' : credName)
    setView(mode === 'add' ? { mode } : { mode, id: id! })
    if (mode === 'add') {
      setValues(initialValues(schema))
      return
    }
    setLoadingForm(true)
    try {
      const r = await getProviderCredential(provider.provider, id)
      setValues(initialValues(schema, r.credentials))
    }
    catch (e) {
      setError(e as Error)
    }
    finally {
      setLoadingForm(false)
    }
  }
  const save = async () => {
    const errs = validate(schema, values, ctx)
    setErrors(errs)
    if (Object.keys(errs).length)
      return
    setBusy('save')
    setError(null)
    try {
      const credentials = pickVisible(schema, values, ctx)
      if (view.mode === 'edit')
        await updateProviderCredential(provider.provider, { credential_id: view.id, credentials, name: name.trim() || undefined })
      else
        await addProviderCredential(provider.provider, { credentials, name: name.trim() || undefined })
      toast(view.mode === 'edit' ? '凭据已更新' : '凭据已添加，模型可以使用了')
      await refresh()
      setView({ mode: 'list' })
    }
    catch (e) {
      setError(e as Error)
    }
    finally {
      setBusy(null)
    }
  }
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast(ok)
      await refresh()
    }
    catch (e) {
      toast(errMsg(e), 'info')
    }
    finally {
      setBusy(null)
      setConfirmDel(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => !o && (setView({ mode: 'list' }), onClose())}
      title={(
        <span className="flex items-center gap-2.5">
          {view.mode !== 'list' && <Button variant="ghost" size="icon-small" aria-label="返回列表" onClick={() => setView({ mode: 'list' })}><RiArrowLeftLine className="size-4" /></Button>}
          <PluginTile icon={provider.icon_small} size={26} />
          {view.mode === 'list' ? `${tr(provider.label)} 凭据` : view.mode === 'add' ? '添加凭据' : '编辑凭据'}
        </span>
      )}
      description={view.mode === 'list' ? '可以保存多条凭据（例如生产与备用 Key），同一时间使用其中一条；负载均衡可让多条轮流使用。' : '凭据加密保存，保存后不会再明文显示。'}
      footer={view.mode === 'list'
        ? <Button variant="primary" onClick={() => openForm('add')}><RiAddLine className="size-4" />添加凭据</Button>
        : <><Button variant="ghost" onClick={() => setView({ mode: 'list' })}>取消</Button><Button variant="primary" loading={busy === 'save'} onClick={save}>保存</Button></>}
    >
      {view.mode === 'list'
        ? creds.length === 0
          ? <EmptyState icon={<RiKey2Line className="size-5" />} title="还没有凭据" hint={`在 ${tr(provider.label)} 控制台创建 API Key，添加后即可使用它的模型。`} />
          : (
              <div className="space-y-2 pb-2">
                {creds.map(c => (
                  <div key={c.credential_id} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
                    <RiKey2Line className="size-4 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{c.credential_name}</span>
                    {confirmDel === c.credential_id
                      ? (
                          <>
                            <span className="text-[12.5px] text-rose">确定删除？</span>
                            <Button size="small" variant="ghost" onClick={() => setConfirmDel(null)}>取消</Button>
                            <Button size="small" variant="primary" tone="destructive" loading={busy === c.credential_id} onClick={() => act(c.credential_id, () => deleteProviderCredential(provider.provider, c.credential_id), '凭据已删除')}>删除</Button>
                          </>
                        )
                      : (
                          <>
                            {current === c.credential_id
                              ? <Badge tone="mint"><RiCheckLine className="size-3.5" />使用中</Badge>
                              : <Button size="small" variant="outline" loading={busy === `sw-${c.credential_id}`} onClick={() => act(`sw-${c.credential_id}`, () => switchProviderCredential(provider.provider, c.credential_id), `已切换到「${c.credential_name}」`)}>设为使用中</Button>}
                            <Button size="icon-small" variant="ghost" aria-label="编辑" onClick={() => openForm('edit', c.credential_id, c.credential_name)}><RiEditLine className="size-4" /></Button>
                            <Button size="icon-small" variant="ghost" tone="destructive" aria-label="删除" onClick={() => setConfirmDel(c.credential_id)}><RiDeleteBinLine className="size-4" /></Button>
                          </>
                        )}
                  </div>
                ))}
              </div>
            )
        : loadingForm
          ? <div className="space-y-4 pb-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-[68px] rounded-2xl" />)}</div>
          : (
              <div className="space-y-4 pb-2">
                <Field label="凭据名称" hint="方便区分多条凭据，例如「生产环境」「备用 Key」。">
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="不填则自动命名" maxLength={40} />
                </Field>
                <SchemaForm schemas={schema} values={values} onChange={setValues} errors={errors} context={ctx} />
                <ErrorBar error={error} />
              </div>
            )}
    </Dialog>
  )
}

export function AddModelDialog({ open, provider, onClose }: { open: boolean, provider: ModelProvider, onClose: (added: boolean) => void }) {
  const toast = useToast()
  const schema = provider.model_credential_schema?.credential_form_schemas ?? []
  const [type, setType] = useState<ModelType>(provider.supported_model_types[0] ?? 'llm')
  const [model, setModel] = useState('')
  const [name, setName] = useState('')
  const [values, setValues] = useState<FormValues>(() => initialValues(schema))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const ctx = { __model_type: type }
  const close = (added: boolean) => {
    onClose(added)
    setTimeout(() => { setModel(''); setName(''); setValues(initialValues(schema)); setErrors({}); setError(null) }, 250)
  }
  const save = async () => {
    const errs = validate(schema, values, ctx)
    if (!model.trim())
      errs.__model = '请填写模型名称'
    setErrors(errs)
    if (Object.keys(errs).length)
      return
    setBusy(true)
    setError(null)
    try {
      await addCustomModel(provider.provider, { model: model.trim(), model_type: type, credentials: pickVisible(schema, values, ctx), name: name.trim() || undefined })
      toast(`已添加 ${model.trim()}`)
      close(true)
    }
    catch (e) {
      setError(e as Error)
    }
    finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={o => !o && close(false)}
      title={`添加模型 · ${tr(provider.label)}`}
      description="填写服务端部署的模型名称和访问方式，保存时会校验连通性。"
      footer={<><Button variant="ghost" onClick={() => close(false)}>取消</Button><Button variant="primary" loading={busy} onClick={save}>保存</Button></>}
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <Field label="模型类型" required>
            <Select value={type} onValueChange={setType} options={provider.supported_model_types.map(t => ({ value: t, label: modelTypeName[t] }))} />
          </Field>
          <Field label={tr(provider.model_credential_schema?.model.label) || '模型名称'} required error={errors.__model}>
            <Input value={model} onChange={e => setModel(e.target.value)} placeholder={tr(provider.model_credential_schema?.model.placeholder)} invalid={!!errors.__model} className="font-mono text-[13px]" />
          </Field>
        </div>
        <Field label="凭据名称"><Input value={name} onChange={e => setName(e.target.value)} placeholder="不填则自动命名" maxLength={40} /></Field>
        <SchemaForm schemas={schema} values={values} onChange={setValues} errors={errors} context={ctx} />
        <ErrorBar error={error} />
      </div>
    </Dialog>
  )
}
