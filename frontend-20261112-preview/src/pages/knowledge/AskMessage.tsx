import type { KbFeedback, KbFeedbackReason, KbReference } from '@/api/knowledge'
import type { Go } from './shared'
import { RiErrorWarningLine, RiFileTextLine, RiThumbDownLine, RiThumbUpLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getMyFeedback, revokeFeedback, submitFeedbackReason, voteAnswer } from '@/api/knowledge'
import { Button } from '@/components/ui/button'
import { TypingDots } from '@/components/ui/effects'
import { Textarea } from '@/components/ui/form'
import { Avatar } from '@/components/ui/primitives'
import { Tip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'

export type Msg = {
  id: string
  question: string
  answer: string
  status: 'streaming' | 'done' | 'failed' | 'stopped'
  statusText?: string
  thinking?: string
  references: KbReference[]
  exchangeId?: string
  error?: string
}

const REASONS: { value: KbFeedbackReason, label: string }[] = [
  { value: 'IRRELEVANT', label: '答非所问' },
  { value: 'BAD_CITATION', label: '引用不准确' },
  { value: 'OUTDATED', label: '资料过时' },
  { value: 'INCOMPLETE', label: '内容不完整' },
  { value: 'OTHER', label: '其他问题' },
]

export const ASSISTANT_AVATAR = asset('/raccoon-emoji-v1/001-reading.webp')

/** 一轮问答：右侧提问气泡 + 左侧回答（流式、引用角标、引用材料、反馈） */
export function AskTurn({ msg, go }: { msg: Msg, go: Go }) {
  const openRef = (r: KbReference) => r.documentId && go(`kb?doc=${encodeURIComponent(r.documentId)}`)
  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.out }} className="flex justify-end">
        <p className="max-w-[78%] rounded-[20px] rounded-br-md bg-volt-soft px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">{msg.question}</p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ease.out, delay: 0.05 }} className="flex gap-3">
        <Avatar src={ASSISTANT_AVATAR} size={32} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {msg.status === 'streaming' && !msg.answer && (
            <div className="flex items-center gap-2.5 py-1.5 text-[13px] text-ink-3">
              <TypingDots />
              <span>{msg.statusText ?? '正在查找相关材料'}</span>
            </div>
          )}
          {msg.thinking && <p className="mb-2 text-[12px] text-ink-3">{msg.thinking}</p>}
          {msg.answer && <AnswerText text={msg.answer} refs={msg.references} onRef={openRef} streaming={msg.status === 'streaming'} />}
          {msg.status === 'failed' && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-rose"><RiErrorWarningLine className="size-4" />{msg.error ?? '回答失败，请重试'}</p>}
          {msg.status === 'stopped' && <p className="mt-1 text-[12.5px] text-ink-3">{msg.statusText ?? '已停止生成'}</p>}
          {msg.references.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[12px] text-ink-3">引用材料</p>
              <div className="flex flex-wrap gap-1.5">
                {msg.references.map((r, i) => (
                  <Tip key={r.citationIdentity} label={r.quoteText ? `「${r.quoteText}」` : r.documentName}>
                    <button
                      type="button"
                      onClick={() => openRef(r)}
                      className="flex h-8 max-w-[320px] cursor-pointer items-center gap-1.5 rounded-full border border-line bg-cyan-soft/60 px-3 text-[12.5px] text-ink-2 transition-colors hover:border-cyan hover:text-ink"
                    >
                      <span className="font-semibold text-cyan tabular-nums">{i + 1}</span>
                      <RiFileTextLine className="size-3.5 shrink-0 text-ink-3" />
                      <span className="truncate">{r.documentName}{r.sectionPath ? ` · ${r.sectionPath}` : ''}</span>
                    </button>
                  </Tip>
                ))}
              </div>
            </div>
          )}
          {msg.status === 'done' && msg.exchangeId && <Feedback exchangeId={msg.exchangeId} />}
        </div>
      </motion.div>
    </div>
  )
}

