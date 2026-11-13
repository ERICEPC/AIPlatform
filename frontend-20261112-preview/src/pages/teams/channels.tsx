import type { Channel, ChannelKind, Team } from '@/api/teams'
import { RiDeleteBinLine, RiHistoryLine, RiQrCodeLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { channelEvents, channelKinds, createChannel, deleteChannel, listChannels, pollChannelQr, setChannelEnabled, startChannelQr } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Badge, Panel, Skeleton } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { errText, fmtAgo, isConflict } from './shared'

const KINDS: { kind: ChannelKind, color: string, desc: string }[] = [
  { kind: 'wecom', color: 'bg-cyan-soft text-cyan', desc: '企业微信自建应用，成员私聊或群里 @ 机器人' },
  { kind: 'feishu', color: 'bg-volt-soft text-volt-text', desc: '飞书机器人，支持私聊和群聊' },
  { kind: 'dingtalk', color: 'bg-amber-soft text-amber', desc: '钉钉机器人，支持私聊和群聊' },
]
const statusTone = (s: string) => (s === 'online' ? 'mint' : s === 'connecting' ? 'amber' : s === 'offline' || s === 'error' ? 'rose' : 'neutral') as 'mint' | 'amber' | 'rose' | 'neutral'

/** 扫码授权：生成二维码后每 2 秒轮询，确认后关闭 */
function QrDialog({ team, channel, onClose, onDone }: { team: Team, channel: Channel | null, onClose: () => void, onDone: () => void }) {
  const [qr, setQr] = useState<{ ticket: string, svg: string } | null>(null)
  const [status, setStatus] = useState<'loading' | 'wait' | 'scaned' | 'confirmed' | 'expired' | 'error'>('loading')
  const [err, setErr] = useState('')
  const alive = useRef(true)
  const done = useRef(onDone)
  done.current = onDone
  const start = async () => {
    if (!channel)
      return
    setStatus('loading')
    setErr('')
    try {
      const r = await startChannelQr(team.id, channel.id)
      setQr(r)
      setStatus('wait')
    }
    catch (e) {
      setErr(errText(e))
      setStatus('error')
    }
  }
  useEffect(() => {
    alive.current = true
    if (channel)
      start()
    return () => { alive.current = false; setQr(null) }
  }, [channel?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!channel || !qr || (status !== 'wait' && status !== 'scaned'))
      return
    const t = setInterval(async () => {
      try {
        const r = await pollChannelQr(team.id, channel.id, qr.ticket)
        if (!alive.current)
          return
        setStatus(r.status)
        if (r.status === 'confirmed') {
          clearInterval(t)
          setTimeout(() => done.current(), 900)
        }
      }
      catch (e) {
        setErr(errText(e))
        setStatus('error')
      }
    }, 2000)
    return () => clearInterval(t)
  }, [qr, status, channel, team.id])
  const tip = { loading: '正在生成二维码…', wait: `请用${channel ? channelKinds[channel.kind] : ''}管理员账号扫码授权`, scaned: '已扫码，请在手机上确认授权', confirmed: '授权完成，可以启用渠道了', expired: '二维码已过期', error: err }[status]
  return (
    <Dialog open={!!channel} onOpenChange={o => !o && onClose()} size="sm" title={`连接${channel ? channelKinds[channel.kind] : ''}`} description="扫码后机器人会绑定到当前团队，使用最新发布版本。" footer={<Button variant="ghost" onClick={onClose}>关闭</Button>}>
      <div className="flex flex-col items-center gap-3 py-2">
        <div className={cn('relative grid size-[200px] place-items-center overflow-hidden rounded-2xl border border-line bg-white p-3', (status === 'expired' || status === 'confirmed') && 'opacity-40')}>
          {qr ? <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr.svg }} /> : <Skeleton className="size-full" />}
        </div>
        <p className={cn('text-[13px]', status === 'error' ? 'text-rose' : status === 'confirmed' ? 'text-mint' : 'text-ink-2')}>{tip}</p>
        {(status === 'expired' || status === 'error') && <Button size="small" onClick={start}>重新生成</Button>}
      </div>
    </Dialog>
  )
}

