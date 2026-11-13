import type { ReactNode } from 'react'
import './messages.css'
import type { CollabArtifact, CollabGroup, CollabMessage, FileCard, ReviewCard, ReviewState, TaskCard } from '@/api/collab'
import { RiArrowRightLine, RiArrowUpLine, RiAtLine, RiAttachment2, RiCheckLine, RiCloseLine, RiFileExcel2Line, RiShieldCheckLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Menu } from '@/components/ui/menu'
import { Avatar, Badge, EmptyState, Panel, Progress, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { Tip } from '@/components/ui/tooltip'
import { me } from '@/data'
import { AssistantReply } from '@/components/assistant-reply'
import { cn } from '@/lib/cn'
import { At, assistantOfOwner, fmtTime, fullName, KindTag, MemberAvatar, Segs, shortName, sourceLabel, useMemberLookup } from './shared'

const stagger = { initial: {}, enter: { transition: { staggerChildren: 0.05 } } }

/* ---------------- 消息流 ---------------- */
export function MessageStream({ group, messages, artifacts = [], error, onRetry, highlight, onOpenArtifact, onMention }: {
  group: CollabGroup
  artifacts?: CollabArtifact[]
  messages: CollabMessage[] | undefined
  error: Error | null
  onRetry: () => void
  highlight: string | null
  onOpenArtifact: (id: string) => void
  onMention: (assistantId: string) => void
}) {
  if (error)
    return <div className="pt-4"><ErrorBar error={error} onRetry={onRetry} /></div>
  if (!messages) {
    return (
      <div className="space-y-7">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex gap-3.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
          </div>
        ))}
      </div>
    )
  }
  if (!messages?.length) {
    return (
      <EmptyState
        icon={<RiAtLine className="size-5" />}
        title={`「${group.name}」建好了`}
        hint={group.kind === 'direct' ? '直接发送消息，与这位助手持续对话' : '向团长描述任务目标，由团长规划并调度合适的成员'}
        action={(
          <div className="flex flex-wrap justify-center gap-2">
            {group.members.filter(m => m.id !== me.id).map(m => (
              <Button key={m.id} variant="secondary" size="small" onClick={() => onMention(m.id)}>
                <MemberAvatar member={m} size={18} />@{m.name}
              </Button>
            ))}
          </div>
        )}
      />
    )
  }
  return (
    <motion.div key={group.id} variants={stagger} initial="initial" animate="enter" className="flex flex-col gap-7">
      {messages.map(m => (
        <div key={m.id} id={`msg-${m.id}`} className={cn('-m-2.5 scroll-mt-24 rounded-[22px] p-2.5 transition-[background-color,box-shadow] duration-700', highlight === m.id && 'bg-volt-soft shadow-[0_0_0_1px_var(--volt)]', m.kind === 'user' && m.author === me.owner && 'self-end')}>
          <MessageView m={m} artifacts={artifacts} onOpenArtifact={onOpenArtifact} />
        </div>
      ))}
    </motion.div>
  )
}

