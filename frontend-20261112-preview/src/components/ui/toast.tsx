import { RiCheckLine, RiInformationLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useState } from 'react'
import { spring } from '@/lib/motion'

type Toast = { id: number, text: string, tone: 'ok' | 'info' }
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {})

// 轻量提示：右上角浮出 2.4 秒，用于"已发布""已连接"这类操作反馈
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setList(l => [...l, { id, text, tone }])
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 2400)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed top-5 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
        <AnimatePresence>
          {list.map(t => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.18 } }}
              transition={spring.smooth}
              className="glass-3 flex items-center gap-2.5 rounded-lg py-2 pr-4 pl-2.5 text-[13px] shadow-float"
            >
              <span className={`grid size-6 place-items-center rounded-full ${t.tone === 'ok' ? 'bg-volt text-volt-ink' : 'bg-cyan-soft text-cyan'}`}>
                {t.tone === 'ok' ? <RiCheckLine className="size-3.5" /> : <RiInformationLine className="size-3.5" />}
              </span>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
