'use client'

import type { RunDetail } from './run-types'
import type { RunnerMode } from './runner-links'
import { Button } from '@langgenius/dify-ui/button'
import { IconButton } from '@langgenius/dify-ui/icon-button'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CopyFeedback } from '@/app/components/base/copy-feedback'
import { Markdown } from '@/app/components/base/markdown'
import { currentWorkspaceIdAtom } from '@/context/workspace-state'
import useDocumentTitle from '@/hooks/use-document-title'
import useTimestamp from '@/hooks/use-timestamp'
import Link from '@/next/link'
import { usePathname, useRouter, useSearchParams } from '@/next/navigation'
import { get, post } from '@/service/agent-teams'
import {
  isActiveRun,
  runDuration,
  runReasons,
  runStates,
  runVersion,
  sourceInfo,
} from './run-types'
import { teamRunUrl } from './runner-links'
import styles from './runner.module.css'

type RunnerTeam = {
  id: string
  name: string
  revision: number
  published_id: string | null
  versions?: { id: string; version: number }[]
}
type ChatRun = RunDetail & { step_count?: number }
type RunPage = { runs: ChatRun[] }
const pendingEvent = 'agent-team-pending-change'
const clientReady = () => true
const serverReady = () => false
const subscribePending = (listener: () => void) => {
  window.addEventListener(pendingEvent, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(pendingEvent, listener)
    window.removeEventListener('storage', listener)
  }
}

