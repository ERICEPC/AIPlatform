import { RESOURCE_NAMES } from '@/api/resource-sharing'
import type { ReleaseRequest, Visibility } from '@/api/releases'
import { RiCheckLine, RiFileShieldLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { decideApproval, getOrg, listApprovals, listGroups } from '@/api/admin'
import { KIND_TEXT, STATE_TEXT, VIS_TEXT } from '@/api/releases'
import { ConsolePage, KV, PageHeader, Section } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

/* 发布审批：通过 / 退回修改；通过时可收窄可见范围。「允许发布」与「允许公开」是两个独立决定。 */
export function ApprovalsPage({ id, go }: { id?: string, go: (p: string) => void }) {
  const toast = useToast()
  const [state, setState] = useState<'pending' | 'done'>('pending')
  const q = useQuery(() => listApprovals(state), [state])
  const [search,setSearch]=useState('')
  const [category,setCategory]=useState('all')
  const [busy,setBusy]=useState(false)
  const all=q.data?.data ?? []
  const categories=[['all','全部'],['agent','智能体'],['team','智能体团队'],['skill','Skills'],['mcp','MCP 与工具']]
  const kindOf=(r:ReleaseRequest)=>r.resource_share?.resource_kind ?? (r.kind==='assistant_copy'?'agent':r.kind==='expert_team'?'team':r.kind)
  const list = all.filter(r=>(category==='all'||kindOf(r)===category)&&`${r.name} ${r.applicant} ${r.id}`.toLowerCase().includes(search.toLowerCase()))
  const cur = list.find(r => r.id === id) ?? list[0]
  const [vis, setVis] = useState<Visibility>('department')
  const [comment, setComment] = useState('')
  const [range, setRange] = useState<string[]>([])
  const [err, setErr] = useState('')
  const org = useQuery(getOrg, [])
  const groups = useQuery(listGroups, [])
  const ranges = [...(org.data?.departments ?? []).map(d => `部门 · ${d.name}`), ...(groups.data?.data ?? []).map(g => `用户组 · ${g.name}`)]
  useEffect(() => { if (cur) { setVis(cur.visibility); setComment(''); setErr(''); setRange([`部门 · ${cur.scope}`].filter(x => ranges.includes(x))) } }, [cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (decision: 'approve' | 'return') => {
    if (!cur)
      return
    if(busy)return
    if(decision==='return'&&!comment.trim()){setErr('请填写退回原因，便于申请人修改');return}
    setBusy(true)
    try {
      await decideApproval(cur.id, { decision, visibility: vis, range, comment })
      toast(decision === 'approve' ? cur.resource_share ? '已通过，资源已共享给团队' : cur.kind === 'expert_team' ? '已通过，专家团已加入智能体团队' : `已通过，按「${VIS_TEXT[vis]}」发布` : '已退回，申请人会收到修改意见')
      go('admin/approvals')
      q.reload()
    }
    catch (e) { setErr((e as Error).message) } finally {setBusy(false)}
  }
  return (
    <ConsolePage bodyClass="p-0 flex min-h-0" header={<PageHeader title="发布审批" desc="统一处理智能体、智能体团队、Skills 与 MCP 的发布和共享申请；审核版本、资源依赖及可见范围。" tabs={[{ id: 'pending', label: '待审批', count: state === 'pending' ? all.length : undefined }, { id: 'done', label: '已处理' }]} tab={state} onTab={setState} />}>
      <div className="w-[320px] shrink-0 overflow-auto border-r border-line bg-solid">
        <div className="sticky top-0 z-10 space-y-3 border-b border-line bg-solid p-4"><Input aria-label="搜索审批申请" placeholder="搜索资源、申请人或编号" value={search} onChange={e=>setSearch(e.target.value)}/><Select value={category} onValueChange={setCategory} options={categories.map(([value,label])=>({value,label:`${label} · ${all.filter(r=>value==='all'||kindOf(r)===value).length}`}))}/><p className="text-xs text-ink-3">共 {list.length} 条申请</p></div>
        {q.error && <div className="p-3"><ErrorBar error={q.error} onRetry={q.reload} /></div>}
        {!list.length && !q.loading && <EmptyState icon={<RiFileShieldLine className="size-5" />} title="没有符合条件的申请" hint="你的管理范围内有新的发布申请时会出现在这里。" />}
        {list.map(r => (
          <button key={r.id} type="button" onClick={() => go(`admin/approvals/${r.id}`)} className={cn('block w-full cursor-pointer border-b border-line px-4 py-3 text-left', r.id === cur?.id ? 'bg-volt-soft' : 'hover:bg-hover')}>
            <span className="flex items-center gap-2 text-[12px] text-ink-3"><Badge>{r.resource_share ? RESOURCE_NAMES[r.resource_share.resource_kind] : KIND_TEXT[r.kind]}</Badge>{r.scope}<span className="ml-auto">{new Date(r.submitted_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></span>
            <span className="mt-1 block text-[14px] font-medium">{r.name} <span className="text-[12.5px] font-normal text-ink-3">{r.version}</span></span>
            <span className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-3">申请人 {r.applicant}{state === 'done' && <Badge tone={STATE_TEXT[r.state][1]}>{STATE_TEXT[r.state][0]}</Badge>}</span>
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-6">
        {cur && <><div className="mx-auto mb-3 flex max-w-[860px] justify-end"><Button onClick={()=>{const key=cur.resource_share?.resource_kind??cur.kind;const rid=encodeURIComponent(cur.object_id);go(({agent:`agents/${rid}`,assistant_copy:`agents/${rid}`,team:`teams/${rid}`,expert_team:cur.expert_team?.team_id?`teams/${cur.expert_team.team_id}`:'collab',skill:`skills/local/${rid}`,mcp:`integrations/installed/${rid}`,knowledge:`kb/${rid}`} as Record<string,string>)[key]??'accelerator')}}>查看申请资源 ↗</Button></div><Detail r={cur} /></>}
        {cur && cur.state === 'pending' && (
          <Section className="mx-auto mt-4 max-w-[860px]" title="审批意见">
            <div className="grid grid-cols-[220px_1fr] gap-4 max-lg:grid-cols-1">
              <Field label="批准的可见范围" hint="可以收窄，不会自动公开底层资料。"><Select value={vis} onValueChange={setVis} options={((cur.resource_share ? ['department', 'org'] : ['private', 'department', 'org', 'public']) as Visibility[]).map(v => ({ value: v, label: VIS_TEXT[v] }))} /></Field>
              <Field label="意见" error={err || undefined} hint="退回时必填，申请人会看到。"><Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="例如：请补充三条真实样例的测试结果" /></Field>
            </div>
            {(vis === 'department' || vis === 'org') && (
              <Field className="mt-4" label="可用范围" hint="按部门或用户组授予；不选表示按批准的可见范围可用。">
                <div className="flex flex-wrap gap-1.5">{ranges.map(r => { const on = range.includes(r); return <button key={r} type="button" onClick={() => setRange(x => (on ? x.filter(y => y !== r) : [...x, r]))} className={cn('h-7 cursor-pointer rounded-md border px-2.5 text-[12.5px]', on ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2 hover:border-line-strong')}>{r}</button> })}</div>
              </Field>
            )}
            <div className="mt-4 flex gap-2"><Button disabled={busy} variant="primary" onClick={() => decide('approve')}><RiCheckLine className="size-4" />{cur.resource_share ? '通过并共享' : '通过并发布'}</Button><Button disabled={busy} onClick={() => decide('return')}>退回修改</Button></div>
          </Section>
        )}
      </div>
    </ConsolePage>
  )
}

function Detail({ r }: { r: ReleaseRequest }) {
  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <Section title={<span className="flex items-center gap-2">{r.name}<span className="text-[13px] font-normal text-ink-3">{r.version}</span><Badge tone={STATE_TEXT[r.state][1]}>{STATE_TEXT[r.state][0]}</Badge></span>} desc={r.note}>
        <KV cols={3} items={[['类型', r.resource_share ? RESOURCE_NAMES[r.resource_share.resource_kind] : KIND_TEXT[r.kind]], ['申请人', r.applicant], ['申请范围', r.scope], ['申请的可见范围', VIS_TEXT[r.visibility]], ['申请编号', r.id], ['测试结果', r.test_summary]]} />
        {r.comment && <p className="mt-4 rounded-md bg-surface px-3 py-2 text-[13px]">{r.approver}：{r.comment}</p>}
      </Section>
      <Section title="发布前检查">
        <ul className="space-y-1.5">{r.checks.map(c => <li key={c.text} className={cn('text-[13px]', c.level === 'ok' ? 'text-ink-2' : c.level === 'warn' ? 'text-amber' : 'text-rose')}>{c.level === 'ok' ? '✓' : '!'} {c.text}</li>)}{!r.checks.length && <li className="text-[13px] text-ink-3">无</li>}</ul>
      </Section>
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Section title="版本变化"><ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">{r.changes.map(c => <li key={c}>{c}</li>)}</ul></Section>
        <Section title="资源依赖" desc="发布后这些资源的可见范围不会自动扩大，调用时按调用者权限校验。"><ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">{r.dependencies.map(c => <li key={c}>{c}</li>)}{!r.dependencies.length && <li className="list-none text-ink-3">无</li>}</ul></Section>
      </div>
    </div>
  )
}
