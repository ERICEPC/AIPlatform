/* 导入预览里的一行服务器：勾选框 + 名称 + 连接方式 + 地址 / 命令 */
import type { McpTransport } from '@/api/integrations'
import { RiCheckLine, RiSubtractLine } from '@remixicon/react'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { transportLabel } from './shared'

export function Check({ checked, indeterminate, disabled, onChange, label }: { checked: boolean, indeterminate?: boolean, disabled?: boolean, onChange: (v: boolean) => void, label: string }) {
  const on = checked || indeterminate
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={cn(
        'grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-md border transition-colors outline-none focus-visible:outline-2 focus-visible:outline-volt disabled:cursor-not-allowed disabled:opacity-40',
        on ? 'border-volt bg-volt text-volt-ink' : 'border-line-strong hover:border-ink-3',
      )}
    >
      {indeterminate ? <RiSubtractLine className="size-3.5" /> : checked && <RiCheckLine className="size-3.5" />}
    </button>
  )
}

export function ServerRow({ name, transport, target, keys, checked, onChange, status, note, error }: {
  name: string
  transport: McpTransport
  /** 地址或命令行 */
  target: string
  /** 需要带过去的 env / header 名 */
  keys?: string[]
  checked: boolean
  onChange: (v: boolean) => void
  /** 不可选时的说明，如「已接入」 */
  status?: React.ReactNode
  /** 仍可勾选的附加说明 */
  note?: React.ReactNode
  error?: string
}) {
  const disabled = !!status || !!error
  return (
    <div
      role="presentation"
      onClick={() => !disabled && onChange(!checked)}
      className={cn('flex items-start gap-3 rounded-2xl border px-3.5 py-3 transition-colors', disabled ? 'border-line opacity-70' : 'cursor-pointer', !disabled && (checked ? 'border-volt/50 bg-volt-soft' : 'border-line hover:border-line-strong hover:bg-hover'))}
    >
      <span className="pt-0.5"><Check checked={checked && !disabled} disabled={disabled} onChange={onChange} label={`选择 ${name}`} /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13.5px] font-medium">
          <span className="truncate">{name}</span>
          <Badge tone={transport === 'stdio' ? 'neutral' : 'cyan'} className="h-5 shrink-0 px-2 text-[11px]">{transportLabel[transport]}</Badge>
        </p>
        <p className="mt-1 truncate font-mono text-[11.5px] text-ink-3" title={target}>{target || '—'}</p>
        {!!keys?.length && <p className="mt-1 truncate text-[11.5px] text-ink-3">带入 {keys.join('、')}</p>}
        {error && <p className="mt-1 text-[12px] text-rose">{error}</p>}
      </div>
      {(status || note) && <span className="shrink-0">{status || note}</span>}
    </div>
  )
}
