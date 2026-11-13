import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { del, get, post } from '@/service/agent-teams'
import { render } from '@/test/console/render'
import { TeamAccess } from './access'
import { TeamApiKeys } from './access-keys'

vi.mock('@/service/agent-teams', () => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }))
vi.mock('@/hooks/use-timestamp', () => ({
  default: () => ({ formatTime: (value: number) => `time-${value}` }),
}))
vi.mock('@/hooks/use-theme', () => ({ default: () => ({ theme: 'dark' }) }))
vi.mock('@langgenius/dify-ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/context/workspace-state', async () => {
  const { atom } = await import('jotai')
  return { currentWorkspaceIdAtom: atom('workspace-test') }
})

const team = {
  id: 'team-test',
  published_id: 'version-test',
  versions: [{ id: 'version-test', version: 2, created_at: 1000 }],
}
const key = { id: 'key-test', label: '业务系统', suffix: '123456', created_at: 1000 }
const renderAccess = (published = true) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TeamAccess team={published ? team : { ...team, published_id: null, versions: [] }} />
    </QueryClientProvider>,
  )
}
const renderKeys = () => {
  const onRefresh = vi.fn()
  const onClose = vi.fn()
  render(
    <TeamApiKeys
      teamId={team.id}
      keys={[key]}
      loading={false}
      loadError={false}
      onRefresh={onRefresh}
      onClose={onClose}
    />,
  )
  return { onRefresh, onClose }
}

describe('Team access and key management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(get).mockResolvedValue({ keys: [key] })
  })
  it('keeps the launch URL in published mode and channels scoped to the current team', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderAccess(true)
    expect(
      screen.getByText(/\/agent-teams\/team-test\/run\?mode=published&workspace=workspace-test$/),
    ).toBeInTheDocument()
    expect(screen.getByTitle('团队消息渠道')).toHaveAttribute(
      'src',
      '/message-channels/?team_id=team-test&embedded=1',
    )
    await userEvent.click(screen.getByRole('button', { name: '启动' }))
    expect(open).toHaveBeenCalledExactlyOnceWith(
      '/agent-teams/team-test/run?mode=published&workspace=workspace-test',
      '_blank',
      'noopener,noreferrer',
    )
    open.mockRestore()
    await waitFor(() => expect(get).toHaveBeenCalledWith('/agent-teams/team-test/keys'))
    expect(post).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })
  it('requires publication before launch or key management without blocking API documentation', async () => {
    renderAccess(false)
    expect(screen.getByRole('button', { name: '启动' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /API Key/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'API Reference' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('1. 提交任务')).toBeInTheDocument()
    expect(within(dialog).getByText('3. 取消任务')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/YOUR_TEAM_API_KEY/)).toHaveLength(3)
    expect(get).not.toHaveBeenCalled()
  })
  it('opens keys without creating a credential and shows only masked existing keys', async () => {
    renderAccess()
    await waitFor(() => expect(screen.getByLabelText('Key 数量')).toHaveTextContent('1'))
    await userEvent.click(screen.getByRole('button', { name: /API Key/ }))
    expect(screen.getByText('••••••123456')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '关闭 API Key' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('shows a newly created key once and allows explicitly hiding it', async () => {
    vi.mocked(post).mockResolvedValue({ token: 'team-fake-unit-test-token' })
    const { onRefresh } = renderKeys()
    await userEvent.click(screen.getByRole('button', { name: '创建 API Key' }))
    expect(post).toHaveBeenCalledExactlyOnceWith('/agent-teams/team-test/keys', {
      body: { label: '业务系统' },
    })
    expect(await screen.findByText('team-fake-unit-test-token')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建 API Key' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '我已保存，隐藏 Key' }))
    expect(screen.queryByText('team-fake-unit-test-token')).not.toBeInTheDocument()
    expect(onRefresh).toHaveBeenCalledOnce()
  })
  it('does not retry an uncertain key creation and asks to reconcile the list', async () => {
    vi.mocked(post).mockRejectedValue(new Error('Network error'))
    const { onRefresh } = renderKeys()
    await userEvent.click(screen.getByRole('button', { name: '创建 API Key' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('刷新列表核对状态')
    expect(post).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
  })
  it('revokes only after confirmation and uses the current team and selected key', async () => {
    vi.mocked(del).mockResolvedValue({ ok: true })
    const { onRefresh } = renderKeys()
    await userEvent.click(screen.getByRole('button', { name: '撤销尾号 123456 的 Key' }))
    expect(del).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(del).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '撤销尾号 123456 的 Key' }))
    await userEvent.click(screen.getByRole('button', { name: '确认撤销' }))
    expect(del).toHaveBeenCalledExactlyOnceWith('/agent-teams/team-test/keys/key-test')
    expect(onRefresh).toHaveBeenCalledOnce()
  })
})
