import type { MemoryKind, MemoryPolicy, PersonalMemory, PersonalStatus, TeamMemory } from '@/api/memory'
import { RiAddLine, RiCheckLine, RiDeleteBinLine, RiEditLine, RiPauseLine, RiPlayLine, RiShareLine, RiSparkling2Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { applyMemoryOptimize, confirmCandidate, createPersonalMemory, decideMemoryReview, deletePersonalMemory, feedbackTeamMemory, getMemoryHealth, getMemoryPolicy, KIND_LABEL, listMemoryReviews, listPersonalMemory, listTeamMemory, PERSONAL_STATUS, saveMemoryPolicy, sharePersonalMemory, SOURCE_LABEL, TEAM_STATUS, updatePersonalMemory } from '@/api/memory'
import { MetricRow, Section, SettingRow } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/form'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

/*
  记忆：个人可管控，团队可分享（《使用指南》9.6）。
  个人：候选 → 确认后启用 → 暂停 / 过期 / 删除；团队：分享 → 审查 → 发布 → 复用 → 维护 → 撤回。
  体检优化：合并重复、处理冲突、到期提醒、暂停长期未用、把稳定做法沉淀为 Skill、压缩背景。
*/
type Sub = 'personal' | 'team' | 'review' | 'optimize' | 'policy'
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('zh-CN') : '—')

export function TuneMemory({ go }: { go: (p: string) => void }) {
  const [sub, setSub] = useState<Sub>('personal')
  const health = useQuery(getMemoryHealth, [sub])
  const h = health.data
  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      {h && <MetricRow items={[
        { label: '已启用', value: h.totals.active, sub: `暂停 ${h.totals.paused} · 过期 ${h.totals.expired}` },
        { label: '候选 · 待确认', value: h.totals.candidate, tone: h.totals.candidate ? 'amber' : undefined, sub: '确认前不会被使用' },
        { label: '团队记忆（已发布）', value: h.totals.team_published, sub: `待审查 ${h.totals.reviewing}` },
        { label: '每次带入', value: `${h.context_tokens} Token`, sub: `命中率 ${Math.round(h.hit_rate * 100)}%` },
        { label: '健康分', value: h.score, tone: 'volt', sub: `${h.suggestions.length} 条优化建议` },
      ]} />}
      <Segmented value={sub} onValueChange={setSub} aria-label="记忆分区" options={[{ value: 'personal', label: '个人记忆' }, { value: 'team', label: '团队记忆' }, { value: 'review', label: '待我审查' }, { value: 'optimize', label: '体检与优化', count: h?.suggestions.length }, { value: 'policy', label: '记忆策略' }]} />
      {sub === 'personal' && <Personal onChanged={health.reload} />}
      {sub === 'team' && <Team />}
      {sub === 'review' && <Reviews />}
      {sub === 'optimize' && <Optimize onChanged={health.reload} go={go} />}
      {sub === 'policy' && <Policy />}
    </div>
  )
}

