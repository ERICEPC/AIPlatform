'use client'

import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import { Dialog, DialogContent, DialogTitle } from '@langgenius/dify-ui/dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchInput } from '../search-input'
import { getRaccoonAvatar, raccoonAvatars } from './catalogue'

export type AppIconEmojiSelection = { type: 'emoji'; icon: string; background: string }
export type AppIconImageSelection = { type: 'image'; fileId: string; url: string }
export type AppIconSelection = AppIconEmojiSelection | AppIconImageSelection
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect?: (payload: AppIconSelection) => void
  enableImageUpload?: boolean
  initialEmoji?: { icon: string; background?: string | null }
  className?: string
}

function Content({ initialEmoji, onSelect, onOpenChange, className }: Omit<Props, 'open'>) {
  const { t, i18n } = useTranslation('app')
  const [selected, setSelected] = useState(() => getRaccoonAvatar(initialEmoji?.icon)?.id ?? '')
  const [query, setQuery] = useState('')
  const chinese = i18n.language.startsWith('zh')
  const filtered = raccoonAvatars.filter((item) =>
    `${item.name} ${item.nameEn}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <DialogContent
      className={cn(
        'flex max-h-[min(640px,90dvh)] w-[min(640px,calc(100vw-32px))] flex-col gap-4 p-5',
        className,
      )}
    >
      <DialogTitle>{t(($) => $['iconPicker.raccoon'])}</DialogTitle>
      <SearchInput value={query} onValueChange={setQuery} />
      <div className="grid min-h-0 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            aria-label={chinese ? item.name : item.nameEn}
            onClick={() => setSelected(item.id)}
            className={cn(
              'flex min-w-0 flex-col items-center gap-1 rounded-xl border p-2 text-text-secondary focus-visible:ring-2 focus-visible:ring-state-accent-solid',
              selected === item.id
                ? 'border-text-accent bg-state-base-active'
                : 'border-transparent hover:bg-state-base-hover',
            )}
          >
            <img
              src={item.src}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              className="size-16 object-contain"
            />
            <span className="w-full truncate text-center text-xs">
              {chinese ? item.name : item.nameEn}
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={() => onOpenChange(false)}>{t(($) => $['iconPicker.cancel'])}</Button>
        <Button
          variant="primary"
          disabled={!selected}
          onClick={() => {
            if (!getRaccoonAvatar(selected)) return
            onSelect?.({ type: 'emoji', icon: selected, background: '#E9EDDF' })
            onOpenChange(false)
          }}
        >
          {t(($) => $['iconPicker.ok'])}
        </Button>
      </div>
    </DialogContent>
  )
}

export default function AppIconPicker(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <Content key={props.initialEmoji?.icon ?? ''} {...props} /> : null}
    </Dialog>
  )
}
