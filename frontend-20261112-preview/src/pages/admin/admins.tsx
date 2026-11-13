/* 管理员与权限：超级管理员（至少保留一位）、部门负责人、静态权限矩阵。仅超级管理员可见。 */
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { addSuper, fmtTime, getOrg, listHeads, listSupers, removeHead, removeSuper } from '@/api/governance'
import { ModuleTitle } from '@/components/page-mark'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { card } from './org'

type Tab = 'supers' | 'heads' | 'matrix'
const MATRIX: [string, string, string, string][] = [
  ['开发智能体、团队、Skills、MCP', '✓', '✓', '✓'],
  ['申请共享到部门 / 公共空间', '✓', '✓', '✓'],
  ['改为仅个人（立即生效）', '✓', '✓', '✓'],
  ['查看「我的发布」', '本人', '本人', '本人'],
  ['审批「部门」申请', '—', '本部门（含下级）', '全部'],
  ['审批「公共空间」申请', '—', '—', '✓'],
  ['转审超级管理员', '—', '✓', '—'],
  ['审批自己提交的申请', '—', '—', '—'],
  ['查看组织树', '—', '本部门子树（只读）', '全部'],
  ['维护部门、成员所属部门', '—', '—', '✓'],
  ['设置 / 移除部门负责人', '—', '—', '✓'],
  ['任命 / 撤销超级管理员', '—', '—', '✓'],
  ['查看业务空间用量', '—', '负责的部门', '全部'],
  ['查看审计日志', '—', '本部门（含下级）', '全部'],
]

export default function Admins() {
  const [tab, setTab] = useState<Tab>('supers')
  const supers = useQuery(listSupers, [])
  const heads = useQuery(listHeads, [])
  const org = useQuery(getOrg, [])
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [confirm, setConfirm] = useState<{ title: string, run: () => Promise<unknown> }>()
  const [error, setError] = useState('')
  const act = async (fn: () => Promise<unknown>, ok: string) => { setError(''); try { await fn(); toast(ok); supers.reload(); heads.reload(); org.reload(); return true } catch (e) { setError((e as Error).message); return false } }
  const th = (cols: string[]) => <thead className="bg-hover text-[12px] text-ink-3"><tr>{cols.map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
  return <main className="flex-1 overflow-auto p-6">
    <header className="flex items-start justify-between"><div><ModuleTitle>管理员与权限</ModuleTitle><p className="mt-2 text-sm text-ink-3">两类管理角色：超级管理员管理全平台；部门负责人审批本部门（含下级）成员的部门共享。</p></div>{tab === 'supers' && <Button variant="primary" onClick={() => { setAdding(true); setPick('') }}>添加超级管理员</Button>}</header>
    <Segmented<Tab> className="mt-4" value={tab} onValueChange={setTab} options={[{ value: 'supers', label: '超级管理员', count: supers.data?.data.length }, { value: 'heads', label: '部门负责人', count: heads.data?.data.length }, { value: 'matrix', label: '权限矩阵' }]} />
    {error && <p role="alert" className="mt-3 text-[13px] text-rose">{error}</p>}
    <div className="mt-4"><ErrorBar error={supers.error ?? heads.error} onRetry={() => { supers.reload(); heads.reload() }} /></div>
    {tab === 'supers' && <div className={`${card} overflow-hidden`}><table className="w-full text-left text-[13px]">{th(['姓名', '部门', '任命人', '任命时间', ''])}<tbody className="divide-y divide-line">{supers.data?.data.map(s => <tr key={s.account_id}>
      <td className="px-4 py-2.5"><p className="font-medium">{s.name}</p><p className="text-[11.5px] text-ink-3">{s.email}</p></td><td className="px-4 py-2.5">{s.department_name ?? '未分配'}</td><td className="px-4 py-2.5">{s.granted_by_name ?? '系统初始化'}</td><td className="px-4 py-2.5 tabular-nums">{fmtTime(s.granted_at)}</td>
      <td className="px-4 py-2.5 text-right"><Button size="small" variant="ghost" tone="destructive" disabled={(supers.data?.data.length ?? 0) <= 1} title={(supers.data?.data.length ?? 0) <= 1 ? '至少保留一位超级管理员' : undefined} onClick={() => setConfirm({ title: `撤销 ${s.name} 的超级管理员？`, run: () => act(() => removeSuper(s.account_id), '已撤销') })}>撤销</Button></td>
    </tr>)}</tbody></table></div>}
    {tab === 'heads' && <div className={`${card} overflow-hidden`}><table className="w-full text-left text-[13px]">{th(['负责人', '部门', '任命人', '任命时间', ''])}<tbody className="divide-y divide-line">
      {!heads.data?.data.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-3">还没有部门负责人，可在「组织与成员 · 部门负责人」设置</td></tr>}
      {heads.data?.data.map(h => <tr key={`${h.department_id}-${h.account_id}`}><td className="px-4 py-2.5 font-medium">{h.name}</td><td className="px-4 py-2.5">{h.department_name}</td><td className="px-4 py-2.5">{h.granted_by_name ?? '—'}</td><td className="px-4 py-2.5 tabular-nums">{fmtTime(h.granted_at)}</td>
        <td className="px-4 py-2.5 text-right"><Button size="small" variant="ghost" tone="destructive" onClick={() => setConfirm({ title: `撤销 ${h.name} 的「${h.department_name}」负责人？`, run: () => act(() => removeHead(h.department_id, h.account_id), '已撤销') })}>撤销</Button></td></tr>)}
    </tbody></table></div>}
    {tab === 'matrix' && <div className={`${card} overflow-hidden`}><table className="w-full text-left text-[13px]">{th(['操作', '成员', '部门负责人', '超级管理员'])}<tbody className="divide-y divide-line">{MATRIX.map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={`px-4 py-2 ${i ? (c === '—' ? 'text-ink-3' : 'text-ink') : 'font-medium'}`}>{c}</td>)}</tr>)}</tbody></table></div>}
    {adding && <Dialog open onOpenChange={setAdding} title="添加超级管理员" description="超级管理员可审批公共空间申请、维护组织与负责人。" footer={<><Button onClick={() => setAdding(false)}>取消</Button><Button variant="primary" disabled={!pick} onClick={async () => { if (await act(() => addSuper(pick), '已添加超级管理员')) setAdding(false) }}>添加</Button></>}>
      <Select value={pick} onValueChange={setPick} placeholder="选择成员" options={(org.data?.members ?? []).filter(m => m.role !== 'super_admin').map(m => ({ value: m.id, label: `${m.name} · ${m.email}` }))} />
    </Dialog>}
    <ConfirmDialog open={!!confirm} onOpenChange={v => !v && setConfirm(undefined)} title={confirm?.title ?? ''} confirmText="撤销" danger onConfirm={() => { void confirm?.run(); setConfirm(undefined) }} />
  </main>
}
