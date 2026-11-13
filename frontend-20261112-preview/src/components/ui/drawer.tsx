import { RiCloseLine } from '@remixicon/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { ease } from '@/lib/motion'
import { Button } from './button'

// 右侧抽屉：从右进、从右出，带遮罩；Esc 关闭
export function Drawer({ open, onClose, title, children, footer }: { open: boolean, onClose: () => void, title: React.ReactNode, children: React.ReactNode, footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open)
      return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="关闭" className="absolute inset-0 cursor-default bg-black/25" onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{ duration: 0.42, ease: ease.sheet }}
            className="glass-3 relative flex h-full w-[520px] max-w-full min-w-0 flex-col rounded-none border-y-0 border-r-0 shadow-float"
          >
            <div className="flex items-start gap-3 p-6 pb-2">
              <div className="min-w-0 flex-1">{title}</div>
              <Button variant="ghost" size="icon" aria-label="关闭" onClick={onClose}><RiCloseLine className="size-5" /></Button>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto px-6 pb-6">{children}</div>
            {footer && <div className="flex gap-2 border-t border-line p-5">{footer}</div>}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
