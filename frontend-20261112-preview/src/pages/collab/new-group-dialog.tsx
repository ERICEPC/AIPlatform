import type { PickedMembers } from './member-picker'
import type { CollabGroup } from '@/api/collab'
import { useEffect, useState } from 'react'
import { replaceMembers, createGroup } from '@/api/collab'
import { useMutation } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/form'
import { emptyPick, MemberPicker, pickCount, useAgentOptions } from './member-picker'

const pickSummary = (p: PickedMembers) => {
  const parts = [p.assistant_ids.length && `${p.assistant_ids.length} 位助手`, p.agent_ids.length && `${p.agent_ids.length} 个 Agent`].filter(Boolean)
  return parts.length ? `已选 ${parts.join(' · ')}` : '未选择'
}

/* 新建群聊：群名称、选择成员（同事的助手 / Agent）、群目标 */
export function NewGroupDialog({ open, onOpenChange, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, onCreated: (g: CollabGroup) => void }) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<PickedMembers>(emptyPick)
  const [desc, setDesc] = useState('')
  const [touched, setTouched] = useState(false)
  const [leader, setLeader] = useState('')
  const create = useMutation(createGroup)
  const agents = useAgentOptions(open)

  useEffect(() => {
    if (open) {
      setLeader('')
      setName('')
      setPicked(emptyPick())
      setDesc('')
      setTouched(false)
    }
  }, [open])

  const count = pickCount(picked)
  const nameErr = touched && !name.trim() ? '请填写群名称' : name.length > 30 ? '群名称不超过 30 个字' : undefined
  const pickErr = touched && count < 2 ? '群聊至少选择两位成员' : undefined

  const submit = async () => {
    setTouched(true)
    if (!name.trim() || name.length > 30 || count < 2 || ![...picked.assistant_ids, ...picked.agent_ids].includes(leader))
      return
    try {
      const g = await create.run({ router_id: leader, name: name.trim(), assistant_ids: picked.assistant_ids, agent_ids: picked.agent_ids, description: desc.trim() || undefined })
      onCreated(g)
      onOpenChange(false)
    }
    catch {}
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="新建群聊"
      description="选择成员与团长，由团长规划任务、按能力调度并汇总交付"
      footer={(
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={create.pending} onClick={submit}>创建群聊</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <Field label="群名称" required error={nameErr} aside={`${name.length}/30`}>
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} invalid={!!nameErr} placeholder="例如：华东城商行 POC 协作群" onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()} />
        </Field>

        <Field label="选择成员" required error={pickErr} aside={pickSummary(picked)} hint="只加入你勾选的成员；可仅选助手、仅选 Agent 或混合选择">
          <MemberPicker value={picked} onChange={setPicked} invalid={!!pickErr} agents={agents} />
        </Field>
        <Field label="团长（Router）" required hint="负责目标拆解、选择执行者、审查成果和最终交付；@ 指定执行成员，按任务依赖安排顺序。" error={touched && ![...picked.assistant_ids, ...picked.agent_ids].includes(leader) ? '请选择一位已加入群的成员作为团长' : undefined}>
          <select aria-label="团长（Router）" className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm" value={[...picked.assistant_ids, ...picked.agent_ids].includes(leader) ? leader : ''} onChange={e => setLeader(e.target.value)}>
            <option value="">请选择团长</option>
            {[...picked.assistant_ids, ...picked.agent_ids].map(id => <option key={id} value={id}>{agents.data?.find(m => m.id === id)?.name ?? id}</option>)}
          </select>
        </Field>

        <Field label="群目标 / 说明" hint="选填。成员会参考它理解这个群要做什么" aside={`${desc.length}/200`}>
          <Textarea rows={2} maxLength={200} value={desc} onChange={e => setDesc(e.target.value)} placeholder="例如：两周内完成华东城商行 POC，产出方案、报价和演示环境" />
        </Field>

        {create.error && <p className="text-[12.5px] text-rose">创建失败：{create.error.message}</p>}
      </div>
    </Dialog>
  )
}

