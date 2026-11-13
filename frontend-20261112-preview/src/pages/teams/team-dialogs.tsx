import type { MenuItem } from '@/components/ui/menu'
import type { TeamAgent } from './agent-source'
import type { Config, Member, Team, TeamAvatarValue } from '@/api/teams'
import { RiAddLine, RiCloseLine, RiDeleteBinLine, RiDownload2Line, RiEditLine, RiFileCopyLine } from '@remixicon/react'
import { useState } from 'react'
import { blankConfig, copyTeam, createTeam, deleteTeam, exportTeam, joinGoal, MAX_MEMBERS, updateTeamInfo } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { AgentFace, defaultDuty } from './agent-source'
import { downloadText, emojiUrl, errText, isConflict, TEAM_EMOJIS, TeamAvatar } from './shared'

/** 下拉选项：只列已发布的 Agent（来自 Agents 模块） */
export const agentOptions = (agents: TeamAgent[]) => agents.filter(a => a.version != null).map(a => ({ value: a.id, label: a.name, hint: `v${a.version}${a.description ? ` · ${a.description}` : ''}` }))

/* ---------------- 新建团队 ---------------- */
export function CreateTeamDialog({ open, onOpenChange, agents, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, agents: TeamAgent[], onCreated: (t: Team) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [leader, setLeader] = useState('')
  const [members, setMembers] = useState<Member[]>([{ agent_id: '', responsibility: '', input_hint: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tried, setTried] = useState(false)
  const toast = useToast()
  const reset = () => { setName(''); setDescription(''); setGoal(''); setLeader(''); setMembers([{ agent_id: '', responsibility: '', input_hint: '' }]); setError(''); setTried(false) }
  const valid = name.trim() && goal.trim() && leader && members.length > 0 && members.every(m => m.agent_id)
  const patch = (i: number, p: Partial<Member>) => setMembers(ms => ms.map((m, j) => (j === i ? { ...m, ...p } : m)))
  const submit = async () => {
    setTried(true)
    if (!valid)
      return
    setBusy(true)
    setError('')
    try {
      const config: Config = { ...blankConfig(), avatar: { type: 'emoji', icon: TEAM_EMOJIS[Math.floor(Math.random() * TEAM_EMOJIS.length)] }, name: name.trim(), description: description.trim(), goal: joinGoal(goal.trim(), ''), leader_id: leader, members: members.map((m) => {
        const a = agents.find(x => x.id === m.agent_id)
        return { ...m, responsibility: m.responsibility.trim() || defaultDuty(a ?? { name: 'Agent', description: '', role: '' }) }
      }) }
      const t = await createTeam(config)
      toast(`已创建「${t.name}」，可以在「成员」里继续调整`)
      reset()
      onCreated(t)
    }
    catch (e) {
      setError(errText(e))
    }
    finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}
      size="lg"
      title="新建团队"
      description="选一位团长和至少一个参与的 Agent，写清团队要完成的任务。运行设置可以稍后在「成员」里调整。"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button variant="primary" loading={busy} onClick={submit}>创建团队</Button></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="团队名称" required aside={`${name.length}/80`} error={tried && !name.trim() ? '请填写团队名称' : undefined}>
            <Input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="例如：客户经营专家团" invalid={tried && !name.trim()} />
          </Field>
          <Field label="简介" aside={`${description.length}/400`}>
            <Input value={description} maxLength={400} onChange={e => setDescription(e.target.value)} placeholder="一句话说明这个团队" />
          </Field>
        </div>
        <Field label="这个团队帮你做什么" required error={tried && !goal.trim() ? '请填写团队任务' : undefined}>
          <Textarea rows={3} value={goal} maxLength={6000} onChange={e => setGoal(e.target.value)} placeholder="例如：根据客户需求，整理产品建议、技术待确认事项和下一步跟进计划。" invalid={tried && !goal.trim()} />
        </Field>
        <Field label="团长" required hint="团长负责理解任务、决定请哪些 Agent 参与，并汇总成一份答复。" error={tried && !leader ? '请选择团长' : undefined}>
          <Select value={leader} onValueChange={setLeader} options={agentOptions(agents)} placeholder="选择已发布的 Agent" />
        </Field>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium">参与的 Agent<span className="ml-0.5 text-rose">*</span><span className="ml-2 text-[12px] font-normal text-ink-3 tabular-nums">{members.length}/{MAX_MEMBERS}</span></p>
            <Button size="small" variant="ghost-accent" disabled={members.length >= MAX_MEMBERS} onClick={() => setMembers(ms => [...ms, { agent_id: '', responsibility: '', input_hint: '' }])}><RiAddLine className="size-4" />添加 Agent</Button>
          </div>
          {members.map((m, i) => (
            <div key={i} className="grid grid-cols-[200px_1fr_auto] items-start gap-2">
              <Select value={m.agent_id} onValueChange={v => patch(i, { agent_id: v })} options={agentOptions(agents)} placeholder={`Agent ${i + 1}`} />
              <Input value={m.responsibility} maxLength={1000} onChange={e => patch(i, { responsibility: e.target.value })} placeholder="负责什么（选填，留空用 Agent 简介）" />
              <Button size="icon" variant="ghost" aria-label={`移除 Agent ${i + 1}`} disabled={members.length <= 1} onClick={() => setMembers(ms => ms.filter((_, j) => j !== i))}><RiCloseLine className="size-4" /></Button>
            </div>
          ))}
          {tried && members.some(m => !m.agent_id) && <p className="text-[12px] text-rose">请为每一行选择一个 Agent，或删掉空行</p>}
        </div>
        {error && <p className="rounded-xl bg-rose-soft px-3 py-2 text-[12.5px] text-rose">{error}</p>}
      </div>
    </Dialog>
  )
}

/* ---------------- 编辑信息 / 复制 / 删除 / 导出 ---------------- */
type Op = 'info' | 'copy' | 'delete'
export function useTeamActions(team: Team | undefined, { onChanged, onConflict, onCopied, onDeleted }: { onChanged: () => void, onConflict: (msg: string) => void, onCopied?: (t: Team) => void, onDeleted?: () => void }) {
  const [op, setOp] = useState<Op | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState<TeamAvatarValue | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  const open = (next: Op) => {
    if (!team)
      return
    setOp(next)
    setError('')
    setName(next === 'copy' ? `${team.name.slice(0, 75)} 副本` : team.name)
    setDescription(team.config.description ?? '')
    setAvatar(team.config.avatar ?? null)
  }
  const run = async () => {
    if (!team || !op)
      return
    setBusy(true)
    setError('')
    try {
      if (op === 'info') {
        await updateTeamInfo(team.id, { revision: team.revision, name: name.trim(), description: description.trim(), avatar })
        toast('团队信息已更新')
      }
      else if (op === 'copy') {
        const t = await copyTeam(team.id, { revision: team.revision, name: name.trim(), description: description.trim() })
        toast(`已复制为「${t.name}」，副本为草稿`)
        onCopied?.(t)
      }
      else {
        await deleteTeam(team.id, team.revision)
        toast(`已删除「${team.name}」`, 'info')
        onDeleted?.()
      }
      setOp(null)
      onChanged()
    }
    catch (e) {
      if (isConflict(e) && op !== 'delete') {
        setOp(null)
        onConflict(errText(e))
      }
      else {
        setError(errText(e))
      }
    }
    finally {
      setBusy(false)
    }
  }
  const exportDsl = async () => {
    if (!team)
      return
    try {
      const r = await exportTeam(team.id)
      downloadText(`${r.name}.team.yml`, r.data)
      toast('已导出团队 DSL（只包含 Agent 引用，不含凭据）')
    }
    catch (e) {
      toast(errText(e, '导出失败，请重试'), 'info')
    }
  }
  const items: MenuItem[] = [
    { label: '编辑信息', icon: RiEditLine, onSelect: () => open('info') },
    { label: '复制', icon: RiFileCopyLine, onSelect: () => open('copy') },
    { label: '导出 DSL', icon: RiDownload2Line, onSelect: exportDsl },
    'separator',
    { label: '删除', icon: RiDeleteBinLine, danger: true, onSelect: () => open('delete') },
  ]
  const dialogs = team && (
    <>
      <Dialog
        open={op === 'info' || op === 'copy'}
        onOpenChange={o => !o && !busy && setOp(null)}
        title={op === 'copy' ? '复制团队' : '编辑团队信息'}
        description={op === 'copy' ? '只复制团队配置，不复制 API Key、消息渠道、运行记录和发布版本。' : undefined}
        footer={<><Button variant="ghost" onClick={() => setOp(null)}>取消</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={run}>{op === 'copy' ? '创建副本' : '保存'}</Button></>}
      >
        <div className="space-y-4">
          {op === 'info' && (
            <Field label="头像">
              <div className="flex flex-wrap gap-1.5">
                {TEAM_EMOJIS.map(e => (
                  <button key={e} type="button" aria-label={`选择头像 ${e}`} onClick={() => setAvatar({ type: 'emoji', icon: e })} className={cn('grid size-11 cursor-pointer place-items-center rounded-2xl border transition-colors', avatar?.icon === e ? 'border-volt bg-volt-soft' : 'border-line hover:bg-hover')}>
                    <img src={emojiUrl(e)} alt="" className="size-8" />
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="团队名称" required aside={`${name.length}/80`}>
            <div className="flex items-center gap-3">
              <TeamAvatar value={avatar} name={name} size={44} />
              <Input value={name} maxLength={80} onChange={e => setName(e.target.value)} />
            </div>
          </Field>
          <Field label="简介" aside={`${description.length}/400`}>
            <Textarea rows={3} value={description} maxLength={400} onChange={e => setDescription(e.target.value)} placeholder="一句话说明这个团队做什么" />
          </Field>
          {error && <p className="text-[12.5px] text-rose">{error}</p>}
        </div>
      </Dialog>
      <ConfirmDialog
        open={op === 'delete'}
        onOpenChange={o => !o && !busy && setOp(null)}
        danger
        loading={busy}
        title={`删除「${team.name}」？`}
        confirmText="确认删除"
        onConfirm={run}
        description={(
          <span className="block space-y-1.5">
            <span className="block">删除后无法恢复：</span>
            <span className="block">· 团队的 API Key 立即失效</span>
            <span className="block">· 绑定的消息渠道全部停用</span>
            <span className="block">· 团长和参与的 Agent 保留，不受影响</span>
            {error && <span className="mt-2 block rounded-xl bg-rose-soft px-3 py-2 text-rose">{error}</span>}
          </span>
        )}
      />
    </>
  )
  return { items, dialogs }
}

/** 列表卡片里的成员头像叠放：团长（高亮描边）在前，参与的 Agent 依次叠放 */
export function LineUp({ config, resolve, size = 32 }: { config: Config, resolve: (id: string) => TeamAgent, size?: number }) {
  const lead = config.leader_id ? resolve(config.leader_id) : null
  const ms = config.members.map(m => resolve(m.agent_id))
  const shown = ms.slice(0, 6)
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {lead && <AgentFace agent={lead} size={size} lead className="relative z-10 ring-2 ring-[var(--solid)]" />}
        {shown.map((a, i) => <AgentFace key={`${a.id}-${i}`} agent={a} size={size} className="ring-2 ring-[var(--solid)]" />)}
        {ms.length > shown.length && <span className="grid place-items-center rounded-full bg-press text-[11px] text-ink-2 ring-2 ring-[var(--solid)]" style={{ width: size, height: size }}>+{ms.length - shown.length}</span>}
      </div>
      <p className="min-w-0 truncate text-[12px] text-ink-3">{lead ? `团长 ${lead.name}` : '未选团长'} · {ms.length} 个 Agent</p>
    </div>
  )
}
