import { ReleaseStatusFilter } from './release-status-filter'
import { RESOURCE_NAMES } from '@/api/resource-sharing'
import type { CopyAssistantBody, ReleaseRequest, Visibility } from '@/api/releases'
import { RiRocketLine, RiChat3Line, RiArrowRightUpLine, RiArrowGoBackLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listMySkills } from '@/api/tune'
import { copyAssistantAsAgent, KIND_TEXT, listMyReleases, STATE_TEXT, VIS_TEXT, withdrawRelease } from '@/api/releases'
import { ConsolePage, MetricRow, Section, Tabs } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

/*
  我的发布：开发者提交的发布申请与审批结果。新建的智能体、由个人助手复制出的专家智能体、智能体团队、
  Skill 包与 Buddy 应用，都要普通管理员（按部门 / 业务 / 工作流）审批通过后才发布，其他用户才能看到。
*/
type ReleaseCategory = 'all' | 'agent' | 'team' | 'skill' | 'mcp'
const releaseCategories: { id: ReleaseCategory, label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'agent', label: '智能体' },
  { id: 'team', label: '智能体团队' },
  { id: 'skill', label: 'Skills' },
  { id: 'mcp', label: 'MCP与工具' },
]
function matchesCategory(r: ReleaseRequest, category: ReleaseCategory) {
  if (category === 'all') return true
  if (r.resource_share) return r.resource_share.resource_kind === category
  if (category === 'agent') return r.kind === 'agent' || r.kind === 'assistant_copy'
  if (category === 'team') return r.kind === 'team' || r.kind === 'expert_team'
  return r.kind === category
}
function releaseTarget(r: ReleaseRequest) {
  const id = encodeURIComponent(r.object_id)
  const kind = r.resource_share?.resource_kind ?? r.kind
  if (kind === 'expert_team') return r.expert_team?.team_id ? `teams/${encodeURIComponent(r.expert_team.team_id)}` : 'collab'
  return ({agent:`agents/${id}`,assistant_copy:`agents/${id}`,team:`teams/${id}`,skill:`skills/local/${id}`,mcp:`integrations/installed/${id}`,knowledge:`kb/${id}`,buddy_app:'accelerator'} as Record<string,string>)[kind] ?? 'agents'
}
export default function Releases({ go }: { go: (p: string) => void }) {
  const toast = useToast()
  const [opinion, setOpinion] = useState<ReleaseRequest | null>(null)
  const q = useQuery(listMyReleases, [])
  const [copyOpen, setCopyOpen] = useState(() => location.hash.includes('copy=assistant'))
  const [category, setCategory] = useState<ReleaseCategory>('all')
  const [status, setStatus] = useState<ReleaseRequest['state'] | 'all'>('all')
  const all = (q.data?.data ?? []).filter(r => r.state !== 'draft' && r.state !== 'withdrawn').map(r => r.state === 'rejected' ? { ...r, state: 'returned' as const } : r)
  const categoryList = all.filter(r => matchesCategory(r, category))
  const list = categoryList.filter(r => status === 'all' || r.state === status)
  const n = (s: ReleaseRequest['state']) => categoryList.filter(r => r.state === s).length
  const statusOptions: { value: ReleaseRequest['state'] | 'all', label: string }[] = [{ value: 'all', label: '全部状态' }, { value: 'pending', label: '审批中' }, { value: 'approved', label: '已通过' }, { value: 'returned', label: '已退回' }]
  return (
    <ConsolePage bodyClass="px-10 pt-6 pb-16" header={<header className="bg-surface px-10 pt-10 pb-2"><h1 className="text-[24px] font-semibold leading-8">我的发布</h1><p className="mt-2 text-[13px] text-ink-2">统一查看各类资源的发布与共享申请，跟踪审批进度和处理结果。</p></header>}>
      <div className="w-full space-y-5">
        <Tabs items={releaseCategories.map(c => ({ ...c, count: all.filter(r => matchesCategory(r,c.id)).length }))} value={category} onChange={setCategory} />
        <MetricRow items={[{ label: '审批中', value: n('pending'), tone: 'amber' }, { label: '已通过', value: n('approved') }, { label: '已退回', value: n('returned'), tone: n('returned') ? 'rose' : undefined }, { label: '全部申请', value: categoryList.length }]} />
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink-3">当前分类共 {categoryList.length} 条申请 · 筛选结果 {list.length} 条</p><div className="flex items-center gap-2"><span className="text-xs text-ink-2">审批状态</span><ReleaseStatusFilter value={status} onChange={setStatus} options={statusOptions.map(s => ({ ...s, count: s.value === 'all' ? categoryList.length : n(s.value) }))} />{status !== 'all' && <Button size="small" variant="ghost" onClick={() => setStatus('all')}>清除筛选</Button>}</div></div>
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        <Section title={category === 'all' ? '全部发布申请' : `${releaseCategories.find(c => c.id === category)?.label} · 发布申请`} bodyClass="p-0">
          {q.loading && <p className="px-5 py-8 text-center text-sm text-ink-3">正在加载发布申请…</p>}
          {!list.length && !q.loading && <EmptyState icon={<RiRocketLine className="size-5" />} title={status !== 'all' ? '没有符合当前筛选的申请' : category === 'all' ? '还没有发布申请' : `还没有${releaseCategories.find(c => c.id === category)?.label}的发布申请`} hint="在对应资源页面提交发布或共享申请后，可在这里查看审批进度。" />}
          <div className="divide-y divide-line">
            {list.map(r => (
              <div key={r.id} className="flex items-center gap-6 px-5 py-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold"><button type="button" className="cursor-pointer truncate text-left hover:text-volt-text hover:underline" title="打开对应资源" onClick={() => go(releaseTarget(r))}>{r.name}</button><span className="text-[12.5px] font-normal text-ink-3">{r.version}</span><Badge>{r.resource_share ? RESOURCE_NAMES[r.resource_share.resource_kind] : KIND_TEXT[r.kind]}</Badge><Badge tone={STATE_TEXT[r.state][1]}>{statusOptions.find(s => s.value === r.state)?.label || STATE_TEXT[r.state][0]}</Badge></p>
                  <p className="mt-1 truncate text-[13px] text-ink-2" title={r.note}>{r.note}</p>
                  <p className="mt-1 text-[12px] text-ink-3">{r.id} · 申请范围：{r.scope} · 可见范围：{VIS_TEXT[r.visibility]} · 提交于 {new Date(r.submitted_at).toLocaleString('zh-CN')}</p>

                </div>
                <div className="grid w-[304px] shrink-0 grid-cols-[100px_108px_80px] items-center gap-2 self-center">
                {r.comment ? <Button size="medium" variant="ghost" className="w-full rounded-lg" onClick={() => setOpinion(r)}><RiChat3Line className="size-3.5" />审批意见</Button> : <span />}
                <Button size="medium" className="w-full rounded-lg border-volt/20 bg-volt-soft/40 text-volt-text hover:bg-volt-soft" onClick={() => go(releaseTarget(r))}><RiArrowRightUpLine className="size-3.5" />{r.state === 'returned' ? '去修改' : '查看资源'}</Button>
                {r.state === 'pending' && <Button size="medium" variant="ghost" className="w-full rounded-lg" onClick={async () => { await withdrawRelease(r.id); toast('已撤回', 'info'); q.reload() }}><RiArrowGoBackLine className="size-3.5" />撤回</Button>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Dialog open={!!opinion} onOpenChange={open => !open && setOpinion(null)} title="审批意见" footer={<Button onClick={() => setOpinion(null)}>关闭</Button>}>{opinion && <div className="space-y-3"><p className="text-sm font-medium">{opinion.name}</p><p className="text-xs text-ink-3">{opinion.approver || '管理员'} · {STATE_TEXT[opinion.state][0]}</p><p className="whitespace-pre-wrap text-sm leading-6">{opinion.comment}</p></div>}</Dialog>
      <CopyDialog open={copyOpen} onClose={() => { setCopyOpen(false); if (location.hash.includes('copy=')) history.replaceState(null, '', '#releases') }} onDone={() => { setCategory('agent'); setStatus('all'); toast('已生成专家智能体草稿并提交发布审批'); q.reload() }} />
    </ConsolePage>
  )
}

function CopyDialog({ open, onClose, onDone }: { open: boolean, onClose: () => void, onDone: () => void }) {
  const skills = useQuery(listMySkills, [], { enabled: open })
  const [b, setB] = useState<CopyAssistantBody>({ name: '', desc: '', include_instructions: true, include_skills: [], include_memory: 'confirmed_experience', memory_ids: [], visibility: 'department', scope: 'FDE 交付中心' })
  useEffect(() => { if (skills.data) setB(x => ({ ...x, include_skills: skills.data!.data.filter(s => s.enabled).map(s => s.id) })) }, [skills.data])
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()} size="lg" title="把我的助手复制为专家智能体" description="把你做事的方式（角色与指令、Skill、经确认的工作经验）复制成一个可供他人调用的专家智能体。生成草稿后提交发布审批，管理员通过后其他用户才能看到。" footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" loading={busy} disabled={!b.name.trim()} onClick={async () => { setBusy(true); try { await copyAssistantAsAgent(b); onDone(); onClose() } finally { setBusy(false) } }}>生成草稿并提交审批</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4"><Field label="专家智能体名称" required><Input value={b.name} onChange={e => setB({ ...b, name: e.target.value })} placeholder="例如：上线评估助手" /></Field><Field label="申请范围"><Select value={b.scope} onValueChange={v => setB({ ...b, scope: v })} options={['FDE 交付中心', '销售管理', '售前方案团队'].map(s => ({ value: s, label: s }))} /></Field></div>
        <Field label="用途说明"><Textarea rows={2} value={b.desc} onChange={e => setB({ ...b, desc: e.target.value })} placeholder="它擅长什么、适合谁用、有什么边界" /></Field>
        <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3"><div><p className="text-[13.5px]">包含角色与工作指令</p><p className="text-[12px] text-ink-3">会去掉只对你个人有效的内容（如个人工作区路径）。</p></div><Switch aria-label="包含角色与工作指令" checked={b.include_instructions} onCheckedChange={v => setB({ ...b, include_instructions: v })} /></div>
        <Field label="包含的 Skill">
          <div className="flex flex-wrap gap-2">{(skills.data?.data ?? []).map(s => { const on = b.include_skills.includes(s.id); return <button key={s.id} type="button" onClick={() => setB({ ...b, include_skills: on ? b.include_skills.filter(x => x !== s.id) : [...b.include_skills, s.id] })} className={cn('h-8 cursor-pointer rounded-md border px-2.5 text-[12.5px]', on ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2')}>{s.name}</button> })}</div>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="包含的记忆" hint="个人偏好与私人背景不会被复制。"><Select value={b.include_memory} onValueChange={v => setB({ ...b, include_memory: v })} options={[{ value: 'confirmed_experience', label: '经确认的工作经验' }, { value: 'none', label: '不包含记忆' }]} /></Field>
          <Field label="申请的可见范围"><Select value={b.visibility} onValueChange={(v: Visibility) => setB({ ...b, visibility: v })} options={(['department', 'org'] as Visibility[]).map(v => ({ value: v, label: VIS_TEXT[v] }))} /></Field>
        </div>
      </div>
    </Dialog>
  )
}
