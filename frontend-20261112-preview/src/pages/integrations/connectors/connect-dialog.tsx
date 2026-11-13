/* 一键接入：选择远程 / 本地方式，预填地址或命令，按认证方式生成凭证表单 */
import type { Connector, ConnectorField, McpTransport, ToolCollection } from '@/api/integrations'
import { RiCheckLine, RiEyeLine, RiEyeOffLine, RiGlobalLine, RiInformationLine, RiLoginCircleLine, RiShieldCheckLine, RiTerminalBoxLine } from '@remixicon/react'
import { useState } from 'react'
import { connectConnector, connectorFields, getConnectorOAuthUrl } from '@/api/integrations'
import { API_MODE } from '@/api/http'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { ChoiceCard } from '../kit'
import { splitArgs, transportLabel } from '../mcp/shared'
import { PublisherBadge } from './card'
import { AUTH, ConnectorTile, errText } from './shared'

type Mode = 'remote' | 'local'
const urlOk = (u: string) => /^https?:\/\/\S+$/i.test(u.trim())
const joinArgs = (args: string[]) => args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')

function SecretInput({ f, value, onChange, invalid }: { f: ConnectorField, value: string, onChange: (v: string) => void, invalid?: boolean }) {
  const [show, setShow] = useState(false)
  if (!f.secret)
    return <Input value={value} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} invalid={invalid} className="font-mono text-[13px]" />
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} autoComplete="off" value={value} onChange={e => onChange(e.target.value)} placeholder={f.placeholder ?? '粘贴密钥'} invalid={invalid} className="pr-10 font-mono text-[13px]" />
      <button type="button" aria-label={show ? '隐藏' : '显示'} onClick={() => setShow(s => !s)} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-hover hover:text-ink">
        {show ? <RiEyeOffLine className="size-4" /> : <RiEyeLine className="size-4" />}
      </button>
    </div>
  )
}

