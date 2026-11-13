import { submitRelease, governance } from '@/api/governance'
import { ReleaseFields, emptyRelease } from '@/components/release-dialog'
import type { AgentCtx } from '../detail'
import type { SaveState } from '.'
import type { ReferencingWorkflow, SnapshotDetail, SnapshotSummary } from '@/api/agents'
import { RiAlertLine, RiArrowLeftSLine, RiCheckboxCircleLine, RiCloseCircleLine, RiGitBranchLine, RiHistoryLine, RiRocket2Line } from '@remixicon/react'
import { useCallback, useEffect, useState } from 'react'
import { getVersion, listReferencingWorkflows, listVersions, restoreVersion } from '@/api/agents'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { Field, Textarea } from '@/components/ui/form'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { me } from '@/data'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { dateTime, errText, fromNow, IconBtn, Row } from '../shared'
import { REF_RE, referenceables, useConfig } from './context'
import { knowledgeIssues } from './knowledge'
import { findModel } from './model'
import { authorized } from './tools'

type Check = { ok: boolean, text: string, block?: boolean }

export function PublishBar({ ctx, save, onRetrySave }: { ctx: AgentCtx, save: SaveState, onRetrySave: () => void }) {
  const { agentId, soul, flush, reload, models, tools } = useConfig()
  const toast = useToast()
  const [latest, setLatest] = useState<SnapshotSummary | null>(null)
  const [dialog, setDialog] = useState(false)
  const [history, setHistory] = useState(false)
  const [checks, setChecks] = useState<Check[]>([])
  const [refs, setRefs] = useState<ReferencingWorkflow[] | null>(null)
  const [releaseOptions,setReleaseOptions]=useState(emptyRelease)
  const [note, setNote] = useState('')
  const [publishing, setPublishing] = useState(false)
  const { publish } = ctx

  const loadLatest = useCallback(() => listVersions(agentId).then(r => setLatest(r.data[0] ?? null)).catch(() => {}), [agentId])
  useEffect(() => {
    loadLatest()
  }, [loadLatest])

  const start = async () => {
    try { await flush() } catch (e) { toast(errText(e), 'info'); return }
    const list: Check[] = []
    const m = soul.model
    const { item } = findModel(models, m?.model_provider, m?.model)
    list.push(!m ? { ok: false, block: true, text: '还没有选择模型' } : item && item.status !== 'active' ? { ok: false, block: true, text: `模型 ${m.model} 当前不可用` } : { ok: true, text: `模型：${m.model}` })
    const unauth = [...new Set((soul.tools?.dify_tools ?? []).filter(t => !authorized(t, tools)).map(t => t.provider_id))]
    list.push(unauth.length ? { ok: false, text: `${unauth.length} 个工具未授权，调用时会失败（${unauth.join('、')}）` } : { ok: true, text: '工具授权正常' })
    const ki = knowledgeIssues(soul.knowledge?.sets ?? [], soul.knowledge?.external_sets ?? [])
    list.push(...(ki.length ? ki.map(t => ({ ok: false, block: true, text: t })) : [{ ok: true, text: ((soul.knowledge?.sets?.length || soul.knowledge?.external_sets?.length) ? '知识检索配置完整' : '未配置知识检索，无需检查') }]))
    if (soul.knowledge?.external_sets?.length) list.push({ ok: true, text: '外部知识库按调用者身份查询；未绑定员工身份的 Web/API 调用将拒绝访问。' })
    const items = referenceables(soul)
    const missing = [...(soul.prompt?.system_prompt ?? '').matchAll(REF_RE)].filter(x => !items.some(i => i.kind === x[1] && i.id === x[2])).map(x => x[3] || x[2])
    if (missing.length)
      list.push({ ok: false, text: `提示词引用了不存在的内容：${[...new Set(missing)].join('、')}` })
    setChecks(list)
    setNote('')
    try {
      const visibility=await governance<{visibility:'private'|'public'|'department';department_ids:string[]}>(`/resource-visibility/agent/${agentId}`)
      setReleaseOptions({...emptyRelease,visibility:visibility.visibility==='public'?'workspace':visibility.visibility,department_ids:visibility.department_ids||[],external_access:ctx.agent.enable_site||ctx.agent.enable_api})
    } catch(e){toast(errText(e),'info');return}
    setRefs(null)
    setDialog(true)
    listReferencingWorkflows(agentId).then(r => setRefs(r.data)).catch(() => setRefs([]))
  }

  const confirm = async () => {
    setPublishing(true)
    try {
      await flush()
      const released=await submitRelease('agent',agentId,'publish',note.trim()||'申请发布新版本',releaseOptions)
      await reload()
      await loadLatest()
      setDialog(false)
      toast(released.state==='approved'?'已发布，Private 无需审批':'已提交发布审批，可在「我的发布」查看进度')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setPublishing(false)
    }
  }

  const blocked = checks.some(c => c.block)
  const status = publishing
    ? <span className="text-ink-2">发布中…</span>
    : save.state === 'saving' || save.state === 'pending'
      ? <span className="text-ink-2">保存中…</span>
      : save.state === 'error'
        ? <span className="text-rose">保存失败{save.error ? `：${save.error}` : ''} · <button type="button" className="cursor-pointer underline" onClick={onRetrySave}>重试</button></span>
        : publish.published
          ? <span><b className="font-medium text-mint">已是最新</b><span className="text-ink-3"> · {fromNow(latest?.created_at)}发布</span></span>
          : publish.everPublished
            ? <span><b className="font-medium text-amber">有未发布的更改</b><span className="text-ink-3"> · {fromNow(save.at)}已保存</span></span>
            : <span><b className="font-medium">草稿</b><span className="text-ink-3"> · {fromNow(save.at)}已保存</span></span>

  return (
    <div className="glass-1 flex h-14 shrink-0 items-center gap-3 border-x-0 border-b-0 px-5">
      <i className={cn('size-2 rounded-full', publish.published ? 'bg-mint' : publish.everPublished ? 'breathe-dot bg-amber text-amber' : 'bg-ink-3')} />
      <p className="text-[13px]">{status}</p>
      {latest && <span className="text-[12px] text-ink-3">当前线上 v{latest.display_version ?? latest.version}</span>}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" onClick={() => setHistory(true)}><RiHistoryLine className="size-4" />版本历史</Button>
        <Button variant="primary" loading={publishing} disabled={publish.published && save.state === 'saved'} onClick={start}><RiRocket2Line className="size-4" />发布</Button>
      </div>

      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="发布智能体"
        description={releaseOptions.visibility==='private'?'Private 发布立即生效，Web 应用和 API 无需审批。':'部门或 Public 共享发布需审批，原线上版本继续服务。'}
        footer={<><Button variant="ghost" onClick={() => setDialog(false)}>取消</Button><Button variant="primary" loading={publishing} disabled={blocked} onClick={confirm}>{blocked ? '先处理上面的问题' : releaseOptions.visibility==='private'?'立即发布':'提交审批'}</Button></>}
      >
        <div className="space-y-5 text-[13px] leading-5">
          <div className="space-y-2 rounded-lg border border-line bg-glass-2 p-3">
            {checks.map((c, i) => (
              <p key={i} className={cn('flex items-start gap-2 text-[13px] leading-5', c.ok ? 'text-ink-2' : c.block ? 'text-rose' : 'text-amber')}>
                {c.ok ? <RiCheckboxCircleLine className="mt-0.5 size-4 shrink-0 text-mint" /> : c.block ? <RiCloseCircleLine className="mt-0.5 size-4 shrink-0" /> : <RiAlertLine className="mt-0.5 size-4 shrink-0" />}
                {c.text}
              </p>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">受影响的应用</p>
            {!refs && <Skeleton className="h-12 rounded-2xl" />}
            {refs?.length === 0 && <p className="rounded-lg border border-line px-3 py-2.5 text-[13px] text-ink-3">没有应用引用这个 Agent。</p>}
            {!!refs?.length && (
              <div className="rounded-2xl border border-amber/40 bg-amber-soft/40 p-1.5">
                {refs.map(w => <Row key={w.workflow_id} icon={w.app_icon ? <img src={asset(w.app_icon)} alt="" className="size-7 rounded-lg" /> : <RiGitBranchLine className="size-4" />} title={w.app_name} sub={`${w.node_ids?.length ?? 1} 个节点引用 · 版本 ${w.workflow_version}`} />)}
              </div>
            )}
          </div>
          <ReleaseFields value={releaseOptions} onChange={setReleaseOptions} agent />
          <Field label="版本说明" hint="写清这次改了什么，方便回溯。">
            <Textarea rows={2} value={note} placeholder="例如：补充退换货政策检索，调低温度" onChange={e => setNote(e.target.value)} />
          </Field>
        </div>
      </Dialog>
      <VersionsDrawer open={history} onClose={() => setHistory(false)} onRestored={async () => { await reload(); await loadLatest() }} />
    </div>
  )
}

function VersionsDrawer({ open, onClose, onRestored }: { open: boolean, onClose: () => void, onRestored: () => Promise<void> }) {
  const { agentId } = useConfig()
  const toast = useToast()
  const [list, setList] = useState<SnapshotSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const [view, setView] = useState<SnapshotDetail | null>(null)
  const [restore, setRestore] = useState<SnapshotSummary | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open)
      return
    setView(null)
    setList(null)
    listVersions(agentId).then(r => setList(r.data)).catch(e => setError(errText(e)))
  }, [open, agentId])

  const shown = (list ?? []).filter(v => filter === 'all' || v.created_by_name === me.owner || v.created_by === me.id)
  const doRestore = async () => {
    if (!restore)
      return
    setBusy(true)
    try {
      await restoreVersion(agentId, restore.id)
      await onRestored()
      toast(`已还原到 v${restore.display_version ?? restore.version}，发布后生效`)
      setRestore(null)
      onClose()
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={<div><p className="text-[17px] font-semibold">版本历史</p><p className="mt-1 text-[13px] text-ink-3">每次发布都会留下一个版本，可以查看或还原</p></div>}>
      {view
        ? <VersionView v={view} onBack={() => setView(null)} onRestore={() => setRestore(view)} />
        : (
            <>
              <Segmented size="small" value={filter} onValueChange={setFilter} options={[{ value: 'all', label: '全部' }, { value: 'mine', label: '只看我的' }]} />
              {error && <p className="mt-3 text-[13px] text-rose">{error}</p>}
              {!list && !error && <div className="mt-3 space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>}
              {list && shown.length === 0 && <p className="py-10 text-center text-[13px] text-ink-3">{list.length ? '没有你发布的版本' : '还没有发布过。发布后，版本会出现在这里。'}</p>}
              <ol className="relative mt-4 space-y-2 pl-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line">
                {shown.map((v, i) => (
                  <li key={v.id} className="relative">
                    <i className={cn('absolute top-4 -left-5 size-[11px] rounded-full border-2 border-[var(--solid)]', i === 0 && filter === 'all' ? 'bg-volt shadow-glow-volt' : 'bg-ink-3')} />
                    <button type="button" onClick={() => getVersion(agentId, v.id).then(setView).catch(e => toast(errText(e), 'info'))} className="w-full cursor-pointer rounded-2xl border border-line p-3 text-left transition-colors hover:bg-hover">
                      <p className="flex items-center gap-2 text-[13.5px] font-semibold">v{v.display_version ?? v.version}{v.id === list?.[0]?.id && <Badge tone="volt">线上</Badge>}</p>
                      <p className="mt-0.5 text-[13px] text-ink-2">{v.version_note || <span className="text-ink-3">没有版本说明</span>}</p>
                      <p className="mt-1 text-[12px] text-ink-3">{v.created_by_name ?? v.created_by} · {dateTime(v.created_at)}</p>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
      <ConfirmDialog open={!!restore} onOpenChange={o => !o && setRestore(null)} title={`还原到 v${restore?.display_version ?? restore?.version}？`} description="当前草稿会被这个版本的配置覆盖。还原后需要重新发布才会在线上生效。" confirmText="还原" loading={busy} onConfirm={doRestore} />
    </Drawer>
  )
}

/** 只读查看某个版本的配置摘要 */
function VersionView({ v, onBack, onRestore }: { v: SnapshotDetail, onBack: () => void, onRestore: () => void }) {
  const s = v.config_snapshot
  const line = (label: string, value: React.ReactNode) => (
    <div className="border-b border-line py-2.5 last:border-b-0">
      <p className="text-[12px] text-ink-3">{label}</p>
      <div className="mt-0.5 text-[13px]">{value || <span className="text-ink-3">无</span>}</div>
    </div>
  )
  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5">
        <IconBtn label="返回" onClick={onBack}><RiArrowLeftSLine className="size-4" /></IconBtn>
        <p className="flex-1 text-[14px] font-semibold">v{v.display_version ?? v.version}<span className="ml-2 text-[12px] font-normal text-ink-3">只读</span></p>
        <Button variant="secondary" size="small" onClick={onRestore}>还原此版本</Button>
      </div>
      <p className="mb-3 text-[13px] text-ink-2">{v.version_note}</p>
      <div className="rounded-2xl border border-line px-4">
        {line('模型', s.model && `${s.model.model}${s.model.fallback ? `（备用 ${s.model.fallback.model}）` : ''}`)}
        {line('提示词', s.prompt?.system_prompt && <pre className="max-h-48 overflow-auto font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{s.prompt.system_prompt}</pre>)}
        {line('Skills', (s.config_skills ?? []).map(x => x.name).join('、'))}
        {line('文件', (s.config_files ?? []).map(x => x.name).join('、'))}
        {line('工具', [...(s.tools?.dify_tools ?? []).map(x => x.name || x.tool_name), ...(s.tools?.cli_tools ?? []).map(x => `${x.name}（CLI）`)].join('、'))}
        {line('知识检索', (s.knowledge?.sets ?? []).map(x => `${x.name}（${x.datasets.map(d => d.name).join('、')}）`).join('；'))}
        {line('外部知识库', (s.knowledge?.external_sets ?? []).map(x => `${x.name}（${x.library_ids.length} 个库，按调用者权限）`).join('；'))}
        {line('环境变量', (s.env?.variables ?? []).map(x => x.key).join('、'))}
      </div>
    </div>
  )
}
