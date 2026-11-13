import type { Agent, RunState, TeamAvatarValue } from '@/api/teams'
import { RiCloseLine, RiErrorWarningLine, RiRefreshLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { ApiError } from '@/api/http'
import { CONFLICT_MESSAGE, runStates } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { agents as portalAgents, me } from '@/data'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { teams as mockTeams } from '@/mock'

/** 当前登录用户（「我创建的」筛选用；接入账号接口后替换） */
export const CURRENT_USER = me.id

export const emojiUrl = (f: string) => asset(`/raccoon-emoji-v1/${f}.webp`)
export const TEAM_EMOJIS = ['028-planning', '006-support', '035-project', '003-teamwork', '029-brainstorm', '036-leadership', '042-ai', '044-automation', '027-presentation', '037-handshake', '026-research', '039-quality']

/* ---------- Agent 头像：接口不带头像，按名称匹配示例头像，其余按 id 稳定取一个 ---------- */
const known: Record<string, string> = {
  售前协调者: emojiUrl('028-planning'),
  升级协调者: emojiUrl('006-support'),
  周报协调者: emojiUrl('035-project'),
  ...Object.fromEntries(mockTeams.flatMap(t => t.members.map(m => [m.name, m.avatar]))),
  ...Object.fromEntries(portalAgents.map(a => [a.name, a.avatar])),
}
const pool = ['001-reading', '002-office', '004-programming', '005-data', '025-note-taking', '030-review', '031-archive', '033-writing', '042-ai', '046-design']
export function agentAvatar(a?: Pick<Agent, 'id' | 'name'> | null) {
  if (!a)
    return emojiUrl('045-testing')
  if (known[a.name])
    return known[a.name]
  const h = [...a.id].reduce((s, c) => s + c.charCodeAt(0), 0)
  return emojiUrl(pool[h % pool.length])
}

/* ---------- 团队头像 ---------- */
export function TeamAvatar({ value, name, size = 44, className }: { value?: TeamAvatarValue | null, name: string, size?: number, className?: string }) {
  const box = cn('grid shrink-0 place-items-center overflow-hidden rounded-[30%] border border-line bg-glass-3', className)
  const style = { width: size, height: size, background: value?.background }
  if (value?.type === 'image' && value.icon)
    return <img src={value.icon} alt="" className={cn(box, 'object-cover')} style={style} />
  if (value?.type === 'emoji' && /^\d{3}-/.test(value.icon))
    return <span className={box} style={style}><img src={emojiUrl(value.icon)} alt="" className="size-[86%]" /></span>
  if (value?.type === 'emoji' && value.icon)
    return <span className={box} style={{ ...style, fontSize: size * 0.5 }}>{value.icon}</span>
  return <span className={cn(box, 'font-semibold text-volt-text')} style={{ ...style, fontSize: size * 0.42 }}>{name.slice(0, 1) || '团'}</span>
}

/* ---------- 时间 ---------- */
const pad = (n: number) => String(n).padStart(2, '0')
export function fmtTime(sec: number | null | undefined, withSeconds = false) {
  if (sec == null)
    return '—'
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}${withSeconds ? `:${pad(d.getSeconds())}` : ''}`
}
export function fmtAgo(sec: number) {
  const diff = Date.now() / 1000 - sec
  if (diff < 60)
    return '刚刚'
  if (diff < 3600)
    return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400)
    return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 30)
    return `${Math.floor(diff / 86400)} 天前`
  return fmtTime(sec).slice(0, 10)
}
export const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/* ---------- 运行状态 ---------- */
export const stateTone: Record<RunState, string> = {
  queued: 'bg-amber', running: 'bg-volt', succeeded: 'bg-mint', failed: 'bg-rose', timed_out: 'bg-rose', interrupted: 'bg-rose', cancelled: 'bg-ink-3',
}
export function StateDot({ state, className }: { state: RunState, className?: string }) {
  const active = state === 'queued' || state === 'running'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap', className)}>
      <i className={cn('size-1.5 rounded-full', stateTone[state] ?? 'bg-ink-3', active && 'breathe-dot', state === 'running' ? 'text-volt' : 'text-amber')} />
      {runStates[state] ?? state}
    </span>
  )
}

/* ---------- 错误 ---------- */
export const isConflict = (e: unknown) => e instanceof ApiError && e.status === 409
export const errText = (e: unknown, fallback = '操作失败，请刷新核对状态') => (e instanceof Error && e.message ? e.message : fallback)

/** 409 冲突提示条：说明原因 + 刷新按钮（Toast 不带按钮，所以单独做） */
export function ConflictBanner({ message, onRefresh, onClose }: { message: string | null, onRefresh: () => void, onClose: () => void }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={spring.smooth}
          role="alert"
          className="glass-3 absolute top-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber/40 py-1.5 pr-1.5 pl-4 text-[13px] shadow-float"
        >
          <RiErrorWarningLine className="size-4 text-amber" />
          <span>{message || CONFLICT_MESSAGE}</span>
          <Button size="small" variant="primary" onClick={() => { onClose(); onRefresh() }}><RiRefreshLine className="size-3.5" />刷新</Button>
          <Button size="icon-small" variant="ghost" aria-label="关闭提示" onClick={onClose}><RiCloseLine className="size-4" /></Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- 轻量 Markdown：标题、列表、粗体、行内代码、段落 ---------- */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <b key={i} className="font-semibold text-ink">{p.slice(2, -2)}</b>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="rounded-md bg-press px-1 font-mono text-[12.5px]">{p.slice(1, -1)}</code>
    return p
  })
}
export function Markdown({ text, className }: { text: string, className?: string }) {
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean, items: string[] } | null = null
  const flush = () => {
    if (!list)
      return
    const L = list.ordered ? 'ol' : 'ul'
    blocks.push(<L key={blocks.length} className={cn('my-1.5 space-y-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc marker:text-cyan')}>{list.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</L>)
    list = null
  }
  for (const line of text.split('\n')) {
    const h = line.match(/^(#{1,4})\s+(.*)/)
    const li = line.match(/^\s*[-*]\s+(.*)/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/)
    if (li || ol) {
      const ordered = !!ol
      if (list && list.ordered !== ordered)
        flush()
      list ??= { ordered, items: [] }
      list.items.push((li ?? ol)![1])
      continue
    }
    flush()
    if (h)
      blocks.push(<p key={blocks.length} className={cn('mt-3 mb-1 font-semibold text-ink first:mt-0', h[1].length <= 2 ? 'text-[15px]' : 'text-[14px]')}>{inline(h[2])}</p>)
    else if (line.trim())
      blocks.push(<p key={blocks.length} className="my-1.5">{inline(line)}</p>)
  }
  flush()
  return <div className={cn('text-[13.5px] leading-relaxed text-ink-2', className)}>{blocks}</div>
}

/** 下载文本文件（导出 DSL） */
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/yaml;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
