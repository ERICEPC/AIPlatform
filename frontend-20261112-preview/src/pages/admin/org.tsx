/*
  组织与成员：账号来自统一身份 Auth，部门树、成员所属部门、部门负责人在平台内维护（超级管理员操作）。
  部门负责人只读看本部门（含下级）子树。
*/
import { RiAddLine, RiDeleteBinLine, RiEditLine, RiOrganizationChart } from '@remixicon/react'
import { useMemo, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { addHead, createDepartment, deleteDepartment, fmtTime, getIdentitySource, getOrg, listHeads, removeHead, ROLE_TEXT, setMemberDepartment, updateDepartment, type OrgDepartment, type OrgMember } from '@/api/governance'
import { ModuleTitle } from '@/components/page-mark'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

type Tab = 'members' | 'heads' | 'identity'
export const card = 'rounded-xl border border-line bg-solid'
/** 部门树按层级展开成带缩进的列表 */
export function flatten(depts: OrgDepartment[]) {
  const ids = new Set(depts.map(d => d.id))
  const out: (OrgDepartment & { depth: number })[] = []
  const walk = (parent: string | null, depth: number) => depts.filter(d => (parent ? d.parent_id === parent : !d.parent_id || !ids.has(d.parent_id))).forEach((d) => { out.push({ ...d, depth }); walk(d.id, depth + 1) })
  walk(null, 0)
  return out
}
const roleTone = (r: OrgMember['role']) => r === 'super_admin' ? 'volt' : r === 'dept_head' ? 'mint' : 'neutral'

function Members({ data, reload }: { data: { departments: OrgDepartment[], members: OrgMember[], readonly: boolean }, reload: () => void }) {
  const toast = useToast()
  const [sel, setSel] = useState<string>('all')
  const [edit, setEdit] = useState<{ id?: string, name: string, parent_id: string }>()
  const [moving, setMoving] = useState<OrgMember>()
  const [target, setTarget] = useState('')
  const [removing, setRemoving] = useState<OrgDepartment>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const tree = useMemo(() => flatten(data.departments), [data.departments])
  const name = (id: string | null) => data.departments.find(d => d.id === id)?.name ?? '未分配'
  const sub = (id: string) => { const s = new Set([id]); let grew = true; while (grew) { grew = false; for (const d of data.departments) if (d.parent_id && s.has(d.parent_id) && !s.has(d.id)) { s.add(d.id); grew = true } } return s }
  const members = sel === 'all' ? data.members : sel === 'none' ? data.members.filter(m => !m.department_id) : data.members.filter(m => m.department_id && sub(sel).has(m.department_id))
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setError(''); try { await fn(); toast(ok); reload(); return true } catch (e) { setError((e as Error).message); return false } finally { setBusy(false) } }
  const opts = [{ value: '', label: '无（顶级部门）' }, ...tree.filter(d => !edit?.id || !sub(edit.id).has(d.id)).map(d => ({ value: d.id, label: `${'　'.repeat(d.depth)}${d.name}` }))]
  return <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4">
    <section className={cn(card, 'flex min-h-0 flex-col')}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5"><span className="text-[13px] font-semibold">部门</span>{!data.readonly && <Button size="small" onClick={() => setEdit({ name: '', parent_id: sel !== 'all' && sel !== 'none' ? sel : '' })}><RiAddLine className="size-4" />新建</Button>}</div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {[{ id: 'all', name: data.readonly ? '我负责的全部部门' : '全部成员', depth: 0, member_count: data.members.length }, ...tree, ...(data.readonly ? [] : [{ id: 'none', name: '未分配部门', depth: 0, member_count: data.members.filter(m => !m.department_id).length }])].map(d =>
          <div key={d.id} className={cn('group flex h-8 items-center gap-1 rounded-md pr-1 text-[13px]', sel === d.id ? 'bg-volt-soft text-volt-text' : 'hover:bg-hover')} style={{ paddingLeft: 8 + d.depth * 14 }}>
            <button type="button" onClick={() => setSel(d.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"><RiOrganizationChart className="size-3.5 shrink-0 text-ink-3" /><span className="truncate">{d.name}</span><span className="text-[11.5px] text-ink-3">{d.member_count}</span></button>
            {!data.readonly && 'parent_id' in d && <span className="hidden gap-0.5 group-hover:flex">
              <button type="button" aria-label="编辑部门" className="cursor-pointer rounded p-1 text-ink-3 hover:text-ink" onClick={() => setEdit({ id: d.id, name: d.name, parent_id: (d as OrgDepartment).parent_id ?? '' })}><RiEditLine className="size-3.5" /></button>
              <button type="button" aria-label="删除部门" className="cursor-pointer rounded p-1 text-ink-3 hover:text-rose" onClick={() => setRemoving(d as OrgDepartment)}><RiDeleteBinLine className="size-3.5" /></button>
            </span>}
          </div>)}
      </div>
      {data.readonly && <p className="border-t border-line px-3 py-2 text-[11.5px] text-ink-3">部门负责人只读查看本部门（含下级）。</p>}
    </section>
    <section className={cn(card, 'min-h-0 overflow-auto')}>
      {error && <p role="alert" className="m-3 text-[13px] text-rose">{error}</p>}
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-hover text-[12px] text-ink-3"><tr>{['成员', '部门', '角色', '最近登录', ''].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {!members.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-3">该部门暂无成员</td></tr>}
          {members.map(m => <tr key={m.id}>
            <td className="px-4 py-2.5"><p className="font-medium">{m.name}</p><p className="text-[11.5px] text-ink-3">{m.email}</p></td>
            <td className="px-4 py-2.5">{m.department_id ? name(m.department_id) : <span className="text-amber">未分配</span>}</td>
            <td className="px-4 py-2.5"><Badge tone={roleTone(m.role)}>{ROLE_TEXT[m.role]}</Badge></td>
            <td className="px-4 py-2.5 text-ink-2 tabular-nums">{fmtTime(m.last_login_at)}</td>
            <td className="px-4 py-2.5 text-right">{!data.readonly && <Button size="small" variant="ghost" onClick={() => { setMoving(m); setTarget(m.department_id ?? '') }}>调整部门</Button>}</td>
          </tr>)}
        </tbody>
      </table>
    </section>
    {edit && <Dialog open onOpenChange={v => !v && !busy && setEdit(undefined)} title={edit.id ? '编辑部门' : '新建部门'} footer={<><Button onClick={() => setEdit(undefined)}>取消</Button><Button variant="primary" loading={busy} disabled={!edit.name.trim()} onClick={async () => { if (await run(() => edit.id ? updateDepartment(edit.id, { name: edit.name.trim(), parent_id: edit.parent_id || null }) : createDepartment({ name: edit.name.trim(), parent_id: edit.parent_id || null }), edit.id ? '部门已更新' : '部门已创建')) setEdit(undefined) }}>保存</Button></>}>
      <div className="space-y-3"><Field label="部门名称" required><Input value={edit.name} maxLength={100} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="上级部门"><Select value={edit.parent_id} onValueChange={v => setEdit({ ...edit, parent_id: v })} options={opts} /></Field>{error && <p role="alert" className="text-[13px] text-rose">{error}</p>}</div>
    </Dialog>}
    {moving && <Dialog open onOpenChange={v => !v && !busy && setMoving(undefined)} title={`调整部门 · ${moving.name}`} description="成员只属于一个部门；部门共享与审批按此部门计算。" footer={<><Button onClick={() => setMoving(undefined)}>取消</Button><Button variant="primary" loading={busy} onClick={async () => { if (await run(() => setMemberDepartment(moving.id, target || null), '已调整部门')) setMoving(undefined) }}>保存</Button></>}>
      <Select value={target} onValueChange={setTarget} options={[{ value: '', label: '未分配' }, ...tree.map(d => ({ value: d.id, label: `${'　'.repeat(d.depth)}${d.name}` }))]} />{error && <p role="alert" className="mt-2 text-[13px] text-rose">{error}</p>}
    </Dialog>}
    <ConfirmDialog open={!!removing} onOpenChange={v => !v && setRemoving(undefined)} title={`删除部门「${removing?.name}」？`} description="只能删除没有成员、下级部门和负责人的空部门。" confirmText="删除" danger onConfirm={() => { if (removing) void run(() => deleteDepartment(removing.id), '部门已删除'); setRemoving(undefined) }} />
  </div>
}

