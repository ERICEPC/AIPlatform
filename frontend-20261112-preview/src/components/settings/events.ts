/* 跨页面打开「个人设置」：任何页面调用 openSettings('models')，侧栏监听后打开对应分区 */
import { useEffect } from 'react'

export type SettingsTab = 'general' | 'models' | 'default-model' | 'account'

const EVENT = 'rx:open-settings'

export function openSettings(tab: SettingsTab = 'general') {
  window.dispatchEvent(new CustomEvent<SettingsTab>(EVENT, { detail: tab }))
}

export function useOpenSettingsListener(onOpen: (tab: SettingsTab) => void) {
  useEffect(() => {
    const h = (e: Event) => onOpen((e as CustomEvent<SettingsTab>).detail ?? 'general')
    window.addEventListener(EVENT, h)
    return () => window.removeEventListener(EVENT, h)
  }, [onOpen])
}

/* 界面语言（前端偏好，先存本地；同时调用 /account/interface-language） */
export type UiLanguage = 'zh-Hans' | 'en-US'
const LANG_KEY = 'rx-v3-lang'

export function readLanguage(): UiLanguage {
  try {
    return localStorage.getItem(LANG_KEY) === 'en-US' ? 'en-US' : 'zh-Hans'
  }
  catch {
    return 'zh-Hans'
  }
}

export function saveLanguage(lang: UiLanguage) {
  try {
    localStorage.setItem(LANG_KEY, lang)
  }
  catch {}
}

export const languageLabel: Record<UiLanguage, string> = { 'zh-Hans': '简体中文', 'en-US': 'English' }
