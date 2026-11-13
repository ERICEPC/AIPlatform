import type { TeamAgent } from './agent-source'
import type { SectionProps } from './detail'
import type { Member } from '@/api/teams'
import { RiAddLine, RiDeleteBinLine, RiEditLine, RiRobot2Line, RiSettings4Line, RiUserStarLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { DIVISION_MARKER, joinGoal, LIMITS, MAX_MEMBERS, splitGoal } from '@/api/teams'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, NumberInput, Textarea } from '@/components/ui/form'
import { Badge, EmptyState, Panel } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { AgentPicker } from './agent-picker'
import { AgentFace, defaultDuty, sourceLabel, useAgentSource } from './agent-source'
import { TrialRun } from './trial-run'

const GOAL_MAX = 6000

function CardTitle({ icon, title, aside, children }: { icon: React.ReactNode, title: string, aside?: React.ReactNode, children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-full bg-hover text-ink-2">{icon}</span>
      <p className="text-[14.5px] font-semibold">{title}</p>
      {aside}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  )
}

function VersionBadges({ agent }: { agent: TeamAgent }) {
  return (
    <>
      {agent.version != null ? <Badge tone="mint">v{agent.version}</Badge> : <Badge tone="amber">未发布</Badge>}
      <Badge>{sourceLabel(agent)}</Badge>
    </>
  )
}

