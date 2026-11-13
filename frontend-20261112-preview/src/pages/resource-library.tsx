import { useRef, useState } from 'react'
import { RiAddLine, RiArrowRightLine, RiFolderUserLine, RiTeamLine } from '@remixicon/react'
import { asset } from '@/lib/asset'
import { API_MODE } from '@/api/http'
import { currentDemo } from '@/api/access'
import { currentUser } from '@/lib/current-user'
import { useQuery } from '@/api/hooks'
import { listPersonalAgents } from '@/api/agents'
import { listTeams } from '@/api/teams'
import { createLibrary, listKnowledgeBases } from '@/api/knowledge'
import { getLocalSkill, listLocalSkills } from '@/api/skills'
import { listMcp, tr } from '@/api/integrations'
import type { ToolCollection } from '@/api/integrations'
import { listResourceShares, submitResourceShare, resourceShareState, RESOURCE_NAMES } from '@/api/resource-sharing'
import type { ResourceKind } from '@/api/resource-sharing'
import { STATE_TEXT } from '@/api/releases'
import { useSession } from '@/lib/session'
import { Page } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Badge } from '@/components/ui/primitives'
import { ErrorBar } from '@/components/ui/data'
import { Menu } from '@/components/ui/menu'
import { InfoDialog, ImportDialog } from './agents/dialogs'
import { FromPersonalDialog } from './agents/from-personal'
import { CreateTeamDialog } from './teams/team-dialogs'
import { useAgentSource } from './teams/agent-source'
import { AddSkill } from './skills/local-add'
import { McpDialog } from './integrations/mcp/dialog'
import { McpDrawer } from './integrations/mcp/drawer'