/* 给已有群添加成员：同一个选择器，已在群里的成员显示为已勾选、不可操作 */
export function AddMembersDialog({ group, open, onOpenChange, onAdded }: { group: CollabGroup, open: boolean, onOpenChange: (o: boolean) => void, onAdded: (g: CollabGroup) => void }) {
  const [picked, setPicked] = useState<PickedMembers>(emptyPick)
  const [touched, setTouched] = useState(false)
  const [leader, setLeader] = useState('')
  const add = useMutation(replaceMembers)
  const agents = useAgentOptions(open)

  useEffect(() => {
    if (open) {
      setLeader(group.router_id ?? '')
      setPicked({assistant_ids: group.members.filter(m => m.kind === 'assistant').map(m => m.id), agent_ids: group.members.filter(m => m.kind === 'agent').map(m => m.id)})
      setTouched(false)
    }
  }, [open])

  const count = pickCount(picked)
  const pickErr = touched && count < 2 ? '群内至少保留两位成员' : undefined

  const submit = async () => {
    setTouched(true)
    if (count < 2 || group.running_tasks > 0 || ![...picked.assistant_ids, ...picked.agent_ids].includes(leader))
      return
    try {
      const g = await add.run(group.id, {...picked, router_id: leader})
      onAdded(g)
      onOpenChange(false)
    }
    catch {}
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="管理成员"
      description={`勾选添加，取消勾选移除。「${group.name}」至少保留两位成员，聊天记录不会因移除成员而删除。`}
      footer={(
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={add.pending} disabled={count < 2 || group.running_tasks > 0} onClick={submit}>保存成员</Button>
        </>
      )}
    >
      <div className="space-y-4">{group.running_tasks > 0 && <p className="text-amber-300 text-sm">任务执行中，结束后可调整成员。</p>}
        <Field label="选择成员" required error={pickErr} aside={pickSummary(picked)}>
          <MemberPicker value={picked} onChange={setPicked} invalid={!!pickErr} agents={agents} />
        </Field>
        <Field label="团长（Router）" required hint="负责目标拆解、选择执行者、审查成果和最终交付；@ 指定执行成员，按任务依赖安排顺序。" error={touched && ![...picked.assistant_ids, ...picked.agent_ids].includes(leader) ? '请选择一位已加入群的成员作为团长' : undefined}>
          <select aria-label="团长（Router）" className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm" value={[...picked.assistant_ids, ...picked.agent_ids].includes(leader) ? leader : ''} onChange={e => setLeader(e.target.value)}>
            <option value="">请选择团长</option>
            {[...picked.assistant_ids, ...picked.agent_ids].map(id => <option key={id} value={id}>{agents.data?.find(m => m.id === id)?.name ?? id}</option>)}
          </select>
        </Field>
        {add.error && <p className="text-[12.5px] text-rose">添加失败：{add.error.message}</p>}
      </div>
    </Dialog>
  )
}

export function DirectDialog({open, onOpenChange, onCreated}: {open: boolean, onOpenChange: (o: boolean) => void, onCreated: (g: CollabGroup) => void}) {
  const [picked, setPicked] = useState<PickedMembers>(emptyPick)
  const agents = useAgentOptions(open)
  const create = useMutation(createGroup)
  useEffect(() => { if (open) setPicked(emptyPick()) }, [open])
  const submit = async () => {
    if (pickCount(picked) !== 1) return
    try { const group = await create.run({...picked, name: '智能体单聊', kind: 'direct'}); onCreated(group); onOpenChange(false) } catch {}
  }
  return <Dialog open={open} onOpenChange={onOpenChange} title="发起单聊" description="选择一位智能体，独立对话并持续处理任务，无需 @。" size="lg" footer={<Button disabled={pickCount(picked) !== 1} loading={create.pending} onClick={submit}>开始对话</Button>}><MemberPicker single value={picked} onChange={setPicked} agents={agents} /><p className="mt-3 text-xs text-ink-3">请选择一位智能体（当前已选 {pickCount(picked)} 位）</p>{create.error && <p className="text-rose">{create.error.message}</p>}</Dialog>
}
