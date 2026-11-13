import type { SectionProps } from './detail'
import type { TeamKey } from '@/api/teams'
import { RiAddLine, RiBookOpenLine, RiCodeSSlashLine, RiDeleteBinLine, RiExternalLinkLine, RiInformationLine, RiKey2Line, RiRefreshLine, RiWindowLine } from '@remixicon/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { createKey, listKeys, revokeKey } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { type Column, CopyField, DataTable, ErrorBar } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Badge, Panel } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { TeamChannels } from './channels'
import { fmtTime } from './shared'

function AccessCard({ icon: Icon, title, published, label, url, children }: { icon: React.ComponentType<{ className?: string }>, title: string, published: boolean, label: string, url: string, children: React.ReactNode }) {
  return (
    <Panel level={2} radius="lg" className="flex flex-col">
      <div className="flex-1 p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-xl bg-volt-soft text-volt-text"><Icon className="size-4" /></span>
          <p className="text-[14.5px] font-semibold">{title}</p>
          <Badge tone={published ? 'mint' : 'neutral'} dot={published} className="ml-auto">{published ? '可用' : '待发布'}</Badge>
        </div>
        <p className="mt-4 mb-1.5 text-[12px] text-ink-3">{label}</p>
        <CopyField value={url} mono />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">{children}</div>
    </Panel>
  )
}

function ApiReference({ open, onClose, endpoint }: { open: boolean, onClose: () => void, endpoint: string }) {
  const examples = [
    { title: '1. 提交任务', method: 'POST', path: '/runs', desc: '返回 HTTP 202 和任务 ID。每个新任务使用新的业务请求编号；同一任务重试时沿用原编号。可加 snapshot_id 固定指定版本。', code: `curl -X POST '${endpoint}/runs' \\\n  -H 'Authorization: Bearer YOUR_TEAM_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: UNIQUE_REQUEST_ID' \\\n  -d '{"user":"USER_ID","query":"请分析客户情况并给出下一步建议"}'` },
    { title: '2. 查询结果', method: 'GET', path: '/runs/{run_id}?user=', desc: '每 1～2 秒查询一次。state 为 succeeded 时读取 answer；failed、timed_out、cancelled、interrupted 表示任务已结束。', code: `curl '${endpoint}/runs/RUN_ID?user=USER_ID' \\\n  -H 'Authorization: Bearer YOUR_TEAM_API_KEY'` },
    { title: '3. 取消任务', method: 'POST', path: '/runs/{run_id}/cancel', desc: '查询和取消要用提交时相同的 Key 和 user。不同用户或不同 Key 不能读取彼此的任务。', code: `curl -X POST '${endpoint}/runs/RUN_ID/cancel' \\\n  -H 'Authorization: Bearer YOUR_TEAM_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"user":"USER_ID"}'` },
  ]
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()} size="xl" title="API 参考" description="通过后端服务调用当前团队。把示例里的 Key、用户编号和任务 ID 换成实际值。">
      <div className="space-y-5">
        {examples.map(e => (
          <section key={e.title}>
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-semibold">{e.title}</p>
              <Badge tone="cyan" className="font-mono">{e.method}</Badge>
              <code className="font-mono text-[12px] text-ink-3">/v1/agent-teams/{'{id}'}{e.path}</code>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">{e.desc}</p>
            <div className="relative mt-2">
              <pre className="overflow-x-auto rounded-2xl border border-line bg-hover p-4 font-mono text-[12px] leading-6 text-ink-2">{e.code}</pre>
              <div className="absolute top-2 right-2 w-10"><CopyField value={e.code} className="h-8 border-0 bg-transparent px-0 [&>span]:hidden" /></div>
            </div>
          </section>
        ))}
        <div className="flex gap-2.5 rounded-2xl bg-cyan-soft p-4 text-[12.5px] leading-relaxed text-ink-2">
          <RiInformationLine className="mt-0.5 size-4 shrink-0 text-cyan" />
          <span>默认使用最新发布版本，草稿修改不影响正式调用。任务结果会返回实际使用的版本。失败不会自动重复调用 Agent。</span>
        </div>
      </div>
    </Dialog>
  )
}

