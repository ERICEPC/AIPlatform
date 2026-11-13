import { RiArrowRightLine } from '@remixicon/react'
import { useQuery } from '@/api/hooks'
import { getOverview, listApprovals } from '@/api/admin'
import { KIND_TEXT } from '@/api/releases'
import { Button } from '@/components/ui/button'
import { ROLE_LABEL, SCOPE_LABEL } from '@/api/access'
import { Bars, ConsolePage, MetricRow, PageHeader, Section, StatusTag } from '@/components/console'
import { ErrorBar } from '@/components/ui/data'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { useSession } from '@/lib/session'

export function OverviewPage({ go }: { go: (p: string) => void }) {
  const q = useQuery(getOverview, [])
  const pending = useQuery(() => listApprovals('pending'), [])
  const { perms } = useSession()
  const d = q.data
  return (
    <ConsolePage header={<PageHeader title="管理概览" actions={<Button size="small" onClick={() => {q.reload();pending.reload()}}>刷新数据</Button>} desc={perms?.role === 'super_admin' ? '超级管理员：全部组织、业务空间、应用接入与 AI 技术栈组件。' : '普通管理员：只看到并管理你的管理范围。'} meta={perms && <Badge tone="volt">{ROLE_LABEL[perms.role]}</Badge>} />}>
      <div className="w-full space-y-5">
        {perms?.role === 'admin' && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-solid px-5 py-3 text-[13px]"><span className="text-ink-3">我的管理范围</span>{perms.scopes.map(s => <Badge key={s.id} tone="volt">{SCOPE_LABEL[s.type]} · {s.name}</Badge>)}</div>}
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        {!d ? <Skeleton className="h-72" /> : (
          <>
            <MetricRow items={[{ label: '待审批的发布', value: d.pending, tone: d.pending ? 'amber' : undefined, sub: '资源发布与团队共享申请' }, { label: '近 30 天发布', value: d.published_30d }, { label: '成员', value: d.members }, { label: '管理员', value: d.admins }, { label: '业务空间', value: d.spaces }]} />
            <Section title="待处理审批" desc="查看申请内容与资源详情，处理发布和团队共享。" actions={<Button size="small" onClick={() => go('admin/approvals')}>进入审批中心<RiArrowRightLine className="size-3.5" /></Button>} bodyClass="p-0">
              {pending.error ? <ErrorBar error={pending.error} onRetry={pending.reload} /> : pending.loading ? <div className="p-5 text-sm text-ink-3">正在加载申请…</div> : !pending.data?.data.length ? <div className="p-8 text-center text-sm text-ink-3">当前没有待处理的审批</div> : <div className="overflow-x-auto"><table className="w-full text-left text-[13px]"><thead className="bg-surface text-xs text-ink-3"><tr>{['申请资源','类型','申请人','提交时间','操作'].map(t=><th key={t} className="px-5 py-3 font-medium">{t}</th>)}</tr></thead><tbody>{pending.data.data.slice(0,5).map(r=><tr key={r.id} className="border-t border-line hover:bg-hover"><td className="px-5 py-3 font-medium">{r.name}<span className="ml-2 text-xs font-normal text-ink-3">{r.version}</span></td><td className="px-5">{KIND_TEXT[r.kind]}</td><td className="px-5">{r.applicant}</td><td className="px-5 text-ink-3">{new Date(r.submitted_at).toLocaleString('zh-CN')}</td><td className="px-5"><Button size="small" onClick={()=>go(`admin/approvals/${r.id}`)}>查看申请</Button></td></tr>)}</tbody></table></div>}
            </Section>
            <div className="grid grid-cols-[1.3fr_1fr] gap-5 max-xl:grid-cols-1">
              <Section title="平台调用（近 7 天，万次）" actions={<button type="button" className="cursor-pointer text-[12.5px] text-volt-text hover:underline" onClick={() => go('admin/apps')}>应用接入</button>}>
                <Bars data={d.calls_7d} labels={['一', '二', '三', '四', '五', '六', '日']} height={120} />
                <div className="mt-4 grid grid-cols-2 gap-2">{d.apps.map(a => <button type="button" onClick={() => go(`admin/apps/${a.id}`)} key={a.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:bg-hover"><span>{a.name}</span><span className="flex items-center gap-2 text-ink-3 tabular-nums">{a.calls_7d.toLocaleString()}<StatusTag status={a.status} label={a.status === 'pending' ? '待接入' : undefined} /></span></button>)}</div>
              </Section>
              <Section title="AI 技术栈组件" actions={<button type="button" className="cursor-pointer text-[12.5px] text-volt-text hover:underline" onClick={() => go('admin/stack')}>全部组件</button>}>
                <div className="mb-4 flex items-center gap-3 text-[13px]"><Badge tone="mint">正常 {d.components.filter(c=>c.status==='ok').length}</Badge><Badge tone="amber">需关注 {d.components.filter(c=>c.status!=='ok').length}</Badge><span className="text-ink-3">共 {d.components.length} 个组件</span></div><div className="grid grid-cols-2 gap-x-4 gap-y-2">{[...d.components].sort((a,b) => Number(b.status !== 'ok') - Number(a.status !== 'ok')).slice(0,8).map(c => <button key={c.id} type="button" onClick={() => go(`admin/stack/${c.id}`)} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-hover"><span className="truncate">{c.name}</span><StatusTag status={c.status} /></button>)}</div>
              </Section>
            </div>
            <Section title="最近操作" actions={<button type="button" className="flex cursor-pointer items-center gap-1 text-[12.5px] text-volt-text hover:underline" onClick={() => go('admin/audit')}>审计日志<RiArrowRightLine className="size-3.5" /></button>} bodyClass="p-0">
              {d.recent.map(a => <div key={a.id} className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[13px] first:border-t-0"><span className="w-36 text-ink-3">{new Date(a.time).toLocaleString('zh-CN')}</span><span className="w-24 font-medium">{a.actor}</span><span className="flex-1">{a.action} · {a.object}</span><span className="text-ink-3">{a.scope}</span><Badge tone={a.result === 'success' ? 'mint' : 'rose'}>{a.result === 'success' ? '成功' : a.result === 'denied' ? '已拒绝' : '失败'}</Badge></div>)}
            </Section>
          </>
        )}
      </div>
    </ConsolePage>
  )
}
