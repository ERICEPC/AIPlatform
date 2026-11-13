'use client'

import type { TeamAvatarValue } from './team-avatar'
import { Button } from '@langgenius/dify-ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@langgenius/dify-ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@langgenius/dify-ui/dropdown-menu'
import { Field, FieldLabel } from '@langgenius/dify-ui/field'
import { Input } from '@langgenius/dify-ui/input'
import { Textarea } from '@langgenius/dify-ui/textarea'
import { toast } from '@langgenius/dify-ui/toast'
import { useState } from 'react'
import { get, post } from '@/service/agent-teams'
import { TeamAvatarEditor } from './team-avatar'
import styles from './teams.module.css'

type Target = {
  id: string
  name: string
  revision: number
  avatar_url?: string
  config: { description?: string; avatar?: TeamAvatarValue | null }
}
type Operation = 'info' | 'copy' | 'delete'

export function TeamActions({ team, onChanged }: { team: Target; onChanged: () => Promise<void> }) {
  const [operation, setOperation] = useState<Operation | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState<TeamAvatarValue | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const open = (next: Operation) => {
    setName(next === 'copy' ? `${team.name.slice(0, 75)} 副本` : team.name)
    setDescription(team.config.description || '')
    setAvatar(team.config.avatar ?? null)
    setAvatarPreview(team.avatar_url)
    setError('')
    setOperation(next)
  }
  const errorMessage = async (e: unknown) => {
    if (e instanceof Response) {
      const data = await e.json().catch(() => ({}))
      return data.message || '操作未完成，请刷新核对状态。'
    }
    return e instanceof Error ? e.message : '操作未完成，请刷新核对状态。'
  }
  const submit = async () => {
    if (pending || !operation) return
    setPending(true)
    setError('')
    try {
      await post(`/agent-teams/${team.id}/${operation}`, {
        body: {
          revision: team.revision,
          name: name.trim(),
          description: description.trim(),
          ...(operation === 'info' ? { avatar } : {}),
        },
      })
      const done = operation
      setOperation(null)
      await onChanged()
      toast.success(
        done === 'copy'
          ? '已创建团队副本，请配置后单独发布。'
          : done === 'delete'
            ? '团队已删除。'
            : '团队信息已更新。',
      )
    } catch (e) {
      setError(await errorMessage(e))
    } finally {
      setPending(false)
    }
  }
  const exportDsl = async () => {
    if (pending) return
    setPending(true)
    try {
      const result = await get<{ name: string; data: string }>(`/agent-teams/${team.id}/export`)
      const url = URL.createObjectURL(
        new Blob([result.data], { type: 'application/yaml;charset=utf-8' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `${result.name.replace(/[\\/:*?"<>|]/g, '_') || 'agent-team'}.team.yml`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('已导出团队 DSL（已保存的草稿配置，包含专家引用）。')
    } catch (e) {
      toast.error(await errorMessage(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${team.name} 的更多操作`}
          className={styles.cardMenuTrigger}
          disabled={pending}
        >
          <span aria-hidden className="i-ri-more-fill size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent placement="bottom-end" sideOffset={4} className="w-40">
          <DropdownMenuItem className="gap-2" onClick={() => open('info')}>
            <span aria-hidden className="i-ri-edit-line size-4 text-text-tertiary" />
            <span>编辑信息</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => open('copy')}>
            <span aria-hidden className="i-ri-file-copy-line size-4 text-text-tertiary" />
            <span>复制</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => void exportDsl()}>
            <span aria-hidden className="i-ri-file-download-line size-4 text-text-tertiary" />
            <span>导出 DSL</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="gap-2" onClick={() => open('delete')}>
            <span aria-hidden className="i-ri-delete-bin-line size-4" />
            <span>删除</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={operation !== null}
        onOpenChange={(value) => {
          if (!value && !pending) setOperation(null)
        }}
        disablePointerDismissal
      >
        <DialogContent className="w-130 max-w-[calc(100vw-2rem)] p-6!">
          <DialogTitle className="title-2xl-semi-bold text-text-primary">
            {operation === 'delete'
              ? `删除“${team.name}”？`
              : operation === 'copy'
                ? '复制专家团'
                : '编辑信息'}
          </DialogTitle>
          <DialogDescription className="mt-2 system-md-regular text-text-tertiary">
            {operation === 'delete'
              ? '删除后，该团队将从列表移除，API Key 失效，消息渠道停用。团队中的专家 Agent 不会被删除。此操作无法从页面撤销。'
              : operation === 'copy'
                ? '复制已保存的团队配置，生成未发布的新草稿。API Key、渠道绑定和运行记录不会复制。'
                : '修改团队的名称和简介。协作目标、专家分工及已发布版本保持原有设置。'}
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            className="mt-5 space-y-5"
          >
            {operation === 'info' && (
              <TeamAvatarEditor
                value={avatar}
                url={avatarPreview}
                disabled={pending}
                onChange={(value, url) => {
                  setAvatar(value)
                  setAvatarPreview(url)
                }}
              />
            )}
            {operation !== 'delete' && (
              <Field name="name">
                <FieldLabel>团队名称</FieldLabel>
                <Input
                  value={name}
                  onValueChange={setName}
                  maxLength={80}
                  required
                  autoComplete="off"
                />
              </Field>
            )}
            {operation === 'info' && (
              <Field name="description">
                <FieldLabel>团队简介（选填）</FieldLabel>
                <Textarea
                  className="min-h-24"
                  value={description}
                  onValueChange={setDescription}
                  maxLength={400}
                  placeholder="简要介绍这个专家团的用途"
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="system-sm-regular text-text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" disabled={pending} onClick={() => setOperation(null)}>
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                tone={operation === 'delete' ? 'destructive' : undefined}
                loading={pending}
                disabled={operation !== 'delete' && !name.trim()}
              >
                {operation === 'delete' ? '确认删除' : operation === 'copy' ? '创建副本' : '保存'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
