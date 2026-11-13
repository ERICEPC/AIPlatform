'use client'

import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogCancelButton,
  AlertDialogConfirmButton,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@langgenius/dify-ui/alert-dialog'
import { Button } from '@langgenius/dify-ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@langgenius/dify-ui/dialog'
import { IconButton } from '@langgenius/dify-ui/icon-button'
import { useState } from 'react'
import { CopyFeedback } from '@/app/components/base/copy-feedback'
import useTimestamp from '@/hooks/use-timestamp'
import { del, post } from '@/service/agent-teams'

export type TeamKey = { id: string; label: string; suffix: string; created_at: number }

export function TeamApiKeys({
  teamId,
  keys,
  loading,
  loadError,
  onRefresh,
  onClose,
}: {
  teamId: string
  keys: TeamKey[]
  loading: boolean
  loadError: boolean
  onRefresh: () => void
  onClose: () => void
}) {
  const { formatTime } = useTimestamp()
  const [busy, setBusy] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [error, setError] = useState('')
  const [revokeKey, setRevokeKey] = useState<TeamKey | null>(null)
  const create = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await post<{ token: string }>(`/agent-teams/${teamId}/keys`, {
        body: { label: '业务系统' },
      })
      setNewKey(result.token)
      onRefresh()
    } catch {
      setError('创建请求未确认，请先刷新列表核对状态，不要重复创建。')
      onRefresh()
    } finally {
      setBusy(false)
    }
  }
  const revoke = async () => {
    if (busy || !revokeKey) return
    setBusy(true)
    setError('')
    try {
      await del(`/agent-teams/${teamId}/keys/${revokeKey.id}`)
      setRevokeKey(null)
      onRefresh()
    } catch {
      setRevokeKey(null)
      setError('撤销请求未确认，请刷新列表核对状态后再操作。')
      onRefresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose()
        }}
        disablePointerDismissal
      >
        <DialogContent className="flex max-h-[85dvh] w-full max-w-200! flex-col overflow-hidden px-8">
          <IconButton
            size="lg"
            className="absolute top-6 right-6"
            aria-label="关闭 API Key"
            disabled={busy}
            onClick={onClose}
          >
            <span aria-hidden className="i-ri-close-line size-4" />
          </IconButton>
          <DialogTitle className="pr-10 title-2xl-semi-bold text-text-primary">API Key</DialogTitle>
          <DialogDescription className="mt-2 system-sm-regular text-text-tertiary">
            Key 仅用于调用当前团队。完整 Key 只在创建时显示一次，请妥善保存。
          </DialogDescription>
          {newKey && (
            <div className="mt-5 rounded-xl border border-components-panel-border bg-background-section-burn p-4">
              <h3 className="system-sm-semibold text-text-primary">
                新 Key 已创建，请复制并安全保存
              </h3>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 text-xs break-all text-text-secondary">
                  {newKey}
                </code>
                <CopyFeedback content={newKey} />
              </div>
              <Button variant="ghost" size="small" className="mt-2" onClick={() => setNewKey('')}>
                我已保存，隐藏 Key
              </Button>
            </div>
          )}
          {error && (
            <p className="mt-3 system-sm-regular text-text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="mt-5 min-h-0 overflow-auto">
            {loadError && (
              <div
                className="flex items-center gap-2 py-3 system-sm-regular text-text-destructive"
                role="alert"
              >
                Key 列表加载失败。
                <Button size="small" variant="secondary" onClick={onRefresh}>
                  刷新列表
                </Button>
              </div>
            )}
            <table className="w-full min-w-130 text-left system-sm-regular text-text-secondary">
              <thead className="bg-background-section-burn system-xs-medium text-text-tertiary">
                <tr>
                  <th className="rounded-l-lg px-3 py-2">名称</th>
                  <th className="px-3 py-2">密钥</th>
                  <th className="px-3 py-2">创建时间</th>
                  <th className="rounded-r-lg px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-text-tertiary">
                      正在加载…
                    </td>
                  </tr>
                ) : keys.length ? (
                  keys.map((key) => (
                    <tr key={key.id} className="border-b border-divider-subtle">
                      <td className="max-w-45 truncate px-3 py-3" title={key.label}>
                        {key.label}
                      </td>
                      <td className="px-3 font-mono whitespace-nowrap">••••••{key.suffix}</td>
                      <td className="px-3 whitespace-nowrap tabular-nums">
                        {formatTime(key.created_at, 'YYYY-MM-DD HH:mm:ss')}
                      </td>
                      <td className="px-3">
                        <Button
                          size="small"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`撤销尾号 ${key.suffix} 的 Key`}
                          onClick={() => setRevokeKey(key)}
                        >
                          <span aria-hidden className="i-ri-delete-bin-line size-4" />
                          撤销
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  !loadError && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-text-tertiary">
                        暂无 API Key
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              disabled={busy || loading || loadError || !!newKey}
              onClick={() => void create()}
            >
              <span aria-hidden className="i-ri-add-line size-4" />
              {busy ? '正在处理…' : '创建 API Key'}
            </Button>
            <Button variant="secondary" disabled={busy || loading} onClick={onRefresh}>
              <span aria-hidden className="i-ri-refresh-line size-4" />
              刷新列表
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!revokeKey}
        onOpenChange={(open) => {
          if (!open && !busy) setRevokeKey(null)
        }}
      >
        <AlertDialogContent>
          <div className="px-6 pt-6 pb-4">
            <AlertDialogTitle className="title-2xl-semi-bold text-text-primary">
              撤销这个 API Key？
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 system-md-regular text-text-tertiary">
              尾号 {revokeKey?.suffix} 的 Key
              会立即失效，使用它的业务系统将无法继续调用或查询团队任务。
            </AlertDialogDescription>
          </div>
          <AlertDialogActions>
            <AlertDialogCancelButton disabled={busy}>取消</AlertDialogCancelButton>
            <AlertDialogConfirmButton loading={busy} onClick={() => void revoke()}>
              确认撤销
            </AlertDialogConfirmButton>
          </AlertDialogActions>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
