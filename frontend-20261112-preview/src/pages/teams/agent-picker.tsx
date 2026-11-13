import type { TeamAgent } from './agent-source'
import { RiArrowRightUpLine, RiCheckLine, RiRobot2Line, RiSearchLine } from '@remixicon/react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { fieldBase } from '@/components/ui/form'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { AgentFace, sourceLabel } from './agent-source'

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** members：多选加入团队；leader：单选团长 */
  mode: 'members' | 'leader'
  candidates: TeamAgent[]
  loading: boolean
  error: Error | null
  onRetry: () => void
  leaderId: string
  memberIds: string[]
  /** members 模式下还能加几个 */
  remaining: number
  onConfirm: (ids: string[]) => void
  onGoAgents: () => void
}

export function AgentPicker({ open, onOpenChange, mode, candidates, loading, error, onRetry, leaderId, memberIds, remaining, onConfirm, onGoAgents }: Props) {
  const [keyword, setKeyword] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  useEffect(() => {
    if (open) {
      setKeyword('')
      setPicked(mode === 'leader' && leaderId ? [leaderId] : [])
    }
  }, [open, mode, leaderId])

  const kw = keyword.trim().toLowerCase()
  const list = useMemo(() => candidates.filter(a => !kw || a.name.toLowerCase().includes(kw) || a.description.toLowerCase().includes(kw) || a.role.toLowerCase().includes(kw)), [candidates, kw])
  const leaderMode = mode === 'leader'

  /** 不可选的原因；null 表示可选 */
  const blockedReason = (a: TeamAgent): string | null => {
    if (a.version == null)
      return '未发布'
    if (!leaderMode && a.id === leaderId)
      return '已是团长'
    if (!leaderMode && memberIds.includes(a.id))
      return '已在团队中'
    return null
  }
  const toggle = (a: TeamAgent) => {
    if (blockedReason(a))
      return
    if (leaderMode)
      return setPicked([a.id])
    setPicked(p => (p.includes(a.id) ? p.filter(x => x !== a.id) : p.length >= remaining ? p : [...p, a.id]))
  }
  const full = !leaderMode && picked.length >= remaining
  const unchangedLeader = leaderMode && picked[0] === leaderId

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={leaderMode ? '更换团长' : '添加 Agent'}
      description={leaderMode
        ? '团长负责理解任务、决定请哪些 Agent 参与，并把结果汇总成一份答复。只能选已发布的 Agent。'
        : `从 Agents 里选已发布的 Agent 加入团队，可多选。还能添加 ${remaining} 个。`}
      footer={(
        <>
          <span className="mr-auto self-center text-[12.5px] text-ink-3">
            {leaderMode ? (leaderId && memberIds.includes(picked[0] ?? '') ? '它目前在参与的 Agent 里，设为团长后会从参与列表移出' : '') : `已选 ${picked.length} 个${full && remaining > 0 ? ' · 已达上限' : ''}`}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" disabled={!picked.length || unchangedLeader} onClick={() => onConfirm(picked)}>
            {leaderMode ? '设为团长' : picked.length ? `添加 ${picked.length} 个` : '添加'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <RiSearchLine className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <input aria-label="搜索 Agent" autoFocus value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索名称、角色或简介" className={cn(fieldBase, 'h-10 rounded-full pl-9 text-[13px]')} />
          </div>
          <Button variant="ghost" size="small" onClick={onGoAgents}>去 Agents 管理<RiArrowRightUpLine className="size-3.5" /></Button>
        </div>
        {error && <ErrorBar error={error} onRetry={onRetry} />}
        {loading
          ? <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[68px] rounded-2xl" />)}</div>
          : !candidates.length
              ? <EmptyState icon={<RiRobot2Line className="size-6" />} title="还没有 Agent" hint="先到 Agents 创建并发布一个 Agent，再回来把它加入团队。" action={<Button onClick={onGoAgents}>去创建 Agent</Button>} />
              : !list.length
                  ? <EmptyState icon={<RiSearchLine className="size-6" />} title="没有匹配的 Agent" hint="换个关键词试试。" />
                  : (
                      <ul className="space-y-1.5" role={leaderMode ? 'radiogroup' : 'group'} aria-label="可选 Agent">
                        {list.map((a) => {
                          const reason = blockedReason(a)
                          const on = picked.includes(a.id)
                          const disabled = !!reason || (!on && full)
                          return (
                            <li key={a.id}>
                              <button
                                type="button"
                                role={leaderMode ? 'radio' : 'checkbox'}
                                aria-checked={on}
                                disabled={disabled}
                                onClick={() => toggle(a)}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors',
                                  on ? 'border-volt bg-volt-soft' : 'border-line',
                                  disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-hover',
                                )}
                              >
                                <AgentFace agent={a} size={40} />
                                <span className="min-w-0 flex-1 leading-tight">
                                  <span className="flex items-center gap-2">
                                    <span className="truncate text-[14px] font-medium">{a.name}</span>
                                    {a.version != null ? <Badge tone="mint">v{a.version}</Badge> : <Badge tone="amber">未发布</Badge>}
                                    <Badge>{sourceLabel(a)}</Badge>
                                  </span>
                                  <span className="mt-1 block truncate text-[12.5px] text-ink-3">{[a.role, a.description].filter(Boolean).join(' · ') || '没有简介'}</span>
                                </span>
                                {reason && reason !== '未发布' && <span className="shrink-0 text-[12px] text-ink-3">{reason}</span>}
                                {reason === '未发布' && <span className="shrink-0 text-[12px] text-amber">发布后可加入</span>}
                                {!reason && (
                                  <span className={cn('grid size-5 shrink-0 place-items-center border transition-colors', leaderMode ? 'rounded-full' : 'rounded-md', on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong')}>
                                    {on && <RiCheckLine className="size-3.5" />}
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
      </div>
    </Dialog>
  )
}
