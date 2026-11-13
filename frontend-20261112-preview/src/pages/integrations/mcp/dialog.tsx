/* 手动添加 / 编辑 MCP 服务：远程地址（Streamable HTTP / SSE）或服务端启动的命令（stdio） */
import type { KV } from '../kit'
import type { McpPayload, McpTransport, ToolCollection } from '@/api/integrations'
import { RiFingerprintLine } from '@remixicon/react'
import { useState } from 'react'
import { createMcp, updateMcp } from '@/api/integrations'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, NumberInput } from '@/components/ui/form'
import { RACCOON_ICONS } from '@/pages/agents/shared'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { KeyValueEditor, PluginTile } from '../kit'
import { splitArgs, toIdentifier, transportLabel, transportOf } from './shared'

export const EMOJIS = RACCOON_ICONS

export function IconPicker({ value, onChange, background }: { value: string, onChange: (v: string) => void, background?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" aria-label="选择小浣熊图标" onClick={() => setOpen(true)} className="cursor-pointer rounded-[14px] transition-transform hover:scale-105"><PluginTile icon={value} size={44} background={background} /></button>
    <Dialog open={open} onOpenChange={setOpen} title="选择小浣熊图标">
      <div className="grid max-h-[55vh] grid-cols-6 gap-2 overflow-y-auto p-1">
        {RACCOON_ICONS.map((src, i) => <button key={src} type="button" aria-label={`小浣熊 ${i + 1}`} aria-pressed={value === src} onClick={() => { onChange(src); setOpen(false) }} className="grid aspect-square place-items-center rounded-xl border border-line bg-glass-1 hover:border-volt aria-pressed:border-volt"><img src={src} alt="" loading="lazy" className="size-12 object-contain" /></button>)}
      </div>
    </Dialog>
  </>
}

const urlOk = (u: string) => /^https?:\/\/[^\s/$.?#].\S*$/i.test(u.trim())
const idOk = (s: string) => /^[a-z0-9_-]{1,24}$/.test(s)

export function McpDialog({ open, editing, onClose, onSaved }: { open: boolean, editing?: ToolCollection, onClose: () => void, onSaved: () => void }) {
  const toast = useToast()
  const [seen, setSeen] = useState<{ open: boolean, id?: string }>({ open: false })
  const [transport, setTransport] = useState<McpTransport>('streamable_http')
  const [url, setUrl] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [env, setEnv] = useState<KV[]>([])
  const [sidEdited, setSidEdited] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('/raccoon-emoji-v1/042-ai.webp')
  const [sid, setSid] = useState('')
  const [tab, setTab] = useState<'auth' | 'headers' | 'env' | 'config'>('auth')
  const [dcr, setDcr] = useState(true)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [headers, setHeaders] = useState<KV[]>([])
  const [timeout, setTimeoutVal] = useState(30)
  const [sse, setSse] = useState(300)
  const [identity, setIdentity] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 打开时按编辑对象回填
  if (open && (!seen.open || seen.id !== editing?.id)) {
    setSeen({ open: true, id: editing?.id })
    const t = editing ? transportOf(editing) : 'streamable_http'
    setTransport(t)
    setUrl(editing?.server_url ?? '')
    setCommand(editing?.command ?? '')
    setArgs((editing?.args ?? []).map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' '))
    setEnv(Object.entries(editing?.masked_env ?? {}).map(([key, value]) => ({ key, value })))
    setSidEdited(!!editing)
    setName(editing ? editing.name : '')
    setIcon(editing?.icon ?? '/raccoon-emoji-v1/042-ai.webp')
    setSid(editing?.server_identifier ?? '')
    setTab(t === 'stdio' ? 'env' : 'auth')
    setDcr(editing ? !!editing.is_dynamic_registration : true)
    setClientId(editing?.authentication?.client_id ?? '')
    setClientSecret(editing?.authentication?.client_secret ?? '')
    setHeaders(Object.entries(editing?.masked_headers ?? editing?.headers ?? {}).map(([key, value]) => ({ key, value })))
    setTimeoutVal(editing?.timeout ?? 30)
    setSse(editing?.sse_read_timeout ?? 300)
    setIdentity(editing?.identity_mode === 'idp_token')
    setTouched(false)
    setError(null)
  }
  if (!open && seen.open)
    setSeen({ open: false })

  const stdio = transport === 'stdio'
  const targetOk = stdio ? !!command.trim() : urlOk(url)
  const valid = targetOk && name.trim() && idOk(sid)
  const pickTransport = (t: McpTransport) => {
    setTransport(t)
    setTab(t === 'stdio' ? 'env' : 'auth')
  }
  const onName = (v: string) => {
    setName(v)
    if (!sidEdited)
      setSid(toIdentifier(v))
  }
  const save = async () => {
    setTouched(true)
    if (!valid)
      return
    setBusy(true)
    setError(null)
    const body: McpPayload = {
      name: name.trim(),
      transport,
      ...(stdio
        ? { command: command.trim(), args: splitArgs(args), env: Object.fromEntries(env.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value])) }
        : { server_url: url.trim() }),
      icon_type: 'emoji',
      icon,
      icon_background: '',
      server_identifier: sid,
      timeout,
      sse_read_timeout: sse,
      headers: stdio ? {} : Object.fromEntries(headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value])),
      is_dynamic_registration: stdio ? false : dcr,
      authentication: stdio || dcr ? null : { client_id: clientId, client_secret: clientSecret },
      identity_mode: identity ? 'idp_token' : 'off',
    }
    try {
      if (editing)
        await updateMcp({ ...body, provider_id: editing.id })
      else
        await createMcp(body)
      toast(editing ? 'MCP 服务已更新' : '已添加 MCP 服务，授权后即可获取工具')
      onSaved()
      onClose()
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
      onOpenChange={o => !o && onClose()}
      title={editing ? '编辑 MCP 服务' : '添加 MCP 服务'}
      description="填写远程服务地址，或在服务端启动的命令，把它提供的工具交给 Agent 使用。"
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={save}>{editing ? '保存' : '添加'}</Button></>}
    >
      <div className="space-y-4 pb-2">
        <Field label="连接方式">
          <Segmented
            size="small"
            value={transport}
            onValueChange={pickTransport}
            aria-label="连接方式"
            options={(['streamable_http', 'sse'] as const).map(v => ({ value: v, label: transportLabel[v] }))}
          />
        </Field>
        {stdio
          ? (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                <Field label="命令" required error={touched && !command.trim() ? '请填写要启动的命令' : undefined}>
                  <Input autoFocus value={command} onChange={e => setCommand(e.target.value)} placeholder="npx" invalid={touched && !command.trim()} className="font-mono text-[13px]" />
                </Field>
                <Field label="参数" hint="空格分隔，含空格的参数用双引号包住">
                  <Input value={args} onChange={e => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-github" className="font-mono text-[13px]" />
                </Field>
              </div>
            )
          : (
              <Field label="服务地址" required error={touched && !urlOk(url) ? '请填写以 http:// 或 https:// 开头的完整地址' : undefined}>
                <Input autoFocus value={url} onChange={e => setUrl(e.target.value)} placeholder={transport === 'sse' ? 'https://mcp.example.com/sse' : 'https://mcp.example.com/mcp'} invalid={touched && !urlOk(url)} className="font-mono text-[13px]" />
              </Field>
            )}
        <div className="flex items-end gap-3">
          <IconPicker value={icon} onChange={setIcon} />
          <Field label="名称" required className="flex-1" error={touched && !name.trim() ? '请填写名称' : undefined}>
            <Input value={name} onChange={e => onName(e.target.value)} placeholder="例如：销售 CRM" maxLength={40} invalid={touched && !name.trim()} />
          </Field>
        </div>
        <Field
          label="服务标识"
          required
          hint="工作区内唯一，Agent 调用工具时用它区分来源。只能包含小写字母、数字、- 和 _，最多 24 个字符。"
          error={touched && !idOk(sid) ? '格式不对：只能包含小写字母、数字、- 和 _' : undefined}
        >
          <Input value={sid} onChange={(e) => { setSid(e.target.value); setSidEdited(true) }} placeholder="sales-crm" disabled={!!editing} invalid={touched && !idOk(sid)} className="font-mono text-[13px]" />
        </Field>

        <Segmented
          value={tab}
          onValueChange={setTab}
          aria-label="高级设置"
          options={stdio
            ? [{ value: 'env', label: '环境变量', count: env.filter(h => h.key).length || undefined }, { value: 'config', label: '配置' }]
            : [{ value: 'auth', label: '认证' }, { value: 'headers', label: '请求头', count: headers.filter(h => h.key).length || undefined }, { value: 'config', label: '配置' }]}
        />
        {tab === 'env' && (
          <Field hint="命令启动时注入。密钥类的值保存后会脱敏显示，不修改就保持原值。">
            <KeyValueEditor rows={env} onChange={setEnv} keyPlaceholder="变量名，如 GITHUB_TOKEN" valuePlaceholder="值" />
          </Field>
        )}
        {tab === 'auth' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
              <div>
                <p className="text-[13.5px] font-medium">动态客户端注册</p>
                <p className="text-[12px] text-ink-3">服务端支持时自动注册 OAuth 客户端，无需手动填写。</p>
              </div>
              <Switch aria-label="动态客户端注册" checked={dcr} onCheckedChange={setDcr} />
            </div>
            {!dcr && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Client ID"><Input value={clientId} onChange={e => setClientId(e.target.value)} className="font-mono text-[13px]" /></Field>
                <Field label="Client Secret"><Input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder={editing ? '不修改请留空' : ''} className="font-mono text-[13px]" /></Field>
              </div>
            )}
          </div>
        )}
        {tab === 'headers' && (
          <Field hint="每次请求 MCP 服务时附带。敏感值保存后会脱敏显示。">
            <KeyValueEditor rows={headers} onChange={setHeaders} keyPlaceholder="Header 名称，如 Authorization" valuePlaceholder="值" />
          </Field>
        )}
        {tab === 'config' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="请求超时" hint={stdio ? '单次工具调用' : '单次 HTTP 请求'}><NumberInput value={timeout} onChange={setTimeoutVal} min={1} max={600} suffix="秒" /></Field>
            {!stdio && <Field label="SSE 读取超时" hint="流式连接保持时间"><NumberInput value={sse} onChange={setSse} min={1} max={3600} suffix="秒" /></Field>}
          </div>
        )}

        <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
          <RiFingerprintLine className="size-5 text-cyan" />
          <div className="flex-1">
            <p className="text-[13.5px] font-medium">转发用户身份（当前部署未启用）</p>
            <p className="text-[12px] text-ink-3">调用时携带当前用户的企业身份令牌，MCP 服务可按人做权限控制。</p>
          </div>
          <Switch aria-label="转发用户身份（当前部署未启用）" checked={identity} onCheckedChange={setIdentity} />
        </div>
        <ErrorBar error={error} />
      </div>
    </Dialog>
  )
}
