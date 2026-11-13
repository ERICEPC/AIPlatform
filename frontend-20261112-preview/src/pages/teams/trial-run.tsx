import type { RunDetail, Team } from '@/api/teams'
import { RiErrorWarningLine, RiPlayFill, RiStopFill } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { cancelRun, createRun, getRun, isActiveRun, runDuration, runReasons, runStates } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { TypingDots } from '@/components/ui/effects'
import { Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { errText, Markdown, StateDot } from './shared'
import { RunTrace } from './trace'

/**
  试运行：用已保存的草稿提交一次预览任务（有未保存修改会先保存），
  在右侧抽屉里看团长调用了哪些 Agent、各自返回什么，以及最终答复。
*/
export function TrialRun({ team, dirty, save, suggestion }: { team: Team, dirty: boolean, save: () => Promise<boolean>, suggestion: string }) {
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const [query, setQuery] = useState('')
  const [starting, setStarting] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<RunDetail | null>(null)
  const [panel, setPanel] = useState(false)
  const active = !!run && isActiveRun(run.state)

  useEffect(() => {
    if (!runId)
      return
    let stop = false
    const tick = async () => {
      try {
        const r = await getRun(team.id, runId)
        if (stop)
          return
        setRun(r)
        if (!isActiveRun(r.state)) {
          stop = true
          toast(r.state === 'succeeded' ? '试运行完成，答复已生成' : `试运行结束：${runStates[r.state]}`, r.state === 'succeeded' ? 'ok' : 'info')
        }
      }
      catch {}
    }
    tick()
    const t = setInterval(() => !stop && tick(), 2000)
    return () => { stop = true; clearInterval(t) }
  }, [runId, team.id, toast])

  const start = async () => {
    if (!query.trim())
      return
    setStarting(true)
    try {
      if (dirty && !(await save()))
        return
      const r = await createRun(team.id, { query: query.trim(), preview: true, request_id: crypto.randomUUID(), conversation: true })
      setAsking(false)
      setRun(null)
      setRunId(r.id)
      setPanel(true)
    }
    catch (e) {
      toast(errText(e, '提交失败，请检查团队成员和团队任务'), 'info')
    }
    finally {
      setStarting(false)
    }
  }
  const stop = () => runId && cancelRun(team.id, runId).catch(() => toast('停止请求未确认，请稍后刷新查看', 'info'))
  const called = run ? [...new Set(run.steps.filter(s => s.kind === 'expert').map(s => run.config.agents[s.agent_id]?.name ?? s.agent_id))] : []

  return (
    <>
      {run && !panel && (
        <Button variant="ghost" size="small" onClick={() => setPanel(true)}>
          {active ? <i className="breathe-dot size-1.5 rounded-full bg-volt text-volt" /> : null}查看试运行
        </Button>
      )}
      <Button variant="secondary" size="small" onClick={() => { setQuery(q => q || (suggestion ? `试运行：${suggestion.slice(0, 40)}` : '')); setAsking(true) }}>
        <RiPlayFill className="size-4" />{run ? '再试运行一次' : '试运行'}
      </Button>

      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="试运行草稿"
        description={dirty ? '会先保存当前修改为草稿，再用草稿提交一次预览任务。不影响已发布版本。' : '使用已保存的草稿提交一次预览任务，不影响已发布版本。'}
        footer={<><Button variant="ghost" onClick={() => setAsking(false)}>取消</Button><Button variant="primary" loading={starting} disabled={!query.trim()} onClick={start}><RiPlayFill className="size-4" />{dirty ? '保存并试运行' : '开始试运行'}</Button></>}
      >
        <Textarea rows={4} autoFocus value={query} maxLength={32000} onChange={e => setQuery(e.target.value)} placeholder="描述一个真实任务，例如：华东某银行智能客服私有化需求，请出一版方案包" />
      </Dialog>

      <Drawer
        open={panel}
        onClose={() => setPanel(false)}
        title={(
          <>
            <p className="text-[17px] font-semibold">试运行</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">草稿预览任务，不影响已发布版本。完整记录也会出现在「日志」里。</p>
          </>
        )}
        footer={active
          ? <Button variant="ghost" tone="destructive" onClick={stop}><RiStopFill className="size-4" />{run?.cancelled ? '正在停止…' : '停止任务'}</Button>
          : <Button variant="primary" className="ml-auto" onClick={() => setPanel(false)}>完成</Button>}
      >
        {!run
          ? <p className="flex items-center gap-2 pt-6 text-[13px] text-ink-2"><TypingDots />正在提交任务…</p>
          : (
              <div className="space-y-4 pt-3">
                <div className="rounded-2xl border border-line bg-hover px-4 py-3">
                  <p className="text-[12px] text-ink-3">任务</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap">{run.query}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                    <StateDot state={run.state} />
                    <span className="tabular-nums">{runDuration(run)}</span>
                    <span>{called.length ? `调用了 ${called.join('、')}` : '还没有调用 Agent'}</span>
                  </div>
                </div>
                <section>
                  <p className="mb-2 text-[13px] font-medium">最终答复</p>
                  <div className="rounded-[20px] border border-line bg-glass-3 px-4 py-3">
                    {run.answer
                      ? <Markdown text={run.answer} />
                      : active
                        ? <p className="flex items-center gap-2 text-[13px] text-ink-2"><TypingDots />团队正在处理，完成后在这里显示答复。</p>
                        : <p className="flex items-center gap-2 text-[13px] text-rose"><RiErrorWarningLine className="size-4" />{runReasons[run.error_code] ?? `任务${runStates[run.state]}`}</p>}
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-[13px] font-medium">执行记录<span className="ml-2 text-[12px] font-normal text-ink-3">{run.steps.length} 条</span></p>
                  <RunTrace run={run} maxCols={2} />
                </section>
              </div>
            )}
      </Drawer>
    </>
  )
}
