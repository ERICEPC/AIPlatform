import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { cn } from '@/lib/cn'

type SwitchProps = {
  defaultChecked?: boolean
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  'aria-label': string
}

function Switch({ className, ...props }: SwitchProps & { className?: string }) {
  return (
    <BaseSwitch.Root
      {...props}
      className={cn(
        'group relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-press p-0.5 transition-[background-color,box-shadow] duration-200',
        'data-checked:border-transparent data-checked:bg-volt',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt data-disabled:cursor-not-allowed data-disabled:opacity-40',
        className,
      )}
    >
      <BaseSwitch.Thumb className="block size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.35)] transition-transform duration-300 ease-sheet group-data-checked:translate-x-4 group-data-checked:bg-volt-ink" />
    </BaseSwitch.Root>
  )
}

export { Switch }
