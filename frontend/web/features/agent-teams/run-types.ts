export type RunSummary = {
  id: string
  snapshot_id: string
  source: string
  query: string
  state: string
  error_code: string
  created_at: number
  started_at: number | null
  finished_at: number | null
  expert_calls: number
  published_version: number | null
}

export type RunDetail = Omit<RunSummary, 'expert_calls' | 'published_version'> & {
  answer: string
  cancelled: boolean
  config: { agents: Record<string, { name: string }> }
  steps: {
    id: string
    kind: string
    agent_id: string
    snapshot_id: string
    round: number
    task: string
    state: string
    result: string
    error_code: string
    started_at: number
    finished_at: number | null
  }[]
}

export const runStates: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  timed_out: '超时',
  interrupted: '执行中断',
  cancelled: '已取消',
}
export const runSources = [
  { value: 'all', name: '全部来源', icon: 'i-ri-filter-3-line' },
  { value: 'console', name: 'Web 运行', icon: 'i-ri-window-line' },
  { value: 'api', name: '后端服务 API', icon: 'i-ri-code-s-slash-line' },
  { value: 'channel', name: '消息渠道', icon: 'i-ri-chat-3-line' },
  { value: 'preview', name: '草稿预览', icon: 'i-ri-play-circle-line' },
  { value: 'other', name: '其他', icon: 'i-ri-more-line' },
]
export const sourceInfo = (source: string) =>
  runSources.find((item) => item.value === source) ?? runSources[5]!
export const runReasons: Record<string, string> = {
  director_failed: '团长调用失败，请检查其模型配置。',
  invalid_plan: '团长未返回有效分工格式，请检查任务后重新发起。',
  unknown_expert: '团长选择了团队外的专家，系统已阻止调用。',
  no_expert_called: '团长未安排专家参与，请补充团队目标和专家职责。',
  context_limit: '专家返回内容过长，请缩小任务范围。',
  runtime_error: '执行失败，请检查专家运行记录。',
  worker_restarted: '执行服务重启，任务已停止，未自动重复调用。',
  queue_expired: '排队超过 5 分钟，请稍后重新发起。',
  timed_out: '超过团队设定的时间上限。',
  cancelled: '任务已取消。',
}
export const isActiveRun = (state: string) => state === 'queued' || state === 'running'
export function runDuration(run: Pick<RunSummary, 'created_at' | 'finished_at'>) {
  return `${Math.max(0, (run.finished_at ?? Date.now() / 1000) - run.created_at).toFixed(1)} 秒`
}
export const runVersion = (run: Pick<RunSummary, 'snapshot_id' | 'published_version'>) =>
  run.snapshot_id.startsWith('draft:')
    ? `草稿 ${run.snapshot_id.slice(6)}`
    : run.published_version
      ? `已发布 v${run.published_version}`
      : '已发布版本'