function MessageView({ m, artifacts, onOpenArtifact }: { m: CollabMessage, artifacts: CollabArtifact[], onOpenArtifact: (id: string) => void }) {
  const lookup = useMemberLookup()
  if (m.kind === 'handoff')
    return <Handoff from={m.from} to={m.to} task={m.task} />
  if (m.kind === 'user') {
    if (m.author === me.owner) {
      return (
        <Rise>
          <div className="max-w-[540px] rounded-[22px] rounded-br-md border border-volt/40 bg-volt-soft px-4 py-2.5 text-[15px]"><Segs content={m.content} /></div>
        </Rise>
      )
    }
    const a = assistantOfOwner(m.author)
    return (
      <Rise className="flex gap-3.5">
        {a ? <Avatar src={a.avatar} size={36} /> : <span className="size-9 rounded-full bg-press" />}
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[13px] text-ink-2"><b className="mr-2 font-semibold text-ink">{m.author}</b>{fmtTime(m.created_at)}</p>
          <div className="inline-block max-w-[540px] rounded-[22px] rounded-tl-md border border-line bg-hover px-4 py-2.5 text-[15px]"><Segs content={m.content} /></div>
        </div>
      </Rise>
    )
  }
  const a = lookup(m.kind === 'agent' ? m.agent_id : m.assistant_id)
  // Keep segmented mentions/emphasis in the same Markdown flow as plain replies.
  const inlineReferences: Record<string, ReactNode> = {}
  const reply = m.content.map((segment, index) => {
    if (typeof segment === 'string') return segment
    const ref = `#collab-inline-${m.id}-${index}`
    inlineReferences[ref] = 'at' in segment ? <At id={segment.at} /> : <strong>{segment.em}</strong>
    return `[member](${ref})`
  }).join('')
  return (
    <Rise className="flex gap-3.5">
      <MemberAvatar member={a} size={36} presence />
      <div className="min-w-0 flex-1">
        <p className="mb-2 flex flex-wrap items-center gap-y-1 text-[13px] text-ink-2">
          <b className={cn('mr-2 font-semibold', 'text-ink')}>{fullName(a)}</b>
          {a?.kind === 'agent'
            ? <><KindTag kind="agent" className="mr-2" />{sourceLabel[a.source]}</>
            : a?.role}
          <span className="ml-2 text-ink-3">{fmtTime(m.created_at)}</span>
        </p>
        <div className="collab-message-body">
          {<AssistantReply text={reply} inlineReferences={inlineReferences} artifacts={artifacts.map(a => ({ id: a.id, name: a.ext ? `${a.title}.${a.ext}` : a.title }))} onPreview={onOpenArtifact} />}
          {m.card?.kind === 'task' && <TaskCardView card={m.card} />}
          {m.card?.kind === 'review' && <ReviewCardView card={m.card} />}
          {m.card?.kind === 'file' && <FileCardView card={m.card} onOpen={() => onOpenArtifact((m.card as FileCard).artifact_id)} />}
        </div>
      </div>
    </Rise>
  )
}

function Handoff({ from, to, task }: { from: string, to: string, task: string }) {
  const lookup = useMemberLookup()
  const f = lookup(from)
  const t = lookup(to)
  return (
    <Rise className="flex items-center gap-3 text-[12.5px] text-ink-3">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line-strong" />
      <span className="glass-1 flex items-center gap-2 rounded-full px-3 py-1">
        <MemberAvatar member={f} size={18} />
        <RiArrowRightLine className="size-3.5 text-cyan" />
        <MemberAvatar member={t} size={18} />
        {shortName(f)}把「{task}」交给了{fullName(t)}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line-strong" />
    </Rise>
  )
}

const subBadge = {
  running: <Badge tone="amber" dot>进行中</Badge>,
  done: <Badge tone="mint">已完成</Badge>,
  review: <Badge tone="volt" dot>等你核对</Badge>,
}

function TaskCardView({ card }: { card: TaskCard }) {
  const lookup = useMemberLookup()
  return (
    <Panel level={2} radius="md" className="mt-3 space-y-3.5 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{card.title}</p>
        <span className="shrink-0 text-[12.5px] text-ink-3">{card.due}</span>
      </div>
      {card.subtasks.map(r => (
        <div key={r.title} className="space-y-1.5">
          <div className="flex items-center justify-between text-[13.5px]"><span>{r.title}<span className="ml-2 text-ink-3">{fullName(lookup(r.assignee_id))}</span></span>{subBadge[r.state]}</div>
          <Progress value={r.progress} tone={r.progress === 100 ? 'mint' : 'volt'} />
        </div>
      ))}
    </Panel>
  )
}

