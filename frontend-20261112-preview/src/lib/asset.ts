declare global { interface Window { __RX_ASSETS__?: Record<string, string> } }
export const isStandalone = typeof window !== 'undefined' && !!window.__RX_ASSETS__
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
/** Accept localized API icons as well as bundled paths. Backend URLs retain their origin path. */
export function asset(input: unknown): string {
  let path = typeof input === 'string' ? input : input && typeof input === 'object' ? String((input as Record<string, unknown>).zh_Hans || (input as Record<string, unknown>).en_US || (input as Record<string, unknown>).url || '') : ''
  if (!path) path = '/raccoon-emoji-v1/002-office.webp'
  const inlined = window.__RX_ASSETS__?.[path]
  if (inlined) return inlined
  return /^\/(raccoon-emoji-v1|brand-assets)\//.test(path) && BASE && BASE !== '.' ? `${BASE}${path}` : path
}
