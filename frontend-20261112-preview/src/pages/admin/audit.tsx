/* 审计日志：只记录人的操作（不含应用调用、智能体运行）。超级管理员看全量；部门负责人看本部门（含下级）。 */
import { RiSearchLine } from '@remixicon/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listAudit, type AuditQuery } from '@/api/governance'
import { ModuleTitle } from '@/components/page-mark'
import { ErrorBar } from '@/components/ui/data'
import { Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { useSession } from '@/lib/session'
import { card } from './org'

const RESULT = { success: ['成功', 'mint'], denied: ['已拒绝', 'amber'], failed: ['失败', 'rose'] } as const
const time = (v: string) => new Date(v).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

export default function Audit() {
  const { perms } = useSession()
  const [f, setF] = useState<Required<AuditQuery>>({ actor: '', category: '', department_id: '', result: '', days: '30', keyword: '' })
  const [kw, setKw] = useState('')
  const q = useQuery(() => listAudit(f), [JSON.stringify(f)])
  const set = (k: keyof AuditQuery) => (v: string) => setF({ ...f, [k]: v === 'all' ? '' : v })
  const all = (v: string) => v || 'all'
  return <main className="flex min-h-0 flex-1 flex-col p-6">
    <header><ModuleTitle>审计日志</ModuleTitle><p className="mt-2 text-sm text-ink-3">记录人的操作：发布申请、审批处理、权限变更、组织变更、技术栈配置与登录。应用调用与智能体运行日志在各自详情页查看。</p></header>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Select size="sm" className="w-[130px]" value={all(f.actor)} onValueChange={set('actor')} options={[{ value: 'all', label: '全部操作人' }, ...(q.data?.actors ?? []).map(a => ({ value: a, label: a }))]} />
      <Select size="sm" className="w-[130px]" value={all(f.category)} onValueChange={set('category')} options={[{ value: 'all', label: '全部类别' }, ...(q.data?.categories ?? []).map(a => ({ value: a, label: a }))]} />
      {perms?.role === 'super_admin' && <Select size="sm" className="w-[150px]" value={all(f.department_id)} onValueChange={set('department_id')} options={[{ value: 'all', label: '全部部门' }, ...(perms.departments ?? []).map(d => ({ value: d.id, label: d.name }))]} />}
      <Select size="sm" className="w-[110px]" value={all(f.result)} onValueChange={set('result')} options={[{ value: 'all', label: '全部结果' }, { value: 'success', label: '成功' }, { value: 'denied', label: '已拒绝' }, { value: 'failed', label: '失败' }]} />
      <Select size="sm" className="w-[110px]" value={all(f.days)} onValueChange={set('days')} options={[{ value: '7', label: '近 7 天' }, { value: '30', label: '近 30 天' }, { value: 'all', label: '全部时间' }]} />
      <form className="flex h-8 w-[220px] items-center gap-1.5 rounded-md border border-line bg-solid px-2" onSubmit={e => { e.preventDefault(); setF({ ...f, keyword: kw.trim() }) }}><RiSearchLine className="size-4 text-ink-3" /><input aria-label="按对象名搜索" value={kw} onChange={e => setKw(e.target.value)} onBlur={() => setF({ ...f, keyword: kw.trim() })} placeholder="对象名，回车搜索" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></form>
      <span className="ml-auto text-[12.5px] text-ink-3">{q.data?.data.length ?? 0} 条</span>
    </div>
    <div className="mt-3"><ErrorBar error={q.error} onRetry={q.reload} /></div>
    <div className={`${card} mt-3 min-h-0 flex-1 overflow-auto`}>
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-hover text-[12px] text-ink-3"><tr>{['时间', '操作人', '对象', '内容', '部门', '结果'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {q.data && !q.data.data.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-3">没有符合条件的记录</td></tr>}
          {q.data?.data.map(a => <tr key={a.id}>
            <td className="px-4 py-2.5 whitespace-nowrap text-ink-2 tabular-nums">{time(a.time)}</td>
            <td className="px-4 py-2.5 whitespace-nowrap">{a.actor_name}</td>
            <td className="px-4 py-2.5 font-medium">{a.object_name || '—'}</td>
            <td className="px-4 py-2.5"><span className="text-ink-3">{a.category}</span> · {a.summary}</td>
            <td className="px-4 py-2.5 whitespace-nowrap">{a.department_name ?? '—'}</td>
            <td className="px-4 py-2.5"><Badge tone={RESULT[a.result][1]}>{RESULT[a.result][0]}</Badge></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </main>
}
