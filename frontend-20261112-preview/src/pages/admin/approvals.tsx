/*
  发布审批 #admin/approvals[/<id>]。左侧申请列表；右侧详情一屏看完：
  顶部固定操作栏（通过 / 驳回 / 转审 + 批准范围 + 意见）→ 申请信息条 → 资源概要与发布前检查两列 → 审批路径。
*/
import { RiArrowRightUpLine, RiCheckLine, RiErrorWarningLine, RiSearchLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { decideApproval, fmtTime, forwardApproval, getApproval, isForwarded, KIND_TEXT, listApprovals, SCOPE_TEXT, STATE_TEXT, type ApprovalDetail, type ShareKind, type ShareRequest } from '@/api/governance'
import { ModuleTitle } from '@/components/page-mark'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { useSession } from '@/lib/session'

const stateBadge = (r: ShareRequest) => isForwarded(r) ? <Badge tone="volt">已转审</Badge> : <Badge tone={STATE_TEXT[r.state][1]}>{r.state === 'pending' ? '待审批' : STATE_TEXT[r.state][0]}</Badge>
const ACTION_TEXT = { submit: '提交申请', forward: '转审超级管理员', approve: '通过', reject: '驳回', withdraw: '撤回' }

function List({ rows, current, go }: { rows: ShareRequest[], current?: string, go: (p: string) => void }) {
  return <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
    {!rows.length && <p className="py-10 text-center text-[13px] text-ink-3">没有申请</p>}
    {rows.map(r => <button key={r.id} type="button" onClick={() => go(`admin/approvals/${r.id}`)} className={cn('w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors', current === r.id ? 'bg-volt-soft' : 'hover:bg-hover')}>
      <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{r.resource_name}</span>{stateBadge(r)}</div>
      <p className="mt-1 truncate text-[12px] text-ink-3">{KIND_TEXT[r.kind]} · 申请{SCOPE_TEXT[r.requested_scope]} · {r.applicant_name}{r.applicant_department_name ? `（${r.applicant_department_name}）` : ''}</p>
      <p className="mt-0.5 text-[11.5px] text-ink-3 tabular-nums">{fmtTime(r.created_at)}</p>
    </button>)}
  </div>
}

function Block({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) {
  return <section className={cn('rounded-lg border border-line bg-solid p-3', className)}><h3 className="mb-2 text-[12.5px] font-semibold text-ink-2">{title}</h3>{children}</section>
}
const Chips = ({ items, empty = '无' }: { items: string[], empty?: string }) => items.length ? <div className="flex flex-wrap gap-1">{items.map(i => <span key={i} className="rounded bg-hover px-1.5 py-0.5 text-[12px] text-ink-2">{i}</span>)}</div> : <span className="text-[12px] text-ink-3">{empty}</span>

function Summary({ d }: { d: ApprovalDetail }) {
  const [more, setMore] = useState(false)
  const r = d.resource
  const row = (k: string, v: React.ReactNode) => <div className="grid grid-cols-[72px_1fr] gap-2 py-1"><span className="text-[12px] text-ink-3">{k}</span><div className="min-w-0 text-[12.5px]">{v}</div></div>
  return <Block title="资源概要">
    <p className="mb-1.5 line-clamp-2 text-[12.5px] leading-5 text-ink-2">{r.description || '暂无描述'}</p>
    {row('所有者', r.owner_name)}
    {r.agent && <>
      {row('模型', r.agent.model || '未配置')}
      {row('提示词', <p className="leading-5 whitespace-pre-wrap text-ink-2">{more || r.agent.prompt.length <= 200 ? r.agent.prompt : `${r.agent.prompt.slice(0, 200)}…`}{r.agent.prompt.length > 200 && <button type="button" className="ml-1 cursor-pointer text-volt-text" onClick={() => setMore(!more)}>{more ? '收起' : '展开'}</button>}</p>)}
      {row('工具', <Chips items={r.agent.tools} />)}
      {row('Skills', <Chips items={r.agent.skills} />)}
      {row('知识库', <Chips items={r.agent.knowledge} />)}
    </>}
    {r.team && <>{row('负责人', r.team.leader)}{row('成员', <Chips items={r.team.members} />)}</>}
    {r.skill && <>{row('文件', <Chips items={r.skill.files} />)}{row('SKILL.md', <pre className="max-h-24 overflow-auto rounded bg-hover p-2 text-[11.5px] leading-5 whitespace-pre-wrap">{r.skill.instructions.slice(0, 600) || '—'}</pre>)}</>}
    {r.mcp && <>{row('服务地址', <span className="font-mono text-[12px]">{r.mcp.server_url}</span>)}{row('工具', <Chips items={r.mcp.tools} />)}{row('授权', r.mcp.authorized ? <span className="text-mint">已授权</span> : <span className="text-amber">未授权</span>)}</>}
    <a href={`#${r.url}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-[12px] text-ink-3 hover:text-volt-text">在新标签页打开资源<RiArrowRightUpLine className="size-3.5" /></a>
  </Block>
}

function Detail({ id, onChanged }: { id: string, onChanged: () => void }) {
  const q = useQuery(() => getApproval(id), [id])
  const { perms } = useSession()
  const toast = useToast()
  const [scope, setScope] = useState<'department' | 'public'>('department')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const d = q.data
  useEffect(() => { if (d) { setScope(d.requested_scope); setComment(''); setError('') } }, [d])
  if (q.error) return <div className="p-6"><ErrorBar error={q.error} onRetry={q.reload} /></div>
  if (!d) return <p className="p-6 text-ink-3">正在加载申请…</p>
  const act = async (kind: 'approve' | 'reject' | 'forward') => {
    if (kind !== 'approve' && !comment.trim()) { setError(kind === 'reject' ? '驳回必须填写意见' : '转审必须填写意见'); return }
    setBusy(kind); setError('')
    try {
      if (kind === 'forward') await forwardApproval(d.id, comment.trim())
      else await decideApproval(d.id, { decision: kind, scope: kind === 'approve' ? scope : undefined, comment: comment.trim() })
      toast(kind === 'approve' ? `已通过，资源变为${SCOPE_TEXT[scope]}可见` : kind === 'reject' ? '已驳回，申请人可看到意见' : '已转审超级管理员')
      await q.reload(); onChanged()
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }
  const open = d.state === 'pending' && (d.can_decide || d.can_forward)
  const reason = d.state !== 'pending' ? '' : d.applicant_id === perms?.account_id ? '这是你提交的申请，不能自己审批' + (d.can_forward ? '，可转审超级管理员。' : '，由其他超级管理员处理。') : isForwarded(d) && !d.can_decide ? `已转审超级管理员，等待处理。` : !d.can_decide && d.requested_scope === 'public' ? '公共空间申请只能由超级管理员审批。' : ''
  const info: [string, React.ReactNode][] = [['申请人', d.applicant_name], ['所属部门', d.applicant_department_name ?? '未分配'], ['申请范围', SCOPE_TEXT[d.requested_scope]], ['当前范围', SCOPE_TEXT[d.current_scope]], ['提交时间', fmtTime(d.created_at)], ['申请编号', <span className="font-mono">{d.code}</span>]]
  return <div className="min-h-0 flex-1 overflow-auto">
    <div className="sticky top-0 z-10 border-b border-line bg-solid/95 px-5 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-[8rem] max-w-full truncate text-[16px] font-semibold" title={d.resource_name}>{d.resource_name}</h2>
        {d.version && <span className="text-[12.5px] text-ink-3">{d.version}</span>}
        <Badge className="h-5 text-[11px]">{KIND_TEXT[d.kind as ShareKind]}</Badge>{stateBadge(d)}
        <div className="ml-auto flex shrink-0 gap-2">
          {d.can_decide && <Button variant="primary" loading={busy === 'approve'} disabled={!!busy} onClick={() => act('approve')}><RiCheckLine className="size-4" />通过</Button>}
          {d.can_decide && <Button tone="destructive" loading={busy === 'reject'} disabled={!!busy} onClick={() => act('reject')}>驳回</Button>}
          {d.can_forward && <Button loading={busy === 'forward'} disabled={!!busy} onClick={() => act('forward')}>转审超级管理员</Button>}
        </div>
      </div>
      {open ? <div className="mt-2.5 flex items-center gap-2">
        {d.can_decide && <><span className="shrink-0 text-[12.5px] text-ink-3">批准范围</span><Select<'department' | 'public'> size="sm" className="w-[120px] shrink-0" value={scope} onValueChange={setScope} options={d.requested_scope === 'public' ? [{ value: 'public', label: '公共空间' }, { value: 'department', label: '部门（收窄）' }] : [{ value: 'department', label: '部门' }]} /></>}
        <input aria-label="审批意见" value={comment} onChange={e => setComment(e.target.value)} maxLength={2000} placeholder="驳回或转审时必填，申请人可见" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-[13px] outline-none focus:border-volt" />
      </div> : <p className="mt-2 text-[12.5px] text-ink-2">{d.state === 'pending' ? reason || '等待处理' : <>{STATE_TEXT[d.state][0]}{d.approved_scope && ` · 批准范围：${SCOPE_TEXT[d.approved_scope]}`} · 审批人：{d.reviewer_name ?? '—'} · {fmtTime(d.decided_at)}{d.comment && <> · 意见：{d.comment}</>}</>}</p>}
      {open && reason && <p className="mt-1.5 text-[12px] text-amber">{reason}</p>}
      {error && <p role="alert" className="mt-1.5 text-[12.5px] text-rose">{error}</p>}
    </div>
    <div className="space-y-3 p-5">
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2 rounded-lg bg-hover px-4 py-2.5 xl:grid-cols-6">{info.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[11.5px] text-ink-3">{k}</dt><dd className="truncate text-[13px]">{v}</dd></div>)}</dl>
      {d.note && <p className="rounded-lg border border-line px-3 py-2 text-[12.5px] leading-5 text-ink-2"><span className="text-ink-3">申请说明：</span>{d.note}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <Summary d={d} />
        <div className="space-y-3">
          <Block title="发布前检查"><ul className="space-y-1">{d.checks.map(c => <li key={c.text} className="flex items-start gap-1.5 text-[12.5px]">{c.level === 'ok' ? <RiCheckLine className="mt-0.5 size-3.5 shrink-0 text-mint" /> : <RiErrorWarningLine className={cn('mt-0.5 size-3.5 shrink-0', c.level === 'risk' ? 'text-rose' : 'text-amber')} />}{c.text}</li>)}</ul></Block>
          <Block title="资源依赖"><Chips items={d.dependencies} empty="无外部依赖" /></Block>
          <Block title="版本变化"><ul className="list-inside list-disc space-y-0.5 text-[12.5px] text-ink-2">{d.changes.map(c => <li key={c}>{c}</li>)}</ul></Block>
        </div>
      </div>
      <Block title="审批路径">
        <ol className="flex flex-wrap items-start gap-x-2 gap-y-2">{d.timeline.map((t, i) => <li key={i} className="flex items-start gap-2">
          {i > 0 && <span className="mt-2 h-px w-6 bg-line-strong" />}
          <div><p className="text-[12.5px] font-medium">{ACTION_TEXT[t.action]} · {t.actor_name}</p><p className="text-[11.5px] text-ink-3 tabular-nums">{fmtTime(t.at)}</p>{t.comment && t.action !== 'submit' && <p className="max-w-[260px] truncate text-[11.5px] text-ink-2" title={t.comment}>{t.comment}</p>}</div>
        </li>)}{d.state === 'pending' && <li className="flex items-start gap-2"><span className="mt-2 h-px w-6 border-t border-dashed border-line-strong" /><p className="text-[12.5px] text-ink-3">待{d.assignee === 'super_admin' ? '超级管理员' : `${d.department_name ?? ''}负责人`}审批</p></li>}</ol>
      </Block>
    </div>
  </div>
}

export default function Approvals({ id, go }: { id?: string, go: (p: string) => void }) {
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [kind, setKind] = useState<'all' | ShareKind>('all')
  const [kw, setKw] = useState('')
  const q = useQuery(() => listApprovals(tab), [tab])
  const rows = (q.data?.data ?? []).filter(r => (kind === 'all' || r.kind === kind) && (!kw || `${r.resource_name}${r.applicant_name}`.includes(kw)))
  useEffect(() => { if (!id && rows[0]) go(`admin/approvals/${rows[0].id}`) }, [id, rows[0]?.id])
  return <main className="flex min-h-0 flex-1 flex-col">
    <header className="border-b border-line px-6 py-3"><ModuleTitle>发布审批</ModuleTitle></header>
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[330px] shrink-0 flex-col border-r border-line">
        <div className="space-y-2 border-b border-line p-3">
          <Segmented<'pending' | 'done'> value={tab} onValueChange={setTab} options={[{ value: 'pending', label: '待审批', count: tab === 'pending' ? q.data?.data.length : undefined }, { value: 'done', label: '已处理' }]} />
          <div className="flex gap-2">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line px-2"><RiSearchLine className="size-4 text-ink-3" /><input aria-label="搜索申请" value={kw} onChange={e => setKw(e.target.value)} placeholder="资源或申请人" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label>
            <Select<'all' | ShareKind> size="sm" className="w-[112px]" value={kind} onValueChange={setKind} options={[{ value: 'all', label: '全部类型' }, ...(['agent', 'team', 'skill', 'mcp'] as const).map(k => ({ value: k, label: KIND_TEXT[k] }))]} />
          </div>
        </div>
        <ErrorBar error={q.error} onRetry={q.reload} />
        <List rows={rows} current={id} go={go} />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col bg-surface">{id ? <Detail key={id} id={id} onChanged={() => void q.refresh()} /> : <p className="p-10 text-center text-ink-3">{q.loading ? '正在加载…' : '选择左侧申请查看详情'}</p>}</section>
    </div>
  </main>
}
