import type { SectionProps } from './detail'
import type { RunDetail, RunStep } from '@/api/teams'
import { RiArrowRightLine, RiExternalLinkLine, RiHandHeartLine, RiSendPlane2Fill, RiUserLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { createRun, getRun, isActiveRun, listRuns } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { agentAvatar, fmtTime, Markdown, StateDot } from './shared'

/*
  对话窗口：每个工作流的配置都会生成一个对话窗口，把执行过程按聊天的方式摊开（黑盒变白盒）。
  用户的任务 → Leader 规划 → 成员逐个执行与交接 → 人工确认点 → Leader 汇总。
  同一窗口也可以在「智能体协同」里作为工作流专属群聊打开。
*/
export function TeamChatWindow({ team, form, go }: SectionProps) {
  const toast = useToast()
  const runs = useQuery(() => listRuns(team.id, { period: 'last30days', page: 1, limit: 12, sort_by: 'created_at', sort_order: 'desc' }), [team.id])
  const [current, setCurrent] = useState<string>('')
  const id = current || runs.data?.runs[0]?.id || ''
  const [active, setActive] = useState(false)
  const run = useQuery(() => getRun(team.id, id), [team.id, id], { enabled: !!id, pollMs: active ? 1500 : false })
  useEffect(() => setActive(!!run.data && isActiveRun(run.data.state)), [run.data])
  const [text, setText] = useState('')
  const send = async () => {
    if (!text.trim())
      return
    const r = await createRun(team.id, { query: text.trim(), preview: !team.published_id, request_id: `rq-${Date.now()}`, conversation: true })
    setText('')
    await runs.reload()
    setCurrent(r.id)
    setActive(true)
    toast('已提交，Leader 开始分派')
  }
  const names = run.data?.config.agents ?? {}
  return (
    <div className="flex min-h-0 flex-1 gap-0 border-t border-line">
      <aside className="w-[280px] shrink-0 overflow-auto border-r border-line bg-solid">
        <p className="px-4 pt-3 pb-2 text-[12px] font-medium text-ink-3">最近的任务</p>
        {runs.loading && !runs.data && <div className="p-3"><Skeleton className="h-40" /></div>}
        {(runs.data?.runs ?? []).map(r => (
          <button key={r.id} type="button" onClick={() => setCurrent(r.id)} className={cn('block w-full cursor-pointer border-t border-line px-4 py-2.5 text-left', r.id === id ? 'bg-volt-soft' : 'hover:bg-hover')}>
            <span className="line-clamp-2 text-[13px]">{r.query}</span>
            <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-3"><StateDot state={r.state} className="text-[11.5px]" /> · {fmtTime(r.created_at)}</span>
          </button>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className="flex items-center gap-2 border-b border-line bg-solid px-5 py-2.5 text-[12.5px] text-ink-2">
          <span className="font-medium text-ink">{team.name} · 对话窗口</span>
          <span>Leader 与 {form.members.length} 位成员</span>
          <Button size="small" variant="ghost" className="ml-auto" onClick={() => go('collab')}><RiExternalLinkLine className="size-3.5" />在智能体协同中打开</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {run.error && <ErrorBar error={run.error} onRetry={run.reload} />}
          {!id && !runs.loading && <p className="py-16 text-center text-[13px] text-ink-3">还没有任务。在下方输入一个任务，看 Leader 和成员如何一步步完成。</p>}
          {run.data && <Thread run={run.data} names={names} />}
        </div>
        <div className="border-t border-line bg-solid p-3">
          <div className="flex items-end gap-2 rounded-lg border border-line-strong bg-solid p-2 focus-within:border-volt">
            <textarea rows={2} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} placeholder={`给「${team.name}」一个任务，例如：根据附件需求输出售前方案包`} className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1 text-[13.5px] outline-none placeholder:text-ink-3" />
            <Button variant="primary" onClick={send} disabled={!text.trim()}><RiSendPlane2Fill className="size-4" />发送</Button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-3">{team.published_id ? '使用已发布版本运行' : '团队未发布，使用已保存的草稿试运行'} · 到人工确认点会生成「待我确认」</p>
        </div>
      </div>
    </div>
  )
}

function Thread({ run, names }: { run: RunDetail, names: Record<string, { name: string }> }) {
  const steps = [...run.steps].sort((a, b) => a.started_at - b.started_at)
  const done = !isActiveRun(run.state)
  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <Bubble right who="我" avatar={<span className="grid size-8 place-items-center rounded-full bg-volt text-volt-ink"><RiUserLine className="size-4" /></span>}>
        <p className="text-[13.5px] whitespace-pre-wrap">{run.query}</p>
      </Bubble>
      {steps.map((s, i) => <StepBubble key={s.id} s={s} name={names[s.agent_id]?.name ?? s.agent_id} next={steps[i + 1]} nextName={steps[i + 1] ? names[steps[i + 1].agent_id]?.name : undefined} />)}
      {!done && <Skeleton className="h-16 rounded-lg" />}
      {done && run.answer && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-amber/40 bg-amber-soft px-4 py-2.5 text-[13px] text-amber"><RiHandHeartLine className="size-4" />人工确认点：对外发送前，由负责人在「待我确认」确认</div>
          <Bubble who={`${names[run.steps.find(s => s.kind === 'director')?.agent_id ?? '']?.name ?? 'Leader'} · 汇总`} avatar={<img src={agentAvatar({ id: 'lead', name: names[run.steps.find(s => s.kind === 'director')?.agent_id ?? '']?.name ?? '' })} alt="" className="size-8 rounded-full border border-line bg-solid" />} tag={<Badge tone="volt">最终答复</Badge>}>
            <Markdown text={run.answer} className="text-[13.5px]" />
          </Bubble>
        </>
      )}
    </div>
  )
}

function StepBubble({ s, name, next, nextName }: { s: RunStep, name: string, next?: RunStep, nextName?: string }) {
  const [open, setOpen] = useState(false)
  const lead = s.kind === 'director'
  return (
    <>
      <Bubble who={name} avatar={<img src={agentAvatar({ id: s.agent_id, name })} alt="" className="size-8 rounded-full border border-line bg-solid" />} tag={<><Badge tone={lead ? 'volt' : 'neutral'}>{lead ? `Leader · 第 ${s.round} 轮` : '成员'}</Badge><StateDot state={s.state} className="text-[12px] text-ink-3" /></>}>
        {s.result ? <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{s.result}</p> : <p className="text-[13px] text-ink-3">执行中…</p>}
        <button type="button" onClick={() => setOpen(o => !o)} className="mt-2 cursor-pointer text-[12px] text-volt-text hover:underline">{open ? '收起收到的任务' : '查看收到的任务'}</button>
        {open && <p className="mt-1.5 rounded-md bg-surface p-2.5 text-[12.5px] whitespace-pre-wrap text-ink-2">{s.task}</p>}
      </Bubble>
      {next && next.agent_id !== s.agent_id && nextName && (
        <div className="flex items-center justify-center gap-2 text-[12px] text-ink-3"><span className="h-px w-10 bg-line" />{name}<RiArrowRightLine className="size-3.5" />{nextName}<span className="h-px w-10 bg-line" /></div>
      )}
    </>
  )
}

function Bubble({ who, avatar, tag, right, children }: { who: string, avatar: React.ReactNode, tag?: React.ReactNode, right?: boolean, children: React.ReactNode }) {
  return (
    <div className={cn('flex gap-3', right && 'flex-row-reverse')}>
      <div className="shrink-0">{avatar}</div>
      <div className={cn('min-w-0 max-w-[720px] flex-1', right && 'flex flex-col items-end')}>
        <p className="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-ink-2">{who}{tag}</p>
        <div className={cn('rounded-lg border px-4 py-3', right ? 'border-volt/30 bg-volt-soft' : 'border-line bg-solid')}>{children}</div>
      </div>
    </div>
  )
}
