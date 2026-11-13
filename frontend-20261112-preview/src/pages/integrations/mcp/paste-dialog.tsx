/* 粘贴配置 JSON 导入：前端解析 mcpServers，预览勾选后批量导入 */
import { RiErrorWarningLine } from '@remixicon/react'
import { useMemo, useState } from 'react'
import { importMcpServers } from '@/api/integrations'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { GroupTitle } from '../kit'
import { importedText } from './import-dialog'
import { parseMcpConfig, SAMPLE_CONFIG } from './parse-config'
import { ServerRow } from './server-row'
import { commandLine } from './shared'

export function PasteDialog({ open, onClose, onImported }: { open: boolean, onClose: () => void, onImported: () => void }) {
  const toast = useToast()
  const [wasOpen, setWasOpen] = useState(false)
  const [text, setText] = useState('')
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set())
  const [identity, setIdentity] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  if (open && !wasOpen) {
    setWasOpen(true)
    setText('')
    setUnpicked(new Set())
    setIdentity(false)
    setError(null)
  }
  if (!open && wasOpen)
    setWasOpen(false)

  const parsed = useMemo(() => parseMcpConfig(text), [text])
  const usable = parsed.servers.filter(s => !s.error)
  const chosen = usable.filter(s => !unpicked.has(s.spec.name))
  const toggle = (name: string, on: boolean) => setUnpicked((p) => {
    const n = new Set(p)
    if (on)
      n.delete(name)
    else
      n.add(name)
    return n
  })

  const submit = async () => {
    if (!chosen.length)
      return
    setBusy(true)
    setError(null)
    try {
      const r = await importMcpServers({ servers: chosen.map(s => s.spec), identity_mode: identity ? 'idp_token' : 'off' })
      toast(importedText(r))
      onImported()
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
      size="lg"
      title="粘贴配置导入"
      description="粘贴 Claude Code、Kiro、Cursor 等工具里的 mcpServers 配置，可以一次导入多个。"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} disabled={!chosen.length} onClick={submit}>{chosen.length ? `导入 ${chosen.length} 个` : '导入'}</Button>
        </>
      )}
    >
      <div className="space-y-4 pb-2">
        <Field
          label="配置 JSON"
          hint="支持 mcpServers、servers 写法，也可以只粘贴其中一段。密钥会随配置一起保存到服务端并脱敏显示。"
          error={parsed.error}
          aside={!text && <Button size="small" variant="ghost-accent" onClick={() => setText(SAMPLE_CONFIG)}>填入示例</Button>}
        >
          <Textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            spellCheck={false}
            rows={9}
            invalid={!!parsed.error}
            placeholder={'{\n  "mcpServers": {\n    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }\n  }\n}'}
            className="font-mono text-[12.5px] leading-relaxed"
          />
        </Field>

        {parsed.servers.length > 0 && (
          <div>
            <GroupTitle aside={<span className="text-[12px] text-ink-3">识别到 {parsed.servers.length} 个</span>}>预览</GroupTitle>
            <div className="space-y-1.5">
              {parsed.servers.map(({ spec, error: err, disabled }) => (
                <ServerRow
                  key={spec.name}
                  name={spec.name}
                  transport={spec.transport}
                  target={spec.server_url ?? commandLine(spec)}
                  keys={[...Object.keys(spec.env ?? {}), ...Object.keys(spec.headers ?? {})]}
                  checked={!unpicked.has(spec.name)}
                  onChange={on => toggle(spec.name, on)}
                  error={err}
                  note={disabled && !err && <Badge tone="amber" className="h-5 px-2 text-[11px]"><RiErrorWarningLine className="size-3" />原配置已停用</Badge>}
                />
              ))}
            </div>
          </div>
        )}

        {usable.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <div>
              <p className="text-[13.5px] font-medium">转发用户身份</p>
              <p className="text-[12px] text-ink-3">对本次导入的服务全部生效，之后可以逐个修改。</p>
            </div>
            <Switch aria-label="转发用户身份" checked={identity} onCheckedChange={setIdentity} />
          </div>
        )}
        <ErrorBar error={error} />
      </div>
    </Dialog>
  )
}
