import { InlineReview } from '@/components/inline-review'
import { ApiError } from '@/api/http'
import { AssistantReply } from '@/components/assistant-reply'
import { RiArrowUpLine, RiEditBoxLine, RiHistoryLine, RiSparkling2Line, RiCheckLine, RiCloseLine, RiDownload2Line, RiBookOpenLine, RiAttachment2 } from '@remixicon/react'
import { useEffect, useRef, useState } from 'react'
import { Page, Toolbar } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Avatar, Badge, Panel } from '@/components/ui/primitives'
import { Drawer } from '@/components/ui/drawer'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { me } from '@/data'
import { choosePersonalWorkspace, loadPersonal, sendPersonal, personalResources, listPersonalSessions, getPersonalSession, downloadPersonalFile, previewPersonalFile, updatePersonalSession, deletePersonalSession, deleteAllPersonalSessions } from '@/api/personal'
import type { PersonalState, PersonalTurn, PersonalSession, Resource, PersonalFile } from '@/api/personal'

export function AssistantToolbar({ tab, go, onNew, onHistory }: { tab: 'assistant' | 'config', go: (r: 'assistant' | 'config') => void, onNew?: () => void, onHistory?: () => void }) {
  return <Toolbar><Avatar src={me.avatar} size={34} ring /><div className="leading-tight"><p className="text-[15px] font-semibold">我的助手</p><p className="mt-1 text-xs text-ink-3">个人工作空间</p></div><div className="absolute left-1/2 -translate-x-1/2"><Segmented value={tab} onValueChange={go} aria-label="助手视图" options={[{ value: 'assistant', label: '对话' }, { value: 'config', label: '配置' }]} /></div><div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="small" onClick={() => { if (onHistory) onHistory(); else { sessionStorage.setItem('rx-open-history', '1'); go('assistant') } }}><RiHistoryLine className="size-4" />历史对话</Button><Button variant="secondary" size="small" onClick={() => onNew ? onNew() : go('assistant')}><RiEditBoxLine className="size-4" />新对话</Button></div></Toolbar>
}
const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} 秒`
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
export default function Assistant({ go, initialSessionId }: { go: (r: string) => void; initialSessionId?: string }) {
  const [initial, setInitial] = useState<PersonalState>()
  const [loadError, setLoadError] = useState('')
  useEffect(() => { let cancelled = false; loadPersonal().then(s => {
    if (!s.scope?.account_id || !s.scope?.tenant_id) throw new Error('个人助手身份信息不完整，请刷新后重试')
    if (!cancelled) setInitial(s)
  }).catch(e => { if (!cancelled) setLoadError(e.message) }); return () => { cancelled = true } }, [])
  if (!initial) return <Page><AssistantToolbar tab="assistant" go={go} /><p className="p-8 text-sm text-ink-3">{loadError || '正在加载个人助手…'}</p></Page>
  return <AssistantSession key={`${initial.scope!.account_id}:${initial.scope!.tenant_id}`} initial={initial} go={go} initialSessionId={initialSessionId} />
}
function AssistantSession({ initial, go, initialSessionId }: { initial: PersonalState, go: (r: string) => void; initialSessionId?: string }) {
  const scope = `${initial.scope!.account_id}:${initial.scope!.tenant_id}`
  const ACTIVE_SESSION_KEY = `rx-personal-active-session:${scope}`
  const WORKSPACE_KEY = `rx-draft-workspace:${scope}`
  const [workspace, setWorkspace] = useState(sessionStorage.getItem(WORKSPACE_KEY) || '')
  const [choosingWorkspace, setChoosingWorkspace] = useState(false)
  const selectWorkspace = async () => { const active = sessionStorage.getItem(ACTIVE_SESSION_KEY); setChoosingWorkspace(true); try { const r = await choosePersonalWorkspace(); if (active !== sessionStorage.getItem(ACTIVE_SESSION_KEY)) return; if (r.workspacePath) { setWorkspace(r.workspacePath); sessionStorage.setItem(WORKSPACE_KEY, r.workspacePath) } } catch (e) { setError(e instanceof Error ? e.message : '无法选择文件夹') } finally { setChoosingWorkspace(false) } }
  const [state, setState] = useState<PersonalState>()
  const [kbs, setKbs] = useState<Resource[]>([])
  const [error, setError] = useState(''), [input, setInput] = useState('')
  const [busy, setBusy] = useState(false), [elapsed, setElapsed] = useState(0)
  const [sessionId, setSessionId] = useState<string>(), [canContinue, setCanContinue] = useState(true)
  const [turns, setTurns] = useState<PersonalTurn[]>([])
  const [history, setHistory] = useState(false), [historyBusy, setHistoryBusy] = useState(false), [historyError, setHistoryError] = useState('')
  const [sessions, setSessions] = useState<PersonalSession[]>([]), [more, setMore] = useState(false), [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState('')
  const previewRequest = useRef(0)
  const [preview, setPreview] = useState<{name: string, url: string, kind: string, text?: string}>()
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview])
  const openPreview = async (id: string, name: string) => {
    if (!sessionId) return
    const ticket = ++previewRequest.current
    setDownloading(id); setError(''); setPreview({name, kind: 'loading', url: ''})
    try {
      const ext = name.split('.').pop()?.toLowerCase() || ''
      const office = /^(pptx?|odp|docx?|odt|rtf|xlsx?|ods)$/.test(ext)
      const blob = await (office ? previewPersonalFile(sessionId, id) : downloadPersonalFile(sessionId, id))
      if (ticket !== previewRequest.current) return
      const mime: Record<string, string> = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',html:'text/html',htm:'text/html',mp3:'audio/mpeg',mp4:'video/mp4'}
      const kind = office ? 'application/pdf' : mime[ext] || (/^(txt|md|json|csv|js|ts|py|css|xml|log|yaml|yml)$/.test(ext) ? 'text/plain' : 'unsupported')
      setPreview({name, kind, url: URL.createObjectURL(new Blob([blob], {type: kind})), text: kind === 'text/plain' ? (await blob.text()).slice(0, 200000) : undefined})
    } catch (e) { if (ticket === previewRequest.current) setPreview({name, kind: 'error', url: '', text: e instanceof Error ? e.message : '预览失败'}) } finally {setDownloading('')}
  }
  const [confirmAction, setConfirmAction] = useState<PersonalSession>()
  const [clearConfirm, setClearConfirm] = useState(false), [clearing, setClearing] = useState(false)
  const [renameTarget, setRenameTarget] = useState<PersonalSession>()
  const [renameValue, setRenameValue] = useState('')
  const [files, setFiles] = useState<PersonalFile[]>([])
  const scroll = useRef<HTMLDivElement>(null), inFlight = useRef(false), activeRequest = useRef<string | undefined>(undefined)
  const followLatest = useRef(true)
  const content = useRef<HTMLDivElement>(null)
  const expectedTurns = useRef(new Map<string, number>())
  const loadHistory = async (append = false) => { setHistoryBusy(true); setHistoryError(''); try { const r = await listPersonalSessions(append ? sessions.length : 0); setSessions(x => append ? [...x, ...r.data] : r.data); setMore(r.has_more) } catch (e) { setHistoryError(e instanceof Error ? e.message : '历史对话加载失败') } finally { setHistoryBusy(false) } }
  const openHistory = () => { setHistory(true); setSearch(''); void loadHistory() }
  useEffect(() => {
    sessionStorage.removeItem('rx-personal-pending')
    // Legacy keys were shared by every account; never migrate their values.
    sessionStorage.removeItem('rx-personal-active-session')
    sessionStorage.removeItem('rx-draft-workspace')
    Promise.resolve(initial).then(s => {
      setState(s); personalResources().then(r => setKbs(r.kb.filter(k => s.config.kb.includes(k.id)))).catch(() => {})
      if (initialSessionId) sessionStorage.setItem(ACTIVE_SESSION_KEY, initialSessionId)
      const active = sessionStorage.getItem(ACTIVE_SESSION_KEY)
      if (active && active !== 'new') { setSessionId(active); getPersonalSession(active).then(detail => { if (sessionStorage.getItem(ACTIVE_SESSION_KEY) !== active) return; setWorkspace(detail.workspace_path || ''); setTurns(detail.turns); setBusy(detail.run_state === 'running'); setCanContinue(detail.can_continue) }).catch(e => { if (sessionStorage.getItem(ACTIVE_SESSION_KEY) !== active) return; if (e instanceof ApiError && e.status === 404) reset(); else setError(e.message) }) }
      else if (!active) listPersonalSessions().then(r => { if (r.data[0] && !sessionStorage.getItem(ACTIVE_SESSION_KEY)) void restore(r.data[0].session_id) }).catch(() => {})
    }).catch(e => setError(e.message)); if (sessionStorage.getItem('rx-open-history')) { sessionStorage.removeItem('rx-open-history'); openHistory() }
  }, [])
  useEffect(() => {
    if (!sessionId) return
    let stopped = false
    const poll = async () => {
      try {
        const detail = await getPersonalSession(sessionId)
        if (stopped || sessionStorage.getItem(ACTIVE_SESSION_KEY) !== sessionId) return
        if (detail.turns.length < (expectedTurns.current.get(sessionId) || 0)) return
        expectedTurns.current.delete(sessionId)
        setWorkspace(detail.workspace_path || ''); setTurns(detail.turns); setBusy(detail.run_state === 'running'); setCanContinue(detail.can_continue)
      } catch (e) { if (!stopped && sessionStorage.getItem(ACTIVE_SESSION_KEY) === sessionId && e instanceof ApiError && e.status === 404 && !inFlight.current) reset() }
    }
    const timer = window.setInterval(poll, 2000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [sessionId])
  useEffect(() => {
    if (!history) return
    const timer = window.setInterval(() => { void listPersonalSessions().then(r => { setSessions(r.data); setMore(r.has_more) }).catch(() => {}) }, 2500)
    return () => window.clearInterval(timer)
  }, [history])
  // Polling replaces message objects; it must never move a reader viewing history.
  useEffect(() => {
    const viewport = scroll.current, body = content.current
    if (!viewport || !body) return
    const observer = new ResizeObserver(() => {
      if (followLatest.current) viewport.scrollTop = viewport.scrollHeight
    })
    observer.observe(body)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (followLatest.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [turns, busy])
  useEffect(() => { if (!busy) return; const started = Date.now(); setElapsed(0); const timer = setInterval(() => setElapsed(Date.now() - started), 1000); return () => clearInterval(timer) }, [busy])
  const ready = !!state?.revision && state.revision === state.applied_revision && canContinue && !historyBusy
  const reset = () => { followLatest.current = true; activeRequest.current = undefined; inFlight.current = false; setBusy(false); setTurns([]); setWorkspace(''); sessionStorage.removeItem(WORKSPACE_KEY); setSessionId(undefined); sessionStorage.setItem(ACTIVE_SESSION_KEY, 'new'); setCanContinue(true); setError(''); setInput(''); setFiles([]) }
  const restore = async (id: string) => { activeRequest.current = undefined; inFlight.current = false; setHistoryBusy(true); setHistoryError(''); sessionStorage.setItem(ACTIVE_SESSION_KEY, id); try { const r = await getPersonalSession(id); if (sessionStorage.getItem(ACTIVE_SESSION_KEY) !== id) return; setSessionId(id); sessionStorage.setItem(ACTIVE_SESSION_KEY, id); followLatest.current = true; setWorkspace(r.workspace_path || ''); setTurns(r.turns); setBusy(r.run_state === 'running'); setCanContinue(r.can_continue); setHistory(false); setError(''); setInput('') } catch (e) { if (sessionStorage.getItem(ACTIVE_SESSION_KEY) !== id) return; if (e instanceof ApiError && e.status === 404) { reset(); setHistoryError('这条对话已删除或不属于当前账号，请选择其他对话。'); void loadHistory() } else setHistoryError(e instanceof Error ? e.message : '无法读取对话') } finally { setHistoryBusy(false) } }
  const rename = (s: PersonalSession) => { setRenameTarget(s); setRenameValue(s.title || '历史对话') }
  const saveRename = async () => { const s = renameTarget; const title = renameValue.trim(); if (!s || !title) return; try { await updatePersonalSession(s.session_id, { title }); setRenameTarget(undefined); await loadHistory() } catch (e) { setHistoryError(e instanceof Error ? e.message : '修改名称失败') } }
  const remove = async (s: PersonalSession) => { try { await deletePersonalSession(s.session_id); setConfirmAction(undefined); if (s.session_id === sessionId) reset(); await loadHistory() } catch (e) { setHistoryError(e instanceof Error ? e.message : '删除失败') } }
  const clearHistory = async () => {
    if (clearing) return
    setClearing(true); setHistoryError('')
    try { await deleteAllPersonalSessions(); setSessions([]); setMore(false); reset(); setClearConfirm(false) }
    catch (e) { setHistoryError(e instanceof Error ? e.message : '删除失败') }
    finally { setClearing(false) }
  }
  const send = async (text = input) => {
    if (!text.trim() || inFlight.current || busy || !ready) return
    const requestId = crypto.randomUUID()
    const targetId = sessionId || crypto.randomUUID()
    followLatest.current = true
    activeRequest.current = requestId; inFlight.current = true
    expectedTurns.current.set(targetId, turns.length + 1)
    setSessionId(targetId); sessionStorage.setItem(ACTIVE_SESSION_KEY, targetId)
    setBusy(true); setError(''); setInput(''); setTurns(t => [...t, { q: text, a: '', status: 'running' }])
    const attachments = files; setFiles([])
    try {
      const r = await sendPersonal(text, sessionId, attachments, sessionId ? undefined : targetId, workspace)
      if (activeRequest.current !== requestId) return
      const detail = await getPersonalSession(targetId)
      if (activeRequest.current !== requestId) return
      setWorkspace(detail.workspace_path || ''); setTurns(detail.turns); setBusy(detail.run_state === 'running')
      if (r.finishReason === 'error') setError('本次执行未完成，请查看回复中的原因。')
    } catch (e) {
      if (activeRequest.current !== requestId) return
      try {
        const detail = await getPersonalSession(targetId)
        if (activeRequest.current !== requestId) return
        setWorkspace(detail.workspace_path || ''); setTurns(detail.turns); setBusy(detail.run_state === 'running')
        if (detail.run_state !== 'running') setError(e instanceof Error ? e.message : '请求失败')
      } catch { if (activeRequest.current === requestId) { setBusy(false); setError(e instanceof Error ? e.message : '请求失败'); setSessionId(sessionId); if (sessionId) sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId); else sessionStorage.setItem(ACTIVE_SESSION_KEY, 'new') } }
    } finally { if (activeRequest.current === requestId) inFlight.current = false }
  }
  const download = async (id: string, name: string) => { if (!sessionId) return; setDownloading(id); try { const blob = await downloadPersonalFile(sessionId, id); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch (e) { setError(e instanceof Error ? e.message : '下载失败') } finally { setDownloading('') } }
  return <Page><Dialog open={!!preview} onOpenChange={o => { if (!o) { previewRequest.current++; setPreview(undefined) } }} title={preview?.name || '文件预览'} size="xl">
      {preview && (preview.kind === 'loading' ? <p role="status" className="py-12 text-center text-sm text-ink-2">正在准备预览，文档转换可能需要一些时间…</p> : preview.kind === 'error' ? <p role="alert" className="py-8 text-sm text-ink-2">{preview.text}</p> : preview.kind.startsWith('image/') ? <img className="mx-auto max-h-[65vh] object-contain" src={preview.url} alt={preview.name} /> : preview.kind === 'application/pdf' || preview.kind === 'text/html' ? <iframe title={preview.name} sandbox={preview.kind === 'text/html' ? 'allow-scripts' : undefined} referrerPolicy="no-referrer" src={preview.url} className="h-[65vh] w-full rounded-xl bg-white" /> : preview.kind === 'text/plain' ? <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap text-sm">{preview.text}</pre> : preview.kind.startsWith('video/') ? <video controls src={preview.url} className="w-full" /> : preview.kind.startsWith('audio/') ? <audio controls src={preview.url} /> : <p className="py-8 text-sm text-ink-2">此格式暂不支持在线预览，请下载后使用对应应用打开。</p>)}
    </Dialog><AssistantToolbar tab="assistant" go={go} onNew={reset} onHistory={openHistory} />
    <div ref={scroll} onScroll={e => { const el = e.currentTarget; followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48 }} onWheel={e => { if (e.deltaY < 0) followLatest.current = false }} className="mt-16 min-h-0 flex-1 overflow-auto overscroll-contain pt-5 pb-6"><div ref={content} className="mx-auto max-w-[820px] space-y-9 px-8">
      {!turns.length && <div className="pt-20 text-center"><div className="mb-5 flex justify-center"><Avatar src={me.avatar} size={64} /></div><h1 className="text-2xl font-semibold">今天一起完成什么？</h1><p className="mt-3 text-sm text-ink-3">整理资料、分析问题、制作内容，使用已关联的 Skill 和工具推进工作。</p>{state && !ready && <Button className="mt-6" onClick={() => go('config')}>配置并启用我的助手</Button>}</div>}
      {turns.map((t, i) => { const running = busy && i === turns.length - 1; const steps = t.steps?.length ? t.steps : t.duration ? [{ label: '完成模型回复', status: 'done', duration: t.duration }] : []; return <div key={i} className="space-y-7"><div className="ml-auto w-fit max-w-[85%] rounded-[24px] rounded-br-md border border-volt/45 bg-volt-soft px-5 py-3 text-[15px] leading-7 whitespace-pre-wrap shadow-[0_0_34px_-10px_var(--volt)]">{t.q}</div><div className="flex items-start gap-4"><Avatar src={me.avatar} size={40} /><div className="min-w-0 flex-1"><p className="mb-3 flex items-center gap-3 text-sm"><b>{state?.config.name || '我的助手'}</b><span className="text-ink-2">{running ? `正在执行 · ${seconds(elapsed)}` : t.duration ? `用时 ${seconds(t.duration)}` : ''}</span></p>{(running || steps.length > 0) && <Panel level={2} radius="lg" className="mb-6 p-5"><p className="mb-4 flex items-center gap-2 text-sm font-semibold"><RiSparkling2Line className="size-5 text-volt-text" />执行过程</p><ol className="space-y-3">{running ? <li className="flex items-center gap-3 text-sm text-ink-2"><i className="size-4 animate-pulse rounded-full border border-volt bg-volt-soft shadow-glow-volt" />正在处理请求<span className="ml-auto text-xs text-ink-3">{seconds(elapsed)}</span></li> : steps.map((step, j) => <li key={j} className="flex items-center gap-3 text-sm"><span className={step.status === 'done' ? 'grid size-5 shrink-0 place-items-center rounded-full bg-volt text-volt-ink shadow-glow-volt' : 'grid size-5 shrink-0 place-items-center rounded-full border border-line text-ink-3'}>{step.status === 'done' ? <RiCheckLine className="size-3" /> : step.status === 'error' ? <RiCloseLine className="size-3" /> : '·'}</span><span>{/codex/i.test(step.label) ? '请求处理结束' : step.label}</span><span className="ml-auto shrink-0 text-xs text-ink-3">{step.status === 'error' ? '未完成' : step.status === 'unknown' ? '状态未确认' : step.duration != null ? seconds(step.duration) : ''}</span></li>)}</ol></Panel>}{t.a ? <AssistantReply text={t.review_id ? t.a.replace('**已提交待我审核，等待你的决定后继续。**', '') : t.a} artifacts={t.artifacts} onPreview={openPreview} /> : !running && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-700">本次请求未完成，未收到助手回复。请查看下方具体错误，恢复连接后重试。</p>}{t.review_id && <InlineReview id={t.review_id}/>}{t.artifacts?.length ? <Panel level={2} radius="lg" className="mt-5 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="font-semibold">已生成文件</p><p className="mt-1 text-xs text-ink-3">{t.artifacts.length} 个文件已完成，可预览或下载</p></div><Badge tone="cyan">交付物</Badge></div><div className="divide-y divide-line/70">{t.artifacts.map(file => <div key={file.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-volt-soft text-[10px] font-bold text-volt-text">{file.name.split('.').pop()?.toUpperCase().slice(0, 4)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="mt-0.5 text-xs text-ink-3">{size(file.size)} · {file.sync_error ? '云端同步未完成' : file.cloud_saved || file.data !== undefined ? '已保存到云端' : '历史附件'}</p></div><Button size="small" variant="ghost" disabled={!!downloading} onClick={() => openPreview(file.id, file.name)}>预览</Button><Button size="small" variant="outline" disabled={!!downloading} onClick={() => download(file.id, file.name)}><RiDownload2Line className="size-4" />{downloading === file.id ? '下载中' : '下载'}</Button></div>)}</div></Panel> : null}</div></div></div> })}
      {!canContinue && <p className="rounded-xl border border-line p-4 text-sm text-ink-2">该对话使用旧版配置，可查看记录。请点击“新对话”使用当前配置。</p>}{sessionId && !turns.length && <p className="text-center text-sm text-ink-3">此会话暂未恢复到可显示的消息。</p>}
      {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">{error}</div>}
      {state && !state.config.executionEnabled && <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">当前未开启工作区执行权限，只能进行文字回答。要生成 HTML、PPT、文档或运行代码，请到「配置」开启“工作区命令执行”并重新应用。</p>}
    </div></div>
    <div className="shrink-0 px-8 pt-2 pb-3"><div className="pointer-events-auto mx-auto max-w-[680px]"><div className="glass-3 rounded-[20px] border border-volt/60 px-3 py-2 shadow-[0_0_30px_-12px_var(--volt)] transition-shadow focus-within:shadow-glow-volt">{files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map(f => <Badge key={f.name} tone="cyan"><RiAttachment2 className="size-3.5" />{f.name}</Badge>)}</div>}<div className="mb-1 flex items-center gap-2 border-b border-line pb-1"><Button size="small" variant="ghost" disabled={busy || !!sessionId || choosingWorkspace} onClick={() => void selectWorkspace()}><RiBookOpenLine className="size-4" />{choosingWorkspace ? '请在本机选择文件夹…' : workspace ? '本机工作区' : '选择本机文件夹'}</Button><span title={workspace || state?.config.workspacePath} className="min-w-0 truncate text-xs text-ink-3">{workspace || (state?.config.workspacePath ? `默认：${state.config.workspacePath}` : '未选择时自动分配目录')}</span>{sessionId && <span className="shrink-0 text-xs text-ink-3">已绑定此对话</span>}</div><textarea rows={1} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} aria-label="给助手发消息" placeholder={busy ? '助手正在执行当前任务，请稍候…' : ready ? '让助手帮你做点什么，或者让它记住一条工作经验' : '请先在配置页保存并应用助手配置'} className="block h-9 min-h-9 w-full resize-none bg-transparent py-1 text-[15px] outline-none placeholder:text-ink-3" /><div className="mt-1 flex flex-wrap items-center gap-2"><label className="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs text-ink-3 hover:text-ink"><RiAttachment2 className="size-4" />添加文件<input aria-label="上传附件" className="hidden" type="file" multiple disabled={!ready || busy} onChange={async e => { const selected = Array.from(e.target.files || []); const encoded: PersonalFile[] = []; for (const file of selected.slice(0, 5)) { if (file.size > 10 * 1024 * 1024) { setError('单个文件不能超过 10 MB'); continue } encoded.push({ name: file.name, data: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }) }) } setFiles(old => [...old.filter(x => !encoded.some(y => y.name === x.name)), ...encoded]); e.currentTarget.value = '' }} /></label>{kbs.map(k => <Badge key={k.id} tone="cyan"><RiBookOpenLine className="size-3.5" />{k.name}</Badge>)}<span className="ml-auto text-xs text-ink-3">Enter 发送，Shift + Enter 换行</span><Button aria-label="发送" size="icon" disabled={!ready || busy || !input.trim()} onClick={() => send()}><RiArrowUpLine className="size-5" /></Button></div></div></div></div>
    <Drawer open={history} onClose={() => setHistory(false)} title={<div><p className="text-[17px] font-semibold">历史对话</p><p className="mt-1 text-[12.5px] text-ink-3">选择一条继续，或管理名称。</p></div>}><div className="mb-3 flex justify-end"><Button size="small" variant="ghost" className="text-red-300" disabled={historyBusy || clearing || !sessions.length || busy} onClick={() => setClearConfirm(true)}>一键删除全部</Button></div><input aria-label="搜索历史对话" placeholder="搜索对话标题" value={search} onChange={e => setSearch(e.target.value)} className="mb-4 w-full rounded-xl border border-line bg-hover p-3 text-sm outline-none focus:border-volt" />{historyError && <p role="alert" className="mb-3 text-sm text-red-300">{historyError}<button className="ml-2 underline" onClick={() => loadHistory()}>重试</button></p>}<div className="space-y-2">{sessions.filter(s => (s.title || '历史对话').toLowerCase().includes(search.toLowerCase())).map(s => <div key={s.session_id} className="group flex items-center gap-3 rounded-2xl border border-line p-4 hover:bg-hover"><button disabled={historyBusy} onClick={() => restore(s.session_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"><RiHistoryLine className="size-5 shrink-0 text-ink-3" /><div className="min-w-0"><p className="truncate text-sm font-medium">{s.title || '历史对话'}</p><p className="mt-1 text-xs text-ink-3">{new Date(s.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · {s.run_state === 'running' ? '正在执行中' : s.run_state === 'failed' ? '执行未完成' : '已执行完毕'}</p></div>{s.session_id === sessionId && <Badge tone="mint" className="ml-auto">当前</Badge>}</button><div className="hidden shrink-0 items-center gap-1 group-hover:flex"><Button size="small" variant="ghost" onClick={() => rename(s)}>改名</Button><Button size="small" variant="ghost" className="text-red-300" onClick={() => setConfirmAction(s)}>删除</Button></div></div>)}</div>{historyBusy && <p className="py-6 text-center text-sm text-ink-3">正在加载…</p>}{!historyBusy && !sessions.length && !historyError && <p className="py-8 text-center text-sm text-ink-3">还没有历史对话，发送第一条消息开始。</p>}{more && <Button disabled={historyBusy} className="mt-4" variant="secondary" onClick={() => loadHistory(true)}>加载更多</Button>}</Drawer>
    <ConfirmDialog open={clearConfirm} onOpenChange={setClearConfirm} title="删除全部历史对话" description="删除本账号的全部历史对话（包括未加载的记录），仅从界面移除，数据库保留。其他账号不受影响。" confirmText="删除全部" danger loading={clearing} onConfirm={() => void clearHistory()} />
    <ConfirmDialog open={!!confirmAction} onOpenChange={open => !open && setConfirmAction(undefined)} title="删除历史对话" description="删除后会从界面和历史列表中移除，但数据库仍保留历史记录。确定删除这条对话吗？" confirmText="确认删除" danger onConfirm={() => confirmAction && void remove(confirmAction)} />
    <Dialog open={!!renameTarget} onOpenChange={open => !open && setRenameTarget(undefined)} title="修改对话名称" description="名称只影响你的历史对话列表。" size="sm" footer={<><Button variant="ghost" onClick={() => setRenameTarget(undefined)}>取消</Button><Button variant="primary" disabled={!renameValue.trim()} onClick={() => void saveRename()}>保存</Button></>}><input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void saveRename() }} className="w-full rounded-xl border border-line bg-hover p-3 text-sm outline-none focus:border-volt" placeholder="输入对话名称" /></Dialog>
  </Page>
}
