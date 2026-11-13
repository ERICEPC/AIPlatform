import { RiShareForwardLine, RiTimeLine, RiCheckLine } from '@remixicon/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { API_MODE } from '@/api/http'
import { currentDemo } from '@/api/access'
import { currentUser } from '@/lib/current-user'
import { listResourceShares, resourceShareState, submitResourceShare } from '@/api/resource-sharing'
import type { ResourceKind } from '@/api/resource-sharing'
import { withdrawRelease } from '@/api/releases'
import { useToast } from './ui/toast'
import { useSession } from '@/lib/session'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Select, Textarea } from './ui/form'
import { ErrorBar } from './ui/data'
export function resourceOwner(kind?: ResourceKind) { return API_MODE === 'mock' ? { id: (kind === 'agent' ? 'acc-' : '') + ({ dev: 'yy', admin: 'jl', super: 'lpc' }[currentDemo()?.id ?? 'super']), name: currentDemo()?.name ?? '李鹏程' } : { id: currentUser.id, name: currentUser.owner } }
export function useResourceFilter(kind: ResourceKind) {
  const toast = useToast()
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<Error | null>(null)
  const [value, setValue] = useState('all')
  const q = useQuery(listResourceShares, [kind])
  const { perms } = useSession()
  const [selected, setSelected] = useState<{id:string,name:string} | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shared = (id: string) => resourceShareState(q.data?.data ?? [],kind,id)?.state === 'approved'
  const matches = (id: string, owned: boolean) => value === 'all' || (value === 'mine' ? owned : !q.loading && !q.error && shared(id))
  const control = <Select aria-label="资源归属" value={value} onValueChange={setValue} size="sm" className="w-[128px] shrink-0" options={[{ value: 'all', label: '全部资源' }, { value: 'mine', label: '我创建的' }, { value: 'team', label: '团队共享' }]} />
  const action = (id: string, name: string, owned: boolean, buttonStyle = true, published = true) => {
    const release = resourceShareState(q.data?.data ?? [], kind, id)
    const state = release?.state
    if (kind === 'mcp' && ((!published && state !== 'pending') || (!owned && state !== 'approved' && state !== 'pending'))) return null
    const open = () => { if (!published) return; setSelected({ id, name }); setReason(''); setError('') }
    if (buttonStyle) {
      const approved = state === 'approved'
      const pending = state === 'pending'
      const unavailable = q.loading || !!q.error
      const disabled = unavailable || approved || pending || !owned || !published
      const label = q.loading ? '加载中' : q.error ? '状态未知' : approved ? '已共享' : pending ? '审批中' : '申请共享'
      const Icon = approved ? RiCheckLine : pending ? RiTimeLine : RiShareForwardLine
      const canWithdraw = pending && owned && !!release
      const color = unavailable ? 'bg-hover/40 text-ink-3' : approved ? 'bg-volt-soft/40 text-volt-text' : pending ? 'bg-hover/60 text-ink-2' : owned && published ? 'bg-solid text-volt-text hover:bg-volt-soft/50' : 'bg-hover/30 text-ink-3'
      return <span className="inline-flex h-6 shrink-0 items-center overflow-hidden rounded-md border border-line bg-solid align-middle" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}><Button size="small" variant="ghost" className={`!h-full !rounded-none !px-2 !gap-1 !text-[11px] !font-normal data-disabled:!opacity-100 ${color}`} disabled={disabled} title={!published && !approved && !pending ? '发布后可共享' : !owned && !approved && !pending ? '仅创建者可申请共享' : undefined} onClick={open}><Icon className="size-3" />{label}</Button>{canWithdraw && release && <Button size="small" variant="ghost" aria-label="撤回审批" title="撤回审批" className="!h-full !rounded-none border-l border-line !px-2 !text-[11px] !font-normal text-ink-3 hover:bg-hover hover:text-ink" loading={withdrawing === release.id} disabled={!!withdrawing} onClick={async () => { if (withdrawing) return; setWithdrawing(release.id); setWithdrawError(null); try { await withdrawRelease(release.id); await q.reload(); toast('已撤回审批，可以重新申请共享', 'info') } catch (e) { setWithdrawError(e instanceof Error ? e : new Error('撤回失败，请重试')); await q.reload() } finally { setWithdrawing(null) } }}>撤回</Button>}</span>
    }
    return <span onClick={e => e.stopPropagation()}>{shared(id) ? <span className="text-[11px] text-volt-text">团队共享</span> : owned ? <Button size="small" className="!h-5 !px-0 !text-[11px]" variant="ghost" disabled={q.loading || !!q.error || state === 'pending'} onClick={open}>{state === 'pending' ? '共享审批中' : '申请共享'}</Button> : null}</span>
  }
  const feedback = <><ErrorBar error={withdrawError} onRetry={() => setWithdrawError(null)} /><ErrorBar error={q.error} onRetry={q.reload}/>{value === 'team' && q.loading && <p className="py-2 text-xs text-ink-3">正在加载共享状态…</p>}<Dialog open={!!selected} onOpenChange={v=>!v && setSelected(null)} title={`申请共享 · ${selected?.name || ''}`} description="审批通过后可通过“团队共享”筛选找到；仍保留创建者归属。" footer={<><Button onClick={()=>setSelected(null)}>取消</Button><Button variant="primary" loading={busy} disabled={!reason.trim() || busy} onClick={async()=>{if(!selected || busy)return;setBusy(true);try{await submitResourceShare({resource_kind:kind,object_id:selected.id,name:selected.name,reason:reason.trim(),scope:perms?.department || ''});setSelected(null);q.reload()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>提交审批</Button></>}><Textarea aria-label="共享理由" rows={4} value={reason} onChange={e=>setReason(e.target.value)} placeholder="说明适用场景与共享价值"/>{error && <p role="alert" className="mt-2 text-rose">{error}</p>}</Dialog></>
  return { value, matches, control, feedback, action, status: (id: string) => { const state = resourceShareState(q.data?.data ?? [],kind,id)?.state; return q.loading ? '加载中' : q.error ? '状态未知' : state === 'approved' ? '已共享' : state === 'pending' ? '审批中' : state === 'returned' ? '已退回' : '未共享' }, reset:()=>setValue('all') }
}
