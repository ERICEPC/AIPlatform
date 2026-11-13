import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/** 实际生效的主题 */
export type Theme = 'dark' | 'light'
/** 用户选择：深色 / 浅色 / 跟随系统 */
export type ThemeMode = Theme | 'system'

const KEY = 'rx-v4-theme'
const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light' || saved === 'system')
      return saved
  }
  catch {}
  // 企业版默认浅色（2026-11-08 会议共识：切换为浅色展示风格）
  return 'light'
}

const resolve = (mode: ThemeMode): Theme => (mode === 'system' ? (mq().matches ? 'dark' : 'light') : mode)

/* 模块级 store：App 与侧栏/设置里的多个 useTheme() 共用同一份状态 */
type State = { mode: ThemeMode, theme: Theme }
let state: State = (() => {
  const mode = readMode()
  return { mode, theme: resolve(mode) }
})()
const listeners = new Set<() => void>()

function commit(mode: ThemeMode) {
  const theme = resolve(mode)
  if (mode === state.mode && theme === state.theme)
    return
  state = { mode, theme }
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, mode)
  }
  catch {}
  listeners.forEach(l => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const m = mq()
  const onSystem = () => state.mode === 'system' && commit('system')
  m.addEventListener('change', onSystem)
  return () => {
    listeners.delete(l)
    m.removeEventListener('change', onSystem)
  }
}

export function setThemeMode(mode: ThemeMode) {
  commit(mode)
}

export function useTheme() {
  const s = useSyncExternalStore(subscribe, () => state)

  useEffect(() => {
    document.documentElement.dataset.theme = s.theme
  }, [s.theme])

  const toggle = useCallback(() => commit(state.theme === 'dark' ? 'light' : 'dark'), [])
  return { theme: s.theme, mode: s.mode, setMode: setThemeMode, toggle }
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduced
}