type Item = { owned?: boolean, id: string, name: string, description: string, icon?: string, mcp?: ToolCollection }
export const RESOURCE_ROUTES: Record<string, ResourceKind> = { agents: 'agent', teams: 'team', kb: 'knowledge', skills: 'skill', integrations: 'mcp' }
async function catalog(kind: ResourceKind): Promise<Item[]> {
  const ownerName = API_MODE === 'mock' ? currentDemo()?.name ?? '李鹏程' : currentUser.owner
  if (kind === 'agent') { const [all, mine] = await Promise.all([listPersonalAgents({ page: 1, limit: 10000 }), listPersonalAgents({ page: 1, limit: 10000, is_created_by_me: true })]); const ids = new Set(mine.data.map(a => a.id)); return all.data.map(a => ({ id: a.id, name: a.name, owned: ids.has(a.id), description: a.description || a.role || '', icon: a.icon_url || undefined })) }
  if (kind === 'team') return (await listTeams()).teams.map(t => ({ id: t.id, name: t.name, owned: t.created_by === (API_MODE === 'mock' ? ({ dev: 'yy', admin: 'jl', super: 'lpc' }[currentDemo()?.id ?? 'super']) : currentUser.id), description: t.config.description || t.config.goal }))
  if (kind === 'knowledge') return (await listKnowledgeBases()).map(k => ({ id: k.id, name: k.name, owned: k.ownedByMe, description: `${k.description || ''} · ${k.count} 份材料` }))
  if (kind === 'skill') return (await listLocalSkills()).data.map(s => ({ id: s.id, name: s.name, owned: s.installed_by === ownerName, description: s.description }))
  return (await listMcp()).map(m => ({ id: m.id, name: m.name, owned: m.author === ownerName, description: tr(m.description), mcp: m }))
}
export default function ResourceLibrary({ kind, route, go }: { kind: ResourceKind, route: string, go: (p: string) => void }) {
  const { perms } = useSession()
  const [tab, setTab] = useState<'personal' | 'team'>('personal')
  const [keyword, setKeyword] = useState('')
  const [create, setCreate] = useState(false)
  const [fromPersonal, setFromPersonal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Item>()
  const [detail, setDetail] = useState<Item>()
  const [skillText, setSkillText] = useState('')
  const [reason, setReason] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const guard = useRef(false)
  const q = useQuery(() => catalog(kind), [kind])
  const grouped = kind !== 'knowledge'
  const shares = useQuery(listResourceShares, [kind], { enabled: grouped })
  const sharingLoading = grouped && shares.loading
  const roster = useQuery(listTeams, [], { enabled: kind === 'team' })
  const source = useAgentSource(roster.data?.agents ?? [])
  const rows = q.data ?? []
  const state = (id: string) => resourceShareState(shares.data?.data ?? [], kind, id)
  const personal = rows.filter(r => r.owned && state(r.id)?.state !== 'approved')
  const team = rows.filter(r => state(r.id)?.state === 'approved')
  const shown = (!grouped ? rows : tab === 'personal' ? personal : team).filter(r => `${r.name} ${r.description}`.toLowerCase().includes(keyword.toLowerCase()))
  const refresh = () => { q.reload(); if (grouped) shares.reload() }
  const open = async (r: Item) => {
    if (kind === 'agent' || kind === 'team') { go(`${route}/${r.id}`); return }
    if (kind === 'knowledge') { go(`kb/${r.id}`); return }
    setDetail(r)
    if (kind === 'skill') { setSkillText('正在加载…'); try { const s = await getLocalSkill(r.id); setSkillText(`版本：${s.version}\n状态：${s.enabled ? '已启用' : '已停用'}\n\n文件清单\n${s.files.map(f => f.path).join('\n')}`) } catch (e) { setSkillText((e as Error).message) } }
  }
  const submit = async () => {
    if (!selected || !reason.trim() || guard.current) return
    guard.current = true; setBusy(true); setError('')
    try { await submitResourceShare({ resource_kind: kind, object_id: selected.id, name: selected.name, reason: reason.trim(), scope: perms?.department || '' }); setSelected(undefined); shares.reload() }
    catch (e) { setError((e as Error).message) }
    finally { guard.current = false; setBusy(false) }
  }
  return <Page className="overflow-auto"><div className="px-10 pt-10 pb-16">
    <div className="flex items-start gap-4"><div><h1 className="text-2xl font-semibold">{RESOURCE_NAMES[kind]}</h1><p className="mt-3 text-sm text-ink-2">{grouped ? '个人创建与探索，有价值的成果经管理员审批后移入团队沉淀，共享复用。' : '统一查看和管理可访问的知识库，整理资料、检索知识。'}</p></div><div className="ml-auto flex gap-2">
      {kind === 'agent' && <Button onClick={() => go('agents/enterprise')}>企服资源</Button>}
      {kind === 'skill' && <Button onClick={() => go('skills/market')}>技能市场</Button>}
      {kind === 'mcp' && <Button onClick={() => go('integrations/marketplace')}>插件市场</Button>}
      {(!grouped || tab === 'personal') && (kind === 'agent' ? <Menu trigger={<Button variant="primary"><RiAddLine className="size-4" />新建 Agent</Button>} items={[{ label: '从空白创建', onSelect: () => setCreate(true) }, { label: '从个人助手创建', onSelect: () => setFromPersonal(true) }, { label: '导入 DSL', onSelect: () => setImporting(true) }]} /> : <Button variant="primary" onClick={() => { setError(''); setName(''); setDetail(undefined); setCreate(true) }}><RiAddLine className="size-4" />{kind === 'skill' ? '导入技能' : kind === 'mcp' ? '接入 MCP' : `新建${RESOURCE_NAMES[kind]}`}</Button>)}
    </div></div>
    <div className="mt-7 flex flex-wrap items-center gap-4">{grouped && <Segmented value={tab} onValueChange={setTab} options={[{ value: 'personal', label: '个人创建', count: personal.length }, { value: 'team', label: '团队沉淀', count: team.length }]} />}<Input className="ml-auto max-w-xs" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索名称或说明" /></div>
    {grouped && <p className="mt-4 text-xs text-ink-3">{tab === 'personal' ? '待审批、退回和拒绝的资源仍保留在这里；通过审批后自动移到团队沉淀。' : '这里仅展示已审批通过的团队资源，保留原资源链接与配置。'}</p>}
    <ErrorBar error={q.error || (grouped ? shares.error : null)} onRetry={refresh} />
    {q.loading || sharingLoading ? <p className="py-12 text-ink-3">正在加载…</p> : <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">{shown.map(r => { const approval = grouped ? state(r.id) : undefined; return <div key={r.id} className="flex min-h-48 flex-col rounded-xl border border-line bg-solid p-5"><div className="flex items-start gap-3">{r.icon ? <img src={asset(r.icon)} onError={e => { const fallback = asset('/raccoon-emoji-v1/042-ai.webp'); if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback }} alt="" className="size-10 rounded-xl" /> : tab === 'personal' ? <RiFolderUserLine className="size-7 text-volt-text" /> : <RiTeamLine className="size-7 text-volt-text" />}<h2 className="min-w-0 flex-1 font-semibold">{r.name}</h2>{grouped && <Badge tone={approval?.state === 'approved' ? 'mint' : approval?.state === 'pending' ? 'amber' : 'neutral'}>{approval?.state === 'approved' ? '团队沉淀' : approval ? STATE_TEXT[approval.state][0] : '个人创建'}</Badge>}</div><p className="mt-3 line-clamp-3 text-sm text-ink-2">{r.description || '暂无简介'}</p>{approval?.comment && <p className="mt-2 text-xs text-ink-3">审批意见：{approval.comment}</p>}<div className="mt-auto flex items-center gap-2 pt-5"><Button size="small" onClick={() => void open(r)}>查看详情<RiArrowRightLine className="size-3" /></Button>{grouped && tab === 'personal' && <Button size="small" disabled={approval?.state === 'pending' || !!shares.error} onClick={() => { setSelected(r); setReason(''); setError('') }}>{approval?.state === 'pending' ? '等待审批' : '申请团队共享'}</Button>}{approval && <Button size="small" variant="ghost" onClick={() => go('releases')}>审批进度</Button>}</div></div> })}</div>}
    {!q.loading && !sharingLoading && !shown.length && <p className="py-16 text-center text-ink-3">{keyword ? '没有匹配的资源' : !grouped ? '暂无知识库，可从右上角新建。' : tab === 'team' ? '暂无团队沉淀。个人创建的资源审批通过后会显示在这里。' : '暂无个人创建的资源，可从右上角开始创建。'}</p>}
  </div>
  <Dialog open={!!selected} onOpenChange={o => { if (!busy && !o) setSelected(undefined) }} title="申请团队共享" description="审批通过后，该资源将从个人创建移入团队沉淀。" footer={<><Button disabled={busy} onClick={() => setSelected(undefined)}>取消</Button><Button variant="primary" loading={busy} disabled={!reason.trim()} onClick={submit}>提交审批</Button></>}><div className="space-y-4"><p>{selected?.name}</p><p className="text-sm text-ink-3">共享范围：{perms?.department}</p><Field label="共享价值与适用场景" required><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="说明它解决了什么问题、适合哪些同事复用。" /></Field>{error && <p className="text-rose">{error}</p>}</div></Dialog>
  {kind === 'agent' && <><InfoDialog open={create} onOpenChange={setCreate} mode="create" onDone={a => go(`agents/${a.id}/configure`)} /><FromPersonalDialog open={fromPersonal} onOpenChange={setFromPersonal} go={go} /><ImportDialog open={importing} onOpenChange={setImporting} onDone={refresh} /></>}
  {kind === 'team' && <CreateTeamDialog open={create} onOpenChange={setCreate} agents={source.candidates} onCreated={t => go(`teams/${t.id}`)} />}
  {kind === 'knowledge' && <Dialog open={create} onOpenChange={setCreate} title="新建知识库" footer={<Button variant="primary" loading={busy} disabled={!name.trim()} onClick={async () => { if (busy) return; setBusy(true); setError(''); try { await createLibrary(name.trim()); setCreate(false); refresh() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}>创建</Button>}><Input maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="知识库名称" />{error && <p className="text-rose">{error}</p>}</Dialog>}
  {kind === 'skill' && <><Dialog open={create} onOpenChange={setCreate} title="创建个人技能" size="lg"><AddSkill onAdded={() => { setCreate(false); refresh() }} /></Dialog><Dialog open={!!detail} onOpenChange={o => { if (!o) setDetail(undefined) }} title={detail?.name || '技能详情'}><p className="mb-4 text-sm">{detail?.description}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{skillText}</pre></Dialog></>}
  {kind === 'mcp' && <><McpDialog open={create} editing={detail?.mcp} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); setDetail(undefined); refresh() }} /><McpDrawer mcp={create ? undefined : detail?.mcp} onClose={() => setDetail(undefined)} onEdit={m => { setDetail({ id: m.id, name: m.name, description: '', mcp: m }); setCreate(true) }} onChanged={refresh} /></>}
  </Page>
}
