/* 业务空间：按部门看智能体用量。智能体属于其所有者所在部门；部门负责人只看自己负责的部门。 */
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { fmtTime, getUsage } from '@/api/governance'
import { ModuleTitle } from '@/components/page-mark'
import { SHARED_TEXT } from '@/components/resource-visibility'
import { ErrorBar } from '@/components/ui/data'
import { Segmented } from '@/components/ui/segmented'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/cn'
import { card } from './org'

const num = (n: number) => n >= 1e8 ? `${(n / 1e8).toFixed(2)} 亿` : n >= 1e4 ? `${(n / 1e4).toFixed(1)} 万` : n.toLocaleString('zh-CN')

export default function Spaces() {
  const { perms } = useSession()
  const superuser = perms?.role === 'super_admin'
  const [days, setDays] = useState<'7' | '30'>('7')
  const [dept, setDept] = useState(superuser ? '' : perms?.head_department_ids[0] ?? '')
  const q = useQuery(() => getUsage(Number(days) as 7 | 30, dept), [days, dept])
  const u = q.data
  const list = [...(superuser ? [{ id: '', name: '全部' }] : []), ...(u?.departments ?? [])]
  const current = list.find(d => d.id === dept)?.name ?? '全部'
  return <main className="flex min-h-0 flex-1 flex-col p-6">
    <header className="flex items-start justify-between gap-4"><div><ModuleTitle>业务空间</ModuleTitle><p className="mt-2 text-sm text-ink-3">按部门查看智能体用量。智能体归属其所有者所在部门。</p></div>
      <Segmented<'7' | '30'> value={days} onValueChange={setDays} aria-label="时间范围" options={[{ value: '7', label: '近 7 天' }, { value: '30', label: '近 30 天' }]} /></header>
    <div className="mt-4 grid min-h-0 flex-1 grid-cols-[220px_1fr] gap-4">
      <nav className={cn(card, 'min-h-0 overflow-auto p-1.5')} aria-label="部门">{list.map(d => <button key={d.id || 'all'} type="button" onClick={() => setDept(d.id)} className={cn('flex h-9 w-full cursor-pointer items-center rounded-md px-3 text-left text-[13px]', dept === d.id ? 'bg-volt-soft font-semibold text-volt-text' : 'hover:bg-hover')}>{d.name}</button>)}</nav>
      <section className="flex min-h-0 flex-col gap-3">
        <ErrorBar error={q.error} onRetry={q.reload} />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{([['智能体数', u?.summary.agents], ['调用次数', u?.summary.calls], ['调用人数', u?.summary.callers], ['模型 Token 总量', u?.summary.tokens]] as const).map(([k, v]) =>
          <div key={k} className={cn(card, 'px-4 py-3')}><p className="text-[12.5px] text-ink-3">{current} · {k}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v === undefined ? '—' : num(v)}</p></div>)}</div>
        <div className={cn(card, 'min-h-0 flex-1 overflow-auto')}>
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-hover text-[12px] text-ink-3"><tr>{['智能体', '所有者', '可见范围', '调用次数', '调用人数', '模型 Token', 'Token 合计', '最近调用'].map(h => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {u && !u.agents.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-3">该时间范围内没有调用</td></tr>}
              {u?.agents.map(a => <tr key={a.id}>
                <td className="px-3 py-2.5 font-medium">{a.name}</td>
                <td className="px-3 py-2.5">{a.owner_name}<p className="text-[11.5px] text-ink-3">{a.department_name ?? '未分配部门'}</p></td>
                <td className="px-3 py-2.5">{SHARED_TEXT[a.visibility]}</td>
                <td className="px-3 py-2.5 tabular-nums">{a.calls.toLocaleString('zh-CN')}</td>
                <td className="px-3 py-2.5 tabular-nums">{a.callers}</td>
                <td className="px-3 py-2.5"><div className="space-y-0.5">{a.models.map(m => <p key={m.model} className="flex justify-between gap-3 text-[12px]"><span className="text-ink-2">{m.model}</span><span className="tabular-nums">{num(m.tokens)}</span></p>)}</div></td>
                <td className="px-3 py-2.5 font-medium tabular-nums">{num(a.tokens)}</td>
                <td className="px-3 py-2.5 text-ink-2 tabular-nums">{fmtTime(a.last_called_at)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
}