export function ConnectDialog({ connector: c, onClose, onConnected }: {
  connector: Connector | null
  onClose: () => void
  onConnected: (c: Connector, provider: ToolCollection) => void
}) {
  const toast = useToast()
  const [seen, setSeen] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('remote')
  const [url, setUrl] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [name, setName] = useState('')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [code, setCode] = useState<string | null>(null)
  const [authorizing, setAuthorizing] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 打开时按连接器回填
  if (c && seen !== c.id) {
    setSeen(c.id)
    setMode(c.remote ? 'remote' : 'local')
    setUrl(c.remote?.url ?? '')
    setCommand(c.local?.command ?? '')
    setArgs(joinArgs(c.local?.args ?? []))
    setName(c.name)
    setVals({})
    setCode(null)
    setTouched(false)
    setError(null)
    return null // 用回填后的状态立即重新渲染
  }
  if (!c && seen)
    setSeen(null)
  if (!c)
    return <Dialog open={false} onOpenChange={() => {}} title="" />

  const transport: McpTransport = mode === 'local' ? 'stdio' : c.remote!.transport
  const fields = connectorFields(c, transport)
  const oauth = mode === 'remote' && c.auth === 'oauth'
  const missing = fields.filter(f => f.required && !vals[f.key]?.trim())
  const targetOk = mode === 'local' ? !!command.trim() : urlOk(url)
  const valid = targetOk && name.trim() && !missing.length && (!oauth || !!code)

  const authorize = async () => {
    setAuthorizing(true)
    setError(null)
    try {
      const { authorization_url } = await getConnectorOAuthUrl(c.id)
      if (API_MODE === 'live')
        window.open(authorization_url, '_blank', 'noopener,width=520,height=680')
      else
        await new Promise(r => setTimeout(r, 900))
      setCode('authorized')
    }
    catch (e) {
      setError(e as Error)
    }
    finally {
      setAuthorizing(false)
    }
  }

  const submit = async () => {
    setTouched(true)
    if (!valid)
      return
    setBusy(true)
    setError(null)
    try {
      const provider = await connectConnector(c.id, {
        name: name.trim(),
        transport,
        ...(mode === 'local' ? { command: command.trim(), args: splitArgs(args) } : { server_url: url.trim() }),
        credentials: Object.fromEntries(fields.map(f => [f.key, vals[f.key]?.trim() ?? '']).filter(([, v]) => v)),
        authorization_code: oauth ? code ?? undefined : undefined,
      })
      toast(`已接入 ${c.name}，可在 Agent 中使用`)
      onConnected(c, provider)
      onClose()
    }
    catch (e) {
      setError(new Error(errText(e)))
    }
    finally {
      setBusy(false)
    }
  }

  const placeholderNote = (s: string) => /\{[A-Z0-9_]+\}/i.test(s) && <>其中 <span className="font-mono">{'{…}'}</span> 会替换成下方填写的值。</>

  return (
    <Dialog
      open
      onOpenChange={o => !o && onClose()}
      size="md"
      title={(
        <span className="flex items-center gap-3">
          <ConnectorTile c={c} size={36} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">连接 {c.name}<PublisherBadge c={c} /></span>
          </span>
        </span>
      )}
      description="接入后会出现在「已接入」，Agent 的工具列表里即可选用。"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{busy ? '连接中' : '连接'}</Button>
        </>
      )}
    >
      <div className="space-y-4 pb-2">
        {c.remote && c.local && (
          <div className="grid grid-cols-2 gap-2.5">
            <ChoiceCard on={mode === 'remote'} onClick={() => setMode('remote')} icon={<RiGlobalLine className="size-4" />} title="远程服务" desc={`连到服务商托管的地址（${transportLabel[c.remote.transport]}），无需部署`} />
            <ChoiceCard on={mode === 'local'} onClick={() => setMode('local')} icon={<RiTerminalBoxLine className="size-4" />} title="本地命令" desc="在 RaccoonX 服务端启动进程（stdio），适合内网与自建" />
          </div>
        )}

        {mode === 'remote'
          ? (
              <Field label="服务地址" required hint={<>{transportLabel[c.remote!.transport]}。{placeholderNote(url)}</>} error={touched && !urlOk(url) ? '请填写以 http:// 或 https:// 开头的完整地址' : undefined}>
                <Input value={url} onChange={e => setUrl(e.target.value)} invalid={touched && !urlOk(url)} className="font-mono text-[13px]" />
              </Field>
            )
          : (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] gap-3">
                <Field label="命令" required error={touched && !command.trim() ? '请填写命令' : undefined}>
                  <Input value={command} onChange={e => setCommand(e.target.value)} invalid={touched && !command.trim()} className="font-mono text-[13px]" />
                </Field>
                <Field label="参数" hint={placeholderNote(args) || '空格分隔，含空格的参数用双引号包住'}>
                  <Input value={args} onChange={e => setArgs(e.target.value)} className="font-mono text-[13px]" />
                </Field>
              </div>
            )}

        {oauth && (
          <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
            <span className={code ? 'text-mint' : 'text-cyan'}>{code ? <RiShieldCheckLine className="size-5" /> : <RiLoginCircleLine className="size-5" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">{code ? `已授权 ${c.name} 账号` : `用 ${c.name} 账号授权`}</p>
              <p className="text-[12px] text-ink-3">{code ? '连接后即可拉取工具。' : '会打开服务商的登录页，授权完成后回到这里继续。'}</p>
              {touched && !code && <p className="mt-0.5 text-[12px] text-rose">请先完成授权</p>}
            </div>
            {code
              ? <span className="flex items-center gap-1 text-[12.5px] font-medium text-mint"><RiCheckLine className="size-4" />已授权</span>
              : <Button variant="secondary" size="small" loading={authorizing} onClick={authorize}>授权</Button>}
          </div>
        )}

        {fields.length > 0 && (
          <div className="space-y-3 rounded-2xl border border-line p-4">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold">
              {(() => {
                const Icon = AUTH[c.auth === 'oauth' ? 'env' : c.auth].icon
                return <Icon className="size-4 text-amber" />
              })()}
              {mode === 'local' ? '环境变量与凭证' : '凭证'}
            </p>
            {fields.map(f => (
              <Field
                key={f.key}
                label={f.label}
                required={f.required}
                aside={<span className="font-mono">{f.key}</span>}
                hint={f.hint}
                error={touched && f.required && !vals[f.key]?.trim() ? `请填写${f.label}` : undefined}
              >
                <SecretInput f={f} value={vals[f.key] ?? ''} onChange={v => setVals(s => ({ ...s, [f.key]: v }))} invalid={touched && f.required && !vals[f.key]?.trim()} />
              </Field>
            ))}
            <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-3">
              <RiInformationLine className="mt-px size-3.5 shrink-0" />
              密钥只保存在服务端，保存后脱敏显示；建议使用权限受限的专用密钥。
            </p>
          </div>
        )}

        {!fields.length && !oauth && (
          <p className="flex items-center gap-1.5 rounded-2xl bg-mint-soft px-4 py-2.5 text-[12.5px] text-mint"><RiShieldCheckLine className="size-4" />这个连接器不需要凭证，点「连接」即可。</p>
        )}

        <Field label="名称" required hint="显示在「已接入」和 Agent 工具列表里" error={touched && !name.trim() ? '请填写名称' : undefined}>
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={40} invalid={touched && !name.trim()} />
        </Field>
        <ErrorBar error={error} />
      </div>
    </Dialog>
  )
}
