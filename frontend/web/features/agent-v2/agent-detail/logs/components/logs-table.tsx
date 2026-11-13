import type { AgentLogConversationItemResponse } from '@dify/contracts/api/console/agent/types.gen'
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useTimestamp from '@/hooks/use-timestamp'
import { LogSourceCell } from './source-cell'

const DEFAULT_WIDTHS = [20, 280, 260, 220, 100, 100, 100, 210, 210]
const MIN_WIDTHS = [20, 120, 120, 120, 80, 80, 80, 210, 210]

export function AgentLogsTable({
  logs,
  isPending,
  isError,
  isSuccess,
  selectedLogId,
  onOpenLog,
  onRetry,
}: {
  logs: AgentLogConversationItemResponse[]
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  selectedLogId?: string
  onOpenLog: (log: AgentLogConversationItemResponse) => void
  onRetry: () => void
}) {
  const [widths, setWidths] = useState(DEFAULT_WIDTHS)
  const dragRef = useRef<{ index: number; x: number; widths: number[] } | null>(null)
  const { t } = useTranslation('agentV2')
  const tableHeaderLabels = {
    unread: t(($) => $['agentDetail.logs.table.unread']),
    title: t(($) => $['agentDetail.logs.table.title']),
    source: t(($) => $['agentDetail.logs.table.source']),
    endUser: t(($) => $['agentDetail.logs.table.endUser']),
    messageCount: t(($) => $['agentDetail.logs.table.messageCount']),
    userRate: t(($) => $['agentDetail.logs.table.userRate']),
    operationRate: t(($) => $['agentDetail.logs.table.operationRate']),
    updatedTime: t(($) => $['agentDetail.logs.table.updatedTime']),
    createdTime: t(($) => $['agentDetail.logs.table.createdTime']),
  }

  return (
    <div
      className="h-full min-h-0 min-w-0 overflow-auto overscroll-contain"
      role="region"
      aria-label={t(($) => $['agentDetail.logs.title'])}
      tabIndex={-1}
    >
      <table
        className="table-fixed border-collapse"
        style={{ width: widths.reduce((a, b) => a + b, 0), minWidth: '100%' }}
      >
        <colgroup>
          {widths.map((width, index) => (
            <col key={Object.keys(tableHeaderLabels)[index]} style={{ width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-background-section-burn">
          <tr className="h-9 text-left system-xs-medium-uppercase text-text-tertiary">
            {Object.entries(tableHeaderLabels).map(([key, label], index) => (
              <TableHead key={key} className="relative">
                <span className={index === 0 ? 'sr-only' : undefined}>{label}</span>
                {index > 0 && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={label}
                    aria-valuemin={MIN_WIDTHS[index]}
                    aria-valuemax={1000}
                    aria-valuenow={Math.round(widths[index] ?? 210)}
                    tabIndex={0}
                    className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none border-r border-divider-regular hover:bg-state-accent-hover focus-visible:ring-2 focus-visible:ring-state-accent-solid"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return
                      event.preventDefault()
                      const cells = event.currentTarget.closest('tr')!.cells
                      const measured = Array.from(
                        cells,
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
                      next[index] = Math.max(
                        MIN_WIDTHS[index] ?? 80,
                        Math.min(1000, (active.widths[index] ?? 210) + event.clientX - active.x),
                      )
                      setWidths(next)
                    }}
                    onPointerUp={(event) => {
                      dragRef.current = null
                      if (event.currentTarget.hasPointerCapture(event.pointerId))
                        event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                    onLostPointerCapture={() => {
                      dragRef.current = null
                    }}
                    onPointerCancel={() => {
                      dragRef.current = null
                    }}
                    onDoubleClick={() =>
                      setWidths((current) =>
                        current.map((width, i) =>
                          i === index ? (DEFAULT_WIDTHS[i] ?? width) : width,
                        ),
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                      event.preventDefault()
                      const delta = event.key === 'ArrowRight' ? 20 : -20
                      setWidths((current) =>
                        current.map((width, i) =>
                          i === index
                            ? Math.max(MIN_WIDTHS[i] ?? 80, Math.min(1000, width + delta))
                            : width,
                        ),
                      )
                    }}
                  />
                )}
              </TableHead>
            ))}
          </tr>
        </thead>
        <AgentLogsTableBody
          logs={logs}
          isPending={isPending}
          isError={isError}
          isSuccess={isSuccess}
          selectedLogId={selectedLogId}
          onOpenLog={onOpenLog}
          onRetry={onRetry}
        />
      </table>
    </div>
  )
}

function AgentLogsTableBody({
  logs,
  isPending,
  isError,
  isSuccess,
  selectedLogId,
  onOpenLog,
  onRetry,
}: {
  logs: AgentLogConversationItemResponse[]
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  selectedLogId?: string
  onOpenLog: (log: AgentLogConversationItemResponse) => void
  onRetry: () => void
}) {
  const { t } = useTranslation('agentV2')
  const { t: tCommon } = useTranslation('common')
  const { formatTime } = useTimestamp()
  const notAvailable = t(($) => $['agentDetail.logs.notAvailable'])
  const formatLogTime = (value?: number | null) =>
    value == null ? notAvailable : formatTime(value, 'YYYY-MM-DD HH:mm:ss')

  return (
    <tbody className="system-sm-regular text-text-secondary">
      {isPending && <LogsSkeletonRows />}
      {isError && (
        <LogsStateRow>
          <div className="flex items-center justify-center gap-2">
            <span>{t(($) => $['agentDetail.logs.loadFailed'])}</span>
            <Button variant="secondary" size="small" onClick={onRetry}>
              {tCommon(($) => $['operation.retry'])}
            </Button>
          </div>
        </LogsStateRow>
      )}
      {isSuccess && logs.length === 0 && (
        <LogsStateRow>{t(($) => $['agentDetail.logs.empty'])}</LogsStateRow>
      )}
      {isSuccess &&
        logs.map((log) => {
          const logTitle = log.title || log.conversation_id
          const isSelected = selectedLogId === log.id

          return (
            <tr
              key={log.id}
              className={cn(
                'h-10 cursor-pointer border-b border-divider-subtle hover:bg-background-default-hover',
                isSelected && 'bg-background-default-hover',
              )}
              onClick={() => onOpenLog(log)}
            >
              <td className="px-0">
                <span
                  className={cn(
                    'mx-auto block size-1.5 rounded-full',
                    log.unread ? 'bg-util-colors-blue-blue-500' : 'bg-transparent',
                  )}
                />
              </td>
              <TableCell>
                <button
                  type="button"
                  aria-label={logTitle}
                  className="block w-full truncate rounded-sm text-left system-sm-medium text-text-secondary focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenLog(log)
                  }}
                >
                  {log.title || notAvailable}
                </button>
              </TableCell>
              <td className="px-3">
                <LogSourceCell source={log.source} />
              </td>
              <TableCell translate="no">{log.end_user_id || notAvailable}</TableCell>
              <TableCell className="tabular-nums">{log.message_count}</TableCell>
              <TableCell className="text-text-quaternary">
                {formatRate(log.user_rate, notAvailable)}
              </TableCell>
              <TableCell className="text-text-quaternary">
                {formatRate(log.operation_rate, notAvailable)}
              </TableCell>
              <TableCell className="tabular-nums" title={formatLogTime(log.updated_at)}>
                {formatLogTime(log.updated_at)}
              </TableCell>
              <TableCell className="tabular-nums" title={formatLogTime(log.created_at)}>
                {formatLogTime(log.created_at)}
              </TableCell>
            </tr>
          )
        })}
    </tbody>
  )
}

function formatRate(value: number | null | undefined, fallback: string) {
  return value == null ? fallback : `${Math.round(value * 100)}%`
}

function LogsStateRow({ children }: { children: ReactNode }) {
  return (
    <tr className="h-20 border-b border-divider-subtle">
      <td colSpan={9} className="px-3 text-center text-text-tertiary">
        {children}
      </td>
    </tr>
  )
}

function LogsSkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }, (_, index) => (
        <tr key={index} className="h-10 border-b border-divider-subtle">
          <td className="px-0">
            <span className="mx-auto block size-1.5 rounded-full bg-text-quaternary opacity-20" />
          </td>
          <td className="px-3">
            <div className="h-3 w-3/4 rounded-sm bg-text-quaternary opacity-20" />
          </td>
          <td className="px-3">
            <div className="flex items-center gap-2">
              <div className="size-5 rounded-full bg-text-quaternary opacity-20" />
              <div className="h-3 w-24 rounded-sm bg-text-quaternary opacity-20" />
            </div>
          </td>
          <td className="px-3">
            <div className="h-3 w-28 rounded-sm bg-text-quaternary opacity-20" />
          </td>
          <td className="px-3">
            <div className="h-3 w-8 rounded-sm bg-text-quaternary opacity-20" />
          </td>
          <td className="px-3">
            <div className="h-3 w-8 rounded-sm bg-text-quaternary opacity-20" />
          </td>
          <td className="px-3">
            <div className="h-3 w-8 rounded-sm bg-text-quaternary opacity-20" />
          </td>
          <td className="px-3">
            <div className="h-3 w-24 rounded-sm bg-text-quaternary opacity-20" />
          </td>
          <td className="px-3">
            <div className="h-3 w-24 rounded-sm bg-text-quaternary opacity-20" />
          </td>
        </tr>
      ))}
    </>
  )
}

function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn('px-3 text-left whitespace-nowrap', className)} {...props} />
}

function TableCell({ children, className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('min-w-0 px-3 whitespace-nowrap', className)} {...props}>
      <div className="truncate">{children}</div>
    </td>
  )
}
