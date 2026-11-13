import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listAudit } from '@/api/admin'
import { ConsolePage, PageHeader, Section } from '@/components/console'
import { ErrorBar } from '@/components/ui/data'
import { Input, Select } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'

/* 审计日志：谁在什么范围做了什么；被拒绝的越权调用也会记录 */
export function AuditPage() {
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [result, setResult] = useState('all')
  const q = useQuery(() => listAudit({ actor, action }), [actor, action])
  const rows = (q.data?.data ?? []).filter(a => result === 'all' || a.result === result)
  return (
    <ConsolePage header={<PageHeader title="审计日志" desc="记录发布与审批、权限与配置变更、应用调用与被拒绝的越权访问。普通管理员只看到管理范围内的记录。" />}>
      <div className="w-full">
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        <Section bodyClass="p-0" title={`操作记录 · ${rows.length} 条`} actions={<><Input className="h-8 w-40" placeholder="操作人" value={actor} onChange={e => setActor(e.target.value)} /><Input className="h-8 w-40" placeholder="搜索操作名称" value={action} onChange={e => setAction(e.target.value)} /><Select className="w-36" value={result} onValueChange={setResult} options={[{value:'all',label:'全部结果'},{value:'success',label:'成功'},{value:'denied',label:'已拒绝'},{value:'failed',label:'失败'}]} /><Button size="small" onClick={()=>{setActor('');setAction('');setResult('all')}}>重置</Button><Button size="small" onClick={q.reload}>刷新</Button></>}>
          <table className="w-full text-[13px]">
            <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">时间</th><th className="px-3 font-medium">操作人</th><th className="px-3 font-medium">操作</th><th className="px-3 font-medium">对象</th><th className="px-3 font-medium">范围</th><th className="px-3 font-medium">结果</th></tr></thead>
            <tbody>{!rows.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-ink-3">{q.loading ? '正在加载操作记录…' : '没有符合筛选条件的记录'}</td></tr>}{rows.map(a => <tr key={a.id} className="border-t border-line hover:bg-hover"><td className="px-5 py-2.5 text-ink-3">{new Date(a.time).toLocaleString('zh-CN')}</td><td className="px-3"><span className="font-medium">{a.actor}</span><span className="ml-1.5 text-[12px] text-ink-3">{a.role}</span></td><td className="px-3">{a.action}</td><td className="px-3 text-ink-2">{a.object}</td><td className="px-3 text-ink-2">{a.scope}</td><td className="px-3"><Badge tone={a.result === 'success' ? 'mint' : 'rose'}>{a.result === 'success' ? '成功' : a.result === 'denied' ? '已拒绝' : '失败'}</Badge></td></tr>)}</tbody>
          </table>
        </Section>
      </div>
    </ConsolePage>
  )
}
