/* 从其他工具导入：扫描 Claude Code / Kiro / Codex / Cursor 已配置的 MCP 服务器，勾选后批量导入 */
import type { McpImportResult, McpImportScan } from '@/api/integrations'
import { RiCheckLine, RiFileCodeLine, RiRefreshLine } from '@remixicon/react'
import { useState } from 'react'
import { importMcpServers, scanMcpImports } from '@/api/integrations'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { PluginTile } from '../kit'
import { Check, ServerRow } from './server-row'
import { commandLine, sourceIcon } from './shared'

/** 导入完成的提示文案 */
export const importedText = (r: McpImportResult) =>
  `已导入 ${r.imported.length} 个 MCP 服务${r.skipped.length ? `，跳过 ${r.skipped.length} 个已接入的` : ''}，授权后即可使用`

export function ImportDialog({ open, onClose, onImported, onPaste }: { open: boolean, onClose: () => void, onImported: () => void, onPaste: () => void }) {
  const toast = useToast()
  const [wasOpen, setWasOpen] = useState(false)
  const [scan, setScan] = useState<McpImportScan | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<Error | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [identity, setIdentity] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const run = async () => {
    setScanning(true)
    setScanError(null)
    setError(null)
    try {
      const r = await scanMcpImports()
      setScan(r)
      // 默认勾选所有未接入的
      setPicked(new Set(r.sources.flatMap(s => s.servers.filter(x => !x.imported).map(x => x.ref))))
    }
    catch (e) {
      setScanError(e as Error)
    }
    finally {
      setScanning(false)
    }
  }
  // 每次打开都重新扫描
  if (open && !wasOpen) {
    setWasOpen(true)
    setScan(null)
    setPicked(new Set())
    setIdentity(false)
    void run()
  }
  if (!open && wasOpen)
    setWasOpen(false)

  const toggle = (refs: string[], on: boolean) => setPicked((p) => {
    const n = new Set(p)
    refs.forEach(r => (on ? n.add(r) : n.delete(r)))
    return n
  })

  const submit = async () => {
    if (!scan || !picked.size)
      return
    setBusy(true)
    setError(null)
    try {
      const r = await importMcpServers({ scan_id: scan.scan_id, refs: [...picked], identity_mode: identity ? 'idp_token' : 'off' })
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

  const found = scan?.sources.reduce((n, s) => n + s.servers.length, 0) ?? 0

  return (
    <Dialog
      open={open}
      onOpenChange={o => !o && onClose()}
      size="lg"
      title="从其他工具导入"
      description={scan?.device ? `已扫描 ${scan.device} 上的 Claude Code、Kiro、Codex、Cursor 配置，选择要导入的 MCP 服务器。` : '读取本机 Claude Code、Kiro、Codex、Cursor 已配置的 MCP 服务器。'}
      footer={(
        <>
          <Button variant="ghost" onClick={onPaste} className="mr-auto"><RiFileCodeLine className="size-4" />改为粘贴配置</Button>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} disabled={!picked.size || scanning} onClick={submit}>{picked.size ? `导入 ${picked.size} 个` : '导入'}</Button>
        </>
      )}
    >
      <div className="space-y-5 pb-2">
        {scanning && (
          <div className="space-y-2">
            <p className="text-[12.5px] text-ink-3">正在读取本机各工具的配置文件…</p>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[62px] rounded-2xl" />)}
          </div>
        )}
        {!scanning && scanError && (
          <div className="space-y-3">
            <ErrorBar error={scanError} onRetry={run} />
            <p className="text-[12.5px] leading-relaxed text-ink-3">扫描需要本机打开 RaccoonX 助手。也可以复制工具里的 mcpServers 配置，用「改为粘贴配置」导入。</p>
          </div>
        )}
        {!scanning && scan && (
          <>
            {found === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">这几个工具里都没有配置 MCP 服务器。</p>}
            {scan.sources.map((s) => {
              const free = s.servers.filter(x => !x.imported).map(x => x.ref)
              const n = free.filter(r => picked.has(r)).length
              return (
                <section key={s.source}>
                  <div className="mb-2 flex items-center gap-2.5">
                    <PluginTile icon={sourceIcon[s.source]} size={26} />
                    <p className="text-[13.5px] font-semibold">{s.label}</p>
                    <span className="truncate font-mono text-[11.5px] text-ink-3">{s.config_path}</span>
                    <span className="flex-1" />
                    {!s.detected
                      ? <Badge className="h-5 px-2 text-[11px]">未检测到</Badge>
                      : free.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-2">
                          <Check checked={n === free.length} indeterminate={n > 0 && n < free.length} onChange={on => toggle(free, on)} label={`全选 ${s.label}`} />
                          全选
                        </label>
                      )}
                  </div>
                  {s.detected && !s.servers.length && <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[12.5px] text-ink-3">没有配置 MCP 服务器</p>}
                  <div className="space-y-1.5">
                    {s.servers.map(x => (
                      <ServerRow
                        key={x.ref}
                        name={x.name}
                        transport={x.transport}
                        target={x.server_url ?? commandLine(x)}
                        keys={[...(x.env_keys ?? []), ...(x.header_keys ?? [])]}
                        checked={picked.has(x.ref)}
                        onChange={on => toggle([x.ref], on)}
                        status={x.imported && <Badge tone="mint" className="h-5 px-2 text-[11px]"><RiCheckLine className="size-3" />已接入</Badge>}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
            {found > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-medium">转发用户身份</p>
                  <p className="text-[12px] text-ink-3">对本次导入的服务全部生效，之后可以逐个修改。</p>
                </div>
                <Switch aria-label="转发用户身份" checked={identity} onCheckedChange={setIdentity} />
              </div>
            )}
            <div className="flex items-center gap-2 text-[12px] text-ink-3">
              <span>密钥类的环境变量和请求头只在服务端流转，不会显示在这里。</span>
              <span className="flex-1" />
              <Button size="small" variant="ghost" onClick={run}><RiRefreshLine className="size-3.5" />重新扫描</Button>
            </div>
          </>
        )}
        <ErrorBar error={error} />
      </div>
    </Dialog>
  )
}
