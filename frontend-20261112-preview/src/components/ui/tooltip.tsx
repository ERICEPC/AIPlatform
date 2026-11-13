import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'

// 只放简短、非交互文字（与 dify-ui Tooltip 约定一致）
function Tip({ label, children, side = 'bottom' }: { label: string, children: React.ReactElement, side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={8} className="z-50">
          <BaseTooltip.Popup className="glass-3 rounded-lg px-2.5 py-1 text-[12px] text-ink shadow-float transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}

const TipProvider = BaseTooltip.Provider

export { Tip, TipProvider }
