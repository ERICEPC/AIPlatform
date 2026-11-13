import type { SectionProps } from './detail'
import type { DistillDraft, LeaderMemory, LeaderMemoryConfig, LeaderSkill, LeaderSource, TeamRouterConfig } from '@/api/memory'
import { RiArrowRightLine, RiCheckLine, RiLock2Line, RiPlayLine, RiSave3Line, RiSparkling2Line, RiUserStarLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { decideLeaderProposal, distillExpertAgent, evaluateLeaderMemory, getLeaderMemory, KIND_LABEL, LEADER_SOURCE_LABEL, saveLeaderMemoryConfig, saveLeaderSkills, saveTeamRouter, TEAM_STATUS, updateLeaderEntry } from '@/api/memory'
import { Bars, KV, MetricRow, Section, SettingRow } from '@/components/console'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/form'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { agentAvatar } from './shared'

/*
  Leader（团长）：一个工作流的团队 Router。它可以是某个人的个人专家智能体，也可以是组织专家智能体。
  三件事：① 团队 Router——按什么方式分派、交接、在哪里停下来等人；② 记忆——参与角色、交接规则、协作反馈、SOP；
  ③ 技能——拆解、派发、交接检查、汇总、复盘。Leader 只读各 Agent 已发布记忆的摘要，不读成员的私人记忆。
*/
type Sub = 'router' | 'memory' | 'skills' | 'review' | 'config'
const PURPOSE: Record<LeaderSkill['purpose'], string> = { plan: '拆解', dispatch: '派发', handoff: '交接检查', summary: '汇总', review: '复盘' }

export function TeamLeader({ team }: SectionProps) {
  const q = useQuery(() => getLeaderMemory(team.id), [team.id, team.revision])
  const [sub, setSub] = useState<Sub>('router')
  const d = q.data
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-10">
      <div className="mx-auto max-w-[1120px] space-y-4">
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        {!d ? <Skeleton className="h-72" /> : (
          <>
            <LeaderCard d={d} />
            <Segmented value={sub} onValueChange={setSub} aria-label="Leader 分区" options={[{ value: 'router', label: '团队 Router' }, { value: 'memory', label: '团队记忆', count: d.entries.length }, { value: 'skills', label: 'Leader 技能', count: d.skills.filter(s => s.enabled).length }, { value: 'review', label: '复盘与优化', count: d.evaluation.proposals.filter(p => p.status === 'open').length }, { value: 'config', label: '记忆配置' }]} />
            {sub === 'router' && <RouterPanel teamId={team.id} router={d.router} onSaved={q.reload} />}
            {sub === 'memory' && <MemoryPanel teamId={team.id} d={d} onChanged={q.reload} />}
            {sub === 'skills' && <SkillsPanel teamId={team.id} skills={d.skills} onSaved={q.reload} />}
            {sub === 'review' && <ReviewPanel teamId={team.id} d={d} onChanged={q.reload} />}
            {sub === 'config' && <ConfigPanel teamId={team.id} config={d.config} onSaved={q.reload} />}
          </>
        )}
      </div>
    </div>
  )
}

function LeaderCard({ d }: { d: LeaderMemory }) {
  return (
    <div className="grid grid-cols-[1.1fr_1.9fr] gap-4 max-xl:grid-cols-1">
      <Section title="Leader" desc="在「成员」里更换。">
        <div className="flex items-center gap-3">
          <img src={agentAvatar({ id: d.leader.id, name: d.leader.name })} alt="" className="size-12 rounded-full border border-line bg-surface" />
          <div>
            <p className="flex items-center gap-2 text-[15px] font-semibold"><RiUserStarLine className="size-4 text-volt-text" />{d.leader.name}</p>
            <p className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3"><Badge tone={d.leader.kind === 'org' ? 'volt' : 'neutral'}>{d.leader.kind === 'org' ? '组织专家智能体' : '个人专家智能体'}</Badge>{d.leader.owner}</p>
          </div>
        </div>
      </Section>
      <Section title="三层记忆，各管各的" desc="加入团队不会自动共享私人记忆；Leader 只维护本团队的团队记忆。">
        <div className="grid grid-cols-3 gap-3 text-[12.5px] max-lg:grid-cols-1">
          <div className="rounded-lg border border-line bg-surface p-3"><p className="flex items-center gap-1.5 font-semibold text-ink"><RiLock2Line className="size-3.5" />个人记忆</p><p className="mt-1 text-ink-3">{d.layers.assistants.map(a => a.name).join('、')}</p><p className="mt-1 text-ink-2">私有 · Leader 不可读</p></div>
          <div className="rounded-lg border border-line bg-surface p-3"><p className="font-semibold text-ink">成员专家记忆</p><p className="mt-1 text-ink-3">{d.layers.agents.map(a => `${a.name} ${a.entries} 条`).join('、')}</p><p className="mt-1 text-ink-2">由各自维护人管理 · Leader 只读摘要</p></div>
          <div className="rounded-lg border border-volt/40 bg-volt-soft p-3"><p className="font-semibold text-volt-text">团队记忆（Leader 维护）</p><p className="mt-1 text-ink-2">{d.entries.length} 条 · 参与角色、交接规则、协作反馈、SOP</p><p className="mt-1 text-ink-2">审查后生效</p></div>
        </div>
      </Section>
    </div>
  )
}

