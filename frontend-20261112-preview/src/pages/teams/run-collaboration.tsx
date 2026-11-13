import type { Agent, Config, RunDetail } from '@/api/teams'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { NetworkNode } from '@/three/CollabNetwork'
import { useTheme } from '@/lib/theme'

const CollabNetwork = lazy(() => import('@/three/CollabNetwork'))
import { isActiveRun } from '@/api/teams'
import { cn } from '@/lib/cn'
import { agentAvatar, StateDot } from './shared'

export function RunCollaboration({ config, agents, run }: { config: Config, agents: Agent[], run?: RunDetail }) {
  const [selected, setSelected] = useState('')
  const [replay, setReplay] = useState<number | null>(null)
  const { theme } = useTheme()
  useEffect(() => { setReplay(null); setSelected('') }, [run?.id, config.leader_id])
  useEffect(() => {
    if (replay === null) return
    const timer = setTimeout(() => setReplay(i => i === null || i + 1 >= (run?.steps.length ?? 0) ? null : i + 1), 1800)
    return () => clearTimeout(timer)
  }, [replay, run?.steps.length])
  const ids = [...new Set([config.leader_id, ...config.members.map(m => m.agent_id), ...Object.keys(run?.config.agents ?? {})].filter(Boolean))]
  const people = ids.map(id => ({ id, name: run?.config.agents[id]?.name ?? agents.find(a => a.id === id)?.name ?? '团队成员' }))
  const current = people.find(p => p.id === selected) ?? people[0]
  const steps = run?.steps ?? []
  const ordered = [...steps].sort((a, b) => a.started_at - b.started_at)
  const replayStep = replay === null ? undefined : ordered[replay]
  const activeSteps = replayStep ? [replayStep] : run && isActiveRun(run.state) ? steps.filter(s => s.state === 'running') : []
  const activeIds = new Set(activeSteps.map(s => s.agent_id))
  const currentSteps = steps.filter(s => s.agent_id === current?.id)
  const nodes: NetworkNode[] = people.map(p => ({ id: p.id, label: p.name, kind: 'agent', avatar: agentAvatar(p), status: activeIds.has(p.id) ? 'busy' : 'idle' }))
  const edges = activeSteps.flatMap(s => (s.handoffs ?? []).map(edge => ({ ...edge, active: true })))
  const name = (id: string) => people.find(p => p.id === id)?.name ?? '团队成员'
  return (
    <aside className="flex min-h-0 flex-col overflow-auto">
      <section className="shrink-0 border-b border-line bg-solid px-4 pb-4">
        <div className="-mx-4 flex h-14 items-center justify-between border-b border-line px-4"><h3 className="text-[13px] font-semibold">协同网络</h3><span className="text-[10px] text-ink-3">{replay !== null ? '历史回放' : run && isActiveRun(run.state) ? '实时协作' : '团队关系'}</span></div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3"><span>{people.length} 位成员 · {steps.filter(s => s.kind === 'expert').length} 次专家调用</span>{!!steps.length && run && !isActiveRun(run.state) && <button type="button" onClick={() => setReplay(i => i === null ? 0 : null)} className="cursor-pointer rounded border border-line px-2 py-0.5 text-volt-text hover:bg-volt-soft">{replay === null ? '回放过程' : '停止回放'}</button>}</div>
        <div className="relative h-[265px] overflow-hidden" aria-label="团队动态协同网络">
          <Suspense fallback={<div className="grid h-full place-items-center text-xs text-ink-3">正在加载协同网络…</div>}>
            <CollabNetwork theme={theme} nodes={nodes} edges={edges} selectedId={selected || null} onSelect={setSelected} />
          </Suspense>
        </div>
        {replayStep && <p className="mb-2 truncate rounded-md bg-volt-soft px-2 py-1.5 text-[10px] text-volt-text" title={replayStep.task}>回放 {replay! + 1}/{ordered.length} · {people.find(p => p.id === replayStep.agent_id)?.name}：{replayStep.task}</p>}
        <div className="mb-2 space-y-1 text-[11px]" aria-live="polite">
          {activeSteps.map(s => <p key={s.id} className="text-amber-600"><span className="mr-1.5 inline-block size-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse" />{name(s.agent_id)} · 执行中</p>)}
          {edges.map((e, i) => <p key={`${e.from}-${e.to}-${i}`} className="text-ink-3">{name(e.from)} → {name(e.to)} · {e.to === config.leader_id ? '结果回传' : '任务交接'}</p>)}
          {!activeSteps.length && <p className="text-center text-ink-3">{run && isActiveRun(run.state) ? '等待下一步任务' : '当前无任务交接'}</p>}
        </div>
        <p className="text-center text-[10px] text-ink-3">拖动旋转 · 点击成员查看任务与协作关系</p>
      </section>
      <section className="bg-solid p-4">
        {current && <><div className="flex items-center gap-2.5"><img src={agentAvatar(current)} alt="" className="size-10 rounded-full border border-line" /><div className="min-w-0"><p className="truncate text-[13px] font-semibold">{current.name}</p><p className="mt-1 text-[11px] text-ink-3">{current.id === config.leader_id ? '团长 · 任务规划与结果汇总' : '专家智能体'}</p></div></div>
        <p className="mt-4 text-[11px] text-ink-3">负责的工作</p><p className="mt-2 text-[12px] leading-relaxed text-ink-2">{current.id === config.leader_id ? '理解需求，分配任务，协调成员并汇总最终结果。' : config.members.find(m => m.agent_id === current.id)?.responsibility || '参与当前任务协作'}</p>
        <p className="mt-4 text-[11px] text-ink-3">本次任务</p>
        {!currentSteps.length && <p className="mt-2 text-[12px] text-ink-3">{run ? '暂无执行记录' : '发送任务后查看执行情况'}</p>}
        {currentSteps.map(s => <div key={s.id} className="mt-2 rounded-md border border-line p-2.5"><StateDot state={s.state} className="text-[11px]" /><p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{s.task}</p></div>)}
        </>}
        <div className="mt-4 border-t border-line pt-3"><p className="mb-2 text-[11px] text-ink-3">团队成员 · {people.length}</p>{people.map(p => <button key={p.id} type="button" onClick={() => setSelected(p.id)} className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md p-2 text-left hover:bg-hover', current?.id === p.id && 'bg-hover')}><img src={agentAvatar(p)} alt="" className="size-7 rounded-full" /><span className="min-w-0 truncate text-[12px]">{p.name}</span>{p.id === config.leader_id && <span className="ml-auto shrink-0 text-[10px] text-volt-text">团长</span>}</button>)}</div>
      </section>
    </aside>
  )
}

export function RunProgress({ run }: { run: RunDetail }) {
  const latestSteps = [...new Map(run.steps.map(step => [step.agent_id, step])).values()]
  return <div className="bg-solid p-4"><div className="mb-3 flex items-center justify-between"><p className="text-[13px] font-semibold">团队协作进度</p><span className="text-[11px] text-ink-3">已完成 {run.steps.filter(s => s.state === 'succeeded').length} / {run.steps.length}</span></div>{latestSteps.length ? latestSteps.map(s => <div key={s.id} className="mt-3"><div className="flex items-center justify-between gap-2 text-[12px]"><span className="truncate">{run.config.agents[s.agent_id]?.name ?? '团队成员'}<span className="ml-2 text-[10px] text-ink-3">{s.kind === 'director' ? '团长' : '专家'}</span></span><StateDot state={s.state} className="shrink-0 text-[11px]" /></div><p className="mt-1 line-clamp-1 text-[11px] text-ink-3">{s.task}</p>{s.result && <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-ink-2">{s.result}</p>}<div className="mt-2 h-0.5 overflow-hidden rounded-full bg-hover"><div className={cn('h-full', s.state === 'succeeded' ? 'w-full bg-volt' : isActiveRun(s.state) ? 'w-1/2 animate-pulse bg-volt/50' : 'w-full bg-rose/40')} /></div></div>) : <p className="text-[12px] text-ink-3">等待团长分配任务…</p>}</div>
}