export function TeamMembers({ team, form, setForm, agents, dirty, save, go }: SectionProps) {
  const toast = useToast()
  const src = useAgentSource(agents)
  const [picker, setPicker] = useState<'members' | 'leader' | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const [task, division] = splitGoal(form.goal)
  const lead = form.leader_id ? src.resolve(form.leader_id) : null
  const memberIds = form.members.map(m => m.agent_id)
  const remaining = MAX_MEMBERS - form.members.length

  const pick = (ids: string[]) => {
    if (picker === 'leader') {
      const id = ids[0]
      const wasMember = memberIds.includes(id)
      setForm(c => ({ ...c, leader_id: id, members: c.members.filter(m => m.agent_id !== id) }))
      toast(`已把「${src.resolve(id).name}」设为团长${wasMember ? '，并从参与的 Agent 中移出' : ''}`)
    }
    else {
      const add = ids.slice(0, remaining).map(id => src.resolve(id))
      setForm(c => ({ ...c, members: [...c.members, ...add.map(a => ({ agent_id: a.id, responsibility: defaultDuty(a), input_hint: '' }))] }))
      toast(`已添加 ${add.map(a => `「${a.name}」`).join('')}，保存草稿后生效`)
    }
    setPicker(null)
  }
  const patchMember = (i: number, p: Partial<Member>) => setForm(c => ({ ...c, members: c.members.map((m, j) => (j === i ? { ...m, ...p } : m)) }))
  const remove = () => {
    if (removing == null)
      return
    const name = src.resolve(form.members[removing].agent_id).name
    setForm(c => ({ ...c, members: c.members.filter((_, j) => j !== removing) }))
    setRemoving(null)
    toast(`已移除「${name}」，保存草稿后生效`, 'info')
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-10">
      <div className="mx-auto max-w-[1120px] space-y-3">
        {src.error && <ErrorBar error={src.error} onRetry={src.reload} />}

        {/* 团长 */}
        <Panel level={2} radius="lg" className="p-5">
          <CardTitle icon={<RiUserStarLine className="size-4" />} title="团长">
            <TrialRun team={team} dirty={dirty} save={save} suggestion={task} />
          </CardTitle>
          {lead
            ? (
                <div className="mt-4 flex items-center gap-4 rounded-[20px] border border-line bg-hover/50 p-4">
                  <AgentFace agent={lead} size={56} lead />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[16px] font-semibold">{lead.name}</p>
                      <VersionBadges agent={lead} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{lead.description || '没有简介'}</p>
                    <p className="mt-1.5 text-[12px] text-ink-3">负责理解任务、决定请哪些 Agent 参与，并把结果汇总成一份答复。</p>
                  </div>
                  <Button variant="secondary" onClick={() => setPicker('leader')}><RiEditLine className="size-4" />更换团长</Button>
                </div>
              )
            : (
                <div className="mt-4 flex items-center gap-4 rounded-[20px] border border-dashed border-amber/50 p-4">
                  <span className="grid size-14 place-items-center rounded-full bg-amber-soft text-amber"><RiUserStarLine className="size-6" /></span>
                  <p className="flex-1 text-[13px] text-ink-2">还没有团长。团长负责理解任务、决定请哪些 Agent 参与，并汇总答复。</p>
                  <Button variant="primary" onClick={() => setPicker('leader')}>选择团长</Button>
                </div>
              )}
        </Panel>

        {/* 参与的 Agent */}
        <Panel level={2} radius="lg" className="p-5">
          <CardTitle
            icon={<RiRobot2Line className="size-4" />}
            title="参与的 Agent"
            aside={<Badge tone={remaining <= 0 ? 'amber' : 'neutral'}>{form.members.length}/{MAX_MEMBERS}</Badge>}
          >
            <Button variant="primary" size="small" disabled={remaining <= 0} onClick={() => setPicker('members')}><RiAddLine className="size-4" />添加 Agent</Button>
          </CardTitle>
          <p className="mt-1.5 pl-[38px] text-[12.5px] text-ink-3">每个 Agent 沿用自己的提示词、模型、Skills、知识库和工具。由团长按任务决定调用谁。</p>
          {!form.members.length
            ? (
                <div className="mt-2">
                  <EmptyState icon={<RiRobot2Line className="size-6" />} title="还没有参与的 Agent" hint="至少添加 1 个已发布的 Agent，团长才能把任务交给它。" action={<Button variant="primary" onClick={() => setPicker('members')}><RiAddLine className="size-4" />添加 Agent</Button>} />
                </div>
              )
            : (
                <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                  <AnimatePresence initial={false}>
                    {form.members.map((m, i) => {
                      const a = src.resolve(m.agent_id)
                      return (
                        <motion.div key={m.agent_id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.smooth} className="group flex flex-col rounded-[20px] border border-line bg-glass-3 p-4">
                          <div className="flex items-start gap-3">
                            <AgentFace agent={a} size={40} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14.5px] font-semibold">{a.name}</p>
                              <div className="mt-1 flex flex-wrap gap-1.5"><VersionBadges agent={a} /></div>
                            </div>
                            <div className="flex gap-0.5">
                              <Button variant="ghost" size="icon-small" aria-label={`编辑「${a.name}」负责什么`} onClick={() => setEditing(i)}><RiEditLine className="size-4" /></Button>
                              <Button variant="ghost" size="icon-small" tone="destructive" aria-label={`移除「${a.name}」`} onClick={() => setRemoving(i)}><RiDeleteBinLine className="size-4" /></Button>
                            </div>
                          </div>
                          <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-3">{a.description || '没有简介'}</p>
                          <button type="button" onClick={() => setEditing(i)} className="mt-3 cursor-pointer rounded-2xl border border-line bg-hover/60 px-3 py-2 text-left transition-colors hover:border-line-strong">
                            <span className="block text-[11.5px] text-ink-3">负责什么</span>
                            <span className={cn('mt-0.5 line-clamp-2 block text-[13px] leading-relaxed', m.responsibility.trim() ? 'text-ink' : 'text-ink-3')}>{m.responsibility.trim() || '点这里写一句，帮团长判断什么时候找它（选填）'}</span>
                          </button>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}
        </Panel>

        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          {/* 团队任务 */}
          <Panel level={2} radius="lg" className="p-5">
            <CardTitle icon={<RiEditLine className="size-4" />} title="团队任务" />
            <div className="mt-4 space-y-4">
              <Field label="这个团队帮你做什么" required aside={<span className={cn(form.goal.length > GOAL_MAX && 'text-rose')}>{task.length}/{GOAL_MAX}</span>} error={!task.trim() ? '请填写团队任务' : undefined}>
                <Textarea rows={4} value={task} invalid={!task.trim()} maxLength={GOAL_MAX - (division ? DIVISION_MARKER.length + division.length : 0)} onChange={e => setForm(c => ({ ...c, goal: joinGoal(e.target.value, division) }))} placeholder="例如：根据客户需求，整理产品建议、技术待确认事项和下一步跟进计划。" />
              </Field>
              <Field label="答复要求" aside={`${form.output.length}/3000`}>
                <Textarea rows={3} maxLength={3000} value={form.output} onChange={e => setForm(c => ({ ...c, output: e.target.value }))} placeholder="选填。例如：按客户需求、产品建议、待确认事项、下一步行动输出，不确定的内容标记为待确认。" />
              </Field>
            </div>
          </Panel>

          {/* 运行设置 */}
          <Panel level={2} radius="lg" className="p-5">
            <CardTitle icon={<RiSettings4Line className="size-4" />} title="运行设置" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(Object.keys(LIMITS) as (keyof typeof LIMITS)[]).map(k => (
                <Field key={k} label={<span className="text-[12.5px]">{LIMITS[k].label}</span>} hint={`${LIMITS[k].min}–${LIMITS[k].max} ${LIMITS[k].unit}`}>
                  <NumberInput value={form[k]} min={LIMITS[k].min} max={LIMITS[k].max} step={k === 'timeout' ? 10 : 1} suffix={LIMITS[k].unit} onChange={v => setForm(c => ({ ...c, [k]: v }))} />
                </Field>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">平台同时最多执行 2 个团队任务和 4 个 Agent 调用。超出时间上限的任务会自动停止。</p>
          </Panel>
        </div>
      </div>

      <AgentPicker
        open={!!picker}
        onOpenChange={o => !o && setPicker(null)}
        mode={picker ?? 'members'}
        candidates={src.candidates}
        loading={src.loading}
        error={src.error}
        onRetry={src.reload}
        leaderId={form.leader_id}
        memberIds={memberIds}
        remaining={remaining}
        onConfirm={pick}
        onGoAgents={() => go('agents')}
      />
      <MemberDialog
        index={editing}
        member={editing != null ? form.members[editing] : undefined}
        agent={editing != null && form.members[editing] ? src.resolve(form.members[editing].agent_id) : undefined}
        onClose={() => setEditing(null)}
        onSave={(i, p) => { patchMember(i, p); setEditing(null) }}
      />
      <ConfirmDialog
        open={removing != null}
        onOpenChange={o => !o && setRemoving(null)}
        danger
        title={removing != null && form.members[removing] ? `移除「${src.resolve(form.members[removing].agent_id).name}」？` : '移除 Agent？'}
        description="只是不再参与这个团队，Agent 本身不受影响。保存草稿后生效，已发布版本不变。"
        confirmText="移除"
        onConfirm={remove}
      />
    </div>
  )
}

function MemberDialog({ index, member, agent, onClose, onSave }: { index: number | null, member?: Member, agent?: TeamAgent, onClose: () => void, onSave: (i: number, p: Partial<Member>) => void }) {
  const [duty, setDuty] = useState('')
  const [hint, setHint] = useState('')
  const [openFor, setOpenFor] = useState<number | null>(null)
  if (index !== openFor) {
    setOpenFor(index)
    setDuty(member?.responsibility ?? '')
    setHint(member?.input_hint ?? '')
  }
  return (
    <Dialog
      open={index != null && !!member}
      onOpenChange={o => !o && onClose()}
      title={agent ? `「${agent.name}」在团队里负责什么` : '负责什么'}
      description="写一句话说明它擅长处理什么，团长据此判断什么时候找它。留空时使用 Agent 的简介。"
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" onClick={() => index != null && onSave(index, { responsibility: duty.trim(), input_hint: hint })}>保存</Button></>}
    >
      <div className="space-y-4">
        <Field label="负责什么" aside={`${duty.length}/1000`}>
          <Textarea rows={3} autoFocus maxLength={1000} value={duty} onChange={e => setDuty(e.target.value)} placeholder={agent?.description || '例如：核对客户现状、识别风险，并说明依据。'} />
        </Field>
        <Field label="输入说明" aside={`${hint.length}/2000`} hint="选填。如果这个 Agent 要求特定格式（例如 JSON），写明必填字段和示例。">
          <Textarea rows={3} maxLength={2000} value={hint} onChange={e => setHint(e.target.value)} placeholder="选填" />
        </Field>
      </div>
    </Dialog>
  )
}
