'use client'

import type { AgentMonitoringChartType } from '@/features/agent-v2/agent-detail/monitoring/chart-utils'
import type { AgentMonitoringPeriod } from '@/features/agent-v2/agent-detail/monitoring/time-range-picker'
import { Button } from '@langgenius/dify-ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectTrigger,
} from '@langgenius/dify-ui/select'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import ReactECharts from 'echarts-for-react'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { Infotip } from '@/app/components/base/infotip'
import { currentWorkspaceIdAtom } from '@/context/workspace-state'
import { buildChartOptions } from '@/features/agent-v2/agent-detail/monitoring/chart-utils'
import { AgentMonitoringTimeRangePicker } from '@/features/agent-v2/agent-detail/monitoring/time-range-picker'
import { get } from '@/service/agent-teams'
import styles from './monitoring.module.css'

type Metrics = {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  timed_out: number
  interrupted: number
  cancelled: number
  model_calls: number
  expert_calls: number
  recorded_calls: number
  total_tokens: number | null
  success_rate: number | null
  avg_latency: number | null
  avg_queue: number | null
}
type Statistics = { summary: Metrics; daily: (Metrics & { date: string })[]; timezone: string }
type Metric = {
  key: keyof Metrics
  title: string
  explanation: string
  type: AgentMonitoringChartType
  unit?: string
  max?: number
}

const sources = [
  { value: 'all', name: '全部' },
  { value: 'console', name: 'Web 运行' },
  { value: 'api', name: '后端服务 API' },
  { value: 'channel', name: '消息渠道' },
  { value: 'preview', name: '草稿预览' },
  { value: 'other', name: '其他' },
]
const metrics: Metric[] = [
  {
    key: 'total',
    title: '全部任务数',
    explanation:
      '按任务创建时间统计所选范围内的全部任务，包含排队、运行、已完成、失败和取消的任务。',
    type: 'conversations',
  },
  {
    key: 'success_rate',
    title: '任务成功率',
    explanation:
      '成功任务 ÷ 已结束任务。已结束任务包含成功、失败、超时和中断，不包含排队、运行中及主动取消。',
    type: 'endUsers',
    unit: '%',
    max: 100,
  },
  {
    key: 'avg_latency',
    title: '平均响应时间',
    explanation: '成功任务从提交到最终完成的平均耗时，包含排队、团长规划、专家执行和汇总。',
    type: 'conversations',
    unit: '秒',
  },
  {
    key: 'avg_queue',
    title: '平均排队时间',
    explanation:
      '已经开始执行的任务，从提交到开始执行的平均等待时间。不包含尚在排队和开始前已取消的任务。',
    type: 'endUsers',
    unit: '秒',
  },
  {
    key: 'expert_calls',
    title: '专家调用次数',
    explanation: '所选任务内已经发起的专家执行次数，包含失败的调用，不包含团长的规划和汇总调用。',
    type: 'conversations',
  },
  {
    key: 'total_tokens',
    title: 'Token 用量',
    explanation:
      '汇总所选任务中团长和专家原生消息记录的输入与输出 Token。同一条消息只计一次；未上报用量的调用不计入，部分记录可能延迟更新。',
    type: 'tokenUsage',
    unit: 'Tokens',
  },
]
const format = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

function MetricChart({ metric, data }: { metric: Metric; data: Statistics }) {
  const rows = data.daily.map((row) => ({ date: row.date, value: row[metric.key] ?? undefined }))
  // Reuse native Agent chart colors, axes and tooltip layout.
  const options = buildChartOptions({
    rows,
    chartType: metric.type,
    valueKey: 'value',
    yMax: metric.max ?? (rows.some((row) => (row.value ?? 0) > 0) ? undefined : 1),
  })
  const axes = Array.isArray(options.xAxis) ? options.xAxis : []
  options.xAxis = axes.map((axis, i) =>
    i === 0
      ? {
          ...axis,
          axisLabel: {
            ...axis.axisLabel,
            formatter: (value: string | number) => dayjs(String(value)).format('MM-DD'),
          },
        }
      : axis,
  )
  // Token cost is not a Team metric; do not show an invented $0 price.
  options.tooltip = {
    trigger: 'axis',
    confine: true,
    valueFormatter: (value) =>
      value == null ? '暂无数据' : `${Number(value).toLocaleString('zh-CN')} ${metric.unit || ''}`,
  }
  if (Array.isArray(options.series))
    options.series = options.series.map((series) => ({ ...series, tooltip: undefined }))
  const value = data.summary[metric.key]
  return (
    <article className={styles.chart} aria-label={metric.title}>
      <div className={styles.chartHeading}>
        <h3>{metric.title}</h3>
        <Infotip aria-label={metric.explanation}>{metric.explanation}</Infotip>
      </div>
      <div className={styles.valueRow}>
        <span className={value === 0 || value === null ? styles.emptyValue : styles.value}>
          {format(value)}
        </span>
        {metric.unit && value !== null && <span className={styles.unit}>{metric.unit}</span>}
        {metric.key === 'total_tokens' && data.summary.model_calls > 0 && (
          <span className={styles.coverage}>
            已记录 {data.summary.recorded_calls} / {data.summary.model_calls} 次调用
          </span>
        )}
      </div>
      <div className={styles.plot}>
        <ReactECharts
          option={options}
          notMerge
          opts={{ renderer: 'svg' }}
          style={{ height: 240, width: '100%' }}
        />
      </div>
    </article>
  )
}

