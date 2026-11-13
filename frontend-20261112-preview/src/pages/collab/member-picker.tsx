import { listMembers } from '@/api/collab'
import type { AgentAppPartial } from '@/api/agents'
import { listAgents } from '@/api/agents'
import type { CollabAgentMember, CollabAssistantMember, CollabMember } from '@/api/collab'
import { RiArrowDownSLine, RiCheckLine, RiCloseLine, RiSearchLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { ErrorBar } from '@/components/ui/data'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { me } from '@/data'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { KindTag, MemberAvatar, statusLabel } from './shared'

/*
  成员选择器：新建群聊、给已有群添加成员共用。
  两个来源用分段切换：「同事的助手」（通讯录）与「Agent」（Agents 模块：企服 + 我的）；
  搜索只过滤当前来源；下方托盘展示已选成员，可逐个移除。
*/

export type PickedMembers = { assistant_ids: string[], agent_ids: string[] }
export const emptyPick = (): PickedMembers => ({ assistant_ids: [], agent_ids: [] })
export const pickCount = (p: PickedMembers) => p.assistant_ids.length + p.agent_ids.length

type Source = 'assistant' | 'agent'
/** Agent 候选项：成员信息 + 能否拉进群 */
type AgentOption = CollabAgentMember & { available: boolean, reason?: string }

export function useAgentOptions(enabled: boolean) {
  return useQuery(async () => {
    const [members, first] = await Promise.all([
      listMembers().then(r => r.data),
      listAgents({ page: 1, limit: 100, scope: 'roster' }),
    ])
    const roster: AgentOption[] = []
    const add = (items: AgentAppPartial[]) => items.forEach(a => {
      // The Agents roster is the source of truth. Only a published active
      // snapshot is callable; drafts remain visible nowhere in this picker.
      if (!a.active_config_is_published)
        return
      roster.push({
        kind: 'agent', id: a.id.startsWith('agent:') ? a.id : `agent:${a.id}`, name: a.name,
        avatar: a.icon_url ?? '/raccoon-emoji-v1/042-ai.webp',
        source: a.created_by ? 'mine' : 'enterprise',
        description: a.description || a.role || '已发布 Agent',
        status: 'idle', status_text: '已发布', available: true,
      })
    })
    add(first.data)
    for (let page = 2; first.has_more && page <= 20; page++) {
      const next = await listAgents({ page, limit: 100, scope: 'roster' })
      add(next.data)
      if (!next.has_more)
        break
    }
    const assistants = members.filter((m): m is CollabAssistantMember & { available: boolean } => m.kind === 'assistant')
    // De-duplicate by Agent id in case the compatibility endpoint also returns it.
    const seen = new Set<string>()
    return [...assistants, ...roster.filter(a => !seen.has(a.id) && seen.add(a.id))]
  }, [], { enabled })
}

export function MemberPicker({ value, onChange, existing = [], invalid, agents, single = false }: {
  value: PickedMembers
  onChange: (v: PickedMembers) => void
  /** 已在群里的成员（添加成员时显示为已勾选、不可操作） */
  existing?: CollabMember[]
  invalid?: boolean
  single?: boolean
  agents: ReturnType<typeof useAgentOptions>
}) {
  const [source, setSource] = useState<Source>('assistant')
  const [q, setQ] = useState('')
  const inGroup = useMemo(() => new Set(existing.map(m => m.id)), [existing])
  const k = q.trim().toLowerCase()

  const assistantOptions = (agents.data ?? []).filter((m): m is CollabAssistantMember & { available: boolean } => m.kind === 'assistant')
  const shownAssistants = assistantOptions.filter(a => !k || a.owner.toLowerCase().includes(k) || a.role.toLowerCase().includes(k))
  const shownAgents = (agents.data ?? []).filter((a): a is AgentOption => a.kind === 'agent').filter(a => !k || a.name.toLowerCase().includes(k) || a.description.toLowerCase().includes(k))

  const toggle = (kind: Source, id: string) => {
    const key = kind === 'assistant' ? 'assistant_ids' : 'agent_ids'
    const list = value[key]
    if (single) { onChange(list.includes(id) ? emptyPick() : { ...emptyPick(), [key]: [id] }); return }
    onChange({ ...value, [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] })
  }

  const picked: CollabMember[] = [
    ...value.assistant_ids.map(id => assistantOptions.find(a => a.id === id)).filter((x): x is CollabAssistantMember & { available: boolean } => !!x),
    ...value.agent_ids.map(id => agents.data?.find(a => a.id === id)).filter((x): x is AgentOption => !!x && x.kind === 'agent'),
  ]

  return (
    <div className={cn('overflow-hidden rounded-[20px] border', invalid ? 'border-rose' : 'border-line')}>
      <div className="flex items-center gap-2 border-b border-line p-2.5">
        <Segmented
          size="small"
          aria-label="成员来源"
          value={source}
          onValueChange={(v) => {
            setSource(v)
            setQ('')
          }}
          options={[
            { value: 'assistant', label: '同事的助手', count: assistantOptions.length },
            { value: 'agent', label: 'Agent', count: (agents.data ?? []).filter(m => m.kind === 'agent').length },
          ]}
        />
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border border-line-strong bg-hover px-3 transition-[border-color,box-shadow] focus-within:border-volt focus-within:shadow-glow-volt">
          <RiSearchLine className="size-3.5 shrink-0 text-ink-3" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
            placeholder={source === 'assistant' ? '搜索姓名或岗位' : '搜索 Agent 名称或简介'}
            aria-label="搜索成员"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-3"
          />
        </label>
      </div>

      <div className="h-[268px] overflow-auto p-2">
        {source === 'assistant' && agents.error && <ErrorBar error={agents.error} onRetry={agents.reload} />}
        {source === 'assistant'
          ? (
              shownAssistants.length
                ? (
                    <Section title="同事" count={shownAssistants.length}>
                      {[...shownAssistants].sort((a, b) => Number(a.status === 'offline') - Number(b.status === 'offline')).map(a => (
                        <OptionRow
                          key={a.id}
                          member={a}
                          title={a.name}
                          sub={`${a.role} · ${statusLabel[a.status]}`}
                          on={inGroup.has(a.id) || value.assistant_ids.includes(a.id)}
                          locked={inGroup.has(a.id) ? '已在群里' : undefined}
                          onToggle={() => toggle('assistant', a.id)}
                        />
                      ))}
                    </Section>
                  )
                : <p className="py-16 text-center text-[13px] text-ink-3">没有找到「{q}」相关的同事</p>
            )
          : (
              <AgentList
                agents={agents}
                shown={shownAgents}
                q={q}
                inGroup={inGroup}
                picked={value.agent_ids}
                onToggle={id => toggle('agent', id)}
              />
            )}
      </div>

      <div className="flex min-h-[52px] items-center gap-2 border-t border-line bg-hover/40 px-3 py-2">
        <span className="shrink-0 text-[12px] text-ink-3">已选 {picked.length}</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {picked.map(m => (
              <motion.span
                key={m.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={spring.snappy}
                className="glass-2 flex h-7 items-center gap-1.5 rounded-full pr-1 pl-1"
              >
                <MemberAvatar member={m} size={20} />
                <span className="max-w-[120px] truncate text-[12.5px]">{m.kind === 'assistant' ? m.owner : m.name}</span>
                <KindTag kind={m.kind} />
                <button
                  type="button"
                  aria-label={`移除${m.name}`}
                  onClick={() => toggle(m.kind, m.id)}
                  className="grid size-5 cursor-pointer place-items-center rounded-full text-ink-3 transition-colors hover:bg-press hover:text-ink"
                >
                  <RiCloseLine className="size-3.5" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
          {!picked.length && <span className="text-[12.5px] text-ink-3">还没有选择成员，从上方勾选同事的助手或 Agent</span>}
        </div>
      </div>
    </div>
  )
}

function AgentList({ agents, shown, q, inGroup, picked, onToggle }: {
  agents: ReturnType<typeof useAgentOptions>
  shown: AgentOption[]
  q: string
  inGroup: Set<string>
  picked: string[]
  onToggle: (id: string) => void
}) {
  if (agents.error)
    return <div className="p-2"><ErrorBar error={agents.error} onRetry={agents.reload} /></div>
  if (!agents.data) {
    return (
      <div className="space-y-1.5 p-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="size-[34px] rounded-[10px]" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-3/4" /></div>
          </div>
        ))}
      </div>
    )
  }
  if (!agents.data.length)
    return <p className="px-6 py-16 text-center text-[13px] text-ink-3">还没有可用的 Agent。去「Agents」里发布一个，或等企服 Agent 上线</p>
  if (!shown.length)
    return <p className="py-16 text-center text-[13px] text-ink-3">没有找到「{q}」相关的 Agent</p>
  const sections = [
    { title: '企服', list: shown.filter(a => a.source === 'enterprise') },
    { title: '我的', list: shown.filter(a => a.source === 'mine') },
  ].filter(s => s.list.length)
  const row = (a: AgentOption) => (
    <OptionRow
      key={a.id}
      member={a}
      title={a.name}
      sub={a.reason ?? a.description}
      badge={a.available ? <Badge tone="mint">{a.status_text}</Badge> : <Badge tone="amber">{a.status_text}</Badge>}
      on={inGroup.has(a.id) || picked.includes(a.id)}
      locked={inGroup.has(a.id) ? '已在群里' : undefined}
      disabled={!a.available && !inGroup.has(a.id)}
      onToggle={() => onToggle(a.id)}
    />
  )
  return (
    <>
      {sections.map((s) => {
        // 已发布 / 已上线（以及已在群里的）优先；未发布、接入中的默认收起
        const ready = s.list.filter(a => a.available || inGroup.has(a.id))
        const rest = s.list.filter(a => !a.available && !inGroup.has(a.id))
        return (
          <Section key={s.title} title={s.title} count={ready.length}>
            {ready.length ? ready.map(row) : <p className="px-2 py-2 text-[12px] text-ink-3">暂无可拉进群的 Agent</p>}
            {rest.length > 0 && <HiddenRest label={s.title === '企服' ? '接入中' : '未发布'} items={rest} render={row} />}
          </Section>
        )
      })}
    </>
  )
}

/** 可展开 / 收起的分组 */
function Section({ title, count, children }: { title: string, count: number, children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex w-full cursor-pointer items-center gap-1 rounded-lg px-2 pt-1.5 pb-1 text-left text-[11.5px] font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <RiArrowDownSLine className={cn('size-3.5 transition-transform duration-200', !open && '-rotate-90')} />
        {title} · {count}
        {!open && <span className="ml-auto font-normal">展开</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-1 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 未发布 / 接入中：默认隐藏，点一下才显示 */
function HiddenRest({ label, items, render }: { label: string, items: AgentOption[], render: (a: AgentOption) => React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <>
      {show && items.map(render)}
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="ml-2 cursor-pointer rounded-full px-2 py-1 text-[11.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
      >
        {show ? `隐藏${label}的 ${items.length} 个` : `显示${label}的 ${items.length} 个`}
      </button>
    </>
  )
}

function OptionRow({ member, title, sub, badge, on, locked, disabled, onToggle }: {
  member: CollabMember
  title: string
  sub: string
  badge?: React.ReactNode
  on: boolean
  locked?: string
  disabled?: boolean
  onToggle: () => void
}) {
  const inert = !!locked || !!disabled
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-disabled={inert}
      title={disabled ? sub : locked}
      onClick={() => !inert && onToggle()}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow,opacity]',
        inert ? 'cursor-not-allowed' : 'cursor-pointer',
        disabled && 'opacity-55',
        on && !locked ? 'border-volt bg-volt-soft shadow-[0_0_20px_-10px_var(--volt)]' : 'border-transparent',
        !inert && !on && 'hover:bg-hover',
      )}
    >
      <MemberAvatar member={member} size={34} presence={member.kind === 'assistant'} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium">{title}</span>
          {badge}
        </span>
        <span className={cn('mt-0.5 block truncate text-[12px]', disabled ? 'text-amber' : 'text-ink-3')}>{locked ? `${sub} · ${locked}` : sub}</span>
      </span>
      <span className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
        locked ? 'border-line-strong bg-press text-ink-3' : on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong',
      )}
      >
        {on && <RiCheckLine className="size-3.5" />}
      </span>
    </button>
  )
}

/** 「你的助手会自动加入」提示里用 */
export const myAssistantName = `${me.owner}的助手`
