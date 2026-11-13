import type { BuddyId, EnterpriseAgent } from '@/api/agents'
import { RiInformationLine, RiTimeLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { BUDDY_IDS } from '@/api/agents'
import { Rise } from '@/components/page'
import { Badge } from '@/components/ui/primitives'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { ease, spring } from '@/lib/motion'
import BuiltinGrid from './builtin/grid'
import { BUDDIES, buddyMeta } from './builtin/meta'

const STATUS: Record<EnterpriseAgent['status'], { label: string, tone: 'mint' | 'amber' }> = {
  online: { label: '已上线', tone: 'mint' },
  onboarding: { label: '接入中', tone: 'amber' },
}

export const asBuddy = (v?: string): BuddyId => ((BUDDY_IDS as string[]).includes(v ?? '') ? v as BuddyId : 'sales')

/** 「企服」：四个 Buddy 分页签，路由 #agents/enterprise/<sales|project|hr|service> */
export default function EnterpriseTab({ buddy, go }: { buddy: BuddyId, go: (path: string) => void }) {
  const meta = buddyMeta(buddy)
  return (
    <>
      <Rise className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label="企服 Buddy">
        {BUDDIES.map((b) => {
          const on = b.id === buddy
          // Product release status; runtime errors remain visible below.
          const st = b.id === 'sales' ? 'online' : 'onboarding'
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go(`agents/enterprise/${b.id}`)}
              className={cn('relative flex cursor-pointer items-center gap-3 rounded-[20px] border px-3.5 py-3 text-left transition-colors', on ? 'border-transparent' : 'border-line hover:bg-hover')}
            >
              {on && <motion.span layoutId="buddy-tab" transition={spring.snappy} className="glass-2 glass-edge absolute inset-0 rounded-[20px] border border-line-strong shadow-float" />}
              <img src={asset(b.icon)} alt="" className="relative size-10 shrink-0 rounded-[13px] border border-line bg-glass-3 object-cover" />
              <div className="relative min-w-0 flex-1">
                <p className={cn('truncate text-[14.5px] tracking-[-0.01em]', on ? 'font-semibold' : 'font-medium text-ink-2')}>{b.name}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                  {<><i className={cn('size-1.5 rounded-full', st === 'online' ? 'breathe-dot bg-mint' : 'bg-amber')} />{STATUS[st].label}</>}
                </div>
              </div>
            </button>
          )
        })}
      </Rise>


      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={buddy} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: ease.out }}>
          {buddy === 'sales'
            ? <BuiltinGrid buddy={buddy} go={go} />
            : <Onboarding name={meta.name} icon={meta.icon} />}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

/** 还没接入内置 Agent 的 Buddy */
function Onboarding({ name, icon, cur }: { name: string, icon: string, cur?: EnterpriseAgent }) {
  return (
    <div className="mt-5 flex flex-col items-center rounded-[22px] border border-dashed border-line-strong px-6 py-16 text-center">
      <div className="relative">
        <img src={asset(icon)} alt="" className="size-20 rounded-[26px] border border-line bg-glass-3 object-cover opacity-90" />
        <span className="absolute -right-1.5 -bottom-1.5 grid size-8 place-items-center rounded-full border border-line bg-amber-soft text-amber">
          <RiTimeLine className="size-4" />
        </span>
      </div>
      <p className="mt-5 text-[17px] font-semibold tracking-[-0.01em]">{name} 正在接入</p>
      <p className="mt-1.5 max-w-[440px] text-[13.5px] leading-relaxed text-ink-2">{name} 的内置 Agent 接入后会显示在这里，可以直接对话，也能复制一份到「我的」按需调整。</p>
      {!!cur?.capabilities.length && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {cur.capabilities.map(c => <Badge key={c} tone="cyan">{c}</Badge>)}
        </div>
      )}
      <p className="mt-6 flex items-center gap-1.5 text-[12.5px] text-ink-3">
        <RiInformationLine className="size-3.5" />
        由企业服务团队统一维护，接入进度可以联系企业服务了解。
      </p>
    </div>
  )
}
