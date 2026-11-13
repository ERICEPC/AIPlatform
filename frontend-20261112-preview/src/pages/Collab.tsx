import type { CollabArtifact, CollabGroup, CollabGroupId, CollabMember } from '@/api/collab'
import { RiAddLine, RiDeleteBin6Line, RiFolder3Line, RiGroupLine, RiLayoutLeftLine, RiLayoutRightLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { dissolveGroup, listArtifacts, listGroups, listMessages, sendMessage, listTasks, taskAction } from '@/api/collab'
import { useMutation, useQuery } from '@/api/hooks'
import { Page, Toolbar } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { Tip } from '@/components/ui/tooltip'
import { me } from '@/data'
import { ease } from '@/lib/motion'
import { ArtifactPreview, ArtifactsPanel } from './collab/artifacts-panel'
import { GroupList } from './collab/group-list'
import { Composer, MessageStream } from './collab/messages'
import { NetworkPanel } from './collab/network-panel'
import { AddMembersDialog, NewGroupDialog, DirectDialog } from './collab/new-group-dialog'
import { GroupAvatar, groupStatus, MembersContext, memberSummary, store } from './collab/shared'

export type { CollabGroupId }

const EMPTY: CollabMember[] = []
const K_COLLAPSED = 'raccoonx.collab.listCollapsed'
const K_GROUP = 'raccoonx.collab.group'
type Side = 'network' | 'artifacts' | null

/*
  智能体协同：左「群聊」列（可收起）· 中间群消息 · 右栏「协同网络」或「协作产出物」（二选一，可收起）。
  当前群存在组件状态 + localStorage；以后接 #collab/<groupId> 时只需把初始值换成路由参数。
*/
export default function Collab({ theme, initialGroupId }: { theme: 'dark' | 'light'; initialGroupId?: string }) {
  const toast = useToast()
  const [collapsed, setCollapsed] = useState(() => store.get(K_COLLAPSED) === '1')
  const [groupId, setGroupId] = useState<CollabGroupId | null>(() => initialGroupId || store.get(K_GROUP))
  const [side, setSide] = useState<Side>('network')
  const [selected, setSelected] = useState(me.id)
  const [creating, setCreating] = useState(false)
  const [direct, setDirect] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [highlight, setHighlight] = useState<string | null>(null)
  const [preview, setPreview] = useState<CollabArtifact | null>(null)
  const [dissolveConfirm, setDissolveConfirm] = useState(false)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  const groups = useQuery(() => listGroups().then(r => r.data), [], { pollMs: 5000 })
  const group: CollabGroup | undefined = groups.data?.find(g => g.id === groupId) ?? groups.data?.[0]
  const gid = group?.id
  const messages = useQuery(() => listMessages(gid!).then(r => r.data), [gid], { enabled: !!gid, pollMs: 3000 })
  const artifacts = useQuery(() => listArtifacts(gid!).then(r => r.data), [gid], { enabled: !!gid, pollMs: 3000 })
  const tasks = useQuery(() => listTasks(gid!).then(r => ({ groupId: gid, items: r.data })), [gid], { enabled: !!gid, pollMs: 2500 })
  const taskItems = tasks.data && tasks.data.groupId === gid ? tasks.data.items : undefined
  const runningTask = taskItems?.find(task => task.state === 'running')
  const executingMember = runningTask?.steps[runningTask.cursor]
  const action = useMutation(taskAction)
  const dissolve = useMutation(dissolveGroup)
  const send = useMutation(sendMessage)
  const requestKey = useRef<string | null>(null)

  useEffect(() => store.set(K_COLLAPSED, collapsed ? '1' : '0'), [collapsed])
  useEffect(() => {
    if (gid)
      store.set(K_GROUP, gid)
  }, [gid])

  const select = (id: CollabGroupId) => {
    if (id === gid)
      return
    setGroupId(id)
    setDraft('')
    requestKey.current = null
    setHighlight(null)
    setSelected(me.id)
    messages.setData(undefined)
    artifacts.setData(undefined)
    // 打开即已读
    groups.setData(list => list?.map(g => g.id === id ? { ...g, unread: 0 } : g))
  }

  const onCreated = (g: CollabGroup) => {
    groups.setData(list => [g, ...(list ?? [])])
    select(g.id)
    setCollapsed(false)
    toast(`已创建「${g.name}」`)
  }

  const onMembersAdded = (g: CollabGroup) => {
    groups.setData(list => list?.map(x => (x.id === g.id ? g : x)))
    toast(`成员已更新，当前 ${g.members.length} 位`)
  }

  const onDissolve = async () => {
    if (!gid || dissolve.pending)
      return
    try {
      await dissolve.run(gid)
      const remaining = (groups.data ?? []).filter(g => g.id !== gid)
      groups.setData(remaining)
      setGroupId(remaining[0]?.id ?? null)
      store.set(K_GROUP, remaining[0]?.id ?? '')
      setSide('network')
      setDissolveConfirm(false)
      toast(group?.kind === 'direct' ? '单聊已删除' : '群聊已解散')
    }
    catch (e) {
      toast(`解散失败：${(e as Error).message}`, 'info')
    }
  }

  const submit = async () => {
    const text = draft.trim()
    if (!gid || !text || send.pending)
      return
    if (group?.kind !== 'direct' && !group?.router_id) { setAdding(true); toast('请先选择团长（Router）', 'info'); return }
    try {
      requestKey.current ??= crypto.randomUUID()
      const m = await send.run(gid, { content: text, request_key: requestKey.current })
      requestKey.current = null
      tasks.refresh()
      setDraft('')
      messages.setData(list => [...(list ?? []), m])
      groups.refresh()
      // 被 @ 的成员（助手 / Agent）稍后回复
      if (text.includes('@')) {
        later(() => {
          messages.refresh()
          groups.refresh()
        }, 1500)
      }
    }
    catch (e) {
      toast(`发送失败：${(e as Error).message}`, 'info')
    }
  }

  const jumpTo = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (!el) {
      toast('来源消息已不在当前群里', 'info')
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlight(messageId)
    later(() => setHighlight(h => (h === messageId ? null : h)), 1800)
  }

  const openArtifact = (id: string) => {
    const a = artifacts.data?.find(x => x.id === id)
    setSide('artifacts')
    if (a)
      setPreview(a)
  }

  const artifactCount = artifacts.data?.length ?? 0

  return (
    <MembersContext value={group?.members ?? EMPTY}>
      <Page className="flex-row">
        <GroupList
          collapsed={collapsed}
          groups={groups.data}
          loading={groups.loading}
          error={groups.error}
          onRetry={groups.reload}
          activeId={gid ?? null}
          onSelect={select}
          onDirect={() => setDirect(true)}
          onCreate={() => setCreating(true)}
          onCollapse={() => setCollapsed(true)}
        />

        <div className="relative flex min-w-0 flex-1 flex-col">
          <Toolbar className="relative shrink-0">
            <Tip label={collapsed ? '展开群聊列表' : '收起群聊列表'}>
              <Button variant={collapsed ? 'ghost' : 'secondary'} size="icon" aria-label={collapsed ? '展开群聊列表' : '收起群聊列表'} aria-pressed={!collapsed} onClick={() => setCollapsed(c => !c)}>
                <RiLayoutLeftLine className="size-[18px]" />
              </Button>
            </Tip>
            <AnimatePresence initial={false}>
              {collapsed && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}>
                  <Tip label="新建群聊">
                    <Button variant="ghost-accent" size="icon" aria-label="新建群聊" onClick={() => setCreating(true)}><RiAddLine className="size-[18px]" /></Button>
                  </Tip>
                </motion.span>
              )}
            </AnimatePresence>

            {group
              ? (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={group.id} className="flex min-w-0 items-center gap-3" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                      <GroupAvatar icon={group.icon} size={36} glow />
                      <div className="min-w-0 leading-tight">
                        <p className="truncate text-[15px] font-semibold">{group.name}</p>
                        <p className="truncate text-[12px] text-ink-3">{group.kind === 'direct' ? '单聊' : memberSummary(group.members)}，{groupStatus(group)}</p>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )
              : groups.loading && <div className="space-y-1.5"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-48" /></div>}

            <div className="ml-auto flex items-center gap-1">
              <Tip label="管理群成员">
                <Button variant="ghost" size="small" aria-label="群成员" disabled={!group || group.kind === 'direct'} onClick={() => setAdding(true)}>
                  <RiGroupLine className="size-4" />成员<span className="text-ink-3 tabular-nums">{group?.members.length ?? ''}</span>
                </Button>
              </Tip>
              <Tip label={side === 'artifacts' ? '收起协作产出物' : `查看本群的协作产出物（${artifactCount}）`}>
                <Button variant={side === 'artifacts' ? 'secondary' : 'ghost'} size="icon" className="relative overflow-visible" aria-label="协作产出物" aria-pressed={side === 'artifacts'} disabled={!group} onClick={() => setSide(s => (s === 'artifacts' ? null : 'artifacts'))}>
                  <RiFolder3Line className="size-[18px]" />
                  {artifactCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-volt px-1 text-[9.5px] leading-none font-bold text-volt-ink">{artifactCount}</span>
                  )}
                </Button>
              </Tip>
              <Tip label={side === 'network' ? '收起协同网络' : '展开协同网络'}>
                <Button variant={side === 'network' ? 'secondary' : 'ghost'} size="icon" aria-label="协同网络" aria-pressed={side === 'network'} disabled={!group} onClick={() => setSide(s => (s === 'network' ? null : 'network'))}>
                  <RiLayoutRightLine className="size-[18px]" />
                </Button>
              </Tip>
              <Tip label={group?.kind === 'direct' ? '删除单聊' : '解散群聊'}>
                <Button variant="ghost" size="icon" aria-label={group?.kind === 'direct' ? '删除单聊' : '解散群聊'} tone="destructive" disabled={!group || dissolve.pending} onClick={() => setDissolveConfirm(true)}>
                  <RiDeleteBin6Line className="size-[17px]" />
                </Button>
              </Tip>
            </div>
          </Toolbar>

          {group && <div className="border-b border-line px-6 py-3 text-xs text-ink-3">{group.kind === 'direct' ? '与此智能体单独对话，直接发送消息即可。历史上下文与文件保留在当前会话。' : `团长（Router）：${group.members.find(m => m.id === group.router_id)?.name ?? '未选择，请在成员管理中设置'}。根据目标规划任务、按能力调度成员，审查成果并汇总交付。@ 指定执行成员，团长按任务依赖安排；需要换人时请你确认。`}</div>}
          {tasks.error && <div role="alert" className="px-6 py-2 text-sm text-rose">任务状态加载失败：{tasks.error.message}</div>}
          {!!taskItems?.filter(t => ['queued', 'running'].includes(t.state)).length && <div className="max-h-48 overflow-auto border-b border-line px-6 py-3 space-y-2">
            {taskItems.filter(t => ['queued', 'running'].includes(t.state)).slice(0, 5).map(t => <div key={t.id} className="flex items-center gap-3 rounded-xl bg-hover px-3 py-2 text-xs">
              <span className="min-w-0 flex-1"><span className="block truncate text-ink">{t.prompt}</span><span>{{ queued: '排队中', running: '执行中', ready: '结果已生成', completed: '执行完成', failed: '执行失败', needs_input: '需核查', cancelled: '已取消' }[t.state]} · {t.routing ? `${t.routing.phase === 'planning' ? '团长规划 / 审查' : '执行子任务'} · 已调度 ${t.routing.rounds} 次` : `${Math.min(t.cursor + 1, t.steps.length)}/${t.steps.length}`} · {group?.members.find(m => m.id === t.steps[t.cursor])?.name ?? ''}{t.error ? ` · ${t.error}` : ''}</span></span>
              {!['completed', 'cancelled'].includes(t.state) && <Button size="small" variant="secondary" disabled={action.pending} onClick={async () => { try { await action.run(t.id, 'cancel'); tasks.refresh(); groups.refresh() } catch (e) { toast((e as Error).message, 'info') } }}>取消任务</Button>}
            </div>)}
          </div>}
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto flex max-w-[760px] flex-col px-8 pt-6 pb-48">
              {group && (
                <MessageStream
                  group={group}
                  messages={messages.data}
                  artifacts={artifacts.data}
                  error={messages.error}
                  onRetry={messages.reload}
                  highlight={highlight}
                  onOpenArtifact={openArtifact}
                  onMention={id => setDraft(d => `${d}@${group.members.find(m => m.id === id)?.name ?? ''} `)}
                />
              )}
            </div>
          </div>

          {group && <Composer group={group} value={draft} onChange={text => { setDraft(text); requestKey.current = null }} onSend={submit} sending={send.pending} />}
        </div>

        {/* 右栏：协同网络 / 协作产出物，从右进、从右出 */}
        <AnimatePresence initial={false}>
          {group && side && (
            <motion.aside
              key="side"
              initial={{ x: 40, opacity: 0, width: 0 }}
              animate={{ x: 0, opacity: 1, width: 372 }}
              exit={{ x: 40, opacity: 0, width: 0 }}
              transition={{ duration: 0.45, ease: ease.sheet }}
              className="rx-collab-side shrink-0 overflow-hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={side}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.2 }}
                  className="flex h-full w-[372px] flex-col gap-3 p-3 pl-0"
                >
                  {side === 'network'
                    ? <NetworkPanel theme={theme} group={group} selected={executingMember ?? (group.members.some(m => m.id === selected) ? selected : group.router_id ?? group.members[0]?.id ?? selected)} executing={executingMember} onSelect={setSelected} onAddMembers={() => setAdding(true)} />
                    : (
                        <ArtifactsPanel
                          artifacts={artifacts.data}
                          error={artifacts.error}
                          onRetry={artifacts.reload}
                          onClose={() => setSide(null)}
                          onJump={jumpTo}
                          onPreview={setPreview}
                        />
                      )}
                </motion.div>
              </AnimatePresence>
            </motion.aside>
          )}
        </AnimatePresence>

        <ArtifactPreview artifact={preview} onClose={() => setPreview(null)} onJump={jumpTo} />
        <DirectDialog open={direct} onOpenChange={setDirect} onCreated={onCreated} />
        <NewGroupDialog open={creating} onOpenChange={setCreating} onCreated={onCreated} />
        {group && <AddMembersDialog group={group} open={adding} onOpenChange={setAdding} onAdded={onMembersAdded} />}
        <ConfirmDialog open={dissolveConfirm} onOpenChange={setDissolveConfirm} title={group?.kind === 'direct' ? '删除单聊' : '解散群聊'} description={`确定移除「${group?.name ?? '当前群聊'}」？群消息、任务和产出记录会一并移除。`} confirmText="确认移除" danger loading={dissolve.pending} onConfirm={() => void onDissolve()} />
      </Page>
    </MembersContext>
  )
}
