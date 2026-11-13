import type { SectionProps } from './detail'
import type { RunDetail } from '@/api/teams'
import { RiArrowDownSLine, RiArrowRightLine, RiChatNewLine, RiCheckLine, RiErrorWarningLine, RiFileCopyLine, RiListCheck2, RiRefreshLine, RiSendPlane2Fill, RiStopFill, RiTeamLine, RiUserLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/http'
import { useQuery } from '@/api/hooks'
import { cancelRun, createRun, getConversation, getRun, isActiveRun, listConversations, runDuration, runReasons, runStates, runVersion, sourceName } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { TypingDots } from '@/components/ui/effects'
import { Kbd, Panel, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { errText, fmtTime, Markdown, StateDot, TeamAvatar } from './shared'
import { RunTrace } from './trace'

type Mode = 'preview' | 'published'

function CopyBtn({ text, label }: { text: string, label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200) }).catch(() => {})} className="flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12px] text-ink-3 transition-colors hover:bg-hover hover:text-ink">
      {done ? <RiCheckLine className="size-3.5 text-mint" /> : <RiFileCopyLine className="size-3.5" />}{label}
    </button>
  )
}

/** 可折叠的协作过程：展开时读取任务详情，运行中每 2 秒刷新 */
function Process({ teamId, turn }: { teamId: string, turn: RunDetail }) {
  const [open, setOpen] = useState(false)
  const active = isActiveRun(turn.state)
  const q = useQuery(() => getRun(teamId, turn.id), [teamId, turn.id], { enabled: open, pollMs: open && active ? 2000 : false })
  const count = q.data?.steps.length ?? turn.step_count ?? turn.steps.length
  return (
    <div className="rounded-2xl border border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-[12.5px] text-ink-2 hover:text-ink">
        <RiListCheck2 className="size-4 text-cyan" />执行记录 · {count} 个步骤
        {active && <i className="breathe-dot size-1.5 rounded-full bg-volt text-volt" />}
        <RiArrowDownSLine className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: ease.out }} className="overflow-hidden">
            <div className="border-t border-line p-3">
              {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
              {q.loading && !q.data ? <Skeleton className="h-24" /> : q.data && <RunTrace run={q.data} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TeamRunner({ team, dirty, go }: SectionProps) {
  const toast = useToast()
  const [mode, setMode] = useState<Mode>(team.published_id ? 'published' : 'preview')
  const preview = mode === 'preview'
  const [cid, setCid] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const requestId = useRef<string | null>(null)
  const scroll = useRef<HTMLDivElement>(null)

  const conv = useQuery(() => listConversations(team.id, preview), [team.id, preview])
  const convActive = conv.data?.runs.some(r => isActiveRun(r.state))
  useEffect(() => {
    if (!convActive)
      return
    const t = setInterval(conv.refresh, 5000)
    return () => clearInterval(t)
  }, [convActive]) // eslint-disable-line react-hooks/exhaustive-deps
  const detail = useQuery(() => getConversation(team.id, cid!, preview), [team.id, cid, preview], { enabled: !!cid })
  const turns = cid ? detail.data?.runs ?? [] : []
  const last = turns.at(-1)
  const active = !!last && isActiveRun(last.state)
  useEffect(() => {
    if (!cid)
      return
    const t = setInterval(detail.refresh, active ? 2000 : 15000)
    return () => clearInterval(t)
  }, [cid, active]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, last?.state])

  const versionOf = (sid: string) => team.versions?.find(v => v.id === sid)?.version ?? null
  const blocked = !preview && !team.published_id
  const canSend = !!query.trim() && !busy && !active && !blocked && !uncertain && !(cid && !last)

  const switchMode = (m: Mode) => { setMode(m); setCid(null); setError(''); setUncertain(false); requestId.current = null }
  const newChat = () => { setCid(null); setQuery(''); setError('') }
  const send = async (retry = false) => {
    if (!retry && !canSend)
      return
    setBusy(true)
    setError('')
    requestId.current ??= crypto.randomUUID()
    try {
      const r = await createRun(team.id, {
        query: query.trim(),
        preview,
        request_id: requestId.current,
        conversation: true,
        ...(cid ? { conversation_id: cid } : !preview ? { snapshot_id: team.published_id! } : {}),
      })
      requestId.current = null
      setUncertain(false)
      setQuery('')
      setCid(r.conversation_id)
      if (cid)
        await detail.refresh()
    }
    catch (e) {
      if (e instanceof ApiError) {
        requestId.current = null
        setUncertain(false)
        setError(errText(e, '提交未通过，请检查对话状态和团队配置后再试。'))
      }
      else {
        // 网络异常：结果未知，保留请求编号，重试时后端按幂等返回原任务
        setUncertain(true)
      }
    }
    finally {
      setBusy(false)
      conv.refresh()
    }
  }
  const stop = async () => {
    if (!last)
      return
    setStopping(true)
    try {
      await cancelRun(team.id, last.id)
      toast('已请求停止任务', 'info')
    }
    catch {
      setError('停止请求未确认，请刷新任务状态后再操作。')
    }
    finally {
      await detail.refresh()
      conv.refresh()
      setStopping(false)
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[264px_1fr] gap-3 px-6 pb-6">
      <Panel level={2} radius="lg" className="flex min-h-0 flex-col p-3">
        <Segmented<Mode> size="small" className="w-full [&>*]:flex-1 [&>*]:justify-center" value={mode} onValueChange={switchMode} aria-label="运行模式" options={[{ value: 'preview', label: '草稿调试' }, { value: 'published', label: '已发布版本' }]} />
        <Button variant="secondary" className="mt-3" disabled={busy} onClick={newChat}><RiChatNewLine className="size-4" />开启新对话</Button>
        <div className="mt-4 mb-1.5 flex items-center justify-between px-1.5">
          <span className="text-[12px] font-medium text-ink-3">我的最近对话</span>
          <Button variant="ghost" size="icon-small" aria-label="刷新最近对话" onClick={conv.reload}><RiRefreshLine className="size-3.5" /></Button>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-auto">
          {conv.error && <ErrorBar error={conv.error} onRetry={conv.reload} />}
          {conv.loading && [0, 1, 2].map(i => <Skeleton key={i} className="mb-1.5 h-12" />)}
          {!conv.loading && conv.data?.runs.length === 0 && <p className="px-2 py-6 text-center text-[12.5px] text-ink-3">还没有对话。</p>}
          {conv.data?.runs.map(r => (
            <button key={r.id} type="button" disabled={busy} onClick={() => { setCid(r.id); setError('') }} aria-current={r.id === cid ? 'true' : undefined} className={cn('w-full cursor-pointer rounded-xl px-2.5 py-2 text-left transition-colors', r.id === cid ? 'bg-press' : 'hover:bg-hover')}>
              <p className="truncate text-[13px]" title={r.query}>{r.query}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3"><StateDot state={r.state} className="text-[11.5px]" /> · {sourceName(r.source)} · {fmtTime(r.created_at).slice(5)}</p>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => go(`teams/${team.id}/logs`)} className="mt-2 flex cursor-pointer items-center gap-1 rounded-xl px-2 py-2 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink">查看全部运行日志<RiArrowRightLine className="size-3.5" /></button>
      </Panel>

      <Panel level={2} radius="lg" className="relative flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
          <TeamAvatar value={team.config.avatar} name={team.name} size={28} />
          <p className="text-[14px] font-semibold">{team.name}</p>
          <span className="rounded-full bg-hover px-2.5 py-0.5 text-[12px] text-ink-2">
            {last ? runVersion({ ...last, published_version: versionOf(last.snapshot_id) }) : preview ? `草稿调试 · r${team.revision}` : team.published_id ? `已发布 v${team.published_version ?? ''}` : '待发布'}
          </span>
          {preview && dirty && <span className="text-[12px] text-amber">有未保存的修改，调试使用上次保存的草稿</span>}
        </div>
        <div ref={scroll} className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {!cid
            ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <span className="grid size-14 place-items-center rounded-2xl border border-line bg-glass-3 text-volt-text shadow-glow-volt"><RiTeamLine className="size-7" /></span>
                  <p className="text-[18px] font-semibold">让团队一起完成任务</p>
                  <p className="text-[13px] text-ink-2">描述你的需求，团长会按需请参与的 Agent 处理，再汇总结果。</p>
                  <p className="text-[12.5px] text-ink-3">{preview ? '使用已保存的团队草稿，调试不改变发布版本。' : team.published_id ? '使用团队的已发布版本。' : '请先在右上角发布团队。'}</p>
                </div>
              )
            : (
                <div className="mx-auto max-w-[760px] space-y-6">
                  {detail.error && <ErrorBar error={detail.error} onRetry={detail.reload} />}
                  {detail.loading && !turns.length && <Skeleton className="h-32" />}
                  {turns.map(turn => (
                    <motion.div key={turn.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.out }} className="space-y-3">
                      <div className="flex justify-end gap-2.5">
                        <p className="max-w-[80%] rounded-[20px] rounded-tr-md bg-volt-soft px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">{turn.query}</p>
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-hover text-ink-3"><RiUserLine className="size-4" /></span>
                      </div>
                      <div className="flex gap-2.5">
                        <TeamAvatar value={team.config.avatar} name={team.name} size={32} />
                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3" aria-live="polite">
                            <StateDot state={turn.state} />
                            <span>{runVersion({ ...turn, published_version: versionOf(turn.snapshot_id) })}</span>
                            <span className="tabular-nums">{runDuration(turn)}</span>
                          </div>
                          <Process teamId={team.id} turn={turn} />
                          <div className="rounded-[20px] border border-line bg-glass-3 px-4 py-3">
                            {turn.answer
                              ? <Markdown text={turn.answer} />
                              : isActiveRun(turn.state)
                                ? <p className="flex items-center gap-2 text-[13px] text-ink-2"><TypingDots />{turn.cancelled ? '正在停止任务…' : '团队正在协作，完成后在这里显示最终答复。'}</p>
                                : <p className="flex items-center gap-2 text-[13px] text-rose"><RiErrorWarningLine className="size-4" />{runReasons[turn.error_code] ?? `任务${runStates[turn.state]}`}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            {turn.answer && <CopyBtn text={turn.answer} label="复制答复" />}
                            <CopyBtn text={turn.id} label="复制任务 ID" />
                            {isActiveRun(turn.state) && turn.id === last?.id && !turn.cancelled && <Button size="small" variant="ghost" tone="destructive" loading={stopping} onClick={stop}><RiStopFill className="size-3.5" />停止任务</Button>}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
        </div>
        <div className="border-t border-line p-4">
          <div className="mx-auto max-w-[760px] space-y-2">
            {uncertain && (
              <div role="alert" className="flex items-center gap-3 rounded-2xl border border-amber/40 bg-amber-soft px-4 py-2.5 text-[12.5px] text-amber">
                <RiErrorWarningLine className="size-4 shrink-0" />
                <span className="flex-1">提交结果尚未确认。可以用同一请求编号重试（不会重复执行），或先刷新最近对话核对。</span>
                <Button size="small" variant="secondary" loading={busy} onClick={() => send(true)}>重试提交</Button>
                <Button size="small" variant="ghost" onClick={() => { setUncertain(false); requestId.current = null; conv.reload() }}>已核对</Button>
              </div>
            )}
            {error && <ErrorBar error={new Error(error)} />}
            <div className="glass-3 flex items-end gap-2 rounded-[22px] p-2 pl-4 focus-within:border-volt">
              <textarea
                aria-label="输入任务"
                rows={2}
                value={query}
                maxLength={32000}
                disabled={blocked}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder={blocked ? '团队尚未发布，切换到「草稿调试」或先发布团队' : active ? '团队正在处理上一轮任务…' : cid ? '继续追问，团队会沿用这个对话的版本' : '描述你的任务，例如：华东某银行智能客服私有化需求，请出一版方案包'}
                className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-relaxed outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
              />
              <Button variant="primary" size="icon" aria-label="发送" disabled={!canSend} loading={busy} onClick={() => send()}>{!busy && <RiSendPlane2Fill className="size-4" />}</Button>
            </div>
            <p className="flex justify-between px-2 text-[11.5px] text-ink-3"><span><Kbd>Enter</Kbd> 发送 · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> 换行</span><span className="tabular-nums">{query.length}/32000</span></p>
          </div>
        </div>
      </Panel>
    </div>
  )
}
