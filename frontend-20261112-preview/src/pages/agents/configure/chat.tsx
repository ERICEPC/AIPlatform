import type { AgentDetail, AgentSoul, SandboxCaller } from '@/api/agents'
import { ApiError, type StreamEvent } from '@/api/http'
import { RiAddCircleLine, RiArrowUpLine, RiAttachment2, RiChat3Line, RiCloseLine, RiFolder3Line, RiHammerLine, RiMicLine, RiRefreshLine, RiSparkling2Line, RiStopFill, RiToggleLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { applyBuildDraft, audioToText, checkoutBuildDraft, discardBuildDraft, finalizeBuildChat, getSuggestedQuestions, refreshDebugConversation, stopChat, streamChat, uploadFile } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { AssistantReply } from '@/components/assistant-reply'
import { ConfirmDialog } from '@/components/ui/dialog'
import { TypingDots } from '@/components/ui/effects'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { AgentIcon, errText } from '../shared'
import { SECTION_LABEL, useConfig } from './context'
import { FeaturesDrawer, WorkspaceDrawer } from './drawers'

type Mode = 'build' | 'preview'
type Msg = { id: string, role: 'user' | 'assistant', text: string, streaming?: boolean, error?: string, messageId?: string, taskId?: string, suggestions?: string[], query?: string }

const SECTION_ANCHOR: Record<string, string> = { model: 'sec-model', prompt: 'sec-prompt', config_skills: 'sec-skills', config_files: 'sec-files', tools: 'sec-tools', knowledge: 'sec-knowledge', env: 'sec-advanced', app_features: 'sec-prompt' }

function ChatPending({ knowledge }: { knowledge: boolean }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <div role="status" className="flex flex-col gap-1.5 text-ink-3"><span className="flex items-center gap-2"><TypingDots />{knowledge ? '正在检索知识库并生成回答' : '正在生成回答'} · {elapsed} 秒</span></div>
}

export function ChatPane({ agent, build, onBuildChange, onApplied }: { agent: AgentDetail, build: AgentSoul | null, onBuildChange: () => Promise<void>, onApplied: () => Promise<void> }) {
  const { agentId, soul, changed, flush } = useConfig()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('build')
  const [msgs, setMsgs] = useState<Record<Mode, Msg[]>>({ build: [], preview: [] })
  const [conv, setConv] = useState<Record<Mode, string | null>>({ build: null, preview: null })
  const [draftId, setDraftId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<{ id: string, name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [drawer, setDrawer] = useState<'workspace' | 'features' | null>(null)
  const [recording, setRecording] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const f = soul.app_features ?? {}
  const list = msgs[mode]
  const streaming = list.some(m => m.streaming)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [list])

  const patch = (m: Mode, id: string, p: Partial<Msg> | ((x: Msg) => Partial<Msg>)) => setMsgs(s => ({ ...s, [m]: s[m].map(x => (x.id === id ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)) }))

  const send = async (q = text, opts: { regenerate?: boolean } = {}) => {
    const query = q.trim()
    if (!query || streaming || busy)
      return
    const m = mode
    const uid = `u-${Date.now()}`
    const aid = `a-${Date.now()}`
    setMsgs(s => ({ ...s, [m]: [...(opts.regenerate ? s[m].slice(0, -1) : [...s[m], { id: uid, role: 'user' as const, text: query }]), { id: aid, role: 'assistant' as const, text: '', streaming: true, query }] }))
    setText('')
    const attach = files
    setFiles([])
    const ctrl = new AbortController()
    abort.current = ctrl
    let mid = ''
    let receivedAgentMessage = false
    let finalAnswer = ''
    let completed = false
    try {
      await flush()
      if (m === 'build') {
        const d = await checkoutBuildDraft(agentId)
        setDraftId(d.draft.id)
        await onBuildChange()
      }
      const run = (conversationId: string | null) => streamChat(agentId, {
        query,
        conversation_id: conversationId,
        inputs: {},
        files: attach.map(x => ({ type: 'document', transfer_method: 'local_file', upload_file_id: x.id })),
        response_mode: 'streaming',
        ...(m === 'build' ? { draft_type: 'debug_build' as const } : {}),
      }, (e: StreamEvent) => {
        if (e.event === 'message_end') completed = true
        if (e.message_id)
          mid = String(e.message_id)
        if (e.event === 'agent_message') receivedAgentMessage = true
        if (e.message_id || e.task_id)
          patch(m, aid, x => ({ messageId: String(e.message_id ?? x.messageId ?? ''), taskId: String(e.task_id ?? x.taskId ?? '') }))
        if (e.event === 'agent_message' || (e.event === 'message' && !receivedAgentMessage))
          patch(m, aid, x => ({ text: x.text + String(e.answer ?? '') }))
        else if (e.event === 'message') {
          // Agent messages are live deltas; message carries the authoritative final answer.
          finalAnswer += String(e.answer ?? '')
          patch(m, aid, { text: finalAnswer })
        }
        else if (e.event === 'message_replace') {
          finalAnswer = String(e.answer ?? '')
          patch(m, aid, { text: finalAnswer })
        }
        if (e.conversation_id)
          setConv(c => ({ ...c, [m]: String(e.conversation_id) }))
        if (e.event === 'error')
          patch(m, aid, { error: String(e.message ?? '生成失败') })
      }, ctrl.signal)
      try {
        await run(conv[m])
      }
      catch (e) {
        // Only a rejected, nonexistent preview conversation is safe to retry.
        // Never replay requests that have started generating or executing tools.
        if (m !== 'preview' || !conv[m] || mid || receivedAgentMessage || completed
          || !(e instanceof ApiError) || e.status !== 404
          || !/Conversation Not Exists/i.test(e.message)) throw e
        setConv(c => ({ ...c, preview: null }))
        toast('原预览会话已失效，已重新开启对话', 'info')
        await run(null)
      }
      if (!completed) throw new Error('连接提前结束，回答未完整接收，请重新生成。')
      patch(m, aid, { streaming: false })
      if (m === 'build')
        await onBuildChange()
      else if (f.suggested_questions_after_answer?.enabled && mid)
        getSuggestedQuestions(agentId, mid).then(r => patch(m, aid, { suggestions: r.data })).catch(() => {})
    }
    catch (e) {
      patch(m, aid, { streaming: false, error: ctrl.signal.aborted ? undefined : errText(e) })
    }
    finally {
      abort.current = null
    }
  }

  const stop = async () => {
    const cur = list.find(x => x.streaming)
    abort.current?.abort()
    if (cur) {
      patch(mode, cur.id, x => ({ streaming: false, text: x.text || '（已停止生成）' }))
      if (cur.taskId)
        stopChat(agentId, cur.taskId).catch(() => {})
    }
  }

  const newChat = async () => {
    setBusy(true)
    try {
      abort.current?.abort()
      if (mode === 'build' && build) {
        await discardBuildDraft(agentId)
        await onBuildChange()
      }
      // This endpoint resets DEBUG_BUILD only. Preview must start without an ID;
      // its own conversation is allocated by the first chat response.
      if (mode === 'build') await refreshDebugConversation(agentId)
      setConv(c => ({ ...c, [mode]: null }))
      setMsgs(s => ({ ...s, [mode]: [] }))
      setDraftId(null)
      setConfirmNew(false)
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setApplying(true)
    try {
      await flush()
      await finalizeBuildChat(agentId)
      await applyBuildDraft(agentId)
      await onApplied()
      await onBuildChange()
      toast('改动已应用到配置')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setApplying(false)
    }
  }
  const discard = async () => {
    setApplying(true)
    try {
      await discardBuildDraft(agentId)
      await onBuildChange()
      toast('已放弃这些改动', 'info')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setApplying(false)
    }
  }

  const voice = async () => {
    if (recording) {
      recorder.current?.stop()
      return
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(media)
      const chunks: Blob[] = []
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = async () => {
        media.getTracks().forEach(t => t.stop())
        setRecording(false)
        try {
          const r = await audioToText(agentId, new Blob(chunks, { type: 'audio/webm' }))
          setText(x => (x ? `${x} ${r.text}` : r.text))
        }
        catch (e) {
          toast(errText(e), 'info')
        }
      }
      recorder.current = rec
      rec.start()
      setRecording(true)
    }
    catch {
      toast('无法使用麦克风，请在浏览器设置里允许访问', 'info')
    }
  }

  const attach = async (fl: FileList) => {
    const limit = f.file_upload?.number_limits ?? 3
    for (const file of Array.from(fl).slice(0, Math.max(0, limit - files.length))) {
      try {
        const up = await uploadFile(file)
        setFiles(x => [...x, { id: up.id, name: up.name }])
      }
      catch (e) {
        toast(errText(e), 'info')
      }
    }
  }

  const caller: SandboxCaller | null = mode === 'build' ? (draftId ? { caller_type: 'build_draft', caller_id: draftId } : null) : (conv.preview ? { caller_type: 'conversation', caller_id: conv.preview } : null)
  const pending = build ? changed.size : 0

  return (
    <div className="glass-2 glass-edge flex h-full flex-col overflow-hidden rounded-[22px]">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Segmented size="small" value={mode} onValueChange={setMode} aria-label="对话模式" options={[{ value: 'build', label: <span className="flex items-center gap-1"><RiHammerLine className="size-3.5" />构建</span> }, { value: 'preview', label: <span className="flex items-center gap-1"><RiChat3Line className="size-3.5" />预览</span> }]} />
        <div className="ml-auto flex items-center gap-0.5">
          <Tip label="新对话"><Button variant="ghost" size="icon-small" aria-label="新对话" loading={busy} onClick={() => (mode === 'build' && (build || list.length) ? setConfirmNew(true) : newChat())}>{!busy && <RiAddCircleLine className="size-4" />}</Button></Tip>
          <Tip label="工作目录"><Button variant="ghost" size="icon-small" aria-label="工作目录" onClick={() => setDrawer('workspace')}><RiFolder3Line className="size-4" /></Button></Tip>
          <Tip label="对话功能"><Button variant="ghost" size="icon-small" aria-label="对话功能" onClick={() => setDrawer('features')}><RiToggleLine className="size-4" /></Button></Tip>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-5">
        {list.length === 0 && mode === 'build' && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-volt-soft text-volt-text shadow-glow-volt"><RiSparkling2Line className="size-6" /></span>
            <p className="mt-4 text-[15px] font-semibold">通过对话构建 Agent</p>
            <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-ink-3">描述你的需求，它会随着对话填写左侧配置。改动先放在草稿里，确认后再应用。</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['帮我写一个售后客服的提示词', '加上查询工单的能力', '回答前先查产品手册'].map(p => <button key={p} type="button" onClick={() => send(p)} className="glass-1 cursor-pointer rounded-full px-3 py-1 text-[12.5px] text-ink-2 hover:text-ink">{p}</button>)}
            </div>
          </div>
        )}
        {list.length === 0 && mode === 'preview' && (
          <div className="flex flex-col items-center pt-8 text-center">
            <AgentIcon agent={agent} size={56} />
            <p className="mt-3 text-[15px] font-semibold">{agent.name}</p>
            {f.opening_statement && <div className="glass-1 mt-4 max-w-[90%] rounded-[20px] px-4 py-2.5 text-left text-[14px] leading-relaxed">{f.opening_statement}</div>}
            {!!f.suggested_questions?.length && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">{f.suggested_questions.filter(Boolean).map(q => <button key={q} type="button" onClick={() => send(q)} className="cursor-pointer rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink">{q}</button>)}</div>
            )}
            {!f.opening_statement && <p className="mt-2 text-[12.5px] text-ink-3">用草稿配置试聊，不计入日志和监控。</p>}
          </div>
        )}
        <AnimatePresence initial={false}>
          {list.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: ease.out }} className={cn('flex gap-2.5', m.role === 'user' && 'justify-end')}>
              {m.role === 'assistant' && (mode === 'build' ? <span className="grid size-7 shrink-0 place-items-center rounded-full bg-volt-soft text-volt-text"><RiHammerLine className="size-3.5" /></span> : <AgentIcon agent={agent} size={28} />)}
              <div className={cn('max-w-[82%]', m.role === 'user' && 'flex flex-col items-end')}>
                <div className={cn('rounded-[18px] px-3.5 py-2.5 text-[13.5px] leading-relaxed', m.role === 'user' ? 'rounded-br-md border border-volt/40 bg-volt-soft whitespace-pre-wrap' : 'glass-1 rounded-tl-md whitespace-normal', m.error && 'border border-rose/40 text-rose')}>
                  {m.streaming && !m.text && !m.error ? <ChatPending knowledge={mode === 'preview' && !!soul.knowledge?.external_sets?.length} /> : m.error ? m.error : m.role === 'user' ? m.text : <AssistantReply text={m.text} onPreview={() => {}} />}
                </div>
                {m.role === 'assistant' && !m.streaming && mode === 'preview' && i === list.length - 1 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Button variant="ghost" size="small" onClick={() => send(m.query ?? '', { regenerate: true })}><RiRefreshLine className="size-3.5" />重新生成</Button>
                    {m.suggestions?.map(s => <button key={s} type="button" onClick={() => send(s)} className="cursor-pointer rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2 hover:bg-hover hover:text-ink">{s}</button>)}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={end} />
      </div>

      <AnimatePresence>
        {mode === 'build' && pending > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mx-3 mb-2 rounded-2xl border border-cyan/40 bg-cyan-soft px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <i className="breathe-dot size-2 rounded-full bg-cyan text-cyan" />
              <p className="text-[13px] font-semibold">{pending} 项变更待应用</p>
              <div className="ml-auto flex gap-1.5">
                <Button variant="ghost" size="small" disabled={applying || streaming} onClick={discard}>放弃</Button>
                <Button variant="primary" size="small" loading={applying} disabled={streaming} onClick={apply}>应用</Button>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[...changed].map(k => <button key={k} type="button" onClick={() => document.getElementById(SECTION_ANCHOR[k])?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="cursor-pointer rounded-md bg-cyan-soft px-1.5 py-0.5 text-[11.5px] text-cyan hover:underline">{SECTION_LABEL[k]}</button>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 pb-3">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">{files.map(x => <span key={x.id} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-[12px]">{x.name}<button type="button" aria-label="移除附件" onClick={() => setFiles(l => l.filter(y => y.id !== x.id))} className="cursor-pointer text-ink-3 hover:text-rose"><RiCloseLine className="size-3.5" /></button></span>)}</div>
        )}
        <form className="glass-3 flex items-end gap-1.5 rounded-[22px] py-1.5 pr-1.5 pl-4 transition-shadow focus-within:shadow-glow-volt" onSubmit={(e) => { e.preventDefault(); send() }}>
          <textarea
            rows={1}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
            placeholder={mode === 'build' ? '描述你想让 Agent 做什么…' : '和 Agent 聊聊，测试草稿配置'}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[13.5px] outline-none [field-sizing:content] placeholder:text-ink-3"
          />
          {mode === 'preview' && f.file_upload?.enabled && (
            <>
              <Tip label="添加附件"><Button variant="ghost" size="icon" aria-label="添加附件" onClick={() => fileInput.current?.click()}><RiAttachment2 className="size-4" /></Button></Tip>
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) attach(e.target.files); e.target.value = '' }} />
            </>
          )}
          {mode === 'preview' && f.speech_to_text?.enabled && (
            <Tip label={recording ? '停止录音' : '语音输入'}><Button variant="ghost" size="icon" aria-label="语音输入" className={cn(recording && 'text-rose')} onClick={voice}><RiMicLine className={cn('size-4', recording && 'breathe-dot')} /></Button></Tip>
          )}
          {streaming
            ? <Button variant="secondary" size="icon" aria-label="停止生成" onClick={stop}><RiStopFill className="size-4" /></Button>
            : <Button type="submit" variant="primary" size="icon" aria-label="发送" disabled={!text.trim()}><RiArrowUpLine className="size-[18px]" /></Button>}
        </form>
      </div>

      <ConfirmDialog open={confirmNew} onOpenChange={setConfirmNew} danger title="清空会话并放弃改动？" description="当前构建对话和还没应用的改动都会被清除，已应用到配置的内容不受影响。" confirmText="清空" loading={busy} onConfirm={newChat} />
      <WorkspaceDrawer open={drawer === 'workspace'} onClose={() => setDrawer(null)} caller={caller} />
      <FeaturesDrawer open={drawer === 'features'} onClose={() => setDrawer(null)} />
    </div>
  )
}
