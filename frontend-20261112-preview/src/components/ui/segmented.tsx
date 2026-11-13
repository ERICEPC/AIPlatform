import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { motion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

type Option<V extends string> = { value: V, label: React.ReactNode, count?: number }

type SegmentedProps<V extends string> = {
  value: V
  onValueChange: (value: V) => void
  options: Option<V>[]
  size?: 'small' | 'medium'
  className?: string
  'aria-label'?: string
}

// 与 dify-ui SegmentedControl 同样基于 RadioGroup；选中块用 layoutId 做弹簧滑动
function Segmented<V extends string>({ value, onValueChange, options, size = 'medium', className, ...rest }: SegmentedProps<V>) {
  const layoutId = useId()
  return (
    <RadioGroup
      value={value}
      onValueChange={v => onValueChange(v as V)}
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5', className)}
      aria-label={rest['aria-label']}
    >
      {options.map(o => (
        <Radio.Root
          key={o.value}
          value={o.value}
          nativeButton
          render={<button type="button" />}
          className={cn(
            'relative flex cursor-pointer items-center gap-1.5 rounded-md whitespace-nowrap text-ink-2 transition-colors duration-150 outline-none hover:text-ink',
            'focus-visible:outline-2 focus-visible:outline-volt data-checked:text-ink',
            size === 'small' ? 'h-6 px-2.5 text-[12.5px]' : 'h-7 px-3.5 text-[13px]',
          )}
        >
          {o.value === value && (
            <motion.span
              layoutId={layoutId}
              transition={spring.snappy}
              className="absolute inset-0 rounded-md border border-line bg-solid shadow-panel"
            />
          )}
          <span className="relative z-10 font-medium">{o.label}</span>
          {o.count !== undefined && <span className="relative z-10 text-[11.5px] text-ink-3 tabular-nums">{o.count}</span>}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}

export { Segmented }
