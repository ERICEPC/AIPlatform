import { RiArrowRightLine, RiComputerLine, RiGitMergeLine, RiLightbulbLine } from '@remixicon/react'
import { useQuery } from '@/api/hooks'
import { getTuneOverview } from '@/api/tune'
import { Bars, MetricRow, Section, StatusTag } from '@/components/console'
import { ErrorBar } from '@/components/ui/data'
import { Skeleton } from '@/components/ui/primitives'

/* 总览：一个人的助手做事情况 + 待优化事项 + 工作原理 */
export function TuneOverview({ go }: { go: (p: string) => void }) {
  const q = useQuery(getTuneOverview, [])
  const d = q.data
  if (q.error)
    return <ErrorBar error={q.error} onRetry={q.reload} />
  if (!d)
    return <Skeleton className="h-64" />
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MetricRow items={[
        { label: '近 7 天任务', value: d.tasks_7d, sub: '个人助手处理' },
        { label: '路由命中率', value: `${d.route_accuracy}%`, sub: '一次就交对执行方', tone: 'volt' },
        { label: '记忆健康分', value: d.memory_score, sub: '重复、冲突、过期越少越高' },
        { label: '启用的技能 / 专家', value: `${d.skills_active} / ${d.experts_active}` },
        { label: '需人确认占比', value: `${d.human_rate}%`, sub: '对外、写入、报价等' },
      ]} />
      <div className="grid grid-cols-[1.4fr_1fr] gap-5 max-xl:grid-cols-1">
        <Section title="待优化" desc="根据近期运行自动发现，处理后重新计算。">
          <div className="divide-y divide-line">
            {d.tips.map(t => (
              <button key={t.id} type="button" onClick={() => go(t.to)} className="flex w-full cursor-pointer items-center gap-3 py-3 text-left first:pt-0 last:pb-0 hover:text-volt-text">
                <RiLightbulbLine className="size-4 shrink-0 text-amber" />
                <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium">{t.title}</span><span className="block text-[12.5px] text-ink-3">{t.detail}</span></span>
                <RiArrowRightLine className="size-4 text-ink-3" />
              </button>
            ))}
          </div>
        </Section>
        <Section title="路由命中率趋势" desc="近 7 天，越高说明任务一次就交给了正确的执行方。">
          <Bars data={d.trend} labels={['周一', '周二', '周三', '周四', '周五', '周六', '周日']} unit="%" height={130} />
          <div className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-3"><RiComputerLine className="size-4" />桌面连接器 {d.desktop_online ? <StatusTag status="ok" label="在线" /> : <StatusTag status="warn" label="离线" />}</div>
        </Section>
      </div>
      <Section title="个人助手怎么做事" desc="一句话进来，按下面的顺序处理；每一层都可以在对应页签里调整。">
        <ol className="grid grid-cols-5 gap-3 max-xl:grid-cols-2">
          {[
            ['1 理解目标', '读取角色、工作指令与已确认的记忆，必要时先提问'],
            ['2 任务路由', '个人 Router 判断用哪些工具、Skill、专家智能体或智能体团队'],
            ['3 分处执行', '本机文件在桌面端执行，检索与生成在云端执行'],
            ['4 人来把关', '对外发送、写入系统、报价承诺转「待我确认」'],
            ['5 沉淀优化', '经确认的经验进入记忆，稳定的做法沉淀为 Skill'],
          ].map(([t, d2]) => (
            <li key={t} className="rounded-lg border border-line bg-surface p-3.5">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold"><RiGitMergeLine className="size-4 text-volt-text" />{t}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{d2}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