function ReviewCardView({ card }: { card: ReviewCard }) {
  const toast = useToast()
  const [state, setState] = useState<ReviewState>(card.state)
  const r = useMemberLookup()(card.reviewer_id)
  const reviewer = r ? shortName(r) : '负责人'
  const mine = card.reviewer_id === me.id
  const act = (s: ReviewState, text: string) => {
    setState(s)
    toast(text)
  }
  return (
    <div className={cn(
      'mt-3 rounded-2xl border p-4',
      state === 'pending' && 'border-amber/40 bg-amber-soft shadow-[0_0_32px_-12px_var(--amber)]',
      state === 'confirmed' && 'border-mint/40 bg-mint-soft',
      state === 'rejected' && 'border-rose/40 bg-rose-soft',
    )}
    >
      <p className={cn('flex items-center gap-2 text-[13px] font-semibold', { pending: 'text-amber', confirmed: 'text-mint', rejected: 'text-rose' }[state])}>
        {state === 'pending' && <><RiShieldCheckLine className="size-4" />{mine ? '需要你核对' : `等${reviewer}核对`}，{card.label}</>}
        {state === 'confirmed' && <><RiCheckLine className="size-4" />{reviewer}已确认，{card.label}</>}
        {state === 'rejected' && <><RiCloseLine className="size-4" />{reviewer}已驳回，{card.label}</>}
      </p>
      <p className="mt-2 text-[14.5px]">{card.text}</p>
      {state === 'pending' && mine && (
        <div className="mt-3 flex gap-2">
          <Button variant="primary" size="small" onClick={() => act('confirmed', '已确认，助手会按此继续推进')}>确认</Button>
          <Button variant="secondary" size="small" onClick={() => toast('在下方输入修改意见，@ 助手即可', 'info')}>修改</Button>
          <Button variant="ghost" size="small" onClick={() => act('rejected', '已驳回，助手会重新整理')}>驳回</Button>
        </div>
      )}
    </div>
  )
}

function FileCardView({ card, onOpen }: { card: FileCard, onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="glass-2 mt-3 flex w-full max-w-[360px] cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-colors hover:bg-hover">
      <span className="grid size-9 place-items-center rounded-xl bg-mint-soft text-mint"><RiFileExcel2Line className="size-[18px]" /></span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13.5px] font-medium">{card.name}</span>
        <span className="block text-[12px] text-ink-3">{card.size} · 已存入协作产出物</span>
      </span>
      <span className="text-[12.5px] text-cyan">预览</span>
    </button>
  )
}

