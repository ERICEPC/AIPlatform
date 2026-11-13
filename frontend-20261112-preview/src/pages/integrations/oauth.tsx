/* OAuth 授权等待：live 模式在新窗口打开授权页并轮询结果；mock 模式在对话框里模拟授权页 */
import { RiCheckboxCircleFill, RiExternalLinkLine, RiLoader4Line, RiShieldCheckLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { API_MODE } from '@/api/http'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { PluginTile } from './kit'

export function OAuthWaitDialog({ open, appName, icon, url, check, onClose, onDone }: {
  open: boolean
  appName: string
  icon: string
  /** 授权地址；为空表示还在获取 */
  url: string | null
  /** 返回 true 表示授权已完成 */
  check: () => Promise<boolean>
  onClose: () => void
  onDone: () => void
}) {
  const [phase, setPhase] = useState<'consent' | 'waiting' | 'done'>('consent')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkRef = useRef(check)
  checkRef.current = check
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!open) {
      setPhase('consent')
      return
    }
    if (url && API_MODE === 'live') {
      window.open(url, '_blank', 'width=560,height=720')
      setPhase('waiting')
    }
  }, [open, url])

  useEffect(() => {
    if (!open || phase !== 'waiting')
      return
    let n = 0
    timer.current = setInterval(async () => {
      n++
      try {
        if (await checkRef.current()) {
          setPhase('done')
          clearInterval(timer.current!)
          setTimeout(() => doneRef.current(), 900)
        }
      }
      catch {}
      if (n > 90)
        clearInterval(timer.current!)
    }, 1000)
    return () => clearInterval(timer.current!)
  }, [open, phase])

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()} title="授权" size="sm">
      <AnimatePresence mode="wait">
        <motion.div key={phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="flex flex-col items-center pt-2 pb-4 text-center">
          <div className="flex items-center gap-3">
            <PluginTile icon={icon} size={44} />
            <span className="h-px w-8 bg-line-strong" />
            <span className="grid size-11 place-items-center rounded-[13px] bg-volt text-[13px] font-bold text-volt-ink">RX</span>
          </div>
          {phase === 'consent' && (
            <>
              <p className="mt-4 font-semibold">RaccoonX 请求访问你的 {appName} 账号</p>
              <p className="mt-1 text-[12.5px] text-ink-3">{url ? '授权后可以代表你读取和写入数据，随时可以在这里撤销。' : '正在获取授权地址…'}</p>
              <ul className="mt-4 w-full space-y-1.5 rounded-2xl border border-line p-3 text-left text-[12.5px] text-ink-2">
                {['读取基本资料', '读取与写入授权范围内的内容', '在你离线时代表你调用'].map(s => <li key={s} className="flex items-center gap-2"><RiShieldCheckLine className="size-3.5 text-mint" />{s}</li>)}
              </ul>
              <div className="mt-5 flex w-full gap-2">
                <Button variant="ghost" className="flex-1" onClick={onClose}>取消</Button>
                <Button variant="primary" className="flex-1" disabled={!url} onClick={() => setPhase('waiting')}>允许</Button>
              </div>
              <p className="mt-3 text-[11px] text-ink-3">示例环境：此页面模拟服务商的授权页</p>
            </>
          )}
          {phase === 'waiting' && (
            <>
              <RiLoader4Line className="mt-5 size-6 animate-spin text-volt-text" />
              <p className="mt-2 font-semibold">等待授权完成…</p>
              <p className="mt-1 text-[12.5px] text-ink-3">在新窗口里完成登录与授权后，这里会自动更新。</p>
              {url && API_MODE === 'live' && <Button variant="ghost-accent" size="small" className="mt-3" onClick={() => window.open(url, '_blank', 'width=560,height=720')}><RiExternalLinkLine className="size-4" />重新打开授权窗口</Button>}
            </>
          )}
          {phase === 'done' && (
            <>
              <RiCheckboxCircleFill className="mt-5 size-8 text-mint" />
              <p className="mt-2 font-semibold">授权成功</p>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Dialog>
  )
}