function RouterPanel({ teamId, router, onSaved }: { teamId: string, router: TeamRouterConfig, onSaved: () => void }) {
  const toast = useToast()
  const [r, setR] = useState(router)
  useEffect(() => setR(router), [router])
  return (
    <Section title="团队 Router" desc="Leader 在本工作流里怎么分派与交接。个人助手侧的 Router 只决定是否把任务交给这个团队。" actions={<Button variant="primary" onClick={async () => { await saveTeamRouter(teamId, r); toast('团队 Router 已保存，保存草稿并发布后对正式调用生效'); onSaved() }}><RiSave3Line className="size-4" />保存</Button>}>
      <SettingRow title="分派方式" hint="Leader 决定：按任务动态选择成员与顺序；按顺序：成员依次接力；并行：同时派给全部成员再汇总。"><Select size="sm" className="w-48" value={r.dispatch} onValueChange={v => setR({ ...r, dispatch: v })} options={[{ value: 'leader', label: 'Leader 决定' }, { value: 'sequential', label: '按顺序接力' }, { value: 'parallel', label: '并行后汇总' }]} /></SettingRow>
      <SettingRow title="最多轮次" hint="一次任务里 Leader 规划—执行—复核的轮数上限。"><NumberInput className="w-28" value={r.max_rounds} min={1} max={5} onChange={v => setR({ ...r, max_rounds: v })} /></SettingRow>
      <SettingRow title="同时执行的成员数"><NumberInput className="w-28" value={r.parallelism} min={1} max={8} onChange={v => setR({ ...r, parallelism: v })} /></SettingRow>
      <SettingRow title="交接格式" hint="每位成员交回结果时必须带齐的内容，Leader 用「交接检查」技能核对。"><Input className="w-72" value={r.handoff_format} onChange={e => setR({ ...r, handoff_format: e.target.value })} /></SettingRow>
      <SettingRow title="人工确认点" hint="到这些节点暂停，生成「待我确认」，确认后继续；不依赖确认的步骤照常执行。"><Input className="w-72" value={r.checkpoints.join('，')} onChange={e => setR({ ...r, checkpoints: e.target.value.split(/[,，]\s*/).filter(Boolean) })} /></SettingRow>
      <SettingRow title="转人处理的情况"><Input className="w-72" value={r.escalate_to_human.join('，')} onChange={e => setR({ ...r, escalate_to_human: e.target.value.split(/[,，]\s*/).filter(Boolean) })} /></SettingRow>
    </Section>
  )
}

