import { useEffect, useRef, useState } from 'react'
import type { CollabGroup } from '@/api/collab'
import type { Agent } from '@/api/teams'
import { blankConfig, listTeams } from '@/api/teams'
import { getExpertTeamRequest, submitExpertTeam, STATE_TEXT } from '@/api/releases'
import type { ReleaseRequest } from '@/api/releases'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useSession } from '@/lib/session'

export function ExpertTeamDialog({ group, open, onOpenChange }: { group: CollabGroup, open: boolean, onOpenChange: (o: boolean) => void }) {
  const { perms } = useSession()
  const [agents, setAgents] = useState<Agent[]>([])
  const [request, setRequest] = useState<ReleaseRequest | null>(null)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [output, setOutput] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [duties, setDuties] = useState<Record<string, string>>({})
  const [leader, setLeader] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const guard = useRef(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true); setError(''); setRequest(null)
    setName(`${group.name}专家团`); setGoal(group.description); setOutput(''); setLeader(group.members[0]?.id ?? '')
    setDuties(Object.fromEntries(group.members.map(m => [m.id, group.delegations.filter(d => d.to === m.id).map(d => d.task).join('；') || (m.kind === 'assistant' ? m.role : m.description)])))
    Promise.all([listTeams(), getExpertTeamRequest(group.id)]).then(([teams, latest]) => {
      if (cancelled) return
      setAgents(teams.agents); setRequest(latest.request)
      setMapping(Object.fromEntries(group.members.map(m => [m.id, teams.agents.some(a => a.id === m.id) ? m.id : ''])))
      setLoading(false)
    }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [open, group.id, retry])
  const locked = request?.state === 'pending' || request?.state === 'approved'
  const submit = async () => {
    if (guard.current) return
    const ids = group.members.map(m => mapping[m.id])
    if (!name.trim() || !goal.trim() || !output.trim() || ids.some(id => !id) || !leader || group.members.some(m => !duties[m.id]?.trim())) { setError('请填写名称、目标、产出，为每位成员选择专家智能体并填写职责。'); return }
    if (new Set(ids).size !== ids.length) { setError('每位成员请选择不同的专家智能体。'); return }
    guard.current = true; setBusy(true); setError('')
    try {
      const r = await submitExpertTeam(group.id, {
        scope: perms?.department || perms?.tenant.name || '',
        member_mapping: group.members.map(m => ({ source: m.id, agent_id: mapping[m.id] })),
        config: { ...blankConfig(), name: name.trim(), description: `来源：${group.name}`, goal: `${goal.trim()}\n\n团长职责：${duties[leader]}`, output: output.trim(), leader_id: mapping[leader], members: group.members.filter(m => m.id !== leader).map(m => ({ agent_id: mapping[m.id], responsibility: duties[m.id], input_hint: '' })) },
      })
      setRequest(r)
    } catch (e) { setError((e as Error).message) }
    finally { guard.current = false; setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o) }} title="沉淀为专家团" description="将协作分工沉淀为可复用的智能体团队。管理员审批通过后才加入团队列表。" size="lg" footer={<><Button disabled={busy} onClick={() => onOpenChange(false)}>关闭</Button>{!locked && <Button variant="primary" disabled={loading || !agents.length || group.members.length < 2 || group.members.length > 9} loading={busy} onClick={submit}>提交管理员审批</Button>}</>}>
    <div className="space-y-4">
      {loading ? <p>正在读取成员与审批状态…</p> : locked ? <div className="space-y-3"><p className="font-medium">{request!.name} · {STATE_TEXT[request!.state][0]}</p><p className="text-sm text-ink-2">{request!.state === 'pending' ? '申请已提交，可在“我的发布”查看进度，管理员在“发布审批”处理。审批前不会生成团队。' : '管理员已通过，专家团已加入智能体团队。'}</p>{request!.expert_team?.team_id && <Button onClick={() => { location.hash = `teams/${request!.expert_team!.team_id}` }}>查看智能体团队</Button>}</div> : <>
        {request && <p className="text-sm text-amber">上次申请：{STATE_TEXT[request.state][0]}。{request.comment} 可修改后重新提交。</p>}
        <Field label="专家团名称" required><Input maxLength={80} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="团队目标" required><Textarea maxLength={5500} value={goal} onChange={e => setGoal(e.target.value)} /></Field>
        <Field label="预期产出" required><Input value={output} onChange={e => setOutput(e.target.value)} placeholder="例如：上线评估报告、风险清单与行动建议" /></Field>
        <Field label="团长"><Select value={leader} onValueChange={setLeader} options={group.members.map(m => ({ value: m.id, label: m.name }))} /></Field>
        <p className="text-xs text-ink-3">为群成员选择已发布的专家智能体承接职责；个人助手可先通过“智能体 → 从个人助手创建”配置并申请发布。群聊原文和私人记忆不纳入。</p>
        {group.members.map(m => <div key={m.id} className="space-y-2 rounded-md border border-line p-3"><Field label={`${m.name}${m.id === leader ? '（团长）' : ''}`}><Select value={mapping[m.id] || ''} onValueChange={id => setMapping(v => ({ ...v, [m.id]: id }))} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="选择已发布的专家智能体" /></Field><Input aria-label={`${m.name}的职责`} value={duties[m.id] || ''} onChange={e => setDuties(v => ({ ...v, [m.id]: e.target.value }))} placeholder="负责什么" /></div>)}
        {(group.members.length < 2 || group.members.length > 9) && <p className="text-rose">专家团需要 1 位团长和 1–8 位专家，请先调整群成员。</p>}
      </>}
      {error && <div className="text-sm text-rose">{error}{!agents.length && <Button onClick={() => setRetry(v => v + 1)}>重新加载</Button>}</div>}
    </div>
  </Dialog>
}