/** 正文：段落 + [n] 引用角标（可点开对应材料） */
function AnswerText({ text, refs, onRef, streaming }: { text: string, refs: KbReference[], onRef: (r: KbReference) => void, streaming: boolean }) {
  const paras = text.split(/\n{2,}/)
  return (
    <div className="space-y-2.5 text-[14.5px] leading-[1.8] text-ink">
      {paras.map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para.split(/(\[\d+\])/g).map((seg, j) => {
            const n = /^\[(\d+)\]$/.exec(seg)
            const ref = n ? refs[Number(n[1]) - 1] : undefined
            if (!n)
              return <span key={j}>{seg}</span>
            return (
              <button
                key={j}
                type="button"
                disabled={!ref}
                onClick={() => ref && onRef(ref)}
                aria-label={ref ? `查看引用 ${n[1]}：${ref.documentName}` : `引用 ${n[1]}`}
                className="mx-0.5 inline-grid h-[18px] min-w-[18px] -translate-y-0.5 cursor-pointer place-items-center rounded-md bg-cyan-soft px-1 align-middle text-[11px] font-semibold text-cyan transition-colors hover:bg-cyan hover:text-bg disabled:cursor-default"
              >
                {n[1]}
              </button>
            )
          })}
          {streaming && i === paras.length - 1 && <i className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-volt" />}
        </p>
      ))}
    </div>
  )
}

/** 赞 / 踩；踩之后可补充原因，再点一次同一个按钮撤回 */
function Feedback({ exchangeId }: { exchangeId: string }) {
  const toast = useToast()
  const mine = useQuery(() => getMyFeedback(exchangeId), [exchangeId])
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState(false)
  const [reasons, setReasons] = useState<KbFeedbackReason[]>([])
  const [comment, setComment] = useState('')
  const current: KbFeedback | null | undefined = mine.data

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    }
    catch (e) {
      toast((e as Error).message || '反馈没有提交成功，请重试', 'info')
    }
    finally {
      setBusy(false)
    }
  }
  const vote = (rating: 'UP' | 'DOWN') => wrap(async () => {
    if (current?.rating === rating) {
      await revokeFeedback(exchangeId, current.feedbackId)
      mine.setData(null)
      setPanel(false)
      return
    }
    mine.setData(await voteAnswer(exchangeId, rating))
    setPanel(rating === 'DOWN')
    setReasons([])
    if (rating === 'UP')
      toast('感谢反馈')
  })
  const submit = () => wrap(async () => {
    mine.setData(await submitFeedbackReason(exchangeId, current!.feedbackId, { reasons, comment: comment.trim() || null }))
    setPanel(false)
    setComment('')
    toast('已记录，我们会据此改进回答')
  })

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1">
        {(['UP', 'DOWN'] as const).map((r) => {
          const Icon = r === 'UP' ? RiThumbUpLine : RiThumbDownLine
          const on = current?.rating === r
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              disabled={busy || mine.loading}
              aria-label={r === 'UP' ? '有帮助' : '没帮助'}
              onClick={() => vote(r)}
              className={cn('grid size-8 cursor-pointer place-items-center rounded-full transition-colors disabled:opacity-50', on ? (r === 'UP' ? 'bg-mint-soft text-mint' : 'bg-rose-soft text-rose') : 'text-ink-3 hover:bg-hover hover:text-ink')}
            >
              <Icon className="size-4" />
            </button>
          )
        })}
        {current?.rating === 'DOWN' && !panel && <button type="button" className="ml-1 cursor-pointer text-[12px] text-ink-3 hover:text-ink" onClick={() => setPanel(true)}>{Number(current.commentCount) ? '已补充反馈' : '补充反馈'}</button>}
      </div>
      {panel && current?.rating === 'DOWN' && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 max-w-[520px] space-y-3 rounded-2xl border border-line bg-hover p-4">
          <p className="text-[13px] font-medium">哪里不对？</p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => {
              const on = reasons.includes(r.value)
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setReasons(cur => (on ? cur.filter(x => x !== r.value) : [...cur, r.value]))}
                  className={cn('h-8 cursor-pointer rounded-full border px-3 text-[12.5px] transition-colors', on ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2 hover:border-line-strong')}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
          <Textarea rows={2} value={comment} maxLength={500} placeholder="补充说明（选填），例如正确的口径在哪份材料里" onChange={e => setComment(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="small" variant="ghost" onClick={() => setPanel(false)}>取消</Button>
            <Button size="small" variant="primary" loading={busy} disabled={!reasons.length && !comment.trim()} onClick={submit}>提交反馈</Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
