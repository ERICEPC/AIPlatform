import type { Msg } from './AskMessage'
import type { KbChatMode, KbSession, KbSessionDetail, KbStreamPayload, KbStreamEvent } from '@/api/knowledge'
import type { Go } from './shared'
import { RiAddLine, RiArrowUpLine, RiChat3Line, RiDeleteBinLine, RiStopFill } from '@remixicon/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { deleteSession, getSession, listChatDocuments, listChatKnowledgeBases, listSessions, openChatStream, stopSession } from '@/api/knowledge'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/form'
import { Menu } from '@/components/ui/menu'
import { Avatar, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/cn'
import { ASSISTANT_AVATAR, AskTurn } from './AskMessage'
import { KbShell } from './KbShell'
import { fmtTime, useHashQuery } from './shared'

type ScopeMode = 'all' | 'kb' | 'doc' | 'open'
type Scope = { mode: ScopeMode, kb: string, doc: string }
const SCOPE_OPTIONS: { value: ScopeMode, label: string }[] = [
  { value: 'all', label: '全部材料' },
  { value: 'kb', label: '指定知识库' },
  { value: 'doc', label: '单份材料' },
  { value: 'open', label: '开放提问' },
]
const SUGGESTIONS: Record<ScopeMode, string[]> = {
  all: ['翼飞客服私有化部署需要多少 GPU？', '银行项目上线前要检查哪些事项？', '保险行业有哪些可对客的案例？'],
  kb: ['这个知识库里最近更新了什么？', '有哪些材料可以直接发给客户？', '帮我梳理交付的关键里程碑'],
  doc: ['用三句话概括这份材料', '这份材料里有哪些关键数据？', '对外引用时要注意什么？'],
  open: ['怎么准备一次银行客户的首次拜访？', '写一段 RaccoonX 的一句话介绍', '售前方案评审一般看哪些点？'],
}
const newId = () => crypto.randomUUID()

/** 页面范围 → 接口字段（对应知识库 resolveChatRequestScope） */
function scopePayload(s: Scope, docKb: string): Pick<KbStreamPayload, 'chatMode' | 'knowledgeBaseSelectionMode' | 'selectedKnowledgeBaseIds' | 'selectedDocumentId'> {
  if (s.mode === 'open')
    return { chatMode: 'OPEN_CHAT', knowledgeBaseSelectionMode: 'NONE', selectedKnowledgeBaseIds: [], selectedDocumentId: null }
  if (s.mode === 'doc')
    return { chatMode: 'DOCUMENT', knowledgeBaseSelectionMode: 'SELECTED', selectedKnowledgeBaseIds: docKb ? [docKb] : [], selectedDocumentId: s.doc || null }
  if (s.mode === 'kb' && s.kb)
    return { chatMode: 'AUTO_DOCUMENT', knowledgeBaseSelectionMode: 'SELECTED', selectedKnowledgeBaseIds: [s.kb], selectedDocumentId: null }
  return { chatMode: 'AUTO_DOCUMENT', knowledgeBaseSelectionMode: 'ALL', selectedKnowledgeBaseIds: [], selectedDocumentId: null }
}
function scopeOfSession(s: Pick<KbSession, 'chatMode' | 'selectedDocumentId' | 'selectedKnowledgeBaseIds'>): Scope {
  const mode: ScopeMode = s.chatMode === 'OPEN_CHAT' ? 'open' : s.chatMode === 'DOCUMENT' ? 'doc' : s.selectedKnowledgeBaseIds.length ? 'kb' : 'all'
  return { mode, kb: s.selectedKnowledgeBaseIds[0] ?? '', doc: s.selectedDocumentId ?? '' }
}
const toMsgs = (d: KbSessionDetail): Msg[] => d.exchanges.map(e => ({
  id: e.exchangeId,
  question: e.question,
  answer: e.answer,
  status: e.status === 'FAILED' ? 'failed' : e.status === 'STOPPED' ? 'stopped' : 'done',
  error: e.errorMessage,
  references: e.references ?? [],
  exchangeId: e.exchangeId,
}))
const MODE_LABEL: Record<KbChatMode, string> = { AUTO_DOCUMENT: '材料问答', DOCUMENT: '单份材料', OPEN_CHAT: '开放提问' }

/** 问材料：左栏会话列表，主区范围选择 + 对话应用 + 输入框 */
export function Ask({ go }: { go: Go }) {
  const query = useHashQuery()
  const libs = useQuery(listChatKnowledgeBases, [])
  const docs = useQuery(listChatDocuments, [])
  const sessions = useQuery(() => listSessions(), [])
  const [scope, setScope] = useState<Scope>({ mode: 'all', kb: '', doc: '' })
  const [convId, setConvId] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loadingConv, setLoadingConv] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [removing, setRemoving] = useState<KbSession | null>(null)
  const abort = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // 入口参数：?doc= 问一份材料，?kb= 问一个知识库，?c= 打开历史会话
  const qDoc = query.get('doc')
  const qKb = query.get('kb')
  const qConv = query.get('c')
  useEffect(() => {
    if (qDoc)
      setScope({ mode: 'doc', kb: '', doc: qDoc })
    else if (qKb)
      setScope({ mode: 'kb', kb: qKb, doc: '' })
  }, [qDoc, qKb])
  useEffect(() => {
    if (qConv && qConv !== convId)
      openConversation(qConv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qConv])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])
  useEffect(() => () => abort.current?.abort(), [])

  const docOption = docs.data?.find(d => d.documentId === scope.doc)
  const libName = (id: string) => libs.data?.find(l => l.id === id)?.baseName ?? ''

  async function openConversation(id: string) {
    abort.current?.abort()
    setStreaming(false)
    setConvId(id)
    setLoadingConv(true)
    setError(null)
    try {
      const d = await getSession(id)
      setMsgs(toMsgs(d))
      setScope(scopeOfSession(d))
    }
    catch (e) {
      setError(e as Error)
      setMsgs([])
    }
    finally {
      setLoadingConv(false)
    }
  }
  const startNew = () => {
    abort.current?.abort()
    setStreaming(false)
    setConvId('')
    setMsgs([])
    setError(null)
    go('kb/ask')
  }
  const patchLast = (fn: (m: Msg) => Msg) => setMsgs(ms => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)))

  async function send(text: string) {
    const question = text.trim()
    if (!question || streaming || loadingConv)
      return
    if (scope.mode === 'doc' && !scope.doc)
      return setError(new Error('单份材料模式下请先选择一份材料'))
    if (scope.mode === 'kb' && !scope.kb)
      return setError(new Error('请先选择要提问的知识库'))
    const cid = convId || newId()
    if (!convId) {
      setConvId(cid)
      // 只更新地址栏，不触发重新加载
      history.replaceState(null, '', `#kb/ask?c=${cid}`)
    }
    setError(null)
    setInput('')
    setMsgs(ms => [...ms, { id: newId(), question, answer: '', status: 'streaming', references: [] }])
    setStreaming(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    const payload: KbStreamPayload = { question, conversationId: cid, ...scopePayload(scope, docOption?.knowledgeBaseId ?? '') }
    const onEvent = (e: KbStreamEvent) => {
      if (e.type === 'status')
        patchLast(m => ({ ...m, statusText: String(e.content) }))
      else if (e.type === 'thinking')
        patchLast(m => ({ ...m, thinking: String(e.content) }))
      else if (e.type === 'text')
        patchLast(m => ({ ...m, answer: m.answer + String(e.content ?? '') }))
      else if (e.type === 'reference' && Array.isArray(e.content))
        patchLast(m => ({ ...m, references: e.content as Msg['references'] }))
    }
    try {
      await openChatStream(payload, onEvent, ctrl.signal)
      if (ctrl.signal.aborted)
        return
      // 回读会话，拿到本轮 exchangeId（反馈要用）
      const d = await getSession(cid)
      const last = d.exchanges.at(-1)
      if (!last || last.status !== 'COMPLETED') throw new Error(last?.errorMessage || '回答未完整完成，请重试。')
      if (last)
        patchLast(m => ({ ...m, status: 'done', exchangeId: last.exchangeId, references: last.references?.length ? last.references : m.references }))
    }
    catch (e) {
      if (!ctrl.signal.aborted) {
        patchLast(m => ({ ...m, status: 'failed', error: (e as Error).message }))
        setError(e as Error)
      }
    }
    finally {
      if (abort.current === ctrl) {
        setStreaming(false)
        sessions.refresh()
      }
    }
  }
  const stop = async () => {
    abort.current?.abort()
    setStreaming(false)
    patchLast(m => ({ ...m, status: 'stopped', statusText: '正在停止生成…' }))
    try {
      const r = await stopSession(convId)
      patchLast(m => ({ ...m, statusText: r?.message || '已停止生成' }))
    }
    catch {
      patchLast(m => ({ ...m, statusText: '浏览器已停止接收后续内容' }))
    }
    sessions.refresh()
  }
  const confirmRemove = async () => {
    if (!removing)
      return
    try {
      await deleteSession(removing.conversationId)
      if (removing.conversationId === convId)
        startNew()
      sessions.refresh()
    }
    catch (e) {
      setError(e as Error)
    }
    setRemoving(null)
  }

  const docOptions = useMemo(() => (docs.data ?? []).map(d => ({ value: d.documentId, label: d.documentName, hint: libs.data?.find(l => l.id === d.knowledgeBaseId)?.baseName })), [docs.data, libs.data])
  const scopeHint = scope.mode === 'doc' ? (docOption ? `只根据《${docOption.documentName}》回答` : '选择一份材料') : scope.mode === 'kb' ? (scope.kb ? `在「${libName(scope.kb)}」里查找依据` : '选择一个知识库') : scope.mode === 'open' ? '不使用知识库，按通用能力回答' : '在你有权查看的全部材料里查找依据'
  const locked = streaming || msgs.length > 0

  const aside = (
    <>
      <Button variant="secondary" className="mb-3 w-full" onClick={startNew}><RiAddLine className="size-4" />新对话</Button>
      <p className="mb-1 px-3 text-[11.5px] font-medium text-ink-3">最近会话</p>
      <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
        {sessions.loading
          ? [0, 1, 2].map(i => <Skeleton key={i} className="mx-2 my-2.5 h-9" />)
          : sessions.error
            ? <p className="px-3 py-2 text-[12px] text-rose">会话列表加载失败<button type="button" className="ml-2 cursor-pointer underline" onClick={sessions.reload}>重试</button></p>
            : !sessions.data?.sessions.length
                ? <p className="px-3 py-2 text-[12px] leading-relaxed text-ink-3">还没有会话。提一个问题，答案会标出依据的材料。</p>
                : sessions.data.sessions.map(s => (
                    <div key={s.conversationId} className={cn('group relative flex items-center rounded-xl transition-colors', s.conversationId === convId ? 'bg-glass-3 ring-1 ring-line-strong' : 'hover:bg-hover')}>
                      <button type="button" onClick={() => go(`kb/ask?c=${s.conversationId}`)} className="min-w-0 flex-1 cursor-pointer px-3 py-2 text-left">
                        <p className={cn('truncate text-[13px]', s.conversationId === convId ? 'font-semibold text-ink' : 'text-ink-2')}>{s.latestUserMessage || '新对话'}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{MODE_LABEL[s.chatMode] ?? '问答'} · {fmtTime(s.updatedAt)}</p>
                      </button>
                      <span className="mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Menu items={[{ label: '删除会话', icon: RiDeleteBinLine, danger: true, onSelect: () => setRemoving(s) }]} />
                      </span>
                    </div>
                  ))}
      </div>
    </>
  )

  return (
    <KbShell view="ask" go={go} aside={aside}>
      {/* 范围选择 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <Segmented<ScopeMode> size="small" aria-label="提问范围" value={scope.mode} onValueChange={mode => !locked && setScope(s => ({ ...s, mode }))} options={SCOPE_OPTIONS} />
        {scope.mode === 'kb' && <Select size="sm" className="w-[220px]" disabled={locked} value={scope.kb} onValueChange={kb => setScope(s => ({ ...s, kb }))} placeholder="选择知识库" options={(libs.data ?? []).map(l => ({ value: l.id, label: l.baseName }))} />}
        {scope.mode === 'doc' && <Select size="sm" className="w-[300px]" disabled={locked} value={scope.doc} onValueChange={doc => setScope(s => ({ ...s, doc }))} placeholder={docs.loading ? '正在加载材料…' : '选择一份材料'} options={docOptions} />}
        <span className="text-[12px] text-ink-3">{locked ? '范围在会话开始后固定，换范围请新建对话' : scopeHint}</span>
      </div>

      {/* 对话应用 */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[820px] px-6 pt-8 pb-10">
          {loadingConv
            ? <div className="space-y-6">{[0, 1].map(i => <div key={i} className="space-y-3"><Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" /><Skeleton className="h-20 w-4/5 rounded-2xl" /></div>)}</div>
            : msgs.length === 0
              ? (
                  <div className="flex flex-col items-center pt-[8vh] text-center">
                    <Avatar src={ASSISTANT_AVATAR} size={64} ring />
                    <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.03em]">问材料</h1>
                    <p className="mt-2 text-[14px] text-ink-2">{scopeHint}，每个结论都标出处。</p>
                    <div className="mt-7 flex max-w-[640px] flex-wrap justify-center gap-2">
                      {SUGGESTIONS[scope.mode].map(s => (
                        <button key={s} type="button" onClick={() => send(s)} className="glass-2 h-9 cursor-pointer rounded-full px-4 text-[13px] text-ink-2 transition-[border-color,color] hover:border-line-strong hover:text-ink">{s}</button>
                      ))}
                    </div>
                  </div>
                )
              : <div className="space-y-8">{msgs.map(m => <AskTurn key={m.id} msg={m} go={go} />)}</div>}
        </div>
      </div>

      {/* 输入框 */}
      <div className="px-6 pb-5">
        <div className="mx-auto max-w-[820px]">
          {error && <div className="mb-2"><ErrorBar error={error} /></div>}
          <div className="glass-3 flex items-end gap-2 rounded-[24px] p-2 pl-4 shadow-float focus-within:border-volt focus-within:shadow-glow-volt">
            <RiChat3Line className="mb-3 size-4 shrink-0 text-ink-3" />
            <textarea
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder="问点什么，Enter 发送，Shift + Enter 换行"
              aria-label="输入问题"
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[14.5px] text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
            />
            {streaming
              ? <Button variant="secondary" size="icon" aria-label="停止生成" onClick={stop}><RiStopFill className="size-4" /></Button>
              : <Button variant="primary" size="icon" aria-label="发送" disabled={!input.trim() || loadingConv} onClick={() => send(input)}><RiArrowUpLine className="size-[18px]" /></Button>}
          </div>
          <p className="mt-2 text-center text-[11.5px] text-ink-3">回答只依据你有权查看的材料；对外引用前请核对原文和使用范围。</p>
        </div>
      </div>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={o => !o && setRemoving(null)}
        title="删除这个会话？"
        description="会话里的问答记录会被清除，运行中的回答会一并停止。"
        confirmText="删除"
        danger
        onConfirm={confirmRemove}
      />
    </KbShell>
  )
}