/* ---------------- 输入框 ---------------- */
export function Composer({ group, value, onChange, onSend, sending }: {
  group: CollabGroup
  value: string
  onChange: (v: string) => void
  onSend: () => void
  sending: boolean
}) {
  const toast = useToast()
  const members = group.members.filter(m => m.id !== me.id)
  const input = useRef<HTMLTextAreaElement>(null)
  const listId = useId()
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [composing, setComposing] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const prefix = value.slice(0, caret)
  const match = prefix.match(/(?:^|[^A-Za-z0-9_./\\])@([^\s@，,。!！?？:：;；]*)$/u)
  const token = match ? { start: prefix.lastIndexOf('@'), query: match[1].toLowerCase() } : null
  const key = token ? `${group.id}:${token.start}:${prefix}` : null
  const shown = members.filter(m => !token?.query || `${m.name} ${m.kind === 'assistant' ? `${m.owner} ${m.role}` : m.description}`.toLowerCase().includes(token.query))
  const open = focused && !composing && !!token && key !== dismissed
  const selectedIndex = Math.min(active, Math.max(0, shown.length - 1))
  useEffect(() => { setActive(0) }, [key])
  useEffect(() => { setDismissed(null); setCaret(0) }, [group.id])
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${selectedIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex, listId])
  const mention = (name: string) => {
    const start = token?.start ?? caret
    const end = token ? caret + (value.slice(caret).match(/^[^\s@，,。!！?？:：;；]*/u)?.[0].length ?? 0) : caret
    const insert = `${start > 0 && !/\s/.test(value[start - 1]) && !token ? ' ' : ''}@${name} `
    const next = value.slice(0, start) + insert + value.slice(end)
    const cursor = start + insert.length
    onChange(next); setCaret(cursor); setDismissed(null)
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(cursor, cursor) })
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/60 to-transparent px-8 pt-14 pb-6">
      <div className="glass-3 pointer-events-auto relative mx-auto max-w-[760px] rounded-[26px] shadow-float transition-shadow duration-300 focus-within:shadow-glow-volt">
        {open && <div id={listId} role="listbox" aria-label="提及候选成员" className="glass-3 absolute bottom-full left-0 z-50 mb-2 max-h-64 w-full max-w-[400px] overflow-auto rounded-2xl border border-line p-2 shadow-float">
          <p className="px-3 py-2 text-xs text-ink-3">本群成员 · ↑↓ 选择，Enter 确认，Esc 关闭</p>
          {shown.length ? shown.map((m, i) => <button type="button" role="option" id={`${listId}-${i}`} aria-selected={i === selectedIndex} tabIndex={-1} key={m.id}
            className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm', i === selectedIndex ? 'bg-hover text-ink' : 'text-ink-2')}
            onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => mention(m.name)}>
            <MemberAvatar member={m} size={28} presence /><span className="min-w-0 flex-1"><span className="block truncate">{m.name}</span><span className="block truncate text-xs text-ink-3">{m.kind === 'assistant' ? m.role : m.description}</span></span><KindTag kind={m.kind} />
          </button>) : <p className="px-3 py-4 text-sm text-ink-3">没有匹配的本群成员</p>}
        </div>}
        <textarea
          ref={input}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && shown.length ? `${listId}-${selectedIndex}` : undefined}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onSelect={e => setCaret(e.currentTarget.selectionStart)}
          onCompositionStart={() => setComposing(true)} onCompositionEnd={e => { setComposing(false); setCaret(e.currentTarget.selectionStart) }}
          rows={1}
          value={value}
          onChange={e => { onChange(e.target.value); setCaret(e.target.selectionStart); setDismissed(null) }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || composing) return
            if (open) {
              if (e.key === 'Escape') { e.preventDefault(); setDismissed(key); return }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive(shown.length ? (selectedIndex + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length : 0); return }
              if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Tab' && shown.length)) { e.preventDefault(); if (shown[selectedIndex]) mention(shown[selectedIndex].name); return }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder={group.kind === 'direct' ? '直接提问，或交给这位助手一项任务…' : '描述任务目标，团长会规划并调度成员；可 @ 指定执行成员'}
          aria-label="群消息"
          className="max-h-40 w-full resize-none bg-transparent px-5 pt-4 text-[15px] outline-none [field-sizing:content] placeholder:text-ink-3"
        />
        <div className="flex items-center gap-1.5 px-3 pb-3">
          <Tip label="添加附件" side="top">
            <Button variant="ghost" size="icon-small" aria-label="添加附件" onClick={() => toast('附件上传即将开放', 'info')}><RiAttachment2 className="size-4" /></Button>
          </Tip>
          <Menu
            align="start"
            trigger={<Button variant="ghost" size="small" disabled={!members.length}><RiAtLine className="size-4" />提及成员</Button>}
            items={members.map(m => ({
              label: <span className="flex items-center gap-2"><MemberAvatar member={m} size={20} presence />{m.name}<KindTag kind={m.kind} className="ml-auto" /></span>,
              onSelect: () => mention(m.name),
            }))}
          />
          <span className="ml-auto mr-1 hidden text-[11.5px] text-ink-3 sm:inline">Enter 发送，Shift + Enter 换行</span>
          <Tip label="发送" side="top">
            <Button variant="primary" size="icon" aria-label="发送" loading={sending} disabled={!value.trim()} onClick={onSend}><RiArrowUpLine className="size-[18px]" /></Button>
          </Tip>
        </div>
      </div>
    </div>
  )
}
