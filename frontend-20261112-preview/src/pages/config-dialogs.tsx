import { RiCheckLine, RiSearchLine } from '@remixicon/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listDemoLocalSkills as listLocalSkills, listDemoNativeSkills as listNativeSkills } from '@/api/personal-demo'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { KbLibraryPicker } from './knowledge/LibraryPicker'

/* 个人助手「配置」页用到的弹窗：关联知识库、添加 Skill、新建定时任务 */

export type KbPick = { id: string, name: string, hint: string }
export type SkillPick = { id: string, name: string, hint: string }
export type CronTask = { id: string, name: string, hint: string, schedule: string }

export function LinkKbDialog({ open, onOpenChange, existing, onAdd }: { open: boolean, onOpenChange: (v: boolean) => void, existing: string[], onAdd: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>([])
  const fresh = ids.filter(i => !existing.includes(i))
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { onOpenChange(v); if (!v) setIds([]) }}
      title="关联知识库"
      description="助手回答时会检索这些知识库，只能选你有权限访问的库。"
      size="md"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button><Button variant="primary" disabled={!fresh.length} onClick={() => { onAdd(fresh); onOpenChange(false); setIds([]) }}>{fresh.length ? `关联 ${fresh.length} 个` : '关联'}</Button></>}
    >
      <KbLibraryPicker demo multiple value={[...new Set([...existing, ...ids])]} onChange={next => setIds(next.filter(i => !existing.includes(i)))} />
    </Dialog>
  )
}

export function AddSkillDialog({ open, onOpenChange, existing, onAdd }: { open: boolean, onOpenChange: (v: boolean) => void, existing: string[], onAdd: (skills: SkillPick[]) => void }) {
  const q = useQuery(() => Promise.all([listNativeSkills(), listLocalSkills()]), [], { enabled: open })
  const [kw, setKw] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const all: (SkillPick & { group: string })[] = q.data
    ? [
        ...q.data[0].data.map(s => ({ id: s.id, name: s.name, hint: s.description, group: '原生' })),
        ...q.data[1].data.filter(s => s.enabled).map(s => ({ id: s.id, name: s.name, hint: s.description, group: '本地' })),
      ]
    : []
  const k = kw.trim().toLowerCase()
  const shown = all.filter(s => !k || `${s.name} ${s.hint}`.toLowerCase().includes(k))
  const close = () => { onOpenChange(false); setPicked([]); setKw('') }
  return (
    <Dialog
      open={open}
      onOpenChange={v => (v ? onOpenChange(v) : close())}
      title="添加 Skill"
      description="从原生和已安装到本地的 Skill 里选；需要更多可以去「Skills」页安装。"
      size="md"
      footer={<><Button variant="secondary" onClick={close}>取消</Button><Button variant="primary" disabled={!picked.length} onClick={() => { onAdd(all.filter(s => picked.includes(s.id))); close() }}>{picked.length ? `添加 ${picked.length} 个` : '添加'}</Button></>}
    >
      <label className="mb-3 flex h-10 items-center gap-2 rounded-full border border-line-strong bg-hover px-4 text-ink-3 focus-within:border-volt">
        <RiSearchLine className="size-4" />
        <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索 Skill" className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" />
      </label>
      <div className="max-h-[360px] space-y-1 overflow-auto">
        {q.error && <ErrorBar error={q.error} onRetry={q.reload} />}
        {q.loading && [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
        {shown.map((s) => {
          const has = existing.includes(s.id)
          const on = has || picked.includes(s.id)
          return (
            <button
              key={s.id}
              type="button"
              disabled={has}
              onClick={() => setPicked(p => (p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id]))}
              className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55', on && !has ? 'border-volt bg-volt-soft' : 'border-transparent hover:bg-hover')}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13.5px] font-medium">{s.name}<span className="text-[11.5px] font-normal text-ink-3">{s.group}</span></span>
                <span className="block truncate text-[12px] text-ink-3">{has ? '已添加' : s.hint}</span>
              </span>
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong')}>{on && <RiCheckLine className="size-3.5" />}</span>
            </button>
          )
        })}
        {!q.loading && !shown.length && <p className="py-10 text-center text-[13px] text-ink-3">没有匹配的 Skill</p>}
      </div>
    </Dialog>
  )
}

const SCHEDULES = ['工作日 9:00', '每天 18:00', '每周一 9:30', '每周五 17:30', '每 4 小时']

export function NewTaskDialog({ open, onOpenChange, onCreate }: { open: boolean, onOpenChange: (v: boolean) => void, onCreate: (t: CronTask) => void }) {
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState(SCHEDULES[0])
  const [hint, setHint] = useState('')
  const [tried, setTried] = useState(false)
  const close = () => { onOpenChange(false); setName(''); setHint(''); setSchedule(SCHEDULES[0]); setTried(false) }
  const submit = () => {
    setTried(true)
    if (!name.trim() || !hint.trim())
      return
    onCreate({ id: `cron-${Date.now()}`, name: name.trim(), hint: hint.trim(), schedule })
    close()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={v => (v ? onOpenChange(v) : close())}
      title="新建定时任务"
      description="到点后助手会自动执行，结果发到你指定的地方；涉及对外承诺的仍会先进「待我核对」。"
      size="md"
      footer={<><Button variant="secondary" onClick={close}>取消</Button><Button variant="primary" onClick={submit}>创建</Button></>}
    >
      <div className="space-y-4">
        <Field label="任务名称" required error={tried && !name.trim() ? '请填写任务名称' : undefined}>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如：客户回访提醒" maxLength={30} />
        </Field>
        <Field label="执行时间">
          <Select value={schedule} onValueChange={v => setSchedule(String(v))} options={SCHEDULES.map(s => ({ value: s, label: s }))} />
        </Field>
        <Field label="要做什么" required error={tried && !hint.trim() ? '请描述助手要做什么' : undefined}>
          <Textarea value={hint} onChange={e => setHint(e.target.value)} rows={3} placeholder="例如：汇总本周还没跟进的客户，发到协作群并 @ 负责人" />
        </Field>
      </div>
    </Dialog>
  )
}
