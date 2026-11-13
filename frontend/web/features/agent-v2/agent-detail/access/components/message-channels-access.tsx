'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useTheme from '@/hooks/use-theme'

// The existing same-origin channel editor owns its forms and requests. This
// access-point boundary supplies only the current Agent and platform theme.
export function MessageChannelsAccess({ agentId }: { agentId: string }) {
  const { t } = useTranslation('agentV2')
  const { theme } = useTheme()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(420)

  useEffect(() => {
    function resize(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow
      )
        return
      const value = event.data
      if (value?.type !== 'raccoon-channel-height' || value.agentId !== agentId) return
      if (typeof value.height === 'number' && Number.isFinite(value.height))
        setHeight(Math.max(120, Math.min(12000, Math.ceil(value.height))))
    }
    window.addEventListener('message', resize)
    return () => window.removeEventListener('message', resize)
  }, [agentId])

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: 'raccoon-channel-theme', theme },
      window.location.origin,
    )
  }, [theme])

  return (
    <section aria-labelledby="agent-message-channels-title">
      <h3 id="agent-message-channels-title" className="mb-3 system-md-semibold text-text-primary">
        {t(($) => $['agentDetail.access.messageChannels.title'])}
      </h3>
      <iframe
        ref={frameRef}
        title={t(($) => $['agentDetail.access.messageChannels.title'])}
        src={`/message-channels/?agent_id=${encodeURIComponent(agentId)}&embedded=1`}
        className="block w-full border-0"
        style={{ height }}
        onLoad={() =>
          frameRef.current?.contentWindow?.postMessage(
            { type: 'raccoon-channel-theme', theme },
            window.location.origin,
          )
        }
      />
    </section>
  )
}
