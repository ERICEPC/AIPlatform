/*
  我的发布：当前账号创建的全部智能体、智能体团队、Skills、MCP 与工具，不论共享范围。
  数据来自服务端同一张申请表与资源可见范围表；进入页面即重新拉取，live 模式每 30 秒刷新一次。
*/
import { RiRefreshLine } from '@remixicon/react'
import { useMemo, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { API_MODE } from '@/api/http'
import { fmtTime, KIND_TEXT, listMine, requestLine, SCOPE_TEXT, STATE_TEXT, isForwarded, withdrawShare, type ResourceShare, type Scope, type ShareKind } from '@/api/governance'
import { ModuleTitle } from '@/components/page-mark'
import { ShareDialog, SHARED_TEXT } from '@/components/resource-visibility'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'

type Cat = 'all' | ShareKind
type ReqFilter = 'all' | 'none' | 'pending' | 'approved' | 'rejected' | 'withdrawn'
export const resourceUrl = (kind: ShareKind, id: string) => kind === 'agent' ? `agents/${id}` : kind === 'team' ? `teams/${id}` : kind === 'skill' ? 'skills/local' : 'integrations'
const SCOPE_TONE: Record<Scope, 'neutral' | 'volt' | 'mint'> = { private: 'neutral', department: 'volt', public: 'mint' }
const reqState = (r: ResourceShare): ReqFilter => !r.request ? 'none' : r.request.state === 'returned' ? 'rejected' : (['pending', 'approved', 'rejected', 'withdrawn'] as const).find(s => s === r.request!.state) ?? 'none'

export default function MyReleases({ go }: { go: (path: string) => void }) {
  const q = useQuery(listMine, [], { pollMs: API_MODE === 'live' ? 30_000 : false })
  const toast = useToast()
  const [cat, setCat] = useState<Cat>('all')
  const [scope, setScope] = useState<'all' | Scope>('all')
  const [state, setState] = useState<ReqFilter>('all')
  const [editing, setEditing] = useState<ResourceShare>()
  const [opinion, setOpinion] = useState<ResourceShare>()
  const [busy, setBusy] = useState('')
  const rows = useMemo(() => q.data?.data ?? [], [q.data])
  const inCat = rows.filter(r => cat === 'all' || r.kind === cat)
  const shown = inCat.filter(r => (scope === 'all' || r.visibility === scope) && (state === 'all' || reqState(r) === state))
  const count = (k: Cat) => rows.filter(r => k === 'all' || r.kind === k).length
  const withdraw = async (r: ResourceShare) => {
    setBusy(r.resource_id)
    try { await withdrawShare(r.request!.id); toast('已撤回申请', 'info'); await q.refresh() } catch (e) { toast((e as Error).message, 'info') } finally { setBusy('') }
  }
  return <main className="flex-1 overflow-auto p-6">
    <header className="flex items-start justify-between gap-4">
      <div><ModuleTitle>我的发布</ModuleTitle><p className="mt-2 text-sm text-ink-3">你创建的智能体、团队、Skills 与 MCP。仅个人立即生效；部门、公共空间需审批，审批通过前可见范围不变。</p></div>
      <Button onClick={() => q.reload()} loading={q.loading}><RiRefreshLine className="size-4" />刷新</Button>
    </header>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <Segmented<Cat> value={cat} onValueChange={setCat} aria-label="资源类型" options={(['all', 'agent', 'team', 'skill', 'mcp'] as const).map(k => ({ value: k, label: k === 'all' ? '全部' : KIND_TEXT[k], count: count(k) }))} />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {([['仅个人', inCat.filter(r => r.visibility === 'private').length], ['部门', inCat.filter(r => r.visibility === 'department').length], ['公共空间', inCat.filter(r => r.visibility === 'public').length], ['审批中', inCat.filter(r => r.request?.state === 'pending').length]] as const).map(([k, v]) =>
        <div key={k} className="rounded-xl border border-line bg-solid px-4 py-3"><p className="text-[12.5px] text-ink-3">{k}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p></div>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Select<'all' | Scope> size="sm" className="w-[150px]" value={scope} onValueChange={setScope} options={[{ value: 'all', label: '可见范围：全部' }, { value: 'private', label: '仅个人' }, { value: 'department', label: '部门' }, { value: 'public', label: '公共空间' }]} />
      <Select<ReqFilter> size="sm" className="w-[150px]" value={state} onValueChange={setState} options={[{ value: 'all', label: '审批状态：全部' }, { value: 'none', label: '无需审批' }, { value: 'pending', label: '审批中' }, { value: 'approved', label: '已通过' }, { value: 'rejected', label: '已驳回' }, { value: 'withdrawn', label: '已撤回' }]} />
      <span className="ml-auto text-[12.5px] text-ink-3">共 {shown.length} 项</span>
    </div>
    <div className="mt-3"><ErrorBar error={q.error} onRetry={q.reload} /></div>
    <div className="mt-3 overflow-hidden rounded-xl border border-line bg-solid">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-hover text-[12px] text-ink-3"><tr>{['资源', '当前可见范围', '最近一次申请', '提交时间', '操作'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {!q.loading && !shown.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-ink-3">{rows.length ? '没有符合筛选条件的资源' : '你还没有创建资源'}</td></tr>}
          {shown.map(r => {
            const rq = r.request, pending = rq?.state === 'pending'
            return <tr key={`${r.kind}:${r.resource_id}`} className="align-middle">
              <td className="px-4 py-3"><p className="font-medium">{r.name}</p><Badge className="mt-1 h-5 text-[11px]">{KIND_TEXT[r.kind]}</Badge>{!r.published && <Badge tone="amber" className="mt-1 ml-1 h-5 text-[11px]">{r.kind === 'mcp' ? '未授权' : '草稿'}</Badge>}</td>
              <td className="px-4 py-3"><Badge tone={SCOPE_TONE[r.visibility]}>{SHARED_TEXT[r.visibility]}</Badge>{r.visibility === 'department' && r.department_name && <p className="mt-1 text-[11.5px] text-ink-3">{r.department_name}</p>}</td>
              <td className="px-4 py-3">{rq ? <><Badge tone={isForwarded(rq) ? 'volt' : STATE_TEXT[rq.state][1]}>{isForwarded(rq) ? '已转审' : STATE_TEXT[rq.state][0]}</Badge><p className="mt-1 text-[12px] text-ink-2">{requestLine(rq)}</p></> : <span className="text-ink-3">无需审批</span>}</td>
              <td className="px-4 py-3 text-ink-2 tabular-nums">{rq ? fmtTime(rq.created_at) : '—'}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">
                <Button size="small" variant="primary" onClick={() => setEditing(r)}>修改共享范围</Button>
                {pending && <Button size="small" loading={busy === r.resource_id} onClick={() => withdraw(r)}>撤回</Button>}
                {rq && (rq.comment || rq.forward_comment) && <Button size="small" variant="ghost" onClick={() => setOpinion(r)}>审批意见</Button>}
                <Button size="small" variant="ghost" onClick={() => go(resourceUrl(r.kind, r.resource_id))}>查看资源</Button>
              </div></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
    {editing && <ShareDialog share={editing} onClose={() => setEditing(undefined)} onDone={() => void q.refresh()} />}
    {opinion?.request && <Dialog open onOpenChange={v => !v && setOpinion(undefined)} title={`审批意见 · ${opinion.name}`} description={requestLine(opinion.request)} footer={<Button onClick={() => setOpinion(undefined)}>知道了</Button>}>
      <div className="space-y-3 text-[13px]">
        {opinion.request.forward_comment && <p className="rounded-lg bg-hover px-3 py-2"><span className="text-ink-3">{opinion.request.forwarded_by_name} 转审超级管理员 · {fmtTime(opinion.request.forwarded_at)}</span><br />{opinion.request.forward_comment}</p>}
        {opinion.request.comment && <p className="rounded-lg bg-hover px-3 py-2"><span className="text-ink-3">{opinion.request.reviewer_name ?? '系统'} · {STATE_TEXT[opinion.request.state][0]} · {fmtTime(opinion.request.decided_at)}</span><br />{opinion.request.comment}</p>}
        <p className="text-[12px] text-ink-3">申请范围：{SCOPE_TEXT[opinion.request.requested_scope]}{opinion.request.approved_scope ? ` · 批准范围：${SCOPE_TEXT[opinion.request.approved_scope]}` : ''}</p>
      </div>
    </Dialog>}
  </main>
}