function MemoryPanel({ teamId, d, onChanged }: { teamId: string, d: LeaderMemory, onChanged: () => void }) {
  const toast = useToast()
  const [edit, setEdit] = useState<{ id: string, content: string } | null>(null)
  const kinds: (keyof typeof KIND_LABEL)[] = ['role', 'handoff', 'feedback', 'sop', 'experience']
  return (
    <Section title="团队记忆" desc="已稳定、无需反复推理的做法可在「复盘与优化」里沉淀为 Leader 技能；修改已发布条目会重新进入审查。">
      <div className="space-y-5">
        {kinds.filter(k => d.entries.some(e => e.kind === k)).map(k => (
          <div key={k}>
            <p className="mb-2 text-[12.5px] font-semibold text-ink-2">{KIND_LABEL[k]}</p>
            <div className="divide-y divide-line rounded-lg border border-line">
              {d.entries.filter(e => e.kind === k).map(e => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">{e.title}<span className="ml-2 text-[12px] font-normal text-ink-3">v{e.version} · 使用 {e.use_count} 次</span></p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{e.content}</p>
                    <p className="mt-1 text-[12px] text-ink-3">来源：{e.source.label} · 审查人 {e.reviewer}</p>
                  </div>
                  <Badge tone={TEAM_STATUS[e.status][1]}>{TEAM_STATUS[e.status][0]}</Badge>
                  <Button size="small" variant="ghost" onClick={() => setEdit({ id: e.id, content: e.content })}>编辑</Button>
                  {e.status === 'published' && <Button size="small" variant="ghost" tone="destructive" onClick={async () => { await updateLeaderEntry(teamId, e.id, { status: 'revoked' }); toast('已停用，停止后续检索', 'info'); onChanged() }}>停用</Button>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)} title="编辑团队记忆" description="已发布条目修改后进入待审查，审查通过前继续使用原版本。" footer={<><Button onClick={() => setEdit(null)}>取消</Button><Button variant="primary" onClick={async () => { if (edit) await updateLeaderEntry(teamId, edit.id, { content: edit.content }); setEdit(null); onChanged() }}>提交</Button></>}>
        <Textarea rows={4} value={edit?.content ?? ''} onChange={e => setEdit(x => (x ? { ...x, content: e.target.value } : x))} />
      </Dialog>
    </Section>
  )
}

function SkillsPanel({ teamId, skills, onSaved }: { teamId: string, skills: LeaderSkill[], onSaved: () => void }) {
  const toast = useToast()
  const [list, setList] = useState(skills)
  useEffect(() => setList(skills), [skills])
  return (
    <Section title="Leader 技能" desc="Leader 统筹时调用的技能；成员各自的技能在成员的智能体配置里管理。" actions={<Button variant="primary" onClick={async () => { await saveLeaderSkills(teamId, list); toast('Leader 技能已保存'); onSaved() }}><RiSave3Line className="size-4" />保存</Button>} bodyClass="p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-surface text-left text-[12px] text-ink-3"><tr><th className="w-[90px] px-5 py-2 font-medium">环节</th><th className="px-3 font-medium">技能</th><th className="w-[110px] px-3 font-medium">来源</th><th className="w-[80px] px-3 font-medium">版本</th><th className="w-[90px] px-3 font-medium">使用</th><th className="w-[80px] px-3 font-medium">启用</th></tr></thead>
        <tbody>
          {list.map(s => (
            <tr key={s.id} className="border-t border-line align-top">
              <td className="px-5 py-3"><Badge tone="volt">{PURPOSE[s.purpose]}</Badge></td>
              <td className="px-3 py-3"><p className="font-medium">{s.name}</p><p className="mt-0.5 text-[12.5px] text-ink-3">{s.desc}</p></td>
              <td className="px-3 py-3 text-ink-2">{s.source === 'org' ? '组织共享' : s.source === 'team' ? '本团队沉淀' : '个人'}</td>
              <td className="px-3 py-3 text-ink-2">{s.version}</td>
              <td className="px-3 py-3 text-ink-2 tabular-nums">{s.uses} 次</td>
              <td className="px-3 py-3"><Switch aria-label={`启用 ${s.name}`} checked={s.enabled} onCheckedChange={v => setList(l => l.map(x => (x.id === s.id ? { ...x, enabled: v } : x)))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function ReviewPanel({ teamId, d, onChanged }: { teamId: string, d: LeaderMemory, onChanged: () => void }) {
  const toast = useToast()
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [busy, setBusy] = useState(false)
  const [distill, setDistill] = useState<DistillDraft | null>(null)
  const e = d.evaluation
  return (
    <div className="space-y-4">
      <MetricRow items={[
        { label: `运行（${e.period}）`, value: e.runs },
        { label: '成功率', value: `${e.success_rate}%`, tone: 'volt' },
        { label: '平均交接次数', value: e.avg_handoffs },
        { label: '返工率', value: `${e.rework_rate}%`, tone: e.rework_rate > 10 ? 'amber' : undefined },
        { label: '人工介入 / 次', value: e.human_touches },
        { label: '平均耗时', value: `${e.avg_latency} 秒` },
      ]} />
      <div className="grid grid-cols-[1fr_1.4fr] gap-4 max-xl:grid-cols-1">
        <Section title="返工率趋势" actions={<><Select size="sm" className="w-28" value={range} onValueChange={setRange} options={[{ value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' }, { value: '90d', label: '近 90 天' }]} /><Button loading={busy} onClick={async () => { setBusy(true); await evaluateLeaderMemory(teamId, range); setBusy(false); toast('Leader 已完成复盘'); onChanged() }}><RiPlayLine className="size-4" />运行复盘</Button></>}>
          <Bars data={e.trend.map(x => Math.round(x * 10) / 10)} unit="%" height={110} />
          <p className="mt-2 text-[12px] text-ink-3">最近一次复盘：{new Date(e.evaluated_at).toLocaleString('zh-CN')}</p>
        </Section>
        <Section title="瓶颈" desc="哪一步、哪个成员最常被退回或返工。">
          <div className="divide-y divide-line">{e.bottlenecks.map(b => <div key={b.step} className="flex items-center gap-3 py-2.5 first:pt-0"><Badge tone="amber">{b.step}</Badge><span className="flex-1 text-[13px]">{b.issue}</span><span className="text-[12.5px] text-ink-3">{b.runs} 次</span></div>)}</div>
        </Section>
      </div>
      <Section title="Leader 的优化建议" desc="采纳后进入团队记忆审查；提炼专家智能体需要提交发布审批。">
        <div className="space-y-3">
          {e.proposals.map(p => (
            <div key={p.id} className={cn('rounded-lg border p-4', p.status === 'open' ? 'border-line' : 'border-line opacity-60')}>
              <div className="flex items-center gap-2"><Badge tone={p.type === 'distill' ? 'volt' : 'neutral'}>{{ sop: 'SOP', handoff: '交接规则', role: '成员职责', skill: '沉淀技能', distill: '提炼专家智能体' }[p.type]}</Badge><span className="text-[14px] font-semibold">{p.title}</span>{p.status !== 'open' && <Badge tone={p.status === 'submitted' ? 'mint' : 'neutral'}>{p.status === 'submitted' ? '已提交' : '已忽略'}</Badge>}</div>
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 text-[13px] max-lg:grid-cols-1">
                <div className="rounded-md bg-surface p-3"><p className="text-[12px] text-ink-3">现在</p><p className="mt-1 text-ink-2">{p.before}</p></div>
                <RiArrowRightLine className="size-4 self-center text-ink-3 max-lg:hidden" />
                <div className="rounded-md border border-volt/30 bg-volt-soft p-3"><p className="text-[12px] text-volt-text">建议</p><p className="mt-1">{p.after}</p></div>
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">依据：{p.evidence} · 效果：{p.impact}</p>
              {p.status === 'open' && (
                <div className="mt-3 flex gap-2">
                  {p.type === 'distill'
                    ? <Button size="small" variant="primary" onClick={() => setDistill({ name: p.title.replace(/.*「(.+)」.*/, '$1'), role: '岗位专家智能体', skills: d.skills.filter(s => s.enabled).map(s => s.name), memory_ids: d.entries.filter(x => x.status === 'published').map(x => x.id), reviewer: '业务管理员', note: '' })}><RiSparkling2Line className="size-3.5" />提炼并提交审批</Button>
                    : <Button size="small" variant="primary" onClick={async () => { await decideLeaderProposal(teamId, p.id, 'submit'); toast('已采纳，进入团队记忆审查'); onChanged() }}><RiCheckLine className="size-3.5" />采纳</Button>}
                  <Button size="small" variant="ghost" onClick={async () => { await decideLeaderProposal(teamId, p.id, 'dismiss'); onChanged() }}>忽略</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
      <Dialog open={!!distill} onOpenChange={o => !o && setDistill(null)} size="lg" title="提炼岗位专家智能体" description="Leader 合并成员已发布的记忆、本团队的团队记忆与 Leader 技能，生成一个专家智能体草稿；管理员审批通过后才会发布，其他用户才能看到。" footer={<><Button onClick={() => setDistill(null)}>取消</Button><Button variant="primary" onClick={async () => { if (!distill) return; const r = await distillExpertAgent(teamId, distill); setDistill(null); toast(`已生成草稿并提交发布审批（${r.approval_id}）`); onChanged() }}>生成草稿并提交审批</Button></>}>
        {distill && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4"><Field label="名称" required><Input value={distill.name} onChange={e => setDistill({ ...distill, name: e.target.value })} /></Field><Field label="审批人"><Input value={distill.reviewer} disabled /></Field></div>
            <KV cols={2} items={[['包含的团队记忆', `${distill.memory_ids.length} 条已发布条目`], ['包含的技能', distill.skills.join('、')]]} />
            <Field label="补充说明" hint="写清适用场景与边界，审批人据此判断可见范围。"><Textarea rows={3} value={distill.note} onChange={e => setDistill({ ...distill, note: e.target.value })} placeholder="例如：适用于私有化售前方案；报价只出草稿，需销售负责人确认" /></Field>
          </div>
        )}
      </Dialog>
    </div>
  )
}

function ConfigPanel({ teamId, config, onSaved }: { teamId: string, config: LeaderMemoryConfig, onSaved: () => void }) {
  const toast = useToast()
  const [c, setC] = useState(config)
  useEffect(() => setC(config), [config])
  const toggleSource = (s: LeaderSource) => setC({ ...c, sources: c.sources.includes(s) ? c.sources.filter(x => x !== s) : [...c.sources, s] })
  return (
    <Section title="Leader 记忆配置" actions={<Button variant="primary" onClick={async () => { await saveLeaderMemoryConfig(teamId, c); toast('已保存 Leader 记忆配置'); onSaved() }}><RiSave3Line className="size-4" />保存</Button>}>
      <SettingRow title="启用 Leader 记忆" hint="关闭后 Leader 不再提取新条目，已发布的团队记忆仍按策略检索。"><Switch aria-label="启用 Leader 记忆" checked={c.enabled} onCheckedChange={v => setC({ ...c, enabled: v })} /></SettingRow>
      <SettingRow title="复盘依据" hint="Leader 从这些来源评价协作效果。">
        <div className="flex max-w-[520px] flex-wrap justify-end gap-1.5">{(Object.keys(LEADER_SOURCE_LABEL) as LeaderSource[]).map(s => <button key={s} type="button" title={LEADER_SOURCE_LABEL[s][1]} onClick={() => toggleSource(s)} className={cn('h-7 cursor-pointer rounded-md border px-2.5 text-[12.5px]', c.sources.includes(s) ? 'border-volt bg-volt-soft text-volt-text' : 'border-line text-ink-2')}>{LEADER_SOURCE_LABEL[s][0]}</button>)}</div>
      </SettingRow>
      <SettingRow title="读取成员私人记忆" hint="固定关闭：加入团队不会共享私人记忆。"><span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><RiLock2Line className="size-4" />不允许</span></SettingRow>
      <SettingRow title="新条目写入方式"><Select size="sm" className="w-56" value={c.write_mode} onValueChange={v => setC({ ...c, write_mode: v })} options={[{ value: 'candidate', label: '先进候选，审查后生效' }, { value: 'direct_low_risk', label: '低风险交接参数直接生效' }]} /></SettingRow>
      <SettingRow title="审查人"><Input className="w-56" value={c.reviewer} onChange={e => setC({ ...c, reviewer: e.target.value })} /></SettingRow>
      <SettingRow title="使用范围"><Select size="sm" className="w-56" value={c.scope} onValueChange={v => setC({ ...c, scope: v })} options={[{ value: 'workflow', label: '仅本工作流' }, { value: 'team', label: '本团队全部工作流' }, { value: 'org', label: '组织内（需管理员审批）' }]} /></SettingRow>
      <SettingRow title="复盘频率"><Select size="sm" className="w-56" value={c.cadence} onValueChange={v => setC({ ...c, cadence: v })} options={[{ value: 'per_run', label: '每次运行后' }, { value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }]} /></SettingRow>
      <SettingRow title="至少累计运行" hint="样本太少时不提出修订。"><NumberInput className="w-28" value={c.min_runs} min={3} max={100} suffix="次" onChange={v => setC({ ...c, min_runs: v })} /></SettingRow>
      <SettingRow title="运行记录保留"><NumberInput className="w-28" value={c.retention_days} min={30} max={730} suffix="天" onChange={v => setC({ ...c, retention_days: v })} /></SettingRow>
    </Section>
  )
}
