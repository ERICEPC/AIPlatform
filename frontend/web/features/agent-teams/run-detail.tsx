import type { RunDetail, RunSummary } from './run-types'
import { Button } from '@langgenius/dify-ui/button'
import { IconButton } from '@langgenius/dify-ui/icon-button'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import CopyIcon from '@/app/components/base/copy-icon'
import { Markdown } from '@/app/components/base/markdown'
import { currentWorkspaceIdAtom } from '@/context/workspace-state'
import useTimestamp from '@/hooks/use-timestamp'
import { get, post } from '@/service/agent-teams'
import { RunStatus } from './logs-table'
import styles from './logs.module.css'
import {
  isActiveRun,
  runDuration,
  runReasons,
  runStates,
  runVersion,
  sourceInfo,
} from './run-types'

export function TeamRunDetail({
  teamId,
  log,
  onClose,
  onChanged,
}: {
  teamId: string
  log: RunSummary
  onClose: () => void
  onChanged: () => void
}) {
  const workspaceId = useAtomValue(currentWorkspaceIdAtom)
  const { formatTime } = useTimestamp()
  const [view, setView] = useState('conversation')
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')
  const query = useQuery({
    queryKey: ['agent-teams', workspaceId, teamId, 'run', log.id],
    queryFn: () => get<RunDetail>(`/agent-teams/${teamId}/runs/${log.id}`),
    refetchInterval: (q) => (q.state.data && isActiveRun(q.state.data.state) ? 2000 : false),
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const run = query.data
  const time = (v: number | null) => (v == null ? '—' : formatTime(v, 'YYYY-MM-DD HH:mm:ss'))
  const cancel = async () => {
    setStopping(true)
    setError('')
    try {
      await post(`/agent-teams/${teamId}/runs/${log.id}/cancel`, { body: {} })
      await query.refetch()
      onChanged()
    } catch {
      setError('停止请求未确认，请刷新查看任务状态后再操作。')
      await query.refetch()
    } finally {
      setStopping(false)
    }
  }
  return (
    <section className={styles.detail} aria-label="团队运行记录详情">
      <header className={styles.detailHeader}>
        <div className={styles.identifier}>
          <strong>任务 ID</strong>
          <div>
            <span title={log.id}>{log.id}</span>
            <CopyIcon content={log.id} />
          </div>
        </div>
        <IconButton size="lg" aria-label="关闭运行详情" onClick={onClose}>
          <span aria-hidden="true" className="i-ri-close-line size-4" />
        </IconButton>
      </header>
      <div className={styles.detailMeta}>
        <RunStatus state={run?.state ?? log.state} />
        <span>{sourceInfo(run?.source ?? log.source).name}</span>
        <span>{runVersion(log)}</span>
        <span>总耗时 {runDuration(run ?? log)}</span>
        {run && isActiveRun(run.state) && (
          <Button
            size="small"
            variant="secondary"
            disabled={stopping || run.cancelled}
            onClick={() => void cancel()}
          >
            {run.cancelled || stopping ? '正在停止…' : '停止任务'}
          </Button>
        )}
      </div>
      <div className={styles.detailDates}>
        创建 {time(run?.created_at ?? log.created_at)}
        <br />
        结束 {time(run ? run.finished_at : log.finished_at)}
      </div>
      <div className={styles.detailTabs} role="tablist" aria-label="运行详情视图">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'conversation'}
          onClick={() => setView('conversation')}
        >
          对话结果
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'steps'}
          onClick={() => setView('steps')}
        >
          执行过程{run ? `（${run.steps.length}）` : ''}
        </button>
      </div>
      <div className={styles.detailBody}>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        {query.isError && (
          <div className={styles.error} role="alert">
            详情加载失败。
            <Button size="small" variant="secondary" onClick={() => void query.refetch()}>
              重试
            </Button>
          </div>
        )}
        {query.isPending && <div className={styles.empty}>正在加载运行详情…</div>}
        {run && view === 'conversation' && (
          <>
            <div className={styles.questionRow}>
              <div className={styles.question}>{run.query}</div>
              <span className={styles.avatar} aria-label="任务输入">
                <span className="i-ri-user-line" aria-hidden="true" />
              </span>
            </div>
            <div className={styles.answerRow}>
              <span className={styles.avatar} aria-label="专家团队">
                <span className="i-ri-team-line" aria-hidden="true" />
              </span>
              <div className={styles.answer}>
                {run.answer ? (
                  <Markdown content={run.answer} />
                ) : (
                  <p>
                    {isActiveRun(run.state)
                      ? run.cancelled
                        ? '正在停止任务…'
                        : '团队正在处理任务，完成后会在这里显示最终结果。'
                      : '本次任务没有生成最终答复。'}
                  </p>
                )}
                {run.error_code && (
                  <div className={styles.failure}>
                    {runReasons[run.error_code] || '任务未完成，请查看执行过程。'}
                    <code>{run.error_code}</code>
                  </div>
                )}
                {!!run.answer && (
                  <div className={styles.answerFooter}>
                    <span>{time(run.finished_at)}</span>
                    <CopyIcon content={run.answer} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {run && view === 'steps' && (
          <div className={styles.steps}>
            {!run.steps.length && (
              <div className={styles.empty}>
                {run.state === 'queued' ? '任务正在排队，尚未开始执行。' : '本次任务没有执行步骤。'}
              </div>
            )}
            {run.steps.map((step, index) => (
              <details className={styles.step} key={step.id}>
                <summary>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <span className={styles.stepName}>
                    {step.kind === 'director' ? '团长' : '专家'} ·{' '}
                    {run.config.agents[step.agent_id]?.name || step.agent_id}
                    <small>
                      第 {step.round} 轮 ·{' '}
                      {Math.max(
                        0,
                        (step.finished_at ?? Date.now() / 1000) - step.started_at,
                      ).toFixed(1)}{' '}
                      秒
                    </small>
                  </span>
                  <RunStatus state={step.state} />
                </summary>
                <div className={styles.stepBody}>
                  <p>
                    开始：{time(step.started_at)}
                    <br />
                    结束：{time(step.finished_at)}
                  </p>
                  <div className={styles.snapshot}>
                    固定版本 <code>{step.snapshot_id}</code>
                  </div>
                  <h4>{step.kind === 'director' ? '规划上下文' : '分配的任务'}</h4>
                  <pre>{step.task}</pre>
                  <h4>{step.kind === 'director' ? '分工决定 / 汇总' : '专家结果'}</h4>
                  <pre>
                    {step.result ||
                      (step.error_code
                        ? runReasons[step.error_code] || step.error_code
                        : isActiveRun(step.state)
                          ? '正在执行…'
                          : runStates[step.state] || '暂无结果')}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
