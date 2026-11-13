/* 设置 → 通用：外观主题（深色/浅色/跟随系统）、界面语言、时区 */
import type { AccountProfile } from '@/api/settings'
import type { ThemeMode } from '@/lib/theme'
import type { UiLanguage } from './events'
import { RiCheckLine, RiComputerLine, RiMoonClearLine, RiSunLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { updateInterfaceLanguage, updateTimezone } from '@/api/settings'
import { Field, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import { languageLabel, readLanguage, saveLanguage } from './events'
import { errText, SettingsGroup } from './kit'

const themes: { value: ThemeMode, label: string, icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'dark', label: '深色', icon: RiMoonClearLine },
  { value: 'light', label: '浅色', icon: RiSunLine },
  { value: 'system', label: '跟随系统', icon: RiComputerLine },
]

/* 主题缩略图：用固定色值画一张迷你界面（缩略图本身就是要展示的颜色，不跟随当前主题） */
function ThemeThumb({ mode }: { mode: ThemeMode }) {
  const dark = { bg: '#0d0f10', panel: '#1a1d1f', line: '#2a2e31', text: '#e9ecee' }
  const light = { bg: '#eef0f2', panel: '#ffffff', line: '#dde1e4', text: '#1b1f22' }
  const mini = (c: typeof dark) => (
    <div className="flex size-full gap-1.5 p-2" style={{ background: c.bg }}>
      <div className="w-1/4 rounded-md" style={{ background: c.panel, border: `1px solid ${c.line}` }} />
      <div className="flex flex-1 flex-col gap-1.5 rounded-md p-1.5" style={{ background: c.panel, border: `1px solid ${c.line}` }}>
        <span className="h-1.5 w-3/5 rounded-full" style={{ background: c.text, opacity: 0.7 }} />
        <span className="h-1.5 w-2/5 rounded-full" style={{ background: c.text, opacity: 0.35 }} />
        <span className="mt-auto h-2.5 w-8 rounded-full bg-volt" />
      </div>
    </div>
  )
  if (mode === 'system') {
    return (
      <div className="relative size-full">
        <div className="absolute inset-0">{mini(light)}</div>
        <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">{mini(dark)}</div>
      </div>
    )
  }
  return mini(mode === 'dark' ? dark : light)
}

function ThemePicker() {
  const { mode, setMode } = useTheme()
  return (
    <div role="radiogroup" aria-label="外观主题" className="grid grid-cols-3 gap-3">
      {themes.map((t) => {
        const on = mode === t.value
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(t.value)}
            className={cn(
              'group relative cursor-pointer rounded-[20px] border p-2 text-left transition-[border-color,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt',
              on ? 'border-volt bg-volt-soft' : 'border-line hover:border-line-strong hover:bg-hover',
            )}
          >
            <div className="aspect-[16/10] overflow-hidden rounded-[14px] border border-line">
              <ThemeThumb mode={t.value} />
            </div>
            <div className="flex items-center gap-2 px-1.5 pt-2.5 pb-1">
              <t.icon className={cn('size-4', on ? 'text-volt-text' : 'text-ink-3')} />
              <span className={cn('flex-1 text-[13.5px]', on ? 'font-semibold text-ink' : 'text-ink-2')}>{t.label}</span>
              {on && (
                <motion.span layoutId="settings-theme-check" transition={spring.snappy} className="grid size-5 place-items-center rounded-full bg-volt text-volt-ink">
                  <RiCheckLine className="size-3.5" />
                </motion.span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

const timezones = [
  { value: 'Asia/Shanghai', label: '(UTC+08:00) 北京、上海' },
  { value: 'Asia/Hong_Kong', label: '(UTC+08:00) 香港' },
  { value: 'Asia/Singapore', label: '(UTC+08:00) 新加坡' },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) 东京' },
  { value: 'Europe/London', label: '(UTC+00:00) 伦敦' },
  { value: 'Europe/Berlin', label: '(UTC+01:00) 柏林' },
  { value: 'America/New_York', label: '(UTC-05:00) 纽约' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) 洛杉矶' },
]

export function GeneralTab({ profile, onProfile }: { profile?: AccountProfile, onProfile: (p: AccountProfile) => void }) {
  const toast = useToast()
  const [lang, setLang] = useState<UiLanguage>(readLanguage)

  const changeLang = async (v: UiLanguage) => {
    const prev = lang
    setLang(v)
    saveLanguage(v)
    try {
      await updateInterfaceLanguage(v)
      toast(v === 'zh-Hans' ? '界面语言已设为简体中文' : '已保存，English 界面将在后续版本生效', 'info')
    }
    catch (e) {
      setLang(prev)
      saveLanguage(prev)
      toast(errText(e), 'info')
    }
  }

  const changeTz = async (v: string) => {
    if (!profile)
      return
    onProfile({ ...profile, timezone: v })
    try {
      await updateTimezone(v)
      toast('时区已更新')
    }
    catch (e) {
      onProfile(profile)
      toast(errText(e), 'info')
    }
  }

  return (
    <div className="space-y-7">
      <SettingsGroup title="外观主题" desc="跟随系统时，会随操作系统的深浅色设置自动切换。">
        <ThemePicker />
      </SettingsGroup>
      <SettingsGroup title="语言与地区">
        <div className="grid grid-cols-2 gap-4">
          <Field label="界面语言" hint="目前仅提供简体中文界面，English 将在后续版本上线。">
            <Select
              value={lang}
              onValueChange={v => changeLang(v as UiLanguage)}
              options={(Object.keys(languageLabel) as UiLanguage[]).map(l => ({ value: l, label: languageLabel[l] }))}
            />
          </Field>
          <Field label="时区" hint="影响日志、运行记录和定时触发器的显示时间。">
            <Select
              value={profile?.timezone ?? ''}
              onValueChange={changeTz}
              options={timezones}
              placeholder={profile ? '选择时区' : '加载中…'}
              disabled={!profile}
            />
          </Field>
        </div>
      </SettingsGroup>
    </div>
  )
}
