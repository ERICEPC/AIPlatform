import { RiFileCopy2Line, RiRobot2Line } from '@remixicon/react'
import { useQuery } from '@/api/hooks'
import { listMyExperts, toggleMyExpert } from '@/api/tune'
import { Section } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Badge } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'

/* 专家智能体：个人助手可委派的个人专家与组织专家，以及把个人助手复制为专家智能体 */
export function TuneExperts({ go }: { go: (p: string) => void }) {
  const q = useQuery(listMyExperts, [])
  const list = q.data?.data ?? []
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <Section
        title="可委派的专家智能体"
        desc="个人专家智能体由你维护；组织专家智能体需要组织授权且已发布。委派不扩大权限，每次调用重新校验。"
        actions={<><Button onClick={() => go('agents/mine')}>管理我的智能体</Button><Button variant="primary" onClick={() => go('releases?copy=assistant')}><RiFileCopy2Line className="size-4" />把我的助手复制为专家智能体</Button></>}
        bodyClass="p-0"
      >
        {q.error && <div className="p-4"><ErrorBar error={q.error} onRetry={q.reload} /></div>}
        <table className="w-full text-[13px]">
          <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">专家智能体</th><th className="w-[160px] px-3 font-medium">归属</th><th className="w-[100px] px-3 font-medium">状态</th><th className="w-[170px] px-3 font-medium">近 30 天调用</th><th className="w-[90px] px-3 font-medium">允许委派</th></tr></thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="px-5 py-3"><p className="flex items-center gap-2 font-medium"><RiRobot2Line className="size-4 text-volt-text" />{e.name}</p><p className="mt-0.5 text-[12.5px] text-ink-3">{e.desc}</p>{e.issue && <p className="mt-1 text-[12.5px] text-amber">{e.issue}</p>}</td>
                <td className="px-3 py-3"><Badge tone={e.kind === 'org' ? 'volt' : 'neutral'}>{e.kind === 'org' ? '组织' : '个人'}</Badge><p className="mt-1 text-[12px] text-ink-3">{e.owner}</p></td>
                <td className="px-3 py-3"><Badge tone={e.status === 'published' ? 'mint' : e.status === 'reviewing' ? 'amber' : 'neutral'}>{e.status === 'published' ? '已发布' : e.status === 'reviewing' ? '审批中' : '草稿（仅自己）'}</Badge></td>
                <td className="px-3 py-3 text-ink-2 tabular-nums">{e.calls_30d ? <>{e.calls_30d} 次 · 成功 {e.success}%<br /><span className="text-ink-3">平均 {e.avg_latency} 秒</span></> : '—'}</td>
                <td className="px-3 py-3"><Switch aria-label={`允许委派 ${e.name}`} checked={e.enabled} disabled={e.status === 'reviewing'} onCheckedChange={async v => { await toggleMyExpert(e.id, v); q.reload() }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="个人助手与专家智能体怎么协同">
        <ol className="grid grid-cols-4 gap-3 text-[13px] leading-relaxed max-lg:grid-cols-2">
          {[['个人助手', '懂你的工作方式，接任务、拆步骤、汇总结果'], ['个人专家智能体', '你沉淀的专长，草稿只自己用，发布需管理员审批'], ['组织专家智能体', '组织统一提供的专项能力，按授权委派'], ['智能体团队', '多个专家接力完成的流程，由 Leader 统筹']].map(([t, d], i) => (
            <li key={t} className="rounded-lg border border-line bg-surface p-3.5"><p className="font-semibold">{i + 1}. {t}</p><p className="mt-1 text-ink-2">{d}</p></li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
