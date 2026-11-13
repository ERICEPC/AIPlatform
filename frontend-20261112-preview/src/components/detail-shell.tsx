import { ModuleTitle } from './page-mark'
import { RiArrowLeftLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

export type SectionItem<S extends string> = {
  id: S
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: React.ReactNode
  disabled?: boolean
}

/*
  详情页外壳（Agent、Agent Team、知识库、集成通用）：
  主区内的二级左栏 = 返回 + 对象身份 + 分区导航，右侧是分区内容。
  分区由 hash 第三段决定，例如 #agents/<id>/access。
*/
export function DetailShell<S extends string>({ back, identity, sections, active, onSection, footer, children, layoutId = 'detail-section' }: {
  back?: { label: string, onClick: () => void }
  identity?: React.ReactNode
  sections: SectionItem<S>[]
  active: S
  onSection: (s: S) => void
  footer?: React.ReactNode
  children: React.ReactNode
  layoutId?: string
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[228px] shrink-0 flex-col border-r border-line p-3">
        {back && (
          <button type="button" onClick={back.onClick} className="mb-2 flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink">
            <RiArrowLeftLine className="size-4" />{back.label}
          </button>
        )}
        {identity && <div className="mb-3 px-1">{identity}</div>}
        <nav className="space-y-0.5">
          {sections.map((s) => {
            const on = s.id === active
            return (
              <button
                key={s.id}
                type="button"
                disabled={s.disabled}
                onClick={() => onSection(s.id)}
                aria-current={on ? 'page' : undefined}
                className={cn('relative flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[13.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40', on ? 'text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink')}
              >
                {on && <motion.span layoutId={layoutId} transition={spring.snappy} className="absolute inset-0 rounded-xl border border-line-strong bg-glass-3" />}
                <s.icon className={cn('relative size-[17px]', on ? 'text-volt-text' : 'text-ink-3')} />
                <span className={cn('relative', on && 'font-semibold')}>{s.label}</span>
                {s.badge && <span className="relative ml-auto">{s.badge}</span>}
              </button>
            )
          })}
        </nav>
        {footer && <div className="mt-auto pt-3">{footer}</div>}
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

/** 分区内容的标准头部：标题 + 说明 + 右侧操作 */
export function SectionHeader({ title, desc, actions, className }: { title: React.ReactNode, desc?: React.ReactNode, actions?: React.ReactNode, className?: string }) {
  return (
    <div className={cn('flex items-end gap-4', className)}>
      <div className="min-w-0 flex-1">
        <ModuleTitle>{title}</ModuleTitle>
        {desc && <p className="mt-1.5 text-[13.5px] text-ink-2">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
