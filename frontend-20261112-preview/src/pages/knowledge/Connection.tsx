import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { request } from '@/api/http'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { ErrorBar } from '@/components/ui/data'

type Status = {
  connected: boolean
  auto_reconnect?: boolean
  account?: string
  account_id?: string
  tenant_id?: string
  reason?: 'connection_required' | 'session_expired' | 'upstream_unavailable'
}
const status = () => request<Status>(
  { method: 'GET', path: '/knowledge-bridge/connection' },
  () => ({ connected: true, account: '演示账号', account_id: 'demo', tenant_id: 'demo' }),
)

export function KnowledgeConnection({ children }: { children: React.ReactNode }) {
  const state = useQuery(status, [], { pollMs: 60_000 })
  const [editing, setEditing] = useState(false)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // A later upstream expiry should return to connection status, not leave a
  // permanently broken knowledge page beneath a stale "connected" banner.
  useEffect(() => {
    const expired = () => { setEditing(false); state.reload() }
    addEventListener('rx-knowledge-session-expired', expired)
    return () => removeEventListener('rx-knowledge-session-expired', expired)
  }, [state.reload])
  async function connect(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      await request({ method: 'POST', path: '/knowledge-bridge/connection', body: { password, auto_reconnect: remember || state.data?.auto_reconnect === true } }, () => ({}))
      setEditing(false); state.reload()
    } catch (e) { setError(e as Error) }
    finally { setPassword(''); setBusy(false) }
  }
  const unavailable = state.data?.reason === 'upstream_unavailable'
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b border-line px-5 py-2 text-xs text-ink-3">
      {state.loading ? '正在验证当前账号的知识库连接…' : state.data?.connected
        ? `知识库 · ${state.data.account ?? ''} · 仅使用本人获授权的数据`
        : unavailable ? '知识库服务暂时不可用' : '知识库身份待验证'}
      {state.data?.connected && <button className="ml-4 cursor-pointer text-volt-text" onClick={() => { setEditing(!editing); setPassword(''); setError(null) }}>连接信息</button>}
      <button className="ml-4 cursor-pointer" onClick={async () => { await state.reload(); dispatchEvent(new Event('rx-knowledge-refresh')) }}>刷新连接</button>
    </div>
    <ErrorBar error={state.error} />
    {(editing || (!state.loading && state.data && !state.data.connected)) && <div className="mx-auto my-6 w-full max-w-lg space-y-4 rounded-2xl border border-line p-6">
      <div><h2 className="font-medium">使用当前平台身份访问知识库</h2><p className="mt-2 text-sm text-ink-3">{state.data?.account}</p></div>
      <p className="text-sm text-ink-2">平台密码登录成功后会自动连接同账号的知识库。连接与当前用户和工作空间绑定，不共用其他成员的登录权限。</p>
      {state.data?.auto_reconnect && <div className="space-y-2 text-sm"><p>已启用自动重连：凭据加密保存在服务器，仅用于本人知识库。密码修改、权限撤销或认证服务故障仍可能需要处理。</p><Button size="small" onClick={async () => { await request({method:'DELETE',path:'/knowledge-bridge/connection'},()=>({})); setRemember(false); await state.reload() }}>关闭自动重连并删除保存的凭据</Button></div>}
      {unavailable ? <p className="text-sm text-ink-3">暂时无法访问知识库服务，请稍后刷新；无需反复输入密码。</p> : !state.data?.connected && <>
        <p className="text-sm text-ink-3">当前会话尚未验证或已过期。可重新登录平台自动连接；若两个系统的密码不同，可在此验证本人知识库账号。</p>
        <form onSubmit={connect} className="space-y-3">
          <Input aria-label="当前账号的知识库密码" type="password" autoComplete="current-password" placeholder="当前账号的知识库密码" value={password} onChange={e => setPassword(e.target.value)} />
          <label className="flex gap-2 text-xs text-ink-3"><input type="checkbox" checked={remember || !!state.data?.auto_reconnect} onChange={e => setRemember(e.target.checked)} disabled={!!state.data?.auto_reconnect} />加密保存本人凭据，登录过期后自动重连</label><p className="text-xs text-ink-3">仅用于当前账号的知识库认证；未开启自动重连时不保存密码。</p>
          <ErrorBar error={error} />
          <Button type="submit" variant="primary" loading={busy} disabled={!password}>验证当前账号</Button>
        </form>
      </>}
    </div>}
    {state.data?.connected && <div className="contents" key={`${state.data.tenant_id}:${state.data.account_id}`}>{children}</div>}
  </div>
}
