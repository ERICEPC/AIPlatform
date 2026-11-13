import type { RunSummary } from './run-types'
import { useRef, useState } from 'react'
import useTimestamp from '@/hooks/use-timestamp'
import styles from './logs.module.css'
import { runDuration, runStates, sourceInfo } from './run-types'

const columns = [
  { name: '标题', width: 360, min: 180 },
  { name: '来源', width: 180, min: 120 },
  { name: '状态', width: 130, min: 100 },
  { name: '专家调用', width: 110, min: 90 },
  { name: '总耗时', width: 140, min: 100 },
  { name: '创建时间', width: 210, min: 210 },
  { name: '结束时间', width: 210, min: 210 },
]

export function RunStatus({ state }: { state: string }) {
  return (
    <span className={styles.status} data-state={state}>
      <span aria-hidden="true" />
      {runStates[state] || state}
    </span>
  )
}

export function TeamLogsTable({
  runs,
  pending,
  selectedId,
  onOpen,
}: {
  runs: RunSummary[]
  pending: boolean
  selectedId?: string
  onOpen: (run: RunSummary) => void
}) {
  const [widths, setWidths] = useState(columns.map((c) => c.width))
  const dragRef = useRef<{ index: number; x: number; widths: number[] } | null>(null)
  const { formatTime } = useTimestamp()
  const timestamp = (v: number | null) => (v == null ? '—' : formatTime(v, 'YYYY-MM-DD HH:mm:ss'))
  const resize = (index: number, width: number) =>
    Math.min(1000, Math.max(columns[index]!.min, width))
  return (
    <div className={styles.tableScroll} role="region" aria-label="团队运行日志表格">
      <table
        className={styles.table}
        style={{ width: widths.reduce((a, b) => a + b, 0), minWidth: '100%' }}
      >
        <colgroup>
          {columns.map((c, i) => (
            <col key={c.name} style={{ width: widths[i] }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c, index) => (
              <th scope="col" key={c.name}>
                {c.name}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`调整${c.name}列宽`}
                  aria-valuemin={c.min}
                  aria-valuemax={1000}
                  aria-valuenow={Math.round(widths[index]!)}
                  tabIndex={0}
                  className={styles.resize}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    const measured = Array.from(
                      event.currentTarget.closest('tr')!.cells,
                      (cell) => cell.getBoundingClientRect().width,
                    )
                    dragRef.current = { index, x: event.clientX, widths: measured }
                    setWidths(measured)
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    const active = dragRef.current
                    if (!active || active.index !== index) return
                    const next = [...active.widths]
                    next[index] = resize(index, active.widths[index]! + event.clientX - active.x)
                    setWidths(next)
                  }}
                  onPointerUp={(event) => {
                    dragRef.current = null
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(event.pointerId)
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null
                  }}
                  onLostPointerCapture={() => {
                    dragRef.current = null
                  }}
                  onDoubleClick={() =>
                    setWidths((previous) => previous.map((w, i) => (i === index ? c.width : w)))
                  }
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
                    event.preventDefault()
                    const delta = event.key === 'ArrowRight' ? 20 : -20
                    setWidths((previous) =>
                      previous.map((w, i) => (i === index ? resize(index, w + delta) : w)),
                    )
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pending ? (
            Array.from({ length: 8 }, (_, i) => (
              <tr key={i} aria-hidden="true">
                {columns.map((c) => (
                  <td key={c.name}>
                    <div className={styles.skeleton} />
                  </td>
                ))}
              </tr>
            ))
          ) : runs.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                没有符合筛选条件的运行记录。
              </td>
            </tr>
          ) : (
            runs.map((run) => (
              <tr key={run.id} data-selected={selectedId === run.id} onClick={() => onOpen(run)}>
                <td>
                  <button
                    className={styles.titleButton}
                    type="button"
                    aria-label={`查看任务：${run.query || run.id}`}
                    title={run.query || run.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(run)
                    }}
                  >
                    {run.query || run.id}
                  </button>
                </td>
                <td>
                  <span className={styles.sourceCell}>
                    <span aria-hidden="true" className={sourceInfo(run.source).icon} />
                    {sourceInfo(run.source).name}
                  </span>
                </td>
                <td>
                  <RunStatus state={run.state} />
                </td>
                <td className={styles.numeric}>{run.expert_calls}</td>
                <td
                  className={styles.numeric}
                  title="从提交到结束的总耗时，包含排队；未结束时显示已等待时长。"
                >
                  {runDuration(run)}
                </td>
                <td className={styles.numeric} title={timestamp(run.created_at)}>
                  {timestamp(run.created_at)}
                </td>
                <td className={styles.numeric} title={timestamp(run.finished_at)}>
                  {timestamp(run.finished_at)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
