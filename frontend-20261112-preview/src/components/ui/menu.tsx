import { Menu as BaseMenu } from '@base-ui/react/menu'
import { RiMore2Line } from '@remixicon/react'
import { cn } from '@/lib/cn'

export type MenuItem =
  | { label: React.ReactNode, icon?: React.ComponentType<{ className?: string }>, onSelect: () => void, danger?: boolean, disabled?: boolean, hint?: string }
  | 'separator'

// 下拉菜单：卡片右上角「⋯」、按钮下拉等
function Menu({ items, trigger, align = 'end' }: { items: MenuItem[], trigger?: React.ReactElement, align?: 'start' | 'end' }) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        onClick={e => e.stopPropagation()}
        render={trigger ?? (
          <button type="button" aria-label="更多操作" className="grid size-8 cursor-pointer place-items-center rounded-md text-ink-3 transition-colors hover:bg-press hover:text-ink">
            <RiMore2Line className="size-4" />
          </button>
        )}
      />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={6} align={align} className="z-[75]">
          <BaseMenu.Popup className="glass-3 min-w-[180px] rounded-lg p-1 shadow-float outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {items.map((it, i) => it === 'separator'
              ? <BaseMenu.Separator key={i} className="mx-2 my-1 h-px bg-line" />
              : (
                  <BaseMenu.Item
                    key={i}
                    disabled={it.disabled}
                    onClick={(e) => { e.stopPropagation(); it.onSelect() }}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-highlighted:bg-hover',
                      it.danger ? 'text-rose' : 'text-ink',
                    )}
                  >
                    {it.icon && <it.icon className={cn('size-4', it.danger ? 'text-rose' : 'text-ink-3')} />}
                    <span className="flex-1">{it.label}</span>
                    {it.hint && <span className="text-[11.5px] text-ink-3">{it.hint}</span>}
                  </BaseMenu.Item>
                ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export { Menu }
