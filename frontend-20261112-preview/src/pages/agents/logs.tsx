import { rangeOf } from '@/lib/log-date-range'
import type { AgentCtx } from './detail'
import type { LogConversation, LogMessage, LogQuery } from '@/api/agents'
import { RiBookOpenLine, RiCheckLine, RiErrorWarningLine, RiFileList3Line, RiSearchLine, RiThumbDownFill, RiThumbDownLine, RiThumbUpFill, RiThumbUpLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { listLogMessages, listLogs, listLogSources, sendFeedback } from '@/api/agents'
import { useQuery } from '@/api/hooks'
import { SectionHeader } from '@/components/detail-shell'
import { Page, Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { DataTable, ErrorBar, Pager } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { Select } from '@/components/ui/form'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { dateTime, errText, fromNow, useDebounced } from './shared'

type Period = '7' | '30' | 'all'
type Sort = 'created_at:desc' | 'created_at:asc' | 'updated_at:desc'
const LIMIT = 10


const STATUS = { success: <Badge tone="mint">成功</Badge>, failed: <Badge tone="rose"><RiErrorWarningLine className="size-3.5" />失败</Badge>, paused: <Badge tone="amber">暂停</Badge> }

export default function LogsSection({ ctx }: { ctx: AgentCtx }) {
  const id = ctx.agent.id
  const [period, setPeriod] = useState<Period>('7')
  const [sources, setSources] = useState<string[]>([])
  const [kw, setKw] = useState('')
  const keyword = useDebounced(kw.trim())
  const [sort, setSort] = useState<Sort>('created_at:desc')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<LogConversation | null>(null)

  useEffect(() => setPage(1), [period, sources, keyword, sort])
  const src = useQuery(() => listLogSources(id), [id])
  const [sort_by, sort_order] = sort.split(':') as [LogQuery['sort_by'], LogQuery['sort_order']]
  const q = useQuery(() => listLogs(id, { page, limit: LIMIT, keyword: keyword || undefined, sources, sort_by, sort_order, ...rangeOf(period === 'all' ? null : Number(period)) }), [id, page, keyword, sources.join(), sort, period])

  const rows = q.data?.data ?? []
  return (
    <Page className="overflow-auto">
      <div className="space-y-5 px-8 pt-8 pb-16">
        <Rise><SectionHeader title="日志" desc="Web 应用、API里的每一次会话。预览对话不计入。" /></Rise>

        <Rise className="flex flex-wrap items-center gap-2.5">
          <Segmented value={period} onValueChange={setPeriod} options={[{ value: '7', label: '最近 7 天' }, { value: '30', label: '最近 30 天' }, { value: 'all', label: '全部' }]} />
          <div className="flex flex-wrap items-center gap-1.5">
            {src.loading && <Skeleton className="h-8 w-40 rounded-full" />}
            {src.data?.data.map((s) => {
              const on = sources.includes(s.id)
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => setSources(l => (on ? l.filter(x => x !== s.id) : [...l, s.id]))} className={cn('flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors', on ? 'border-cyan bg-cyan-soft text-cyan' : 'border-line text-ink-2 hover:bg-hover')}>
                  {on && <RiCheckLine className="size-3.5" />}{s.type === 'webapp' ? 'Web 应用' : s.app_name}
                </button>
              )
            })}
          </div>
          <label className="glass-1 ml-auto flex h-9 w-[220px] items-center gap-2 rounded-full px-3.5 text-ink-3 focus-within:border-volt">
            <RiSearchLine className="size-4" />
            <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索会话标题" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
          </label>
          <Select<Sort> size="sm" className="w-[140px]" value={sort} onValueChange={setSort} options={[{ value: 'created_at:desc', label: '最新创建' }, { value: 'created_at:asc', label: '最早创建' }, { value: 'updated_at:desc', label: '最近更新' }]} />
        </Rise>

        <ErrorBar error={q.error} onRetry={q.reload} />
        <Rise>
          <DataTable<LogConversation>
            loading={q.loading}
            rows={rows}
            rowKey={r => r.id}
            activeKey={open?.id}
            onRowClick={(r) => {
              setOpen(r)
              q.setData(d => d && { ...d, data: d.data.map(x => (x.id === r.id ? { ...x, unread: false } : x)) })
            }}
            compact
            empty={<EmptyState icon={<RiFileList3Line className="size-6" />} title="没有会话记录" hint={ctx.publish.everPublished ? '换个时间范围或来源试试。' : '发布并开启访问后，用户的对话会记录在这里。'} />}
            columns={[
              { key: 'title', title: '会话', render: r => <span className="flex items-center gap-2">{r.unread && <i className="size-1.5 shrink-0 rounded-full bg-volt shadow-glow-volt" />}<span className={cn('truncate', r.unread && 'font-semibold')}>{r.title || '未命名会话'}</span></span> },
              { key: 'src', title: '来源', width: '150px', render: r => <span className="truncate text-ink-2">{r.source?.type === 'webapp' ? 'Web 应用' : r.source?.app_name ?? '—'}</span> },
              { key: 'user', title: '用户', width: '90px', render: r => <span className="font-mono text-[12px] text-ink-3">{r.end_user_id ?? '—'}</span> },
              { key: 'n', title: '消息', width: '56px', align: 'right', render: r => <span className="tabular-nums">{r.message_count}</span> },
              { key: 'rate', title: '反馈', width: '70px', align: 'center', render: r => <span className="inline-flex gap-1.5">{r.user_rate === 1 && <RiThumbUpFill className="size-4 text-mint" />}{r.user_rate === 0 && <RiThumbDownFill className="size-4 text-rose" />}{r.operation_rate != null && <Badge tone="cyan">已标注</Badge>}{r.user_rate == null && r.operation_rate == null && <span className="text-ink-3">—</span>}</span> },
              { key: 'st', title: '状态', width: '80px', render: r => STATUS[r.status] },
              { key: 't', title: '时间', width: '96px', align: 'right', render: r => <span className="text-ink-3" title={dateTime(r.created_at)}>{fromNow(r.created_at)}</span> },
            ]}
          />
        </Rise>
        {!!q.data?.total && <Pager page={page} total={q.data.total} limit={LIMIT} onPage={setPage} />}
      </div>
      <Transcript agentId={id} conv={open} onClose={() => setOpen(null)} />
    </Page>
  )
}

