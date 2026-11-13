import type { ChannelQrPoll, ChannelType, MessageChannel } from '@/api/agents'
import { RiCheckboxCircleFill, RiDeleteBinLine, RiQrCodeLine, RiRefreshLine, RiSettings3Line } from '@remixicon/react'
import { useEffect, useRef, useState } from 'react'
import { configureChannel, createChannel, deleteChannel, getChannelQr, listChannels, pollChannelQr, setChannelEnabled } from '@/api/agents'
import { useQuery } from '@/api/hooks'
import { Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form'
import { Badge, Panel, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { errText, fromNow, IconBtn } from './shared'

const PLATFORMS: { type: ChannelType, name: string, mark: string, tone: string, desc: string, fields: { key: string, label: string, placeholder: string }[] }[] = [
  { type: 'wecom', name: '企业微信', mark: '企', tone: 'bg-cyan-soft text-cyan', desc: '企业微信智能机器人，支持单聊和群聊', fields: [{ key: 'bot_id', label: 'Bot ID', placeholder: '企业微信智能机器人的 Bot ID' }, { key: 'secret', label: 'Secret', placeholder: '企业微信智能机器人 Secret' }] },
  { type: 'feishu', name: '飞书', mark: '飞', tone: 'bg-volt-soft text-volt-text', desc: '飞书应用机器人，支持单聊和群聊', fields: [{ key: 'app_id', label: 'App ID', placeholder: 'cli_...' }, { key: 'app_secret', label: 'App Secret', placeholder: '飞书应用的 App Secret' }] },
  { type: 'dingtalk', name: '钉钉', mark: '钉', tone: 'bg-amber-soft text-amber', desc: '钉钉 Stream 机器人，支持单聊和群聊', fields: [{ key: 'client_id', label: 'Client ID', placeholder: '钉钉应用 Client ID' }, { key: 'client_secret', label: 'Client Secret', placeholder: '钉钉应用 Client Secret' }] },
  { type: 'wechat', name: '微信', mark: '微', tone: 'bg-mint-soft text-mint', desc: '微信 ClawBot，扫码绑定明确授权的个人账号', fields: [] },
]
const POLL_TEXT: Record<ChannelQrPoll['status'], string> = { waiting: '等待扫码', scanned: '已扫码，请在手机上确认', confirmed: '绑定成功', expired: '二维码已过期' }

type Platform = typeof PLATFORMS[number]
function BindDialog({ agentId, platform, channel, onClose, onBound }: { agentId: string, platform: Platform, channel: MessageChannel | null, onClose: () => void, onBound: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(channel?.name ?? `${platform.name}渠道`)
  const [cid, setCid] = useState(channel?.id ?? null)
  const [revision, setRevision] = useState(channel?.revision ?? 0)
  const [stage, setStage] = useState<'name' | 'config' | 'qr'>(channel ? (platform.type === 'wechat' ? 'qr' : 'config') : 'name')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [users, setUsers] = useState('')
  const [groups, setGroups] = useState('')
  const [qr, setQr] = useState<{ ticket: string, qr_url: string, expires_at: number } | null>(null)
  const [status, setStatus] = useState<ChannelQrPoll['status']>('waiting')
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const fetchQr = async (id: string) => {
    setBusy(true)
    try { const r = await getChannelQr(agentId, id); setQr(r); setStatus('waiting') }
    catch (e) { toast(errText(e), 'info') }
    finally { setBusy(false) }
  }
  useEffect(() => { if (stage === 'qr' && cid && !qr) void fetchQr(cid) }, [stage, cid]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!qr || !cid || status === 'confirmed' || status === 'expired') return
    timer.current = setInterval(async () => {
      if (Date.now() / 1000 > qr.expires_at) { setStatus('expired'); return }
      try { const r = await pollChannelQr(agentId, cid, qr.ticket); setStatus(r.status); if (r.status === 'confirmed') { toast(`${platform.name}已连接`); onBound(); setTimeout(onClose, 800) } } catch (e) { toast(errText(e), 'info'); setStatus('expired') }
    }, 2000)
    return () => clearInterval(timer.current)
  }, [qr, cid, status, agentId, onBound, onClose, platform.name])

  const start = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const c = cid ? channel : await createChannel(agentId, { channel_type: platform.type, name: name.trim() })
      if (!c) return
      setCid(c.id); setRevision(c.revision); onBound()
      setStage(platform.type === 'wechat' ? 'qr' : 'config')
    } catch (e) { toast(errText(e), 'info') } finally { setBusy(false) }
  }
  const save = async () => {
    const missing = platform.fields.find(f => !credentials[f.key]?.trim())
    if (missing || !cid) { toast(`请填写${missing?.label ?? '完整配置'}`, 'info'); return }
    const allowedUsers = users.split(/[\n,，]/).map(x => x.trim()).filter(Boolean)
    const allowedGroups = groups.split(/[\n,，]/).map(x => x.trim()).filter(Boolean)
    if (!allowedUsers.length) { toast('请至少填写一个允许使用机器人的用户 ID', 'info'); return }
    setBusy(true)
    try { await configureChannel(agentId, cid, { revision, credentials, settings: { access: 'restricted', allowed_users: allowedUsers, allowed_groups: allowedGroups, groups: allowedGroups.length > 0 } }); toast(`${platform.name}配置已保存`); onBound(); onClose() }
    catch (e) { toast(errText(e), 'info') } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={o => !o && onClose()} size="md" title={`连接${platform.name}`} description={stage === 'qr' ? '使用微信扫码授权，授权信息只保存在当前工作空间。' : '凭据仅在服务端加密保存，用于接收消息和回复。'} footer={stage === 'name' ? <><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={start}>下一步</Button></> : stage === 'config' ? <><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" loading={busy} onClick={save}>保存并连接</Button></> : undefined}>
    {stage === 'name' && <Field label="渠道名称" required><Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="例如：销售客户群" /></Field>}
    {stage === 'config' && <div className="space-y-3">{platform.fields.map(f => <Field key={f.key} label={f.label} required><Input type={f.key.includes('secret') ? 'password' : 'text'} value={credentials[f.key] ?? ''} onChange={e => setCredentials(x => ({ ...x, [f.key]: e.target.value }))} placeholder={f.placeholder} className="font-mono text-[13px]" /></Field>)}<Field label="允许使用的用户 ID" required><Input value={users} onChange={e => setUsers(e.target.value)} placeholder="每行一个，也可用逗号分隔" /></Field><Field label="允许的群 ID（可选）"><Input value={groups} onChange={e => setGroups(e.target.value)} placeholder="填写后自动开启群聊" /></Field><p className="text-[12px] text-ink-3">机器人只响应授权用户；群聊需要额外填写群 ID，并在平台侧完成机器人入群/订阅。</p></div>}
    {stage === 'qr' && <div className="flex flex-col items-center gap-3 py-2"><div className="relative grid size-52 place-items-center overflow-hidden rounded-2xl border border-line bg-white p-3">{qr ? <img src={qr.qr_url} alt="微信绑定二维码" className="size-full" /> : <Skeleton className="size-full" />}{(status === 'confirmed' || status === 'expired') && <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/55">{status === 'confirmed' ? <RiCheckboxCircleFill className="size-12 text-mint" /> : <Button variant="primary" size="small" loading={busy} onClick={() => { setQr(null); setStatus('waiting') }}><RiRefreshLine className="size-3.5" />刷新二维码</Button>}</div>}</div><p className={cn('flex items-center gap-2 text-[13px]', status === 'confirmed' ? 'text-mint' : status === 'expired' ? 'text-rose' : 'text-ink-2')}>{(status === 'waiting' || status === 'scanned') && <i className="breathe-dot size-1.5 rounded-full bg-current" />}{POLL_TEXT[status]}</p></div>}
  </Dialog>
}

export function ChannelsSection({ agentId, ready }: { agentId: string, ready: boolean }) {
  const toast = useToast(); const q = useQuery(() => listChannels(agentId), [agentId]); const [bind, setBind] = useState<{ platform: Platform, channel: MessageChannel | null } | null>(null); const [del, setDel] = useState<MessageChannel | null>(null); const [busy, setBusy] = useState<string | null>(null); const list = q.data?.data ?? []
  const toggle = async (c: MessageChannel, on: boolean) => { setBusy(c.id); try { const n = await setChannelEnabled(agentId, c.id, { revision: c.revision, enabled: on }); q.setData(d => d && { data: d.data.map(x => x.id === c.id ? n : x) }); toast(on ? '渠道已启用' : '渠道已暂停') } catch (e) { toast(errText(e), 'info') } finally { setBusy(null) } }
  const remove = async () => { if (!del) return; setBusy(del.id); try { await deleteChannel(agentId, del.id, del.revision); q.setData(d => d && { data: d.data.filter(x => x.id !== del.id) }); toast('渠道已删除'); setDel(null) } catch (e) { toast(errText(e), 'info') } finally { setBusy(null) } }
  return <Rise><p className="text-[16px] font-semibold">消息渠道</p><p className="mt-0.5 mb-3 text-[12.5px] text-ink-3">接入企业 IM，同事在聊天里就能使用这个 Agent。支持飞书、钉钉、企业微信和微信。</p><ErrorBar error={q.error} onRetry={q.reload} /><div className="grid grid-cols-1 gap-3 lg:grid-cols-4">{PLATFORMS.map(p => { const cs = list.filter(c => c.channel_type === p.type); return <Panel key={p.type} level={2} className="flex flex-col p-4"><div className="flex items-center gap-3"><span className={cn('grid size-10 place-items-center rounded-2xl text-[16px] font-semibold', p.tone)}>{p.mark}</span><div className="min-w-0 flex-1"><p className="text-[14.5px] font-semibold">{p.name}</p><p className="truncate text-[12px] text-ink-3">{p.desc}</p></div></div><div className="mt-3 flex-1 space-y-1.5">{q.loading && <Skeleton className="h-12 rounded-xl" />}{cs.map(c => <div key={c.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"><div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 truncate text-[13px] font-medium">{c.name}{c.status === 'pending' && <Badge tone="amber">待配置</Badge>}{c.status === 'error' && <Badge tone="rose">异常</Badge>}</p><p className="truncate text-[11.5px] text-ink-3">{c.bound_account ?? '尚未连接'} · {fromNow(c.created_at)}</p></div>{c.status === 'pending' ? <Button size="small" variant="ghost-accent" onClick={() => setBind({ platform: p, channel: c })}><RiSettings3Line className="size-3.5" />配置</Button> : <Switch aria-label={`${c.name}启用`} checked={c.enabled} disabled={busy === c.id} onCheckedChange={on => toggle(c, on)} />}{c.status === 'connected' && p.type === 'wechat' && <RiQrCodeLine className="size-4 text-ink-3" />}{<IconBtn label="删除" danger onClick={() => setDel(c)}><RiDeleteBinLine className="size-4" /></IconBtn>}</div>)}</div><Button className="mt-3" size="small" variant={cs.length ? 'ghost' : 'secondary'} disabled={!ready} onClick={() => setBind({ platform: p, channel: null })}>{cs.length ? '再接一个' : '连接'}</Button></Panel>})}</div>{bind && <BindDialog agentId={agentId} platform={bind.platform} channel={bind.channel} onClose={() => setBind(null)} onBound={q.refresh} />}<ConfirmDialog open={!!del} onOpenChange={o => !o && setDel(null)} danger title={`删除渠道「${del?.name ?? ''}」？`} description="删除后需要重新配置或扫码才能恢复。" confirmText="删除" loading={!!del && busy === del.id} onConfirm={remove} /></Rise>
}
