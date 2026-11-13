'use client'

import { useEffect, useRef, useState } from 'react'
import useTheme from '@/hooks/use-theme'

export function TeamAccessChannels({ teamId }: { teamId: string }) {
  const { theme } = useTheme()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(420)
  useEffect(() => {
    const resize = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow
      )
        return
      const value = event.data
      if (value?.type !== 'raccoon-channel-height' || value.agentId !== teamId) return
      if (typeof value.height === 'number' && Number.isFinite(value.height))
        setHeight(Math.max(120, Math.min(12000, Math.ceil(value.height))))
    }
    window.addEventListener('message', resize)
    return () => window.removeEventListener('message', resize)
  }, [teamId])
  const syncTheme = () =>
    frameRef.current?.contentWindow?.postMessage(
      { type: 'raccoon-channel-theme', theme },
      window.location.origin,
    )
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: 'raccoon-channel-theme', theme },
      window.location.origin,
    )
  }, [theme])
  return (
    <section aria-labelledby="team-message-channels-title">
      <h3 id="team-message-channels-title" className="mb-3 system-md-semibold text-text-primary">
        消息渠道
      </h3>
      <iframe
        ref={frameRef}
        title="团队消息渠道"
        src={`/message-channels/?team_id=${encodeURIComponent(teamId)}&embedded=1`}
        className="block w-full border-0"
        style={{ height }}
        onLoad={() => {
          // The same-origin channel editor retains all requests and credentials.
          // Let the host background show through between its native-style cards.
          const body = frameRef.current?.contentDocument?.body
          if (body) body.style.background = 'transparent'
          syncTheme()
        }}
      />
      <p className="mt-2 system-xs-regular text-text-tertiary">
        渠道固定绑定当前团队，使用最新发布版本。渠道任务执行上限为 150 秒。
      </p>
    </section>
  )
}
