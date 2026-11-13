'use client'

import type { ReactNode } from 'react'
import type { TeamKey } from './access-keys'
import { Button } from '@langgenius/dify-ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@langgenius/dify-ui/dialog'
import { IconButton } from '@langgenius/dify-ui/icon-button'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { useState, useSyncExternalStore } from 'react'
import { CopyFeedback } from '@/app/components/base/copy-feedback'
import { currentWorkspaceIdAtom } from '@/context/workspace-state'
import useTimestamp from '@/hooks/use-timestamp'
import { get } from '@/service/agent-teams'
import { TeamAccessChannels } from './access-channels'
import { TeamApiKeys } from './access-keys'
import { teamRunUrl } from './runner-links'

type AccessTeam = {
  id: string
  published_id: string | null
  versions?: { id: string; version: number; created_at: number }[]
}
const subscribeOrigin = () => () => {}
const readOrigin = () => window.location.origin
const serverOrigin = () => ''

function AccessCard({
  title,
  icon,
  published,
  label,
  url,
  children,
}: {
  title: string
  icon: string
  published: boolean
  label: string
  url: string
  children: ReactNode
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-components-panel-border bg-components-panel-bg shadow-xs">
      <div className="flex-1 px-4 pt-4 pb-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-state-accent-solid text-text-primary-on-surface">
              <span aria-hidden className={`${icon} size-4`} />
            </span>
            <h3 className="truncate system-md-semibold text-text-secondary">{title}</h3>
          </div>
          <span
            className={`inline-flex items-center gap-1 system-xs-medium ${published ? 'text-text-success' : 'text-text-tertiary'}`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${published ? 'bg-text-success' : 'bg-text-quaternary'}`}
            />
            {published ? '可用' : '待发布'}
          </span>
        </div>
        <div className="mt-3 system-xs-medium text-text-tertiary">{label}</div>
        <div className="mt-1 flex h-8 min-w-0 items-center gap-2 rounded-lg bg-components-input-bg-normal px-2">
          <span
            className="min-w-0 flex-1 truncate system-sm-regular text-text-secondary"
            title={url}
            translate="no"
          >
            {url || '加载中…'}
          </span>
          {url && <CopyFeedback content={url} />}
        </div>
      </div>
      <div className="flex min-h-16 flex-wrap items-center gap-2 border-t border-divider-subtle px-4 py-4">
        {children}
      </div>
    </article>
  )
}

function ApiReference({ endpoint, onClose }: { endpoint: string; onClose: () => void }) {
  const examples = [
    {
      title: '1. 提交任务',
      description:
        '返回 HTTP 202 和任务 ID。每次新任务使用一个新的业务请求编号；同一任务重试时沿用原编号。',
      code: `curl -X POST '${endpoint}/runs' \\\n  -H 'Authorization: Bearer YOUR_TEAM_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: UNIQUE_REQUEST_ID' \\\n  -d '{"user":"USER_ID","query":"请分析客户情况并给出下一步建议"}'`,
    },
    {
      title: '2. 查询结果',
      description:
        '每 1～2 秒查询一次。仅在 state 为 succeeded 时读取 answer；failed、timed_out、cancelled、interrupted 表示任务已结束。',
      code: `curl '${endpoint}/runs/RUN_ID?user=USER_ID' \\\n  -H 'Authorization: Bearer YOUR_TEAM_API_KEY'`,
    },
    {
      title: '3. 取消任务',
      description:
        '查询和取消需使用提交时相同的 Key 和 user。不同用户或不同 Key 不能读取彼此的任务。',
      code: `curl -X POST '${endpoint}/runs/RUN_ID/cancel' \\\n  -H 'Authorization: Bearer YOUR_TEAM_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"user":"USER_ID"}'`,
    },
  ]
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85dvh] w-full max-w-200! flex-col overflow-hidden px-8">
        <IconButton
          size="lg"
          className="absolute top-6 right-6"
          aria-label="关闭 API Reference"
          onClick={onClose}
        >
          <span aria-hidden className="i-ri-close-line size-4" />
        </IconButton>
        <DialogTitle className="pr-10 title-2xl-semi-bold text-text-primary">
          API Reference
        </DialogTitle>
        <DialogDescription className="mt-2 system-sm-regular text-text-tertiary">
          通过后端服务调用当前团队。将示例中的 Key、用户编号和任务 ID 替换为你的实际值。
        </DialogDescription>
        <div className="mt-5 min-h-0 space-y-5 overflow-y-auto">
          {examples.map((example) => (
            <section key={example.title}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="system-md-semibold text-text-primary">{example.title}</h3>
                <CopyFeedback content={example.code} />
              </div>
              <p className="mt-1 system-sm-regular text-text-tertiary">{example.description}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-components-input-bg-normal p-4 text-xs leading-6 text-text-secondary">
                <code>{example.code}</code>
              </pre>
            </section>
          ))}
          <div className="rounded-lg bg-background-section-burn p-4 system-sm-regular text-text-secondary">
            <h3 className="system-sm-semibold">发布版本</h3>
            <p className="mt-1">
              默认使用最新发布版本，草稿修改不会影响正式调用。提交时可增加 snapshot_id
              固定指定版本；任务结果会返回实际使用的版本。失败不会自动重复执行专家操作。
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TeamAccess({ team }: { team: AccessTeam }) {
  const origin = useSyncExternalStore(subscribeOrigin, readOrigin, serverOrigin)
  const workspaceId = useAtomValue(currentWorkspaceIdAtom)
  const { formatTime } = useTimestamp()
  const [dialog, setDialog] = useState<'keys' | 'reference' | null>(null)
  const published = !!team.published_id
  const keysQuery = useQuery({
    queryKey: ['agent-team-keys', workspaceId, team.id],
    queryFn: () => get<{ keys: TeamKey[] }>(`/agent-teams/${team.id}/keys`),
    enabled: published,
    staleTime: 15000,
    retry: 1,
  })
  const endpoint = origin ? `${origin}/v1/agent-teams/${team.id}` : ''
  const webUrl = origin ? `${origin}${teamRunUrl(team.id, 'published', workspaceId)}` : ''
  const keys = keysQuery.data?.keys ?? []
  return (
    <div data-team-access className="space-y-6">
      <header>
        <h2 className="system-xl-semibold text-text-primary">访问点</h2>
        <p className="mt-1 system-xs-regular text-text-tertiary">
          此团队的所有访问方式。正式调用使用已发布版本。
        </p>
      </header>
      {!published && (
        <div
          role="status"
          className="rounded-lg border border-divider-subtle bg-background-section-burn px-4 py-3 system-sm-regular text-text-secondary"
        >
          请先发布团队，再启用 Web 运行、创建 API Key 或绑定消息渠道。
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <AccessCard
          title="Web 应用"
          icon="i-ri-window-line"
          published={published}
          label="Web 应用 URL"
          url={webUrl}
        >
          <Button
            variant="secondary"
            size="medium"
            disabled={!published}
            onClick={() =>
              window.open(
                teamRunUrl(team.id, 'published', workspaceId),
                '_blank',
                'noopener,noreferrer',
              )
            }
          >
            <span aria-hidden className="i-ri-external-link-line size-4" />
            启动
          </Button>
          <span className="system-xs-regular text-text-tertiary">仅工作空间成员可访问</span>
        </AccessCard>
        <AccessCard
          title="后端服务 API"
          icon="i-ri-node-tree size-4"
          published={published}
          label="服务 API 端点"
          url={endpoint}
        >
          <Button
            variant="secondary"
            size="medium"
            disabled={!published}
            onClick={() => setDialog('keys')}
          >
            <span aria-hidden className="i-ri-key-2-line size-4" />
            API Key
            <span
              className="rounded bg-state-base-hover px-1.5 system-xs-medium"
              aria-label="Key 数量"
            >
              {keysQuery.isFetching ? '…' : keysQuery.isError ? '—' : keys.length}
            </span>
          </Button>
          <Button variant="secondary" size="medium" onClick={() => setDialog('reference')}>
            <span aria-hidden className="i-ri-book-open-line size-4" />
            API Reference
          </Button>
        </AccessCard>
      </div>
      <TeamAccessChannels teamId={team.id} />
      <section aria-labelledby="team-access-versions-title">
        <h3 id="team-access-versions-title" className="system-md-semibold text-text-primary">
          已发布版本
        </h3>
        <p className="mt-1 system-xs-regular text-text-tertiary">
          API 可通过 snapshot_id 指定版本；Web 入口和消息渠道使用最新发布版本。
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-160 text-left system-sm-regular text-text-secondary">
            <thead className="bg-background-section-burn system-xs-medium text-text-tertiary">
              <tr>
                <th className="rounded-l-lg px-3 py-2">版本</th>
                <th className="px-3 py-2">发布时间</th>
                <th className="px-3 py-2">快照 ID</th>
                <th className="rounded-r-lg px-3 py-2">状态</th>
              </tr>
            </thead>
            <tbody>
              {team.versions?.length ? (
                team.versions.map((version) => (
                  <tr key={version.id} className="border-b border-divider-subtle">
                    <td className="px-3 py-3">v{version.version}</td>
                    <td className="px-3 whitespace-nowrap tabular-nums">
                      {formatTime(version.created_at, 'YYYY-MM-DD HH:mm:ss')}
                    </td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs">{version.id}</code>
                        <CopyFeedback content={version.id} />
                      </div>
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      {version.id === team.published_id ? (
                        <span className="text-text-success">当前版本</span>
                      ) : (
                        '历史版本'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-text-tertiary">
                    暂无已发布版本
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {dialog === 'keys' && (
        <TeamApiKeys
          teamId={team.id}
          keys={keys}
          loading={keysQuery.isPending}
          loadError={keysQuery.isError}
          onRefresh={() => {
            void keysQuery.refetch()
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reference' && (
        <ApiReference endpoint={endpoint} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
