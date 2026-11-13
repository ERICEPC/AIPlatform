import type { InboxAction, InboxItem, InboxType } from '@/api/inbox'
import { RiArrowRightUpLine, RiCheckLine, RiInbox2Line, RiShareForwardLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { actInbox, EXEC_STATE, INBOX_STATE, INBOX_TYPE, listInbox } from '@/api/inbox'
import { ConsolePage, PageHeader } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/form'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

/*
  待我确认：智能体决定不了的事，由人确认。左侧列表，右侧详情回答五个问题：
  需要我决定什么、为什么不能继续、有哪些依据、可选方案及影响、确认后将发生什么。
*/
type Filter = InboxType | 'all'
export default function ReviewInbox({ go }: { go: (p: string) => void }) {
  const toast = useToast()
  const [state, setState] = useState<'pending' | 'done'>('pending')
  const [filter, setFilter] = useState<Filter>('all')
  const q = useQuery(() => listInbox({ state }), [state])
  const list = (q.data?.data ?? []).filter(i => filter === 'all' || i.type === filter)
  const [current, setCurrent] = useState<string>('')
  const item = list.find(i => i.id === current) ?? list[0]
  const [option, setOption] = useState('')
  const [dialog, setDialog] = useState<InboxAction | null>(null)
  const [comment, setComment] = useState('')
  useEffect(() => setOption(item?.options.find(o => o.recommended)?.id ?? item?.options[0]?.id ?? ''), [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action: InboxAction) => {
    if (!item)
      return
    await actInbox(item.id, { action, option, comment: comment.trim() || undefined })
    setDialog(null)
    setComment('')
    toast(action === 'return' ? '已退回，智能体会按你的意见处理' : action === 'transfer' ? '已转交' : action === 'supplement' ? '已补充，智能体继续处理' : '已确认，开始执行')
    q.reload()
  }
  const counts = (q.data?.data ?? []).reduce<Record<string, number>>((m, i) => ((m[i.type] = (m[i.type] ?? 0) + 1), m), {})

  return (
    <ConsolePage
      bodyClass="p-0 flex min-h-0"
      header={(
        <PageHeader
          title="待我确认"
          desc="智能体遇到信息不足、结论冲突或超出权限的事项，会停下来交给你确认；不依赖该决定的工作照常继续。"
          tabs={[{ id: 'pending', label: '待处理', count: state === 'pending' ? q.data?.data.length : undefined }, { id: 'done', label: '已处理' }]}
          tab={state}
          onTab={s => { setState(s); setCurrent('') }}
        />
      )}
    >
      <div className="flex w-[380px] shrink-0 flex-col border-r border-line bg-solid">
        <div className="flex flex-wrap gap-1.5 border-b border-line p-3">
          {(['all', 'decision', 'handoff', 'memory', 'release'] as Filter[]).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn('h-7 cursor-pointer rounded-md px-2.5 text-[12.5px]', filter === f ? 'bg-volt-soft font-medium text-volt-text' : 'text-ink-2 hover:bg-hover')}>
              {f === 'all' ? '全部' : INBOX_TYPE[f]}{f !== 'all' && counts[f] ? ` ${counts[f]}` : ''}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {q.error && <div className="p-3"><ErrorBar error={q.error} onRetry={q.reload} /></div>}
          {q.loading && !q.data && <div className="space-y-2 p-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20" />)}</div>}
          {list.map(i => (
            <button key={i.id} type="button" onClick={() => setCurrent(i.id)} className={cn('block w-full cursor-pointer border-b border-line px-4 py-3 text-left transition-colors', i.id === item?.id ? 'bg-volt-soft' : 'hover:bg-hover')}>
              <span className="flex items-center gap-2 text-[12px] text-ink-3"><Badge tone="neutral">{INBOX_TYPE[i.type]}</Badge>{i.from}<span className="ml-auto">{new Date(i.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></span>
              <span className="mt-1.5 block text-[14px] font-medium">{i.title}</span>
              <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{i.source}</span>
            </button>
          ))}
          {!q.loading && !list.length && <EmptyState icon={<RiInbox2Line className="size-5" />} title={state === 'pending' ? '没有待处理的事项' : '还没有处理过的事项'} hint="智能体需要你确认时，会出现在这里，顶栏的通知也会提醒。" />}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-auto p-6">
        {item && <Detail item={item} option={option} setOption={setOption} onAct={a => (a === 'confirm' ? act(a) : setDialog(a))} go={go} />}
      </div>

      <Dialog
        open={!!dialog}
        onOpenChange={v => !v && setDialog(null)}
        title={dialog === 'return' ? '退回' : dialog === 'transfer' ? '转交给他人' : dialog === 'supplement' ? '补充信息' : '修改后确认'}
        description={dialog === 'return' ? '写清退回原因，智能体会据此调整。' : dialog === 'transfer' ? '写明转交对象与原因；对方需要有该事项的权限。' : '补充的内容会作为本事项的依据记录下来。'}
        footer={<><Button variant="secondary" onClick={() => setDialog(null)}>取消</Button><Button variant="primary" disabled={!comment.trim()} onClick={() => dialog && act(dialog)}>提交</Button></>}
      >
        <Field label={dialog === 'transfer' ? '转交给' : '说明'}><Textarea rows={4} value={comment} onChange={e => setComment(e.target.value)} placeholder={dialog === 'transfer' ? '例如：交给销售负责人，由他确认客户预算' : '例如：以最新会议纪要为准，金额待客户书面确认'} /></Field>
      </Dialog>
    </ConsolePage>
  )
}

function Detail({ item, option, setOption, onAct, go }: { item: InboxItem, option: string, setOption: (v: string) => void, onAct: (a: InboxAction) => void, go: (p: string) => void }) {
  const [label, tone] = INBOX_STATE[item.state]
  return (
    <div className="max-w-[820px] space-y-4">
      <div className="rounded-xl border border-line bg-solid p-5">
        <div className="flex items-center gap-2"><Badge tone={tone}>{label}</Badge><Badge>{INBOX_TYPE[item.type]}</Badge>{item.state !== 'pending' && <Badge tone={item.exec === 'succeeded' ? 'mint' : item.exec === 'failed' ? 'rose' : 'volt'}>{EXEC_STATE[item.exec]}</Badge>}<span className="ml-auto text-[12.5px] text-ink-3">截止 {item.due}</span></div>
        <h2 className="mt-3 text-[18px] font-semibold">{item.title}</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">{item.from} · {item.source}</p>
        {item.link && <button type="button" onClick={() => go(item.link!)} className="mt-2 flex cursor-pointer items-center gap-1 text-[12.5px] text-volt-text hover:underline">打开原对话或任务<RiArrowRightUpLine className="size-3.5" /></button>}
      </div>
      <Block title="需要我决定什么">{item.question}</Block>
      <Block title="为什么不能继续">{item.why_blocked}</Block>
      <Block title="依据">
        <ul className="space-y-1.5">{item.evidence.map(e => <li key={e.label}><button type="button" onClick={() => go(e.ref)} className="cursor-pointer text-volt-text hover:underline">{e.label}</button></li>)}</ul>
      </Block>
      <Block title="可选方案及影响">
        <div className="space-y-2">
          {item.options.map(o => (
            <label key={o.id} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', option === o.id ? 'border-volt bg-volt-soft' : 'border-line hover:border-line-strong')}>
              <input type="radio" name="opt" checked={option === o.id} onChange={() => setOption(o.id)} disabled={item.state !== 'pending'} className="mt-1" />
              <span><span className="flex items-center gap-2 text-[13.5px] font-medium">{o.label}{o.recommended && <Badge tone="volt">建议</Badge>}</span><span className="mt-0.5 block text-[12.5px] text-ink-3">{o.impact}</span></span>
            </label>
          ))}
        </div>
      </Block>
      <Block title="确认后将发生什么">{item.after_confirm}</Block>
      {item.state === 'pending' && (
        <div className="sticky bottom-0 flex flex-wrap gap-2 rounded-xl border border-line bg-solid p-3">
          <Button variant="primary" onClick={() => onAct('confirm')}><RiCheckLine className="size-4" />确认</Button>
          <Button onClick={() => onAct('confirm_edit')}>修改后确认</Button>
          <Button onClick={() => onAct('supplement')}>补充信息</Button>
          <Button onClick={() => onAct('transfer')}><RiShareForwardLine className="size-4" />转交</Button>
          <Button variant="ghost" tone="destructive" onClick={() => onAct('return')}>退回</Button>
          <span className="ml-auto self-center text-[12px] text-ink-3">一次确认只授权本事项；超时不会默认同意</span>
        </div>
      )}
    </div>
  )
}

function Block({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-solid p-5">
      <p className="text-[12.5px] font-semibold text-ink-3">{title}</p>
      <div className="mt-1.5 text-[14px] leading-relaxed text-ink">{children}</div>
    </div>
  )
}
