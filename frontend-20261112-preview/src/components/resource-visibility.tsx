/*
  申请共享（智能体 / 智能体团队 / Skills / MCP 与工具 通用）。
  仅个人：立即生效，并收回已有共享、自动撤回审批中的申请；部门 / 公共空间：提交审批，审批中可见范围不变。
*/
import { RiCheckLine, RiShareForwardLine, RiTimeLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { getShare, isForwarded, SCOPE_TEXT, submitShare, withdrawShare, approverText, type ResourceShare, type Scope, type ShareKind } from '@/api/governance'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/cn'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Textarea } from './ui/form'
import { useToast } from './ui/toast'

export const SHARED_TEXT: Record<Scope, string> = { private: '仅个人', department: '部门可见', public: '公共空间' }

/** 修改共享范围弹窗（列表按钮与「我的发布」共用） */
export function ShareDialog({ share, onClose, onDone }: { share: ResourceShare, onClose: () => void, onDone: (v: ResourceShare) => void }) {
  const { perms } = useSession()
  const toast = useToast()
  const pending = share.request?.state === 'pending' ? share.request : null
  const [scope, setScope] = useState<Scope>(pending ? 'private' : share.visibility === 'department' ? 'public' : 'department')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const noDept = !perms?.department_id
  const options: { value: Scope, title: string, desc: string, disabled?: string }[] = [
    { value: 'private', title: '仅个人', desc: '只有自己可见。无需审批，立即生效；会收回当前共享并撤回审批中的申请。' },
    { value: 'department', title: '部门', desc: `共享到你所在的部门${perms?.department_name ? `「${perms.department_name}」` : ''}（含下级部门）。由部门负责人或超级管理员审批。`, disabled: noDept ? '你还没有分配部门，请联系超级管理员分配部门' : !share.published ? '发布后才能共享' : share.visibility !== 'private' ? '当前已是该范围或更大范围' : pending ? '已有审批中的申请，可先撤回' : undefined },
    { value: 'public', title: '公共空间', desc: '当前租户全部账号可见。只有超级管理员能审批。', disabled: !share.published ? '发布后才能共享' : share.visibility === 'public' ? '当前已是公共空间' : pending ? '已有审批中的申请，可先撤回' : undefined },
  ]
  const chosen = options.find(o => o.value === scope)!
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const next = await submitShare({ kind: share.kind, resource_id: share.resource_id, scope, note: note.trim() }, { name: share.name, published: share.published })
      toast(scope === 'private' ? '已改为仅个人，立即生效' : `已提交「${SCOPE_TEXT[scope]}」共享申请，审批通过前可见范围不变`, 'ok')
      onDone(next); onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={v => !v && !busy && onClose()} title={`共享范围 · ${share.name}`} description={`当前：${SHARED_TEXT[share.visibility]}${pending ? ` · 审批中（申请${SCOPE_TEXT[pending.requested_scope]}）` : ''}`} footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" loading={busy} disabled={!!chosen.disabled || (scope === 'private' && share.visibility === 'private' && !pending)} onClick={submit}>{scope === 'private' ? '立即生效' : '提交审批'}</Button></>}>
    <div role="radiogroup" aria-label="共享范围" className="space-y-2">
      {options.map(o => <button key={o.value} type="button" role="radio" aria-checked={scope === o.value} disabled={!!o.disabled} onClick={() => setScope(o.value)} className={cn('flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55', scope === o.value ? 'border-volt bg-volt-soft/40' : 'border-line hover:border-line-strong')}>
        <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', scope === o.value ? 'border-volt' : 'border-line-strong')}>{scope === o.value && <span className="size-2 rounded-full bg-volt" />}</span>
        <span className="min-w-0"><span className="block text-[13.5px] font-medium">{o.title}<span className="ml-2 text-[11.5px] font-normal text-ink-3">{o.value === 'private' ? '立即生效' : '需审批'}</span></span><span className="mt-0.5 block text-[12px] leading-5 text-ink-3">{o.disabled ?? o.desc}</span></span>
      </button>)}
    </div>
    {scope !== 'private' && <label className="mt-4 block"><span className="mb-1.5 block text-[12.5px] text-ink-2">申请说明（选填，最多 500 字）</span><Textarea rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="说明适用场景与复用价值，方便审批人判断" /></label>}
    {share.request?.state === 'rejected' && share.request.comment && <p className="mt-3 rounded-lg bg-rose-soft px-3 py-2 text-[12.5px] text-rose">上次申请被驳回：{share.request.comment}</p>}
    {error && <p role="alert" className="mt-3 text-[13px] text-rose">{error}</p>}
  </Dialog>
}

/** 列表 / 详情上的共享按钮 */
export function ResourceVisibility({ kind, id, name, published, onLoaded }: { kind: ShareKind, id: string, name?: string, published?: boolean, onLoaded?: (value: ResourceShare) => void }) {
  const [data, setData] = useState<ResourceShare>()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => {
    let alive = true
    setData(undefined); setError('')
    getShare(kind, id, { name, published }).then(r => { if (alive) { setData(r); onLoaded?.(r) } }).catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [kind, id, name, published, onLoaded])
  if (error) return <p role="alert" className="my-2 text-xs text-rose">{error}</p>
  if (!data) return <p className="my-2 text-xs text-ink-3">加载共享状态…</p>
  const pending = data.request?.state === 'pending' ? data.request : null
  const withdraw = async () => {
    if (!pending) return
    setBusy(true)
    try { await withdrawShare(pending.id); setData(await getShare(kind, id, { name, published })); toast('已撤回申请', 'info') } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const label = pending ? '审批中' : data.visibility === 'private' ? '申请共享' : SHARED_TEXT[data.visibility]
  const Icon = pending ? RiTimeLine : data.visibility === 'private' ? RiShareForwardLine : RiCheckLine
  const tip = pending ? `${SCOPE_TEXT[pending.requested_scope]} · ${isForwarded(pending) ? '已转审超级管理员' : `审批人：${approverText(pending)}`}` : data.request?.state === 'rejected' ? `上次申请已驳回：${data.request.comment}` : data.visibility === 'private' ? '仅你可见' : data.visibility === 'department' ? `${data.department_name ?? '部门'}成员可见` : '当前租户全部账号可见'
  return <div className="my-2 flex min-w-0 items-center gap-2 text-xs" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    {data.can_manage
      ? <span className="inline-flex h-7 shrink-0 items-center overflow-hidden rounded-md border border-line bg-solid">
          <button type="button" onClick={() => setOpen(true)} disabled={busy} className={cn('flex h-full cursor-pointer items-center gap-1 px-2.5 transition-colors', pending ? 'text-amber hover:bg-hover' : data.visibility === 'private' ? 'text-volt-text hover:bg-volt-soft/50' : 'text-mint hover:bg-hover')}><Icon className="size-3.5" />{label}</button>
          {pending && <button type="button" onClick={withdraw} disabled={busy} className="h-full cursor-pointer border-l border-line px-2 text-ink-3 hover:bg-hover hover:text-ink">撤回</button>}
        </span>
      : <span className="shrink-0 rounded-md bg-hover px-2 py-1 text-ink-2">{SHARED_TEXT[data.visibility]} · 仅创建者可管理</span>}
    <span className={cn('min-w-0 truncate text-ink-3', data.request?.state === 'rejected' && !pending && 'text-rose')} title={tip}>{tip}</span>
    {open && <ShareDialog share={data} onClose={() => setOpen(false)} onDone={v => { setData(v); onLoaded?.(v) }} />}
  </div>
}