export function TeamMonitoring({ teamId }: { teamId: string }) {
  const workspaceId = useAtomValue(currentWorkspaceIdAtom)
  const [period, setPeriod] = useState<AgentMonitoringPeriod>(() => ({
    name: '今天',
    query: {
      start: dayjs().startOf('day').format('YYYY-MM-DD HH:mm'),
      end: dayjs().endOf('day').format('YYYY-MM-DD HH:mm'),
    },
  }))
  const [source, setSource] = useState('all')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const params = new URLSearchParams({
    start: dayjs(period.query.start).format('YYYY-MM-DD'),
    end: dayjs(period.query.end).format('YYYY-MM-DD'),
    timezone,
    source,
  })
  const query = useQuery({
    queryKey: ['agent-teams', workspaceId, teamId, 'statistics', params.toString()],
    queryFn: () => get<Statistics>(`/agent-teams/${teamId}/statistics?${params}`),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const selected = sources.find((item) => item.value === source)
  const summary = query.data?.summary
  return (
    <section data-team-monitor className={styles.monitor} aria-label="团队监控">
      <header className={styles.heading}>
        <h2>监控</h2>
        <p>跟踪该团队在所有访问点上的任务、协作效率与用量。</p>
        <div className={styles.filters}>
          <AgentMonitoringTimeRangePicker value={period} onChange={setPeriod} />
          <Select
            value={source}
            onValueChange={(value) => {
              if (value) setSource(value)
            }}
          >
            <div className={styles.source}>
              <SelectTrigger aria-label={`来源 ${selected?.name}`} className={styles.sourceTrigger}>
                <span className={styles.sourceLabel}>来源</span>
                <span>{selected?.name}</span>
              </SelectTrigger>
              <button
                className={styles.clear}
                aria-label="清除来源筛选"
                type="button"
                onClick={() => setSource('all')}
              >
                <span aria-hidden="true" className="i-ri-close-circle-fill" />
              </button>
            </div>
            <SelectContent className="w-56">
              {sources.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <SelectItemText>{item.name}</SelectItemText>
                  <SelectItemIndicator />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className={styles.refreshInfo}>{timezone} · 每 15 秒刷新</span>
          <Button
            variant="secondary"
            size="small"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            aria-label="刷新监控"
          >
            <span aria-hidden="true" className="i-ri-refresh-line" />
            刷新
          </Button>
        </div>
      </header>
      {query.isError && (
        <div className={styles.error} role="alert">
          监控数据加载失败{query.data ? '，当前显示上次成功获取的数据' : ''}。
          <Button variant="secondary" size="small" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      )}
      {summary && (
        <div className={styles.statuses} aria-label="任务状态汇总">
          <span>
            已完成 <b>{summary.succeeded}</b>
          </span>
          <span>
            排队中 <b>{summary.queued}</b>
          </span>
          <span>
            执行中 <b>{summary.running}</b>
          </span>
          <span>
            失败 / 超时 / 中断 <b>{summary.failed + summary.timed_out + summary.interrupted}</b>
          </span>
          <span>
            已取消 <b>{summary.cancelled}</b>
          </span>
          {summary.total === 0 && <span>所选范围内暂无任务</span>}
        </div>
      )}
      <div className={styles.grid} aria-busy={query.isPending}>
        {query.isPending
          ? metrics.map((metric) => (
              <div
                className={styles.skeleton}
                key={metric.key}
                aria-label={`${metric.title}加载中`}
              />
            ))
          : query.data &&
            metrics.map((metric) => (
              <MetricChart metric={metric} data={query.data} key={metric.key} />
            ))}
      </div>
    </section>
  )
}
