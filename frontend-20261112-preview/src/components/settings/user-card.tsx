/* 侧栏底部用户卡：整卡可点，弹出菜单（设置 / 主题切换 / 语言 / 登出），并持有设置对话框的开关 */
import type { SettingsTab } from './events'
import { RiExpandUpDownLine, RiLogoutBoxRLine, RiMoonClearLine, RiSettings3Line, RiSunLine, RiTranslate2 } from '@remixicon/react'
import { useCallback, useState } from 'react'
import { Menu } from '@/components/ui/menu'
import { Avatar } from '@/components/ui/primitives'
import { currentUser as me } from '@/lib/current-user'
import { useTheme } from '@/lib/theme'
import { languageLabel, readLanguage, useOpenSettingsListener } from './events'
import { useLogout } from './kit'
import { SettingsDialog } from './settings-dialog'

export function UserCard({ go }: { go: (path: string) => void }) {
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<SettingsTab>('general')
  const out = useLogout(go)

  const show = useCallback((t: SettingsTab) => {
    setTab(t)
    setOpen(true)
  }, [])
  useOpenSettingsListener(show)

  return (
    <>
      <Menu
        align="start"
        trigger={(
          <button
            type="button"
            aria-label={`${me.owner}，打开账号菜单`}
            className="group mt-3 flex w-full cursor-pointer items-center gap-2.5 rounded-2xl border border-line bg-hover p-2.5 text-left transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt data-popup-open:border-line-strong data-popup-open:bg-press"
          >
            <Avatar src={me.avatar} size={34} presence="idle" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13.5px] font-semibold">{me.owner}</span>
              <span className="block truncate text-[11.5px] text-ink-3">{me.role}</span>
            </span>
            <span className="grid size-8 place-items-center rounded-full text-ink-3 transition-colors group-hover:text-ink">
              <RiExpandUpDownLine className="size-4" />
            </span>
          </button>
        )}
        items={[
          { label: '设置', icon: RiSettings3Line, hint: '模型、账号', onSelect: () => show('general') },
          { label: theme === 'dark' ? '切换到浅色' : '切换到深色', icon: theme === 'dark' ? RiSunLine : RiMoonClearLine, onSelect: toggle },
          { label: '语言', icon: RiTranslate2, hint: languageLabel[readLanguage()], onSelect: () => show('general') },
          'separator',
          { label: out.pending ? '正在登出…' : '登出', icon: RiLogoutBoxRLine, danger: true, disabled: out.pending, onSelect: out.run },
        ]}
      />
      <SettingsDialog open={open} onOpenChange={setOpen} tab={tab} onTabChange={setTab} go={go} />
    </>
  )
}
