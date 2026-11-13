import type { RunDetail, RunStep } from '@/api/teams'
import { RiArrowDownSLine, RiGitMergeLine, RiRouteLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { isActiveRun, runReasons } from '@/api/teams'
import { cn } from '@/lib/cn'
import { agentAvatar, StateDot } from './shared'

type Round = { round: number, plan: RunStep[], batches: RunStep[][], summary: RunStep[] }

/** 按轮次分组：团长规划 → 参与的 Agent（时间重叠的放同一批，表示并行）→ 团长汇总 */
export function groupRounds(steps: RunStep[]): Round[] {
  const rounds = [...new Set(steps.map(s => s.round))].sort((a, b) => a - b)
  return rounds.map((round) => {
    const list = steps.filter(s => s.round === round).sort((a, b) => a.started_at - b.started_at)
    const experts = list.filter(s => s.kind === 'expert')
    const firstExpert = experts[0]?.started_at ?? Infinity
    const batches: RunStep[][] = []
    let end = -Infinity
    for (const s of experts) {
      if (!batches.length || s.started_at >= end) {
        batches.push([s])
        end = s.finished_at ?? Infinity
      }
      else {
        batches[batches.length - 1].push(s)
        end = Math.max(end, s.finished_at ?? Infinity)
      }
    }
    return {
      round,
      plan: list.filter(s => s.kind === 'director' && s.started_at <= firstExpert),
      batches,
      summary: list.filter(s => s.kind === 'director' && s.started_at > firstExpert),
    }
  })
}

const secs = (s: RunStep) => `${Math.max(0, (s.finished_at ?? Date.now() / 1000) - s.started_at).toFixed(1)} 秒`

function StepCard({ step, run, role }: { step: RunStep, run: RunDetail, role: string }) {
  const [open, setOpen] = useState(false)
  const name = run.config.agents[step.agent_id]?.name ?? step.agent_id
  const active = isActiveRun(step.state)
  const body = step.result || (step.error_code ? runReasons[step.error_code] ?? step.error_code : active ? '正在执行…' : '暂无结果')
  return (
    <div className={cn('min-w-0 rounded-2xl border bg-glass-2 transition-colors', active ? 'border-volt/60 shadow-glow-volt' : step.state === 'failed' ? 'border-rose/40' : 'border-line')}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left">
        <img src={agentAvatar({ id: step.agent_id, name })} alt="" className="size-7 shrink-0 rounded-full border border-line" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[11.5px] text-ink-3">{role} · {secs(step)}</span>
        </span>
        <StateDot state={step.state} />
        <RiArrowDownSLine className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {!open && !active && step.result && <p className="line-clamp-2 px-3 pb-2.5 text-[12px] leading-relaxed text-ink-2">{step.result}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2 border-t border-line px-3 py-2.5 text-[12px]">
              <p className="text-ink-3">{step.kind === 'director' ? '规划上下文' : '分配的任务'}</p>
              <pre className="font-sans leading-relaxed whitespace-pre-wrap text-ink-2">{step.task}</pre>
              <p className="text-ink-3">{step.kind === 'director' ? '团长决定 / 汇总' : '返回结果'}</p>
              <pre className={cn('font-sans leading-relaxed whitespace-pre-wrap', step.error_code ? 'text-rose' : 'text-ink')}>{body}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 协作过程：每一轮一条泳道，并行调用的 Agent 并排显示 */
export function RunTrace({ run, className, maxCols = 3 }: { run: RunDetail, className?: string, maxCols?: number }) {
  const rounds = groupRounds(run.steps)
  if (!rounds.length)
    return <p className={cn('py-6 text-center text-[12.5px] text-ink-3', className)}>{isActiveRun(run.state) ? '团队正在排队，马上开始…' : '任务没有产生执行步骤。'}</p>
  return (
    <div className={cn('space-y-3', className)}>
      {rounds.map(r => (
        <motion.section key={r.round} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative rounded-[20px] border border-line bg-hover/40 p-3">
          <p className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink-2">
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-cyan-soft px-1.5 text-[11px] text-cyan tabular-nums">{r.round}</span>
            第 {r.round} 轮
            <span className="font-normal text-ink-3">{r.batches.reduce((s, b) => s + b.length, 0)} 次 Agent 调用</span>
          </p>
          <div className="space-y-2">
            {r.plan.map(s => <StepCard key={s.id} step={s} run={run} role={r.round === 1 ? '团长 · 规划分工' : '团长 · 检查并追加'} />)}
            {r.batches.map((b, i) => (
              <div key={i} className="relative pl-4">
                <span className="absolute top-1 bottom-1 left-1 w-px bg-cyan/50" aria-hidden />
                {b.length > 1 && <p className="mb-1.5 flex items-center gap-1 text-[11px] text-cyan"><RiRouteLine className="size-3.5" />并行 × {b.length}</p>}
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(b.length, maxCols)}, minmax(0, 1fr))` }}>
                  {b.map(s => <StepCard key={s.id} step={s} run={run} role="参与的 Agent" />)}
                </div>
              </div>
            ))}
            {r.summary.map(s => (
              <div key={s.id}>
                <p className="mb-1.5 flex items-center gap-1 text-[11px] text-ink-3"><RiGitMergeLine className="size-3.5" />汇总</p>
                <StepCard step={s} run={run} role="团长 · 汇总答复" />
              </div>
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  )
}