function Personal({ onChanged }: { onChanged: () => void }) {
  const toast = useToast()
  const [kind, setKind] = useState<MemoryKind | ''>('')
  const [status, setStatus] = useState<PersonalStatus | ''>('')
  const [kw, setKw] = useState('')
  const q = useQuery(() => listPersonalMemory({ kind, status, q: kw }), [kind, status, kw])
  const [edit, setEdit] = useState<Partial<PersonalMemory> & { open?: boolean } | null>(null)
  const [share, setShare] = useState<PersonalMemory | null>(null)
  const [del, setDel] = useState<PersonalMemory | null>(null)
  const refresh = () => { q.reload(); onChanged() }
  const list = q.data?.data ?? []
  const cands = list.filter(m => m.status === 'candidate')
  const consumers = q.data?.consumers ?? []
  return (
    <>
      {cands.length > 0 && (
        <Section title={`候选记忆 · ${cands.length} 条待确认`} desc="从任务中自动提取，确认前不会被任何助手使用；未经确认的推断不会直接成为事实。">
          <div className="space-y-2">
            {cands.map(m => (
              <div key={m.id} className="flex items-start gap-3 rounded-lg border border-amber/30 bg-amber-soft/40 p-3">
                <Badge tone="amber">{KIND_LABEL[m.kind]}</Badge>
                <div className="min-w-0 flex-1"><p className="text-[13.5px]">{m.content}</p><p className="mt-0.5 text-[12px] text-ink-3">{m.source.label} · 把握度 {Math.round((m.confidence ?? 0) * 100)}%{m.valid_until ? ` · 有效期至 ${m.valid_until}` : ''}</p></div>
                <Button size="small" variant="primary" onClick={async () => { await confirmCandidate(m.id); toast('已确认并启用'); refresh() }}><RiCheckLine className="size-3.5" />确认</Button>
                <Button size="small" onClick={() => setEdit({ ...m, open: true })}>修改后确认</Button>
                <Button size="small" variant="ghost" onClick={async () => { await deletePersonalMemory(m.id); toast('已忽略', 'info'); refresh() }}>忽略</Button>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section
        title="个人记忆"
        desc="默认仅本人和本人授权的助手使用；管理员不能浏览个人记忆正文。"
        actions={<Button variant="primary" onClick={() => setEdit({ open: true, kind: 'preference', content: '', consumers: ['assistant'], valid_until: null })}><RiAddLine className="size-4" />新增记忆</Button>}
        bodyClass="p-0"
      >
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
          <Input className="h-8 w-56" placeholder="搜索内容或来源" value={kw} onChange={e => setKw(e.target.value)} />
          <Select size="sm" className="w-32" value={kind} onValueChange={setKind} placeholder="全部类型" options={[{ value: '' as MemoryKind, label: '全部类型' }, ...(['preference', 'background', 'experience', 'context'] as MemoryKind[]).map(k => ({ value: k, label: KIND_LABEL[k] }))]} />
          <Select size="sm" className="w-32" value={status} onValueChange={setStatus} placeholder="全部状态" options={[{ value: '' as PersonalStatus, label: '全部状态' }, ...(Object.keys(PERSONAL_STATUS) as PersonalStatus[]).map(s => ({ value: s, label: PERSONAL_STATUS[s][0] }))]} />
        </div>
        {q.error && <div className="p-4"><ErrorBar error={q.error} onRetry={q.reload} /></div>}
        {q.loading && !q.data && <div className="p-4"><Skeleton className="h-40" /></div>}
        <table className="w-full text-[13px]">
          <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="w-[84px] px-5 py-2 font-medium">类型</th><th className="px-3 font-medium">内容与来源</th><th className="w-[170px] px-3 font-medium">允许使用</th><th className="w-[110px] px-3 font-medium">使用</th><th className="w-[110px] px-3 font-medium">状态</th><th className="w-[150px]" /></tr></thead>
          <tbody>
            {list.filter(m => m.status !== 'candidate').map(m => (
              <tr key={m.id} className={cn('border-t border-line align-top', m.status !== 'active' && 'text-ink-3')}>
                <td className="px-5 py-3"><Badge>{KIND_LABEL[m.kind]}</Badge></td>
                <td className="px-3 py-3"><p className="leading-relaxed">{m.content}</p><p className="mt-1 text-[12px] text-ink-3">{SOURCE_LABEL[m.source.type]} · {m.source.label} · 更新 {fmt(m.updated_at)}{m.valid_until ? ` · 有效期至 ${m.valid_until}` : ''}</p>{m.shared_to && <p className="mt-1 text-[12px] text-volt-text">已分享到 {m.shared_to.team} · {TEAM_STATUS[m.shared_to.status][0]}</p>}</td>
                <td className="px-3 py-3 text-[12.5px] text-ink-2">{m.consumers.map(c => consumers.find(x => x.id === c)?.name.split(' ')[0] ?? c).join('、')}</td>
                <td className="px-3 py-3 text-[12.5px] text-ink-2 tabular-nums">{m.use_count} 次<br /><span className="text-ink-3">最近 {fmt(m.last_used_at)}</span></td>
                <td className="px-3 py-3"><Badge tone={PERSONAL_STATUS[m.status][1]}>{PERSONAL_STATUS[m.status][0]}</Badge></td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon-small" aria-label="编辑" onClick={() => setEdit({ ...m, open: true })}><RiEditLine className="size-4" /></Button>
                  {m.status === 'active' && <Button variant="ghost" size="icon-small" aria-label="暂停" onClick={async () => { await updatePersonalMemory(m.id, { status: 'paused' }); refresh() }}><RiPauseLine className="size-4" /></Button>}
                  {m.status === 'paused' && <Button variant="ghost" size="icon-small" aria-label="恢复" onClick={async () => { await updatePersonalMemory(m.id, { status: 'active' }); refresh() }}><RiPlayLine className="size-4" /></Button>}
                  {m.status === 'active' && !m.shared_to && <Button variant="ghost" size="icon-small" aria-label="分享到团队" onClick={() => setShare(m)}><RiShareLine className="size-4" /></Button>}
                  <Button variant="ghost" size="icon-small" tone="destructive" aria-label="删除" onClick={() => setDel(m)}><RiDeleteBinLine className="size-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.loading && !list.length && <EmptyState icon={<RiSparkling2Line className="size-5" />} title="没有符合条件的记忆" hint="在对话里说「记住……」，或点右上角新增。" />}
      </Section>

      <EditDialog value={edit} consumers={consumers} onClose={() => setEdit(null)} onSaved={refresh} />
      <ShareDialog m={share} onClose={() => setShare(null)} onDone={async (b) => { if (!share) return; await sharePersonalMemory(share.id, b); setShare(null); toast('已提交分享，团队维护人审查后发布'); refresh() }} />
      <ConfirmDialog open={!!del} onOpenChange={v => !v && setDel(null)} danger title="删除这条记忆？" description="删除后停止后续检索并清理索引与缓存；已经生成的历史回复不会自动消失。" confirmText="删除" onConfirm={async () => { if (del) await deletePersonalMemory(del.id); setDel(null); refresh() }} />
    </>
  )
}

function EditDialog({ value, consumers, onClose, onSaved }: { value: (Partial<PersonalMemory> & { open?: boolean }) | null, consumers: { id: string, name: string }[], onClose: () => void, onSaved: () => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  if (!v)
    return null
  const save = async () => {
    if (!v.content?.trim())
      return
    if (v.id && v.status === 'candidate')
      await confirmCandidate(v.id, v.content)
    else if (v.id)
      await updatePersonalMemory(v.id, { kind: v.kind, content: v.content, consumers: v.consumers, valid_until: v.valid_until })
    else
      await createPersonalMemory({ kind: v.kind ?? 'preference', content: v.content, consumers: v.consumers ?? ['assistant'], valid_until: v.valid_until ?? null })
    onSaved()
    onClose()
  }
  return (
    <Dialog open={!!value?.open} onOpenChange={o => !o && onClose()} title={v.id ? (v.status === 'candidate' ? '修改后确认' : '编辑记忆') : '新增记忆'} description="写成助手能直接照做的一句话；涉及事实时写清有效期。" footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>保存</Button></>}>
      <div className="space-y-4">
        <Field label="类型"><Select value={v.kind ?? 'preference'} onValueChange={k => setV({ ...v, kind: k })} options={(['preference', 'background', 'experience', 'context'] as MemoryKind[]).map(k => ({ value: k, label: KIND_LABEL[k] }))} /></Field>
        <Field label="内容" required><Textarea rows={3} value={v.content ?? ''} onChange={e => setV({ ...v, content: e.target.value })} placeholder="例如：周报先写风险，再写进展和下周计划" /></Field>
        <Field label="允许使用的助手或 Buddy" hint="未勾选的 Buddy 不会读取这条记忆。">
          <div className="flex flex-wrap gap-2">{consumers.map(c => { const on = v.consumers?.includes(c.id); return <button key={c.id} type="button" onClick={() => setV({ ...v, consumers: on ? v.consumers?.filter(x => x !== c.id) : [...(v.consumers ?? []), c.id] })} className={cn('h-8 cursor-pointer rounded-md border px-2.5 text-[12.5px]', on ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2')}>{c.name}</button> })}</div>
        </Field>
        <Field label="有效期至" hint="留空表示长期有效；业务上下文建议写到期日。"><Input type="date" value={v.valid_until ?? ''} onChange={e => setV({ ...v, valid_until: e.target.value || null })} /></Field>
      </div>
    </Dialog>
  )
}

function ShareDialog({ m, onClose, onDone }: { m: PersonalMemory | null, onClose: () => void, onDone: (b: { team: string, title: string, content: string, scope: TeamMemory['scope'] }) => void }) {
  const [team, setTeam] = useState('FDE 交付中心')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  useEffect(() => { if (m) { setTitle(m.content.slice(0, 14)); setContent(m.content) } }, [m])
  return (
    <Dialog open={!!m} onOpenChange={o => !o && onClose()} size="lg" title="分享到团队记忆" description="预览将公开的内容，去掉客户名称、金额、个人信息等不应共享的内容；审查通过前不会被团队检索。" footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!content.trim() || !title.trim()} onClick={() => onDone({ team, title, content, scope: 'team' })}>提交审查</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4"><Field label="分享到"><Select value={team} onValueChange={setTeam} options={['FDE 交付中心', '售前方案团队', '销售管理'].map(t => ({ value: t, label: t }))} /></Field><Field label="条目标题"><Input value={title} onChange={e => setTitle(e.target.value)} /></Field></div>
        <Field label="将公开的内容" hint="团队条目与原个人记忆分开保存，保留来源关系；你可以随时撤回自己的分享。"><Textarea rows={4} value={content} onChange={e => setContent(e.target.value)} /></Field>
      </div>
    </Dialog>
  )
}

function Team() {
  const q = useQuery(() => listTeamMemory({}), [])
  return (
    <Section title="团队记忆" desc="经审查发布的经验、规范与业务背景；只有授权成员和被授权的助手能检索。" bodyClass="p-0">
      {q.error && <div className="p-4"><ErrorBar error={q.error} onRetry={q.reload} /></div>}
      <table className="w-full text-[13px]">
        <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">条目</th><th className="w-[130px] px-3 font-medium">团队</th><th className="w-[150px] px-3 font-medium">维护 / 审查</th><th className="w-[90px] px-3 font-medium">使用</th><th className="w-[100px] px-3 font-medium">状态</th><th className="w-[110px]" /></tr></thead>
        <tbody>
          {(q.data?.data ?? []).map(t => (
            <tr key={t.id} className="border-t border-line align-top">
              <td className="px-5 py-3"><p className="font-medium">{t.title}<span className="ml-2 text-[12px] font-normal text-ink-3">v{t.version} · {KIND_LABEL[t.kind]}</span></p><p className="mt-1 leading-relaxed text-ink-2">{t.content}</p><p className="mt-1 text-[12px] text-ink-3">来源：{t.source.label}{t.source.from ? ` · ${t.source.from}` : ''}</p></td>
              <td className="px-3 py-3 text-ink-2">{t.team}</td>
              <td className="px-3 py-3 text-ink-2">{t.maintainer} / {t.reviewer}</td>
              <td className="px-3 py-3 text-ink-2 tabular-nums">{t.use_count} 次</td>
              <td className="px-3 py-3"><Badge tone={TEAM_STATUS[t.status][1]}>{TEAM_STATUS[t.status][0]}</Badge></td>
              <td className="px-3 py-2.5 text-right">{t.status === 'published' && <><Button size="small" variant="ghost" onClick={async () => { await feedbackTeamMemory(t.id, true); q.reload() }}>有用 {t.feedback.up}</Button><Button size="small" variant="ghost" onClick={async () => { await feedbackTeamMemory(t.id, false); q.reload() }}>纠错 {t.feedback.down}</Button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function Reviews() {
  const toast = useToast()
  const q = useQuery(listMemoryReviews, [])
  const [reason, setReason] = useState<Record<string, string>>({})
  const list = q.data?.data ?? []
  return (
    <Section title="待我审查" desc="你是这些团队条目的审查人：核查来源、准确性、重复与冲突、时效以及分享权限。退回与拒绝需要写原因。">
      {!list.length && !q.loading && <EmptyState icon={<RiCheckLine className="size-5" />} title="没有待审查的条目" hint="团队成员提交分享或 Leader 复盘提出修订时会出现在这里。" />}
      <div className="space-y-3">
        {list.map(r => (
          <div key={r.id} className="rounded-lg border border-line p-4">
            <div className="flex items-center gap-2"><Badge tone={r.type === 'conflict' ? 'rose' : r.type === 'leader' ? 'volt' : 'neutral'}>{r.type === 'share' ? '成员分享' : r.type === 'leader' ? 'Leader 修订' : r.type === 'conflict' ? '冲突核对' : '更新'}</Badge><span className="text-[14px] font-semibold">{r.title}</span><span className="ml-auto text-[12px] text-ink-3">{r.from} · {r.team}</span></div>
            <p className="mt-2 rounded-md bg-surface p-3 text-[13.5px] leading-relaxed">{r.preview}</p>
            <p className="mt-2 text-[12.5px] text-ink-3">依据：{r.basis}</p>
            <ul className="mt-2 space-y-1">{r.checks.map(c => <li key={c.text} className={cn('text-[12.5px]', c.level === 'ok' ? 'text-ink-2' : c.level === 'warn' ? 'text-amber' : 'text-rose')}>{c.level === 'ok' ? '✓' : '!'} {c.text}</li>)}</ul>
            <div className="mt-3 flex items-center gap-2">
              <Input className="h-8 flex-1" placeholder="退回或拒绝时写原因" value={reason[r.id] ?? ''} onChange={e => setReason(x => ({ ...x, [r.id]: e.target.value }))} />
              <Button size="small" variant="primary" onClick={async () => { await decideMemoryReview(r.id, 'approve', ''); toast('已通过并发布'); q.reload() }}>通过</Button>
              <Button size="small" disabled={!reason[r.id]?.trim()} onClick={async () => { await decideMemoryReview(r.id, 'return', reason[r.id]); q.reload() }}>退回修改</Button>
              <Button size="small" variant="ghost" tone="destructive" disabled={!reason[r.id]?.trim()} onClick={async () => { await decideMemoryReview(r.id, 'reject', reason[r.id]); q.reload() }}>拒绝</Button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Optimize({ onChanged, go }: { onChanged: () => void, go: (p: string) => void }) {
  const toast = useToast()
  const q = useQuery(getMemoryHealth, [])
  const [picked, setPicked] = useState<string[]>([])
  const list = q.data?.suggestions ?? []
  const run = async (ids: string[]) => {
    const r = await applyMemoryOptimize(ids)
    toast(`已执行 ${r.applied} 项优化`)
    setPicked([])
    q.reload()
    onChanged()
    if (ids.includes('sg-skill'))
      go('tune/skills')
  }
  return (
    <Section title="体检与优化" desc="自动发现可以改进的地方；只做辅助治理，不替你做分享决定。" actions={<Button variant="primary" disabled={!picked.length} onClick={() => run(picked)}><RiSparkling2Line className="size-4" />执行所选（{picked.length}）</Button>}>
      {!list.length && !q.loading && <EmptyState icon={<RiCheckLine className="size-5" />} title="记忆状态良好" hint="没有需要优化的项目。" />}
      <div className="divide-y divide-line">
        {list.map(s => (
          <label key={s.id} className="flex cursor-pointer items-start gap-3 py-3.5 first:pt-0">
            <input type="checkbox" className="mt-1" checked={picked.includes(s.id)} onChange={e => setPicked(p => (e.target.checked ? [...p, s.id] : p.filter(x => x !== s.id)))} />
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[13.5px] font-medium">{s.title}<Badge tone={s.type === 'conflict' ? 'rose' : s.type === 'skill' ? 'volt' : s.type === 'candidate' ? 'amber' : 'neutral'}>{{ merge: '合并', conflict: '冲突', expire: '到期', stale: '未使用', skill: '沉淀 Skill', compress: '压缩', candidate: '候选' }[s.type]}</Badge></span><span className="mt-1 block text-[12.5px] leading-relaxed text-ink-2">{s.detail}</span><span className="mt-1 block text-[12px] text-ink-3">效果：{s.impact}</span></span>
            <Button size="small" onClick={(e) => { e.preventDefault(); s.type === 'candidate' ? go('tune/memory') : run([s.id]) }}>{s.action}</Button>
          </label>
        ))}
      </div>
    </Section>
  )
}

function Policy() {
  const toast = useToast()
  const q = useQuery(getMemoryPolicy, [])
  const [p, setP] = useState<MemoryPolicy | null>(null)
  useEffect(() => { if (q.data) setP(q.data.policy) }, [q.data])
  if (!p)
    return <Skeleton className="h-64" />
  const set = (x: Partial<MemoryPolicy>) => setP({ ...p, ...x })
  const toggleOn = (k: MemoryPolicy['extract_on'][number]) => set({ extract_on: p.extract_on.includes(k) ? p.extract_on.filter(x => x !== k) : [...p.extract_on, k] })
  return (
    <Section title="记忆策略" desc="暂停某条记忆、关闭全部检索、关闭新记忆提取分别控制。" actions={<Button variant="primary" onClick={async () => { await saveMemoryPolicy(p); toast('记忆策略已保存') }}>保存</Button>}>
      <SettingRow title="检索记忆" hint="关闭后所有助手和 Buddy 都不读取你的个人记忆，记忆本身保留。"><Switch aria-label="检索记忆" checked={p.retrieval} onCheckedChange={v => set({ retrieval: v })} /></SettingRow>
      <SettingRow title="提取新记忆" hint="关闭后不再从任务中提取候选，你仍可手动新增。"><Switch aria-label="提取新记忆" checked={p.extract} onCheckedChange={v => set({ extract: v })} /></SettingRow>
      <SettingRow title="什么时候提取候选" hint="提取的内容先进入候选，确认后才生效（企业版不可关闭确认）。">
        <div className="flex flex-wrap gap-1.5">{([['explicit', '我说「记住」'], ['task_end', '任务结束'], ['feedback', '我给出反馈'], ['correction', '我纠正回答']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => toggleOn(k)} className={cn('h-7 cursor-pointer rounded-md border px-2.5 text-[12.5px]', p.extract_on.includes(k) ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2')}>{l}</button>)}</div>
      </SettingRow>
      <SettingRow title="候选保留天数" hint="超过后未确认的候选自动清除。"><NumberInput className="w-28" value={p.candidate_ttl_days} min={3} max={60} suffix="天" onChange={v => set({ candidate_ttl_days: v })} /></SettingRow>
      <SettingRow title="每次对话最多带入" hint="按相关度挑选；太多会稀释重点并增加 Token。"><NumberInput className="w-28" value={p.max_context} min={3} max={30} suffix="条" onChange={v => set({ max_context: v })} /></SettingRow>
      <SettingRow title="自动合并重复" hint="内容相同的候选直接并入已有条目。"><Switch aria-label="自动合并重复" checked={p.dedupe} onCheckedChange={v => set({ dedupe: v })} /></SettingRow>
      <SettingRow title="冲突转「待我确认」" hint="个人与团队记忆、或与业务系统数据不一致时，不静默覆盖，交给你确认。"><Switch aria-label="冲突转待我确认" checked={p.conflict_to_review} onCheckedChange={v => set({ conflict_to_review: v })} /></SettingRow>
      <SettingRow title="提示沉淀为 Skill" hint="已稳定、无需反复推理的做法，建议沉淀为 Skill；仍需学习优化的经验保留在记忆。"><Switch aria-label="提示沉淀为 Skill" checked={p.suggest_skill} onCheckedChange={v => set({ suggest_skill: v })} /></SettingRow>
    </Section>
  )
}
