/* 设置模块内部小件：分组标题、错误文案、登出 */
import { useCallback, useState } from 'react'
import { logout } from '@/api/settings'

export const errText = (e: unknown) => (e instanceof Error ? e.message : '操作失败，请稍后重试')

export function SettingsGroup({ title, desc, aside, children }: { title: React.ReactNode, desc?: React.ReactNode, aside?: React.ReactNode, children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-[14px] font-semibold text-ink">{title}</h4>
          {desc && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{desc}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** 登出：调用 POST /logout，无论成功与否都回到登录页（会话可能已过期） */
export function useLogout(go: (path: string) => void, before?: () => void) {
  const [pending, setPending] = useState(false)
  const run = useCallback(async () => {
    setPending(true)
    try {
      await logout()
    }
    catch {}
    finally {
      setPending(false)
      before?.()
      dispatchEvent(new Event('rx-session-expired'))
      go('login')
    }
  }, [go, before])
  return { run, pending }
}
