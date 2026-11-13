'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppIcon from '@/app/components/base/app-icon'
import AppIconPicker from '@/app/components/base/app-icon-picker'

export type TeamAvatarValue = {
  type: 'emoji' | 'image'
  icon: string
  background?: string
}

export function TeamAvatar({
  value,
  url,
  small = false,
}: {
  value?: TeamAvatarValue | null
  url?: string
  small?: boolean
}) {
  return (
    <AppIcon
      size={small ? 'large' : 'xl'}
      rounded
      iconType={value?.type ?? 'emoji'}
      icon={value?.type === 'emoji' ? value.icon : undefined}
      background={value?.background ?? 'var(--rx-selected, #E9EDDF)'}
      imageUrl={value?.type === 'image' ? url : undefined}
    />
  )
}

export function TeamAvatarEditor({
  value,
  url,
  disabled,
  onChange,
}: {
  value?: TeamAvatarValue | null
  url?: string
  disabled?: boolean
  onChange: (value: TeamAvatarValue | null, preview?: string) => void
}) {
  const { t } = useTranslation('app')
  const { t: common } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const label = t(($) => $['iconPicker.raccoon'])
  return (
    <div data-team-avatar-editor className="flex items-center gap-3 py-3">
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded-full p-0! focus-visible:ring-2 focus-visible:ring-state-accent-solid"
      >
        <TeamAvatar value={value} url={url} />
      </button>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>
      {value && (
        <button type="button" disabled={disabled} onClick={() => onChange(null)}>
          {common(($) => $['operation.reset'])}
        </button>
      )}
      <AppIconPicker
        open={open}
        onOpenChange={setOpen}
        initialEmoji={
          value?.type === 'emoji' ? { icon: value.icon, background: value.background } : undefined
        }
        onSelect={(selection) => {
          if (selection.type === 'emoji')
            onChange({ type: 'emoji', icon: selection.icon, background: selection.background })
          else onChange({ type: 'image', icon: selection.fileId }, selection.url)
        }}
      />
    </div>
  )
}
