/*
  智能体协同（群聊）的有状态内存 mock。
  - 群成员 = 同事的助手（src/data.ts）+ Agent（企服 / 我的，读 Agents 模块 mock，保证名称、头像、上线状态一致）。
  - 群：新建后立即出现在列表最前；读取消息后未读清零；可以继续添加成员。
  - 发言：带「@某某的助手」或「@Agent 名称」时，被 @ 的第一位成员约 1.2 秒后在群里回复（重新拉取消息即可看到）。
  - 示例数据见 ./collab-seed.ts，产出物见 ./collab-artifacts.ts。
*/
import type { AddMembersBody, CollabAgentMember, CollabAssistantMember, CollabGroup, CollabMember, CollabMessage, CreateGroupBody, GroupIcon, Seg, SendMessageBody } from '../collab'
import type { MemberRef } from './collab-seed'
import { me, teammates } from '@/data'
import { ApiError } from '../http'
import { db as agentsDb } from './agents'
import { seedArtifacts } from './collab-artifacts'
import { seedGroups, seedMessages } from './collab-seed'

const now = () => Math.floor(Date.now() / 1000)
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`
const people = [me, ...teammates]

/* ---------------- 成员 ---------------- */
const presence = { busy: 'busy', idle: 'idle', off: 'offline' } as const

function assistantMember(id: string): CollabAssistantMember | undefined {
  const p = people.find(x => x.id === id)
  if (!p)
    return undefined
  return { kind: 'assistant', id, name: `${p.owner}的助手`, owner: p.owner, role: p.role, avatar: p.avatar, status: presence[p.presence], status_text: p.status }
}

/** Agent 是否可以拉进群：企服需已上线，我的需已发布 */
function agentMember(id: string): (CollabAgentMember & { available: boolean }) | undefined {
  const e = agentsDb.enterprise().data.find(x => x.id === id)
  if (e) {
    const on = e.status === 'online'
    return { kind: 'agent', id, name: e.name, avatar: e.icon_url, source: 'enterprise', description: e.tagline, status: on ? 'idle' : 'offline', status_text: on ? '已上线' : '接入中', available: on }
  }
  const m = agentsDb.list({ page: 1, limit: 200 }).data.find(x => x.id === id)
  if (m) {
    const on = !!m.active_config_is_published
    return { kind: 'agent', id, name: m.name, avatar: m.icon_url ?? '/raccoon-emoji-v1/042-ai.webp', source: 'mine', description: m.description || m.role || '', status: on ? 'idle' : 'offline', status_text: on ? '已发布' : '未发布', available: on }
  }
  return undefined
}

function fromRef(r: MemberRef): CollabMember {
  const base = r.kind === 'assistant' ? assistantMember(r.id) : agentMember(r.id)
  if (!base)
    throw new Error(`mock 示例数据里的成员不存在：${r.id}`)
  const { available: _, ...m } = base as CollabAgentMember & { available?: boolean }
  return { ...m, ...(r.status && { status: r.status }), ...(r.status_text && { status_text: r.status_text }) } as CollabMember
}

const memberName = (g: CollabGroup | undefined, id: string) =>
  g?.members.find(m => m.id === id)?.name ?? assistantMember(id)?.name ?? agentMember(id)?.name ?? '成员'

/* ---------------- 消息 ---------------- */
const messages: Record<string, CollabMessage[]> = structuredClone(seedMessages)

const preview = (g: CollabGroup | undefined, m: CollabMessage) => {
  if (m.kind === 'handoff')
    return { author: memberName(g, m.from), text: `把「${m.task}」交给了${memberName(g, m.to)}` }
  const text = m.content.map(s => typeof s === 'string' ? s : 'at' in s ? `@${memberName(g, s.at)}` : s.em).join('')
  const author = m.kind === 'user' ? m.author : memberName(g, m.kind === 'agent' ? m.agent_id : m.assistant_id)
  return { author, text }
}

/* ---------------- 群 ---------------- */
const groups: CollabGroup[] = seedGroups.map((s) => {
  const g: CollabGroup = { ...s, members: s.members.map(fromRef), last_message: null, updated_at: s.created_at }
  const list = messages[g.id] ?? []
  const last = list[list.length - 1]
  if (last) {
    g.last_message = { ...preview(g, last), created_at: last.created_at }
    g.updated_at = last.created_at
  }
  return g
})

const findGroup = (id: string) => {
  const g = groups.find(x => x.id === id)
  if (!g)
    throw new ApiError('群聊不存在或已解散', 404)
  return g
}

export function listGroups() {
  const copy = (g: CollabGroup): CollabGroup => ({ ...g, members: [...g.members], delegations: [...g.delegations] })
  return { data: [...groups].sort((a, b) => b.updated_at - a.updated_at).map(copy) }
}

/** 把请求里的助手 / Agent id 解析成成员；不存在或不可用时报 400 */
function resolveMembers(body: AddMembersBody, existing: CollabMember[] = []): CollabMember[] {
  const has = new Set(existing.map(m => m.id))
  const out: CollabMember[] = []
  for (const id of new Set(body.assistant_ids)) {
    if (has.has(id))
      continue
    const m = assistantMember(id)
    if (!m)
      throw new ApiError('有同事的助手不存在，请刷新后重选', 400)
    out.push(m)
  }
  for (const id of new Set(body.agent_ids)) {
    if (has.has(id))
      continue
    const m = agentMember(id)
    if (!m)
      throw new ApiError('有 Agent 不存在或已被删除，请刷新后重选', 400)
    if (!m.available)
      throw new ApiError(`「${m.name}」${m.source === 'enterprise' ? '还在接入中' : '还没有发布'}，暂时不能拉进群`, 400)
    const { available: _, ...rest } = m
    out.push(rest)
  }
  return out
}

const icons: GroupIcon[] = ['team', 'node', 'presales', 'support', 'bank', 'report']

export function createGroup(body: CreateGroupBody): CollabGroup {
  const name = body.name.trim()
  if (!name)
    throw new ApiError('请填写群名称', 400)
  if (name.length > 30)
    throw new ApiError('群名称不超过 30 个字', 400)
  const ids = { assistant_ids: body.assistant_ids.filter(id => id !== me.id), agent_ids: body.agent_ids }
  if (!ids.assistant_ids.length && !ids.agent_ids.length)
    throw new ApiError('至少选择一位成员（同事的助手或 Agent）', 400)
  const mine = assistantMember(me.id)!
  const t = now()
  const g: CollabGroup = {
    id: uid('g'),
    name,
    icon: icons[groups.length % icons.length],
    description: body.description?.trim() ?? '',
    members: [mine, ...resolveMembers(ids, [mine])],
    running_tasks: 0,
    unread: 0,
    last_message: null,
    delegations: [],
    created_at: t,
    updated_at: t,
  }
  groups.unshift(g)
  messages[g.id] = []
  return g
}

export function addMembers(id: string, body: AddMembersBody): CollabGroup {
  const g = findGroup(id)
  const added = resolveMembers(body, g.members)
  if (!added.length)
    throw new ApiError('选中的成员都已经在群里了', 400)
  g.members.push(...added)
  g.updated_at = now()
  return { ...g, members: [...g.members] }
}

export function listMessages(id: string) {
  const g = findGroup(id)
  g.unread = 0
  return { data: [...(messages[id] ?? [])] }
}

const push = (g: CollabGroup, m: CollabMessage) => {
  (messages[g.id] ??= []).push(m)
  g.last_message = { ...preview(g, m), created_at: m.created_at }
  g.updated_at = m.created_at
}

export function sendMessage(id: string, body: SendMessageBody): CollabMessage {
  const g = findGroup(id)
  const text = body.content.trim()
  if (!text)
    throw new ApiError('消息不能为空', 400)
  // 把「@成员名」拆成提及片段：群成员（助手 / Agent），以及不在群里的同事助手；长名字优先匹配
  const candidates = [
    ...g.members.map(m => ({ id: m.id, label: m.name })),
    ...people.filter(p => !g.members.some(m => m.id === p.id)).map(p => ({ id: p.id, label: `${p.owner}的助手` })),
  ].sort((a, b) => b.label.length - a.label.length)
  const content: Seg[] = []
  const mentioned: string[] = []
  let buf = ''
  for (let i = 0; i < text.length;) {
    const hit = text[i] === '@' ? candidates.find(c => text.startsWith(c.label, i + 1)) : undefined
    if (!hit) {
      buf += text[i++]
      continue
    }
    if (buf)
      content.push(buf)
    buf = ''
    content.push({ at: hit.id })
    mentioned.push(hit.id)
    i += hit.label.length + 1
  }
  if (buf)
    content.push(buf)

  const msg: CollabMessage = { id: uid('m'), kind: 'user', author: me.owner, content, created_at: now() }
  push(g, msg)

  const responder = mentioned.find(x => x !== me.id)
  if (responder) {
    if (!g.members.some(m => m.id === responder)) {
      const a = assistantMember(responder)
      if (a)
        g.members.push(a)
    }
    const topic = content.filter((s): s is string => typeof s === 'string').join('').replace(/\s+/g, ' ').trim().slice(0, 24)
    const isAgent = g.members.find(m => m.id === responder)?.kind === 'agent'
    setTimeout(() => {
      const reply = [`收到，我来跟进「${topic || '这件事'}」，有进展会在群里同步。`]
      push(g, isAgent
        ? { id: uid('m'), kind: 'agent', agent_id: responder, created_at: now(), content: reply }
        : { id: uid('m'), kind: 'assistant', assistant_id: responder, created_at: now(), content: reply })
      g.running_tasks += 1
      const task = topic.slice(0, 10) || '新任务'
      if (!g.delegations.some(d => d.from === me.id && d.to === responder && d.task === task))
        g.delegations.push({ from: me.id, to: responder, task })
    }, 1200)
  }
  return msg
}

/* ---------------- 产出物 ---------------- */
export function listArtifacts(id: string) {
  findGroup(id)
  return { data: seedArtifacts[id] ?? [] }
}