function ExecutionSteps({
  run,
  teamId,
  workspaceId,
}: {
  run: ChatRun
  teamId: string
  workspaceId: string
}) {
  const [open, setOpen] = useState(false)
  const detail = useQuery({
    queryKey: ['agent-teams', workspaceId, teamId, 'step-detail', run.id],
    queryFn: () => get<RunDetail>(`/agent-teams/${teamId}/runs/${run.id}`),
    enabled: open,
    refetchInterval: isActiveRun(run.state) ? 2000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const steps = detail.data?.steps || run.steps
  return (
    <details className={styles.process} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span aria-hidden className="i-ri-node-tree size-4" />
        协作过程 · {run.step_count ?? run.steps.length} 个步骤
      </summary>
      <div className={styles.steps}>
        {detail.isError && <p>步骤加载失败，请重新展开重试。</p>}
        {!steps.length && <p>{detail.isFetching ? '正在加载步骤…' : '任务尚未产生执行步骤。'}</p>}
        {steps.map((step, index) => (
          <details className={styles.step} key={step.id}>
            <summary>
              <span className={styles.stepNumber}>{index + 1}</span>
              <span>
                {step.kind === 'director' ? '团长' : '专家'} ·{' '}
                {run.config.agents[step.agent_id]?.name || step.agent_id}
                <small>
                  第 {step.round} 轮 · {runStates[step.state] || step.state}
                </small>
              </span>
            </summary>
            <h3>{step.kind === 'director' ? '规划上下文' : '分配的任务'}</h3>
            <pre>{step.task}</pre>
            <h3>{step.kind === 'director' ? '分工决定 / 汇总' : '专家结果'}</h3>
            <pre>
              {step.result ||
                (step.error_code
                  ? runReasons[step.error_code] || step.error_code
                  : isActiveRun(step.state)
                    ? '正在执行…'
                    : '暂无结果')}
            </pre>
          </details>
        ))}
      </div>
    </details>
  )
}

function Runner({
  teamId,
  workspaceId,
  mode,
}: {
  teamId: string
  workspaceId: string
  mode: RunnerMode
}) {
  const search = useSearchParams()
  const router = useRouter()
  const runId = search.get('run') || ''
  const { formatTime } = useTimestamp()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const submittingRef = useRef(false)
  const stoppingRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastTurnRef = useRef('')
  const pendingKey = `team-run-pending:${workspaceId}:${teamId}:${mode}`
  const ready = useSyncExternalStore(subscribePending, clientReady, serverReady)
  const hasPending = useSyncExternalStore(
    subscribePending,
    () => {
      try {
        return !!sessionStorage.getItem(pendingKey)
      } catch {
        return false
      }
    },
    serverReady,
  )
  const uncertain = unconfirmed || (hasPending && !busy)
  const base = `/agent-teams/${teamId}`
  const teamQuery = useQuery({
    queryKey: ['agent-teams', workspaceId, teamId, 'runner-team'],
    queryFn: () => get<{ team: RunnerTeam }>(`/agent-teams/${teamId}`),
    enabled: !!workspaceId,
    retry: 1,
  })
  const team = teamQuery.data?.team
  const history = useQuery({
    queryKey: ['agent-teams', workspaceId, teamId, 'runner-history', mode],
    queryFn: () =>
      get<RunPage>(`/agent-teams/${teamId}/conversations?preview=${mode === 'preview'}`),
    enabled: !!team,
    refetchInterval: (q) =>
      q.state.data?.runs.some((run) => isActiveRun(run.state)) ? 5000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const detail = useQuery({
    queryKey: ['agent-teams', workspaceId, teamId, 'conversation', runId, mode],
    queryFn: () =>
      get<RunPage>(
        `/agent-teams/${teamId}/conversations/${encodeURIComponent(runId)}?preview=${mode === 'preview'}`,
      ),
    enabled: !!team && !!runId,
    refetchInterval: (q) =>
      q.state.data?.runs.some((item) => isActiveRun(item.state)) ? 2000 : 15000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const turns = runId ? detail.data?.runs || [] : []
  const run = turns.at(-1)
  const active = !!run && isActiveRun(run.state)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (lastTurnRef.current !== run?.id || el.scrollHeight - el.scrollTop - el.clientHeight < 180)
      el.scrollTo?.({ top: el.scrollHeight })
    lastTurnRef.current = run?.id || ''
  }, [run?.id, run?.state])
  const preview = mode === 'preview'
  const version = team?.versions?.find((item) => item.id === team.published_id)?.version
  useDocumentTitle(`${team?.name || 'Agent Teams'} · ${preview ? '草稿调试' : '团队对话'}`)

  const clearPending = () => {
    try {
      sessionStorage.removeItem(pendingKey)
    } catch {
      /* No stored credentials or answers. */
    }
    window.dispatchEvent(new Event(pendingEvent))
    setUnconfirmed(false)
  }
  const select = (id?: string) => {
    router.replace(teamRunUrl(teamId, mode, workspaceId, id), { scroll: false })
    setMobileOpen(false)
  }
  const newTask = () => {
    select()
    setQuery('')
    setError('')
    inputRef.current?.focus()
  }
  const send = async () => {
    if (
      submittingRef.current ||
      uncertain ||
      !ready ||
      !team ||
      !query.trim() ||
      active ||
      (runId && !run) ||
      (!preview && !team.published_id)
    )
      return
    submittingRef.current = true
    setBusy(true)
    setError('')
    const requestId = crypto.randomUUID()
    try {
      sessionStorage.setItem(pendingKey, requestId)
    } catch {
      /* The in-memory lock still prevents duplicate clicks. */
    }
    try {
      const result = await post<{ id: string; conversation_id: string }>(`${base}/runs`, {
        body: {
          query: query.trim(),
          preview,
          request_id: requestId,
          conversation: true,
          ...(runId
            ? { conversation_id: runId }
            : !preview
              ? { snapshot_id: team.published_id }
              : {}),
        },
      })
      select(result.conversation_id)
      if (runId) await detail.refetch()
      clearPending()
      setQuery('')
    } catch (e) {
      const rejected = e instanceof Response && [400, 401, 403, 404, 409, 422].includes(e.status)
      if (rejected) {
        clearPending()
        const failure = await e.json().catch(() => ({}))
        setError(
          failure.message || failure.description || '提交未通过，请检查对话状态和团队配置后再试。',
        )
        void detail.refetch()
        void teamQuery.refetch()
      } else {
        setUnconfirmed(true)
        setError('提交结果尚未确认。请先刷新最近对话或查看运行日志核对，避免重复执行。')
      }
    } finally {
      submittingRef.current = false
      setBusy(false)
      void history.refetch()
    }
  }
  const stop = async () => {
    if (!run || !active || run.cancelled || stoppingRef.current) return
    stoppingRef.current = true
    setStopping(true)
    setError('')
    try {
      await post(`${base}/runs/${run.id}/cancel`, { body: {} })
    } catch {
      setError('停止请求未确认，请刷新任务状态后再操作。')
    } finally {
      await detail.refetch()
      void history.refetch()
      setStopping(false)
      stoppingRef.current = false
    }
  }

  return (
    <div
      className={`${styles.root} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}
    >
      {mobileOpen && (
        <button
          className={styles.backdrop}
          aria-label="收起最近对话"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={styles.sidebar} aria-label="团队对话导航">
        <div className={styles.brand}>
          <span className={styles.avatar}>
            <span aria-hidden className="i-ri-team-line size-6" />
          </span>
          <strong title={team?.name}>{team?.name || 'Agent Teams'}</strong>
          <IconButton
            aria-label="收起侧栏"
            onClick={() => {
              setCollapsed(true)
              setMobileOpen(false)
            }}
          >
            <span aria-hidden className="i-ri-side-bar-line size-4" />
          </IconButton>
        </div>
        <Button variant="secondary" disabled={busy} onClick={newTask}>
          <span aria-hidden className="i-ri-chat-new-line size-4" />
          开启新对话
        </Button>
        <div className={styles.historyTitle}>
          <span>我的最近对话</span>
          <IconButton
            aria-label="刷新最近对话"
            disabled={history.isFetching || !team}
            onClick={() => void history.refetch()}
          >
            <span aria-hidden className="i-ri-refresh-line size-4" />
          </IconButton>
        </div>
        <div className={styles.history}>
          {history.isError && <p role="alert">对话列表加载失败，请刷新重试。</p>}
          {history.isPending && team && <p>正在加载…</p>}
          {history.data?.runs.length === 0 && <p>还没有对话。</p>}
          {history.data?.runs.map((item) => (
            <button
              key={item.id}
              className={styles.historyItem}
              aria-current={item.id === runId ? 'true' : undefined}
              onClick={() => select(item.id)}
              disabled={busy}
            >
              <span title={item.query}>{item.query}</span>
              <small>
                {sourceInfo(item.source).name} · {runStates[item.state] || item.state}
              </small>
              <small>{formatTime(item.created_at, 'MM-DD HH:mm')}</small>
            </button>
          ))}
        </div>
        <div className={styles.sidebarFooter}>
          <Link href={`${base}?tab=logs`}>
            查看全部运行日志
            <span aria-hidden className="i-ri-arrow-right-line size-4" />
          </Link>
          <Link href={`${base}?tab=${preview ? 'config' : 'access'}`}>
            <span aria-hidden className="i-ri-arrow-left-line size-4" />
            返回团队管理
          </Link>
        </div>
      </aside>
      <section className={styles.main} aria-label="团队独立调试页面">
        <header className={styles.header}>
          <IconButton
            className={styles.toggle}
            aria-label="展开侧栏"
            onClick={() => {
              setCollapsed(false)
              setMobileOpen(true)
            }}
          >
            <span aria-hidden className="i-ri-side-bar-line size-4" />
          </IconButton>
          <strong>{team?.name || 'Agent Teams'}</strong>
          <span className={styles.mode}>
            {run
              ? runVersion({
                  ...run,
                  published_version:
                    team?.versions?.find((item) => item.id === run.snapshot_id)?.version ?? null,
                })
              : preview
                ? `草稿调试${team ? ` · r${team.revision}` : ''}`
                : team?.published_id
                  ? `已发布${version ? ` v${version}` : ''}`
                  : '待发布'}
          </span>
          <Link className={styles.management} href={`${base}?tab=${preview ? 'config' : 'access'}`}>
            团队管理
            <span aria-hidden className="i-ri-arrow-right-up-line size-4" />
          </Link>
        </header>
        <div className={styles.scroll} ref={scrollRef}>
          <div className={styles.messages}>
            {teamQuery.isError ? (
              <div role="alert" className={styles.error}>
                无法读取团队，请确认已登录并处于正确的工作空间。
                <Button variant="secondary" size="small" onClick={() => void teamQuery.refetch()}>
                  重新加载
                </Button>
              </div>
            ) : !team ? (
              <p className={styles.loading}>正在加载团队…</p>
            ) : !runId ? (
              <div className={styles.empty}>
                <span className={styles.heroIcon}>
                  <span aria-hidden className="i-ri-team-line size-8" />
                </span>
                <h1>让专家团队一起完成任务</h1>
                <p>描述你的需求，由团长安排专家协作，再汇总结果。</p>
                <span>
                  {preview
                    ? '使用已保存的团队草稿，调试不改变发布版本。'
                    : team.published_id
                      ? '使用团队的已发布版本。'
                      : '请先在团队管理中发布团队。'}
                </span>
              </div>
            ) : (
              <>
                {detail.isError && (
                  <div role="alert" className={styles.error}>
                    对话加载失败，请确认账号、工作空间和运行模式。
                    <Button variant="secondary" size="small" onClick={() => void detail.refetch()}>
                      刷新任务
                    </Button>
                  </div>
                )}
                {!run && detail.isPending && <p className={styles.loading}>正在读取对话…</p>}
                {turns.map((turn) => (
                  <div key={turn.id}>
                    <div className={styles.questionRow}>
                      <div className={styles.question}>{turn.query}</div>
                      <span className={styles.userAvatar}>
                        <span aria-hidden className="i-ri-user-line size-5" />
                      </span>
                    </div>
                    <div className={styles.answerRow}>
                      <span className={styles.avatar}>
                        <span aria-hidden className="i-ri-team-line size-5" />
                      </span>
                      <div className={styles.answerBody}>
                        <div className={styles.runMeta} aria-live="polite">
                          <span className={isActiveRun(turn.state) ? styles.active : ''}>
                            {runStates[turn.state] || turn.state}
                          </span>
                          <span>
                            {runVersion({
                              ...turn,
                              published_version:
                                team?.versions?.find((item) => item.id === turn.snapshot_id)
                                  ?.version ?? null,
                            })}
                          </span>
                          <span>{runDuration(turn)}</span>
                        </div>
                        <ExecutionSteps run={turn} teamId={teamId} workspaceId={workspaceId} />
                        <div className={styles.answer}>
                          {turn.answer ? (
                            <Markdown content={turn.answer} />
                          ) : (
                            <p>
                              {isActiveRun(turn.state)
                                ? turn.cancelled
                                  ? '正在停止任务…'
                                  : '团队正在协作，完成后会在这里显示最终答复。'
                                : '本次任务没有生成最终答复。'}
                            </p>
                          )}
                          {turn.error_code && (
                            <p className={styles.failure}>
                              {runReasons[turn.error_code] || '任务未完成，请查看协作过程。'}
                            </p>
                          )}
                        </div>
                        <div className={styles.answerFooter}>
                          {turn.answer && <CopyFeedback content={turn.answer} />}
                          <span title={turn.id}>任务 {turn.id.slice(0, 8)}</span>
                          <CopyFeedback content={turn.id} />
                          {isActiveRun(turn.state) && (
                            <Button
                              size="small"
                              variant="secondary"
                              disabled={stopping || turn.cancelled}
                              onClick={() => void stop()}
                            >
                              {stopping || turn.cancelled ? '正在停止…' : '停止任务'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <footer className={styles.footer}>
          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}
          {uncertain && (
            <div className={styles.uncertain} role="status">
              <span>上次提交状态未确认。核对运行记录后再开启新对话；系统不会自动重发。</span>
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  clearPending()
                  newTask()
                }}
              >
                已核对，开启新对话
              </Button>
            </div>
          )}
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <textarea
              ref={inputRef}
              aria-label="团队任务"
              value={query}
              maxLength={32000}
              rows={3}
              disabled={busy || uncertain || !team || active || (!preview && !team.published_id)}
              placeholder={
                active
                  ? '团队正在回答，可等待完成或开启新对话。'
                  : runId
                    ? '继续提问，团队会参考本对话前文…'
                    : '描述任务并提供必要资料…'
              }
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void send()
                }
              }}
            />
            <div className={styles.composerBar}>
              <span>{preview ? '草稿调试' : '已发布运行'} · Enter 发送，Shift + Enter 换行</span>
              <Button
                type="submit"
                variant="primary"
                aria-label="发送任务"
                disabled={
                  busy ||
                  uncertain ||
                  !ready ||
                  !team ||
                  !query.trim() ||
                  active ||
                  (!!runId && !run) ||
                  (!preview && !team.published_id)
                }
              >
                <span aria-hidden className="i-ri-arrow-up-line size-4" />
                {busy ? '提交中…' : '发送'}
              </Button>
            </div>
          </form>
          <p className={styles.hint}>
            同一对话会参考前文；开启新对话后重新开始。对话沿用开始时的配置，使用新配置请开启新对话。
          </p>
        </footer>
      </section>
    </div>
  )
}

export default function TeamRunnerPage() {
  const workspaceId = useAtomValue(currentWorkspaceIdAtom)
  const path = usePathname()
  const search = useSearchParams()
  const teamId = path.split('/')[2] || ''
  const mode = search.get('mode') === 'preview' ? 'preview' : 'published'
  const requestedWorkspace = search.get('workspace')
  if (workspaceId && requestedWorkspace && workspaceId !== requestedWorkspace)
    return (
      <div className={styles.scopeError} role="alert">
        <h1>当前工作空间不匹配</h1>
        <p>请返回团队管理，切换到该团队所属的工作空间后重新打开。</p>
        <Link href="/agent-teams">返回 Agent Teams</Link>
      </div>
    )
  return (
    <Runner
      key={`${workspaceId}:${teamId}:${mode}`}
      teamId={teamId}
      workspaceId={workspaceId}
      mode={mode}
    />
  )
}
