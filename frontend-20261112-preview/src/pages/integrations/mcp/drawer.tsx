import { ResourceVisibility } from '@/components/resource-visibility'
/* MCP 服务详情抽屉：授权、获取 / 更新工具、连接设置、编辑与移除 */
import type { ToolAction, ToolCollection } from '@/api/integrations'
import { RiArrowDownSLine, RiDeleteBinLine, RiEditLine, RiLockUnlockLine, RiRefreshLine, RiShieldCheckLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, useEffect } from 'react'
import { authorizeMcp, deleteMcp, fetchMcpTools, listMcp, refreshMcpTools, tr } from '@/api/integrations'
import { Button } from '@/components/ui/button'
import { CopyField } from '@/components/ui/data'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { Menu } from '@/components/ui/menu'
import { cn } from '@/lib/cn'
import { useToast } from '@/components/ui/toast'
import { errMsg, fmtTime, GroupTitle, PluginTile } from '../kit'
import { OAuthWaitDialog } from '../oauth'
import { commandLine, sourceLabel, transportLabel, transportOf } from './shared'

/** 工具列表（可展开看参数） */
export function ActionList({ tools, empty = '没有工具' }: { tools: ToolAction[], empty?: string }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!tools.length)
    return <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">{empty}</p>
  return (
    <div className="space-y-1.5">
      {tools.map(t => (
        <div key={t.name} className="rounded-2xl border border-line">
          <button type="button" onClick={() => setOpen(o => (o === t.name ? null : t.name))} className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">{tr(t.label)}<span className="ml-2 font-mono text-[11.5px] font-normal text-ink-3">{t.name}</span></p>
              <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{tr(t.description)}</p>
            </div>
            <RiArrowDownSLine className={cn('mt-0.5 size-4 shrink-0 text-ink-3 transition-transform', open === t.name && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {open === t.name && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="space-y-2 border-t border-line px-4 py-3">
                  <p className="text-[12px] text-ink-3">参数</p>
                  {t.parameters.length === 0 && <p className="text-[12.5px] text-ink-3">无参数</p>}
                  {t.parameters.map(p => (
                    <div key={p.name} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className="font-mono text-ink">{p.name}</span>
                      <span className="text-ink-3">{p.type}</span>
                      {p.required && <span className="text-rose">必填</span>}
                      <span className="min-w-0 flex-1 truncate text-ink-2">{tr(p.human_description) || tr(p.label)}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

export function McpDrawer({ mcp, onClose, onEdit, onChanged }: { mcp?: ToolCollection, onClose: () => void, onEdit: (m: ToolCollection) => void, onChanged: () => void }) {
  const [access, setAccess] = useState<{can_manage:boolean}>({can_manage:false})
  useEffect(() => setAccess({can_manage:false}), [mcp?.id])
  const toast = useToast()
  const [busy, setBusy] = useState<'auth' | 'fetch' | 'update' | 'delete' | null>(null)
  const [confirm, setConfirm] = useState<'update' | 'delete' | null>(null)
  const [oauth, setOauth] = useState<string | null>(null)

  const run = async (key: 'auth' | 'fetch' | 'update' | 'delete', fn: () => Promise<unknown>, text: string) => {
    setBusy(key)
    try {
      await fn()
      toast(text)
      onChanged()
    }
    catch (e) {
      toast(errMsg(e), 'info')
    }
    finally {
      setBusy(null)
      setConfirm(null)
    }
  }
  const auth = async () => {
    if (!mcp)
      return
    setBusy('auth')
    try {
      const r = await authorizeMcp({ provider_id: mcp.id })
      if (r.authorization_url) {
        setOauth(r.authorization_url)
      }
      else {
        await fetchMcpTools(mcp.id)
        toast('授权成功，已获取工具')
        onChanged()
      }
    }
    catch (e) {
      toast(errMsg(e), 'info')
    }
    finally {
      setBusy(null)
    }
  }

  const stdio = mcp && transportOf(mcp) === 'stdio'
  const rows: [string, string][] = []
  if (mcp) {
    rows.push(['连接方式', transportLabel[transportOf(mcp)]], ['请求超时', `${mcp.timeout ?? 30} 秒`])
    if (stdio)
      rows.push(['环境变量', `${Object.keys(mcp.masked_env ?? {}).length} 个`])
    else
      rows.push(['SSE 读取超时', `${mcp.sse_read_timeout ?? 300} 秒`], ['请求头', `${Object.keys(mcp.masked_headers ?? {}).length} 个`], ['客户端注册', mcp.is_dynamic_registration ? '动态注册' : '手动配置'])
    rows.push(
      ['转发用户身份', mcp.identity_mode === 'idp_token' ? '开启' : '关闭'],
      ['来源', mcp.imported_from ? `从 ${sourceLabel[mcp.imported_from]} 导入` : '手动添加'],
      ['最近更新', fmtTime(mcp.updated_at)],
    )
  }

  return (
    <Drawer
      open={!!mcp}
      onClose={onClose}
      title={mcp && (
        <div className="flex items-start gap-3">
          <PluginTile icon={mcp.icon} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-semibold tracking-[-0.01em]">{mcp.name}</p>
            <p className="mt-0.5 font-mono text-[12px] text-ink-3">{mcp.server_identifier}</p>
          </div>
          {access.can_manage && <Menu items={[{ label: '编辑', icon: RiEditLine, onSelect: () => onEdit(mcp) }, 'separator', { label: '移除', icon: RiDeleteBinLine, danger: true, onSelect: () => setConfirm('delete') }]} />}
        </div>
      )}
    >
      {mcp && (
        <div className="space-y-5 pt-2">
          <ResourceVisibility kind="mcp" id={mcp.id} onLoaded={setAccess} />
          <div className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3', mcp.is_team_authorization ? 'border-mint/30 bg-mint-soft' : 'border-amber/40 bg-amber-soft')}>
            {mcp.is_team_authorization ? <RiShieldCheckLine className="size-5 text-mint" /> : <RiLockUnlockLine className="size-5 text-amber" />}
            <div className="flex-1">
              <p className="text-[13.5px] font-medium">{mcp.is_team_authorization ? '已授权' : '尚未授权'}</p>
              <p className="text-[12px] text-ink-3">{mcp.is_team_authorization ? '凭据失效或更换账号时可以重新授权。' : '完成授权后才能获取和调用工具。'}</p>
            </div>
            <Button disabled={!access.can_manage} size="small" variant={mcp.is_team_authorization ? 'secondary' : 'primary'} loading={busy === 'auth'} onClick={auth}>{mcp.is_team_authorization ? '重新授权' : '授权'}</Button>
          </div>

          <div>
            <GroupTitle
              aside={access.can_manage && mcp.is_team_authorization && (mcp.tools.length
                ? <Button size="small" variant="ghost" loading={busy === 'update'} onClick={() => setConfirm('update')}><RiRefreshLine className="size-3.5" />更新工具</Button>
                : <Button size="small" variant="ghost-accent" loading={busy === 'fetch'} onClick={() => run('fetch', () => fetchMcpTools(mcp.id), '已获取工具')}>获取工具</Button>)}
            >
              工具 {mcp.tools.length > 0 && <span className="ml-1 font-normal text-ink-3">{mcp.tools.length}</span>}
            </GroupTitle>
            <ActionList tools={mcp.tools} empty={mcp.is_team_authorization ? '还没有获取工具，点击「获取工具」从服务端拉取。' : '授权后可获取工具。'} />
          </div>

          <div>
            <GroupTitle>连接设置</GroupTitle>
            <div className="space-y-3">
              <CopyField value={stdio ? commandLine(mcp) : mcp.server_url ?? ''} mono />
              <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
                {rows.map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-hover px-3 py-2"><dt className="text-ink-3">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm === 'update'}
        onOpenChange={o => !o && setConfirm(null)}
        title="从服务端更新工具？"
        description="会用服务端最新的工具列表覆盖当前列表。已被删除的工具，使用它的 Agent会调用失败。"
        confirmText="更新"
        loading={busy === 'update'}
        onConfirm={() => mcp && run('update', () => refreshMcpTools(mcp.id), '工具已更新')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={o => !o && setConfirm(null)}
        danger
        title={`移除 ${mcp?.name}？`}
        description="使用它的工具的 Agent会无法调用。"
        confirmText="移除"
        loading={busy === 'delete'}
        onConfirm={() => mcp && run('delete', async () => { await deleteMcp(mcp.id); onClose() }, '已移除 MCP 服务')}
      />
      <OAuthWaitDialog
        open={!!oauth}
        appName={mcp?.name ?? ''}
        icon={mcp?.icon ?? ''}
        url={oauth}
        check={async () => !!(await listMcp()).find(x => x.id === mcp?.id)?.is_team_authorization}
        onClose={() => setOauth(null)}
        onDone={() => { setOauth(null); onChanged() }}
      />
    </Drawer>
  )
}