function Heads({ data, reload }: { data: { departments: OrgDepartment[], members: OrgMember[], readonly: boolean }, reload: () => void }) {
  const q = useQuery(listHeads, [])
  const toast = useToast()
  const [adding, setAdding] = useState<OrgDepartment>()
  const [pick, setPick] = useState('')
  const [error, setError] = useState('')
  const tree = flatten(data.departments)
  const chain = (id: string) => { const out: string[] = []; for (let d = data.departments.find(x => x.id === id); d; d = data.departments.find(x => x.id === d!.parent_id)) out.push(d.id); return out }
  const act = async (fn: () => Promise<unknown>, ok: string) => { setError(''); try { await fn(); toast(ok); q.reload(); reload(); return true } catch (e) { setError((e as Error).message); return false } }
  return <section className={cn(card, 'min-h-0 overflow-auto')}>
    {error && <p role="alert" className="m-3 text-[13px] text-rose">{error}</p>}
    <ErrorBar error={q.error} onRetry={q.reload} />
    <table className="w-full text-left text-[13px]">
      <thead className="sticky top-0 bg-hover text-[12px] text-ink-3"><tr>{['部门', '负责人', ''].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{tree.map(d => {
        const heads = (q.data?.data ?? []).filter(h => h.department_id === d.id)
        return <tr key={d.id}>
          <td className="px-4 py-2.5" style={{ paddingLeft: 16 + d.depth * 16 }}>{d.name}</td>
          <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1.5">{!heads.length && <span className="text-ink-3">未设置</span>}{heads.map(h => <span key={h.account_id} className="inline-flex items-center gap-1 rounded-md bg-hover px-2 py-0.5">{h.name}{!data.readonly && <button type="button" aria-label={`移除 ${h.name}`} className="cursor-pointer text-ink-3 hover:text-rose" onClick={() => void act(() => removeHead(d.id, h.account_id), `已移除 ${h.name}`)}>×</button>}</span>)}</div></td>
          <td className="px-4 py-2.5 text-right">{!data.readonly && <Button size="small" variant="ghost" onClick={() => { setAdding(d); setPick('') }}>设置负责人</Button>}</td>
        </tr>
      })}</tbody>
    </table>
    {adding && <Dialog open onOpenChange={v => !v && setAdding(undefined)} title={`设置负责人 · ${adding.name}`} description="从该部门及上级部门成员中选择；一个部门可有多位负责人。" footer={<><Button onClick={() => setAdding(undefined)}>取消</Button><Button variant="primary" disabled={!pick} onClick={async () => { if (await act(() => addHead(adding.id, pick), '已设置部门负责人')) setAdding(undefined) }}>确定</Button></>}>
      <Select value={pick} onValueChange={setPick} placeholder="选择成员" options={data.members.filter(m => m.department_id && chain(adding.id).includes(m.department_id) && !adding.head_ids.includes(m.id)).map(m => ({ value: m.id, label: `${m.name} · ${data.departments.find(x => x.id === m.department_id)?.name}` }))} />
      {error && <p role="alert" className="mt-2 text-[13px] text-rose">{error}</p>}
    </Dialog>}
  </section>
}

function Identity() {
  const q = useQuery(getIdentitySource, [])
  const s = q.data
  return <section className={cn(card, 'max-w-3xl p-5')}>
    <ErrorBar error={q.error} onRetry={q.reload} />
    {s && <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-[13.5px]">
      <dt className="text-ink-3">身份来源</dt><dd>统一身份 Auth</dd>
      <dt className="text-ink-3">Issuer</dt><dd className="font-mono text-[12.5px]">{s.issuer}</dd>
      <dt className="text-ink-3">登录方式</dt><dd>{s.methods.join('；')}</dd>
      <dt className="text-ink-3">接入状态</dt><dd>{s.configured ? <Badge tone="mint" dot>已配置</Badge> : <Badge tone="amber" dot>未配置</Badge>}</dd>
      <dt className="text-ink-3">说明</dt><dd className="leading-6 text-ink-2">{s.note}<br />后续可从 Auth 的 organization_units 同步部门。</dd>
    </dl>}
  </section>
}

export default function Org() {
  const [tab, setTab] = useState<Tab>('members')
  const q = useQuery(getOrg, [])
  return <main className="flex min-h-0 flex-1 flex-col p-6">
    <header><ModuleTitle>组织与成员</ModuleTitle><p className="mt-2 text-sm text-ink-3">账号来自统一身份，部门在本平台维护。成员只属于一个部门，部门共享与审批按所属部门计算。</p></header>
    <Segmented<Tab> className="mt-4 self-start" value={tab} onValueChange={setTab} options={[{ value: 'members', label: '成员与部门' }, { value: 'heads', label: '部门负责人' }, { value: 'identity', label: '身份来源' }]} />
    <div className="mt-4 flex min-h-0 flex-1 flex-col"><ErrorBar error={q.error} onRetry={q.reload} />
      {tab === 'identity' ? <Identity /> : q.data && (tab === 'members' ? <Members data={q.data} reload={() => void q.refresh()} /> : <Heads data={q.data} reload={() => void q.refresh()} />)}
    </div>
  </main>
}
