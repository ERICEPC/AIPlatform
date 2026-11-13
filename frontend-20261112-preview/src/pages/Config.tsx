import { DesktopDevicePicker } from './DesktopDevice'
import { RiAddLine, RiCloseLine, RiBookOpenLine, RiBrainLine, RiCpuLine, RiFlashlightLine, RiShieldCheckLine, RiTimeLine, RiUser3Line, RiRobot2Line, RiPlugLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { Page, Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Badge, Panel } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'
import { loadPersonal, personalResources, savePersonal, applyPersonal, choosePersonalWorkspace } from '@/api/personal'
import type { PersonalState, PersonalConfig, Resources, ResourceKind } from '@/api/personal'
import { AssistantToolbar } from './Assistant'

const sections = [
  { id: 'role', label: '角色与指令', icon: RiUser3Line }, { id: 'workspace', label: '默认工作区', icon: RiBookOpenLine }, { id: 'model', label: '模型', icon: RiCpuLine },
  { id: 'agents', label: '业务智能体', icon: RiRobot2Line }, { id: 'kb', label: '知识库', icon: RiBookOpenLine },
  { id: 'skills', label: 'Skills', icon: RiFlashlightLine }, { id: 'mcps', label: 'MCP', icon: RiPlugLine },
  { id: 'cron', label: '定时任务', icon: RiTimeLine }, { id: 'memory', label: '记忆', icon: RiBrainLine },
  { id: 'perm', label: '协同与权限', icon: RiShieldCheckLine },
]
const labels: Record<ResourceKind, string> = { agents: '可调用的业务智能体', kb: '知识库', skills: 'Skills', mcps: 'MCP' }
const inputClass = 'w-full rounded-xl border border-line bg-hover px-4 py-3 text-sm outline-none focus:border-volt'
function Row({ title, hint, children }: { title: string, hint?: string, children?: React.ReactNode }) {
  return <div className="flex min-h-[60px] items-center gap-4 border-t border-line px-5 py-3 first:border-t-0"><div className="min-w-0 flex-1"><p className="text-sm">{title}</p>{hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}</div>{children}</div>
}
function Group({ id, title, children, action }: { id: string, title: string, children: React.ReactNode, action?: React.ReactNode }) {
  return <Rise id={id} className="scroll-mt-6"><div className="mb-2.5 flex items-center justify-between px-1"><h2 className="text-[15px] font-semibold">{title}</h2>{action}</div><Panel level={2} radius="lg" className="overflow-hidden">{children}</Panel></Rise>
}
export default function Config({ go }: { go: (r: 'assistant' | 'config') => void }) {
  const [state, setState] = useState<PersonalState>()
  const [resources, setResources] = useState<Resources>()
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [choosingWorkspace, setChoosingWorkspace] = useState(false)
  const [workspaceNotice, setWorkspaceNotice] = useState('')
  const persistWorkspace = async (workspacePath: string) => {
    if (!state) return
    // Save only the workspace against the last persisted config; keep other draft edits local.
    const baseline = JSON.parse(saved) as PersonalConfig
    const next = await savePersonal({ ...state, config: { ...baseline, workspacePath } })
    setSaved(JSON.stringify(next.config))
    setState(current => current ? { ...next, config: { ...current.config, workspacePath } } : next)
    setWorkspaceNotice('工作区已保存，正在应用…')
    try {
      const applied = await applyPersonal()
      setState(current => current ? { ...applied, config: current.config } : applied)
      setWorkspaceNotice(workspacePath ? '默认工作区已保存并生效，未指定工作区的新对话将使用此目录。' : '已清除默认工作区，新对话将自动分配目录。')
    } catch (e) {
      setWorkspaceNotice('工作区已保存，但尚未应用。请点击“保存并应用”重试。')
      throw e
    }
  }
  const chooseWorkspace = async (clear = false) => {
    if (!state || busy || choosingWorkspace) return
    setChoosingWorkspace(true); setError(''); setWorkspaceNotice('')
    try {
      if (clear) await persistWorkspace('')
      else {
        const result = await choosePersonalWorkspace()
        if (result.workspacePath) await persistWorkspace(result.workspacePath)
      }
    } catch (e) { setError(e instanceof Error ? e.message : '工作区保存失败') }
    finally { setChoosingWorkspace(false) }
  }
  const [active, setActive] = useState('role')
  const [picker, setPicker] = useState<ResourceKind | null>(null)
  const [search, setSearch] = useState('')
  const reload = () => { setError(''); Promise.all([loadPersonal(), personalResources()]).then(([s, r]) => { setState(s); setSaved(JSON.stringify(s.config)); setResources(r) }).catch(e => setError(e.message)) }
  useEffect(reload, [])
  const dirty = !!state && JSON.stringify(state.config) !== saved
  const change = (patch: Partial<PersonalConfig>) => setState(s => s ? { ...s, config: { ...s.config, ...patch } } : s)
  const commit = async (apply: boolean) => {
    if (!state) return
    setBusy(true); setError('')
    try {
      let next = state
      if (dirty || !state.revision) { next = await savePersonal(state); setState(next); setSaved(JSON.stringify(next.config)) }
      if (apply) { next = await applyPersonal(); setState(next) }
    } catch (e) { setError(e instanceof Error ? e.message : '配置保存失败') }
    finally { setBusy(false) }
  }
  const remove = (kind: ResourceKind, id: string) => state && change({ [kind]: state.config[kind].filter(x => x !== id) })
  return <Page><AssistantToolbar tab="config" go={go} />
    <div className="flex min-h-0 flex-1 pt-16">
      <nav className="w-[200px] shrink-0 space-y-1 p-4 max-md:w-[140px]">{sections.map(s => <button key={s.id} className={cn('flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm', active === s.id ? 'bg-press text-ink' : 'text-ink-2 hover:bg-hover')} onClick={() => { setActive(s.id); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><s.icon className="size-4 shrink-0" />{s.label}{state && s.id in labels && <span className="ml-auto text-xs text-ink-3">{state.config[s.id as ResourceKind].length}</span>}</button>)}</nav>
      <div className="min-h-0 flex-1 overflow-auto px-8 pt-4 pb-24"><div className="mx-auto max-w-[720px] space-y-8">
        <Rise><h1 className="text-[32px] font-semibold tracking-tight">配置我的助手</h1><p className="mt-2 text-sm text-ink-2">独立运行的个人助手。平台能力默认可用，保存后应用到助手。</p><div className="mt-4 flex flex-wrap items-center gap-3"><Badge tone={dirty ? 'amber' : 'mint'}>{dirty ? '有未保存的修改' : state?.revision ? state.applied_revision === state.revision ? `已应用 · v${state.revision}` : `已保存 · v${state.revision} · 待应用` : '尚未配置'}</Badge><Button disabled={!state || busy || choosingWorkspace || (!dirty && state.revision === state.applied_revision)} size="small" onClick={() => commit(true)}>{busy ? '正在应用…' : '保存并应用'}</Button></div></Rise>
        {error && <div role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-300">{error}<button className="ml-3 underline" onClick={reload}>重新加载</button></div>}
        {!state || !resources ? <p className="text-ink-3">正在读取个人配置与平台资源…</p> : <fieldset disabled={busy || choosingWorkspace} className="space-y-8 disabled:opacity-70">
          <Group id="role" title="角色与指令"><div className="space-y-4 p-5"><label className="block text-sm">名称<input className={inputClass + ' mt-2'} value={state.config.name} maxLength={100} onChange={e => change({ name: e.target.value })} /></label><label className="block text-sm">角色<input className={inputClass + ' mt-2'} value={state.config.role} maxLength={1000} onChange={e => change({ role: e.target.value })} /></label><label className="block text-sm">工作指令<textarea className={inputClass + ' mt-2 min-h-28'} value={state.config.instructions} maxLength={30000} onChange={e => change({ instructions: e.target.value })} /></label></div></Group>
          <Group id="workspace" title="默认工作区"><DesktopDevicePicker config={state.config} onChange={change} />{!state.config.desktopDeviceId && <div className="space-y-3 p-5"><p className="text-sm text-ink-2">为未单独选择工作区的新对话设置默认本机文件夹。</p><div className="flex items-center gap-3"><RiBookOpenLine className="size-5 shrink-0 text-ink-3" /><span className="min-w-0 flex-1 break-all text-sm">{state.config.workspacePath || '未设置，将为新对话自动分配目录'}</span><Button size="small" disabled={choosingWorkspace} onClick={() => void chooseWorkspace()}>{choosingWorkspace ? '请在本机选择…' : '选择本机文件夹'}</Button>{state.config.workspacePath && <Button size="small" variant="ghost" disabled={choosingWorkspace} onClick={() => void chooseWorkspace(true)}>清除</Button>}</div><p className="text-xs leading-5 text-ink-3">选择文件夹后自动保存并生效。对话单独选择的工作区优先；已有对话保留原目录。文件夹位于连接器所在电脑，不是云服务器。</p>{workspaceNotice && <p role="status" className="text-xs text-ink-2">{workspaceNotice}</p>}</div>}</Group>
          <Group id="model" title="模型"><Row title="对话模型" hint="与平台模型供应商配置共用凭据"><select aria-label="对话模型" className="max-w-[360px] rounded-xl border border-line bg-panel px-3 py-2 text-sm" value={`${state.config.provider}|${state.config.model}`} onChange={e => { const [provider, model] = e.target.value.split('|'); change({ provider, model }) }}><option value="|">请选择模型</option>{resources.models.map(m => <option key={`${m.provider}|${m.id}`} disabled={!m.available} value={`${m.provider}|${m.id}`}>{m.name || m.id}{!m.available ? '（暂不支持此协议）' : ''}</option>)}</select></Row><Row title="单次输出上限" hint="限制每次模型输出的 Token 数"><input aria-label="单次输出上限" type="number" min={256} max={16384} className={inputClass + ' !w-28'} value={state.config.maxTokens} onChange={e => change({ maxTokens: Number(e.target.value) })} /></Row></Group>
          {(Object.keys(labels) as ResourceKind[]).map(kind => <Group key={kind} id={kind} title={labels[kind]} action={<Button size="small" variant="ghost-accent" onClick={() => { setPicker(kind); setSearch('') }}><RiAddLine className="size-4" />{kind === 'agents' ? '添加业务智能体' : `关联${labels[kind]}`}</Button>}>{!state.config[kind].length && <Row title={kind === 'agents' ? '尚未添加业务智能体' : `尚未关联${labels[kind]}`} hint={kind === 'agents' ? '允许个人助手把任务交给这些已发布的业务智能体处理' : '从平台当前账号可访问的资源中选择'} />}{state.config[kind].map(id => { const item = resources[kind].find(r => r.id === id); return <Row key={id} title={item?.name || '资源已删除或无权访问'} hint={item?.available ? item.hint : '不可用，请移除后重新选择'}><Switch checked disabled={!item?.available} aria-label={item?.name || id} onCheckedChange={() => remove(kind, id)} /><Button aria-label="移除资源" variant="ghost" size="icon-small" onClick={() => remove(kind, id)}><RiCloseLine className="size-4" /></Button></Row> })}</Group>)}
          <Group id="cron" title="定时任务"><Row title="调度服务尚未启用" hint="当前不会自动执行或发送定时任务。个人助手对话和资源调用不受影响。" /></Group>
          <Group id="memory" title="记忆"><Row title="个人记忆" hint="仅本账号可见，启用后随每次会话加载"><Switch checked={state.config.memoryEnabled} onCheckedChange={memoryEnabled => change({ memoryEnabled })} aria-label="个人记忆" /></Row><div className="border-t border-line p-5"><textarea className={inputClass + ' min-h-28'} aria-label="记忆内容" placeholder="写下希望助手长期记住的偏好和背景…" maxLength={16000} value={state.config.memory} onChange={e => change({ memory: e.target.value })} /><p className="mt-2 text-xs text-ink-3">由你维护和清除，不会自动共享给团队。</p></div></Group>
          <Group id="perm" title="协同与权限"><Row title="允许同事邀请助手参与协同" hint="保存并应用后生效；群任务使用独立空间，不携带个人记忆或私有资源。"><Switch checked={!!state.config.collaborationEnabled} onCheckedChange={collaborationEnabled => change({ collaborationEnabled })} aria-label="允许协同邀请" /></Row><Row title="工作区命令执行" hint="在连接器已授权的本机工作区内执行。需要额外授权的操作默认拒绝。"><Switch checked={state.config.executionEnabled} onCheckedChange={executionEnabled => change({ executionEnabled })} aria-label="工作区命令执行" /></Row><Row title="业务智能体调用范围" hint="仅可调用上方关联且已发布的业务智能体，每次调用重新校验权限" /><Row title="对外操作" hint="先向你确认；当前没有自动批准额外权限的入口" /></Group>
        </fieldset>}
      </div></div>
    </div>
    {picker && resources && state && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-8" onClick={() => setPicker(null)}><div role="dialog" aria-modal="true" aria-label={picker === 'agents' ? '添加业务智能体' : `关联${labels[picker]}`} className="max-h-[75vh] w-full max-w-xl overflow-auto rounded-3xl border border-line-strong bg-[#171b18] p-6" onClick={e => e.stopPropagation()}><div className="mb-4 flex justify-between"><h2 className="text-xl font-semibold">{picker === 'agents' ? '添加业务智能体' : `关联${labels[picker]}`}</h2><Button aria-label="关闭" variant="ghost" size="icon-small" onClick={() => setPicker(null)}><RiCloseLine className="size-4" /></Button></div><input autoFocus aria-label="搜索资源" placeholder="搜索名称或描述" className={inputClass} value={search} onChange={e => setSearch(e.target.value)} /><div className="mt-3">{resources[picker].filter(r => `${r.name} ${r.hint}`.toLowerCase().includes(search.toLowerCase())).map(r => <Row key={r.id} title={r.name} hint={r.available ? r.hint : '尚未发布或尚未连接'}><Switch aria-label={r.name} checked={state.config[picker].includes(r.id)} disabled={!r.available} onCheckedChange={v => change({ [picker]: v ? [...state.config[picker], r.id] : state.config[picker].filter(id => id !== r.id) })} /></Row>)}{!resources[picker].length && <p className="py-8 text-center text-sm text-ink-3">平台暂无可访问资源，请先在对应模块创建。</p>}</div><Button className="mt-4" onClick={() => setPicker(null)}>完成选择</Button></div></div>}
  </Page>
}