function ApiKeys({ open, onClose, teamId, keys, loading, error, onRefresh }: { open: boolean, onClose: () => void, teamId: string, keys: TeamKey[], loading: boolean, error: Error | null, onRefresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [revoking, setRevoking] = useState<TeamKey | null>(null)
  const toast = useToast()
  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await createKey(teamId, '业务系统')
      setToken(r.token)
    }
    catch {
      setErr('创建请求未确认，请先刷新列表核对状态，不要重复创建。')
    }
    finally {
      setBusy(false)
      onRefresh()
    }
  }
  const revoke = async () => {
    if (!revoking)
      return
    setBusy(true)
    try {
      await revokeKey(teamId, revoking.id)
      toast(`尾号 ${revoking.suffix} 的 Key 已撤销`, 'info')
    }
    catch {
      setErr('撤销请求未确认，请刷新列表核对状态后再操作。')
    }
    finally {
      setRevoking(null)
      setBusy(false)
      onRefresh()
    }
  }
  const columns: Column<TeamKey>[] = [
    { key: 'label', title: '名称', render: k => <span className="truncate">{k.label}</span> },
    { key: 'suffix', title: '密钥', render: k => <span className="font-mono text-[12.5px]">••••••{k.suffix}</span> },
    { key: 'created', title: '创建时间', width: '170px', render: k => <span className="text-ink-2 tabular-nums">{fmtTime(k.created_at, true)}</span> },
    { key: 'op', title: '', width: '80px', align: 'right', render: k => <Button size="small" variant="ghost" tone="destructive" disabled={busy} aria-label={`撤销尾号 ${k.suffix} 的 Key`} onClick={() => setRevoking(k)}><RiDeleteBinLine className="size-3.5" />撤销</Button> },
  ]
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={o => !o && !busy && (setToken(''), onClose())}
        size="lg"
        title="API Key"
        description="Key 只用于调用当前团队。完整 Key 只在创建时显示一次，请妥善保存。"
        footer={<><Button variant="ghost" disabled={busy || loading} onClick={onRefresh}><RiRefreshLine className="size-4" />刷新列表</Button><Button variant="primary" loading={busy} disabled={loading || !!error || !!token} onClick={create}><RiAddLine className="size-4" />创建 API Key</Button></>}
      >
        <div className="space-y-3">
          {token && (
            <div className="rounded-2xl border border-volt/40 bg-volt-soft p-4">
              <p className="text-[13px] font-semibold">新 Key 已创建，请复制并安全保存</p>
              <CopyField value={token} mono className="mt-2 bg-glass-3" />
              <Button size="small" variant="ghost" className="mt-2" onClick={() => setToken('')}>我已保存，隐藏 Key</Button>
            </div>
          )}
          {err && <ErrorBar error={new Error(err)} />}
          <ErrorBar error={error} onRetry={onRefresh} />
          <DataTable columns={columns} rows={keys} rowKey={k => k.id} loading={loading} empty="暂无 API Key" />
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={o => !o && !busy && setRevoking(null)}
        danger
        loading={busy}
        title="撤销这个 API Key？"
        description={`尾号 ${revoking?.suffix ?? ''} 的 Key 会立即失效，使用它的业务系统将无法继续调用或查询团队任务。`}
        confirmText="确认撤销"
        onConfirm={revoke}
      />
    </>
  )
}

export function TeamAccess({ team }: SectionProps) {
  const published = !!team.published_id
  const [dialog, setDialog] = useState<'keys' | 'ref' | null>(null)
  const keys = useQuery(() => listKeys(team.id), [team.id], { enabled: published })
  const origin = location.origin
  const webUrl = `${origin}/agent-teams/${team.id}/run?mode=published`
  const endpoint = `${origin}/v1/agent-teams/${team.id}`
  const versions = team.versions ?? []
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-auto px-6 pb-8">
      {!published && (
        <div role="status" className="flex items-center gap-2.5 rounded-2xl border border-amber/40 bg-amber-soft px-4 py-3 text-[13px] text-amber">
          <RiInformationLine className="size-4 shrink-0" />请先发布团队，再启用 Web 运行、创建 API Key 或绑定消息渠道。
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <AccessCard icon={RiWindowLine} title="Web 应用" published={published} label="Web 应用 URL" url={webUrl}>
          <Button variant="secondary" disabled={!published} onClick={() => window.open(webUrl, '_blank', 'noopener,noreferrer')}><RiExternalLinkLine className="size-4" />启动</Button>
          <span className="text-[12px] text-ink-3">仅工作空间成员可访问</span>
        </AccessCard>
        <AccessCard icon={RiCodeSSlashLine} title="后端服务 API" published={published} label="服务 API 端点" url={endpoint}>
          <Button variant="secondary" disabled={!published} onClick={() => setDialog('keys')}>
            <RiKey2Line className="size-4" />API Key
            <span className="rounded-full bg-press px-1.5 text-[11.5px] tabular-nums">{!published ? 0 : keys.loading ? '…' : keys.error ? '—' : keys.data?.keys.length ?? 0}</span>
          </Button>
          <Button variant="ghost" onClick={() => setDialog('ref')}><RiBookOpenLine className="size-4" />API 参考</Button>
        </AccessCard>
      </div>

      <TeamChannels team={team} />

      <section>
        <p className="text-[15px] font-semibold">已发布版本</p>
        <p className="mt-1 mb-3 text-[12.5px] text-ink-3">API 可通过 snapshot_id 指定版本；Web 入口和消息渠道使用最新发布版本。</p>
        <DataTable
          rows={versions}
          rowKey={v => v.id}
          empty="暂无已发布版本"
          columns={[
            { key: 'v', title: '版本', width: '80px', render: v => <span className="font-semibold">v{v.version}</span> },
            { key: 't', title: '发布时间', width: '180px', render: v => <span className="text-ink-2 tabular-nums">{fmtTime(v.created_at, true)}</span> },
            { key: 'id', title: '快照 ID', render: v => <CopyField value={v.id} mono className="h-8 max-w-[360px]" /> },
            { key: 's', title: '状态', width: '100px', render: v => (v.id === team.published_id ? <Badge tone="mint">当前版本</Badge> : <span className="text-[12.5px] text-ink-3">历史版本</span>) },
          ]}
        />
      </section>

      <ApiKeys open={dialog === 'keys'} onClose={() => setDialog(null)} teamId={team.id} keys={keys.data?.keys ?? []} loading={keys.loading} error={keys.error} onRefresh={keys.reload} />
      <ApiReference open={dialog === 'ref'} onClose={() => setDialog(null)} endpoint={endpoint} />
    </div>
  )
}
