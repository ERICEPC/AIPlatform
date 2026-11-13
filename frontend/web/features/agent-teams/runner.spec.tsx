import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { get, post } from '@/service/agent-teams'
import { render } from '@/test/console/render'
import TeamRunnerPage from './runner'

const navigation = vi.hoisted(() => ({
  search: new URLSearchParams('mode=published&workspace=workspace-test'),
  replace: vi.fn(),
}))
vi.mock('@/next/navigation', () => ({
  usePathname: () => '/agent-teams/team-test/run',
  useSearchParams: () => navigation.search,
  useRouter: () => ({ replace: navigation.replace }),
}))
vi.mock('@/service/agent-teams', () => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/hooks/use-document-title', () => ({ default: vi.fn() }))
vi.mock('@/hooks/use-timestamp', () => ({
  default: () => ({ formatTime: (time: number) => `time-${time}` }),
}))
vi.mock('@/app/components/base/markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}))
vi.mock('@/context/workspace-state', async () => {
  const { atom } = await import('jotai')
  return { currentWorkspaceIdAtom: atom('workspace-test') }
})
const team = {
  id: 'team-test',
  name: '测试专家团队',
  published_id: 'snapshot-2',
  revision: 3,
  versions: [{ id: 'snapshot-2', version: 2 }],
}
const run = {
  id: 'run-1',
  query: '已有测试任务',
  answer: '团队汇总结果',
  snapshot_id: 'snapshot-2',
  published_version: 2,
  state: 'succeeded',
  source: 'console',
  created_at: 1000,
  finished_at: 1010,
  started_at: 1001,
  cancelled: false,
  error_code: '',
  config: { agents: { expert: { name: '分析专家' } } },
  steps: [
    {
      id: 'step-1',
      kind: 'expert',
      agent_id: 'expert',
      snapshot_id: 'expert-v1',
      round: 1,
      task: '分析事实',
      state: 'succeeded',
      result: '核查完成',
      error_code: '',
      started_at: 1001,
      finished_at: 1008,
    },
  ],
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const ui = () => (
    <QueryClientProvider client={client}>
      <TeamRunnerPage />
    </QueryClientProvider>
  )
  const view = render(ui())
  return () => view.rerender(ui())
}
describe('Standalone Team runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    navigation.search = new URLSearchParams('mode=published&workspace=workspace-test')
    vi.mocked(get).mockImplementation(async (url) =>
      url.endsWith('/runs/run-1')
        ? run
        : url.includes('/conversations/run-1?')
          ? { runs: [run] }
          : url.includes('/conversations?')
            ? { runs: [run], total: 1 }
            : { team },
    )
  })
  it('opens without starting a model task and restores a run from its URL', async () => {
    navigation.search.set('run', 'run-1')
    mount()
    expect(await screen.findByText('团队汇总结果')).toBeInTheDocument()
    await userEvent.click(screen.getByText('协作过程 · 1 个步骤'))
    await userEvent.click(screen.getByText('专家 · 分析专家'))
    expect(screen.getByText('核查完成')).toBeVisible()
    expect(post).not.toHaveBeenCalled()
  })
  it('submits exactly once to the displayed published snapshot and records its run URL', async () => {
    let finish!: (value: { id: string; conversation_id: string }) => void
    vi.mocked(post).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    mount()
    await screen.findByText('让专家团队一起完成任务')
    await userEvent.type(screen.getByRole('textbox', { name: '团队任务' }), '请分析客户资料')
    await userEvent.dblClick(screen.getByRole('button', { name: '发送任务' }))
    expect(post).toHaveBeenCalledExactlyOnceWith('/agent-teams/team-test/runs', {
      body: {
        query: '请分析客户资料',
        preview: false,
        conversation: true,
        snapshot_id: 'snapshot-2',
        request_id: expect.any(String),
      },
    })
    expect(screen.getByRole('button', { name: '发送任务' })).toBeDisabled()
    finish({ id: 'run-new', conversation_id: 'run-new' })
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/agent-teams/team-test/run?mode=published&workspace=workspace-test&run=run-new',
        { scroll: false },
      ),
    )
    expect(sessionStorage.length).toBe(0)
  })
  it('allows saved draft debugging without a publication', async () => {
    navigation.search.set('mode', 'preview')
    vi.mocked(get).mockImplementation(async (url) =>
      url.includes('/conversations?')
        ? { runs: [], total: 0 }
        : { team: { ...team, published_id: null } },
    )
    vi.mocked(post).mockResolvedValue({ id: 'draft-run', conversation_id: 'draft-run' })
    mount()
    await screen.findByText('草稿调试 · r3')
    await userEvent.type(screen.getByRole('textbox', { name: '团队任务' }), '调试任务{enter}')
    await waitFor(() =>
      expect(post).toHaveBeenCalledExactlyOnceWith('/agent-teams/team-test/runs', {
        body: {
          query: '调试任务',
          preview: true,
          conversation: true,
          request_id: expect.any(String),
        },
      }),
    )
  })
  it('blocks published execution when no published version exists', async () => {
    vi.mocked(get).mockImplementation(async (url) =>
      url.includes('/conversations?')
        ? { runs: [], total: 0 }
        : { team: { ...team, published_id: null } },
    )
    mount()
    await screen.findByText('请先在团队管理中发布团队。')
    expect(screen.getByRole('textbox', { name: '团队任务' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送任务' })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })
  it('does not resend after an uncertain submission, and retains the warning across reload', async () => {
    vi.mocked(post).mockRejectedValue(new Error('connection closed'))
    mount()
    await screen.findByText('让专家团队一起完成任务')
    await userEvent.type(screen.getByRole('textbox', { name: '团队任务' }), '可能已被接受的任务')
    await userEvent.click(screen.getByRole('button', { name: '发送任务' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('提交结果尚未确认')
    await userEvent.click(screen.getByRole('button', { name: '刷新最近对话' }))
    expect(screen.getByRole('button', { name: '发送任务' })).toBeDisabled()
    expect(post).toHaveBeenCalledOnce()
    expect(
      sessionStorage.getItem('team-run-pending:workspace-test:team-test:published'),
    ).toBeTruthy()
  })
  it('loads a pending-submit marker without issuing a new request', async () => {
    sessionStorage.setItem('team-run-pending:workspace-test:team-test:published', 'pending-request')
    mount()
    await screen.findByText(/上次提交状态未确认/)
    expect(screen.getByRole('button', { name: '发送任务' })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })
  it('cancels only the selected active run and then reads its state', async () => {
    navigation.search.set('run', 'run-1')
    let cancelled = false
    vi.mocked(get).mockImplementation(async (url) =>
      url.includes('/conversations/run-1?')
        ? {
            runs: [
              {
                ...run,
                state: cancelled ? 'cancelled' : 'running',
                answer: '',
                finished_at: cancelled ? 1010 : null,
              },
            ],
          }
        : url.includes('/conversations?')
          ? { runs: [run], total: 1 }
          : { team },
    )
    vi.mocked(post).mockImplementation(async () => {
      cancelled = true
      return {}
    })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: '停止任务' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '停止任务' })).not.toBeInTheDocument(),
    )
    expect(post).toHaveBeenCalledExactlyOnceWith('/agent-teams/team-test/runs/run-1/cancel', {
      body: {},
    })
    expect(
      vi.mocked(get).mock.calls.filter(([url]) => url.includes('/conversations/run-1?')).length,
    ).toBeGreaterThanOrEqual(2)
  })
  it('restores every turn and continues the same conversation', async () => {
    navigation.search.set('run', 'run-1')
    const second = { ...run, id: 'run-2', query: '预算增加两万呢', answer: '新预算是二十万' }
    vi.mocked(get).mockImplementation(async (url) =>
      url.includes('/conversations/run-1?')
        ? { runs: [run, second] }
        : url.includes('/conversations?')
          ? { runs: [run] }
          : { team },
    )
    vi.mocked(post).mockResolvedValue({ id: 'run-3', conversation_id: 'run-1' })
    mount()
    expect(await screen.findByText('新预算是二十万')).toBeInTheDocument()
    expect(screen.getByText('团队汇总结果')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: '团队任务' }), '继续细化{enter}')
    await waitFor(() =>
      expect(post).toHaveBeenCalledExactlyOnceWith('/agent-teams/team-test/runs', {
        body: {
          query: '继续细化',
          preview: false,
          conversation: true,
          conversation_id: 'run-1',
          request_id: expect.any(String),
        },
      }),
    )
  })
  it('starts an empty conversation only after the new conversation action', async () => {
    navigation.search.set('run', 'run-1')
    const rerender = mount()
    await screen.findByText('团队汇总结果')
    await userEvent.click(screen.getByRole('button', { name: '开启新对话' }))
    expect(navigation.replace).toHaveBeenLastCalledWith(
      '/agent-teams/team-test/run?mode=published&workspace=workspace-test',
      { scroll: false },
    )
    navigation.search.delete('run')
    rerender()
    await screen.findByText('让专家团队一起完成任务')
    expect(screen.queryByText('团队汇总结果')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
  it('does not load or submit across a workspace mismatch', async () => {
    navigation.search.set('workspace', 'another-workspace')
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent('当前工作空间不匹配')
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})