function Events({ team, channel }: { team: Team, channel: Channel }) {
  const q = useQuery(() => channelEvents(team.id, channel.id), [team.id, channel.id, channel.revision])
  if (q.loading)
    return <Skeleton className="h-16" />
  if (q.error)
    return <ErrorBar error={q.error} onRetry={q.reload} />
  if (!q.data?.events.length)
    return <p className="py-3 text-center text-[12px] text-ink-3">暂无消息事件</p>
  return (
    <div className="space-y-1">
      {q.data.events.slice(0, 5).map(e => (
        <div key={e.id} className="flex items-center gap-2 text-[12px]">
          <i className={cn('size-1.5 rounded-full', e.state === 'done' ? 'bg-mint' : 'bg-rose')} />
          <span className="text-ink-2">{e.sender_id}</span>
          <span className="text-ink-3">· {e.chat_id}</span>
          <span className="ml-auto text-ink-3 tabular-nums">{e.description || `${e.duration} 秒`} · {fmtAgo(e.created_at)}</span>
        </div>
      ))}
    </div>
  )
}

export function TeamChannels({ team }: { team: Team }) {
  const published = !!team.published_id
  const q = useQuery(() => listChannels(team.id), [team.id])
  const [qr, setQr] = useState<Channel | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Channel | null>(null)
  const [openEvents, setOpenEvents] = useState<string | null>(null)
  const toast = useToast()
  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok)
        toast(ok)
    }
    catch (e) {
      toast(isConflict(e) ? `${errText(e)}，已自动刷新` : errText(e), 'info')
    }
    finally {
      setBusy(null)
      q.refresh()
    }
  }
  const connect = async (kind: ChannelKind) => {
    setBusy(kind)
    try {
      const existing = q.data?.channels.find(c => c.kind === kind)
      const c = existing ?? (await createChannel(team.id, kind)).channel
      setQr(c)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(null)
      q.refresh()
    }
  }
  return (
    <section>
      <p className="text-[15px] font-semibold">消息渠道</p>
      <p className="mt-1 mb-3 text-[12.5px] text-ink-3">渠道固定绑定当前团队，使用最新发布版本。渠道任务执行上限为 150 秒。</p>
      <ErrorBar error={q.error} onRetry={q.reload} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {KINDS.map(({ kind, color, desc }) => {
          const c = q.data?.channels.find(x => x.kind === kind)
          const bound = !!c?.account_id
          return (
            <Panel key={kind} level={2} radius="lg" className="flex flex-col p-4">
              <div className="flex items-center gap-2.5">
                <span className={cn('grid size-9 place-items-center rounded-xl text-[13px] font-semibold', color)}>{channelKinds[kind].slice(0, 1)}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-[14px] font-semibold">{channelKinds[kind]}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{bound ? c!.account_id : desc}</p>
                </div>
                {q.loading ? <Skeleton className="h-6 w-10" /> : c && <Badge tone={statusTone(c.status)} dot={c.status === 'online'}>{c.status_label}</Badge>}
              </div>
              <div className="mt-4 flex items-center gap-2">
                {!c || !bound
                  ? <Button size="small" variant="secondary" disabled={!published || q.loading} loading={busy === kind} onClick={() => connect(kind)}><RiQrCodeLine className="size-3.5" />扫码连接</Button>
                  : (
                      <>
                        <Switch aria-label={`启用${channelKinds[kind]}`} checked={c.enabled} disabled={busy === c.id || !published} onCheckedChange={v => act(c.id, () => setChannelEnabled(team.id, c.id, c.revision, v), v ? '渠道已启用' : '渠道已暂停')} />
                        <span className="text-[12.5px] text-ink-2">{c.enabled ? '已启用' : '已暂停'}</span>
                        <Button size="icon-small" variant="ghost" className="ml-auto" aria-label="最近事件" onClick={() => setOpenEvents(o => (o === c.id ? null : c.id))}><RiHistoryLine className="size-4" /></Button>
                      </>
                    )}
                {c && <Button size="icon-small" variant="ghost" tone="destructive" className={cn(!bound && 'ml-auto')} aria-label="删除渠道" disabled={c.enabled} onClick={() => setRemoving(c)}><RiDeleteBinLine className="size-4" /></Button>}
              </div>
              <AnimatePresence>
                {c && openEvents === c.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-3 border-t border-line pt-3"><p className="mb-2 text-[12px] text-ink-3">最近事件</p><Events team={team} channel={c} /></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Panel>
          )
        })}
      </div>
      <QrDialog team={team} channel={qr} onClose={() => setQr(null)} onDone={() => { setQr(null); toast('授权完成，打开开关即可启用'); q.refresh() }} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={o => !o && setRemoving(null)}
        danger
        loading={!!removing && busy === removing.id}
        title={`删除${removing ? channelKinds[removing.kind] : ''}渠道？`}
        description="删除后机器人不再响应消息，需要重新扫码才能绑定。"
        confirmText="确认删除"
        onConfirm={() => removing && act(removing.id, () => deleteChannel(team.id, removing.id, removing.revision), '渠道已删除').then(() => setRemoving(null))}
      />
    </section>
  )
}
