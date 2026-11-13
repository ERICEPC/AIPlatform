'use client'

import type { RunSummary } from './run-types'
import { Button } from '@langgenius/dify-ui/button'
import {
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerPopup,
  DrawerPortal,
  DrawerTitle,
  DrawerViewport,
} from '@langgenius/dify-ui/drawer'
import { Pagination } from '@langgenius/dify-ui/pagination'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import Chip from '@/app/components/base/chip'
import { SearchInput } from '@/app/components/base/search-input'
import Sort from '@/app/components/base/sort'
import { currentWorkspaceIdAtom } from '@/context/workspace-state'
import { get } from '@/service/agent-teams'
import { TeamLogsTable } from './logs-table'
import styles from './logs.module.css'
import { TeamRunDetail } from './run-detail'
import { runSources, runStates } from './run-types'

type RunPage = { runs: RunSummary[]; total: number; page: number; limit: number }
const periods = [
  { value: 'last7days', name: '最近 7 天' },
  { value: 'last30days', name: '最近 30 天' },
  { value: 'allTime', name: '全部时间' },
]
const states = [
  { value: 'all', name: '全部状态' },
  ...Object.entries(runStates).map(([value, name]) => ({ value, name })),
]

export function TeamLogs({ teamId }: { teamId: string }) {
  const workspaceId = useAtomValue(currentWorkspaceIdAtom)
  const [period, setPeriod] = useState('last7days')
  const [source, setSource] = useState('all')
  const [state, setState] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [selected, setSelected] = useState<RunSummary | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(keyword.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [keyword])
  const params = new URLSearchParams({
    period,
    source,
    state,
    keyword: search,
    page: String(page),
    limit: String(limit),
    sort_by: sort.replace(/^-/, ''),
    sort_order: sort.startsWith('-') ? 'desc' : 'asc',
  })
  const logs = useQuery({
    queryKey: ['agent-teams', workspaceId, teamId, 'logs', params.toString()],
    queryFn: () => get<RunPage>(`/agent-teams/${teamId}/runs?${params}`),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const close = () => {
    setSelected(null)
    void logs.refetch()
  }
  return (
    <section data-team-logs className={styles.logs} aria-label="团队运行日志">
      <header className={styles.heading}>
        <h2>运行日志</h2>
        <p>查看该团队的每次任务记录，包括用户输入、团队回复和专家执行过程。</p>
        <div className={styles.filters}>
          <Chip
            value={period}
            items={periods}
            leftIcon={<span className="i-ri-calendar-line size-4" aria-hidden="true" />}
            onSelect={(item) => {
              setPage(1)
              setPeriod(item.value)
            }}
            onClear={() => {
              setPage(1)
              setPeriod('allTime')
            }}
          />
          <Chip
            value={source}
            items={runSources}
            onSelect={(item) => {
              setPage(1)
              setSource(item.value)
            }}
            onClear={() => {
              setPage(1)
              setSource('all')
            }}
          />
          <Chip
            value={state}
            items={states}
            onSelect={(item) => {
              setPage(1)
              setState(item.value)
            }}
            onClear={() => {
              setPage(1)
              setState('all')
            }}
          />
          <SearchInput
            aria-label="搜索任务内容或 ID"
            value={keyword}
            placeholder="搜索任务内容或 ID"
            className="w-60 shrink-0"
            onValueChange={(value) => setKeyword(value.slice(0, 200))}
          />
          <div className={styles.sort}>
            <Sort
              order={sort.startsWith('-') ? '-' : ''}
              value={sort.replace(/^-/, '')}
              items={[
                { value: 'created_at', name: '创建时间' },
                { value: 'finished_at', name: '结束时间' },
              ]}
              onSelect={(value) => {
                setPage(1)
                setSort(value)
              }}
            />
            <Button
              size="small"
              variant="secondary"
              disabled={logs.isFetching}
              aria-label="刷新运行日志"
              onClick={() => void logs.refetch()}
            >
              <span aria-hidden="true" className="i-ri-refresh-line" />
            </Button>
          </div>
        </div>
      </header>
      {logs.isError && (
        <div className={styles.error} role="alert">
          日志加载失败{logs.data ? '，当前显示上次获取的记录' : ''}。
          <Button size="small" variant="secondary" onClick={() => void logs.refetch()}>
            重试
          </Button>
        </div>
      )}
      <TeamLogsTable
        runs={logs.data?.runs ?? []}
        pending={logs.isPending}
        selectedId={selected?.id}
        onOpen={setSelected}
      />
      <footer className={styles.footer}>
        <span className={styles.total}>{logs.data ? `共 ${logs.data.total} 条` : '加载中…'}</span>
        <Pagination
          page={logs.data?.page ?? page}
          totalPages={Math.max(1, Math.ceil((logs.data?.total ?? 0) / limit))}
          onPageChange={setPage}
          className="min-w-0 flex-1"
          labels={{
            previous: '上一页',
            next: '下一页',
            editPageNumber: (current, total) => `第 ${current} 页，共 ${total} 页`,
            pageNumberInput: '页码',
          }}
          pageSize={{
            value: limit,
            options: [10, 25, 50],
            onValueChange: (value) => {
              setPage(1)
              setLimit(value)
            },
            label: '每页条数',
            ariaLabel: '每页条数',
          }}
        />
      </footer>
      <Drawer
        open={!!selected}
        modal
        swipeDirection="right"
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DrawerPortal>
          <DrawerBackdrop className="bg-transparent max-sm:bg-black/20" />
          <DrawerViewport>
            <DrawerPopup
              aria-label="团队运行记录详情"
              className="p-0! data-[swipe-direction=right]:top-16 data-[swipe-direction=right]:right-2 data-[swipe-direction=right]:bottom-3 data-[swipe-direction=right]:h-auto data-[swipe-direction=right]:w-full data-[swipe-direction=right]:max-w-180 data-[swipe-direction=right]:rounded-xl data-[swipe-direction=right]:border data-[swipe-direction=right]:border-components-panel-border"
            >
              <DrawerTitle className="sr-only">团队运行记录详情</DrawerTitle>
              <DrawerContent className="flex min-h-0 flex-1 flex-col p-0 pb-0">
                {selected && (
                  <TeamRunDetail
                    key={selected.id}
                    teamId={teamId}
                    log={selected}
                    onClose={close}
                    onChanged={() => void logs.refetch()}
                  />
                )}
              </DrawerContent>
            </DrawerPopup>
          </DrawerViewport>
        </DrawerPortal>
      </Drawer>
    </section>
  )
}