function Transcript({ agentId, conv, onClose }: { agentId: string, conv: LogConversation | null, onClose: () => void }) {
  const [msgs, setMsgs] = useState<LogMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!conv)
      return
    setMsgs(null)
    setError(null)
    listLogMessages(agentId, conv.conversation_id).then(r => setMsgs(r.data)).catch(e => setError(errText(e)))
  }, [agentId, conv])

  return (
    <Drawer
      open={!!conv}
      onClose={onClose}
      title={(
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="text-[17px] font-semibold">{conv?.title || '会话详情'}</p>
          <p className="mt-1 text-[12.5px] text-ink-3">{conv?.source?.type === 'webapp' ? 'Web 应用' : conv?.source?.app_name} · {conv?.end_user_id} · {dateTime(conv?.created_at)}</p>
        </div>
      )}
    >
      {error && <p className="text-[13px] text-rose">{error}</p>}
      {!msgs && !error && <div className="space-y-3">{[0, 1].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>}
      <div className="space-y-5">
        {msgs?.map(m => <MessageItem key={m.id} agentId={agentId} m={m} onChange={n => setMsgs(l => l && l.map(x => (x.id === n.id ? n : x)))} />)}
      </div>
    </Drawer>
  )
}

function MessageItem({ agentId, m, onChange }: { agentId: string, m: LogMessage, onChange: (m: LogMessage) => void }) {
  const toast = useToast()
  const admin = m.feedbacks?.find(f => f.from_source === 'admin')
  const user = m.feedbacks?.find(f => f.from_source === 'user')
  const [note, setNote] = useState(admin?.content ?? '')
  const [busy, setBusy] = useState(false)

  const rate = async (rating: 'like' | 'dislike' | null, content = note) => {
    setBusy(true)
    try {
      await sendFeedback(agentId, { message_id: m.message_id, rating, content: content || null })
      onChange({ ...m, feedbacks: [...(m.feedbacks ?? []).filter(f => f.from_source !== 'admin'), ...(rating ? [{ rating, content: content || null, from_source: 'admin' as const }] : [])] })
      toast(rating ? '标注已保存' : '已取消标注', rating ? 'ok' : 'info')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
      <div className="flex min-w-0 justify-end"><div className="min-w-0 max-w-[85%] whitespace-pre-wrap leading-relaxed rounded-[18px] rounded-br-md border border-volt/40 bg-volt-soft px-3.5 py-2 text-[13.5px]">{m.query}</div></div>
      <div className={cn('min-w-0 max-w-full rounded-[18px] rounded-tl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap', m.error ? 'border border-rose/40 bg-rose-soft text-rose' : 'glass-1')}>{m.error || m.answer}</div>
      {!!m.knowledge_retrieval?.length && (
        <div className="flex flex-wrap gap-1.5">{m.knowledge_retrieval.map(k => <span key={k} className="flex items-center gap-1 rounded-md bg-cyan-soft px-1.5 py-0.5 text-[11.5px] text-cyan"><RiBookOpenLine className="size-3" />{k}</span>)}</div>
      )}
      <p className="text-[11.5px] text-ink-3 tabular-nums">{m.latency.toFixed(2)} 秒 · 输入 {m.message_tokens} / 输出 {m.answer_tokens} tokens · ¥{m.total_price}{user && <span className={user.rating === 'like' ? 'text-mint' : 'text-rose'}> · 用户{user.rating === 'like' ? '点赞' : '点踩'}</span>}</p>
      <div className="flex items-center gap-1.5 rounded-xl border border-line p-1.5">
        <span className="px-1.5 text-[12px] text-ink-3">标注</span>
        <button type="button" aria-label="赞" disabled={busy} onClick={() => rate(admin?.rating === 'like' ? null : 'like')} className={cn('grid size-7 cursor-pointer place-items-center rounded-lg hover:bg-hover', admin?.rating === 'like' ? 'text-mint' : 'text-ink-3')}>{admin?.rating === 'like' ? <RiThumbUpFill className="size-4" /> : <RiThumbUpLine className="size-4" />}</button>
        <button type="button" aria-label="踩" disabled={busy} onClick={() => rate(admin?.rating === 'dislike' ? null : 'dislike')} className={cn('grid size-7 cursor-pointer place-items-center rounded-lg hover:bg-hover', admin?.rating === 'dislike' ? 'text-rose' : 'text-ink-3')}>{admin?.rating === 'dislike' ? <RiThumbDownFill className="size-4" /> : <RiThumbDownLine className="size-4" />}</button>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="备注：哪里答得不好、应该怎么答" className="h-7 min-w-0 flex-1 bg-transparent px-1.5 text-[12.5px] outline-none placeholder:text-ink-3" />
        {note !== (admin?.content ?? '') && <Button size="small" variant="ghost-accent" loading={busy} onClick={() => rate(admin?.rating ?? 'dislike', note)}>保存</Button>}
      </div>
    </div>
  )
}
