import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { pageVariants, riseItem } from '@/lib/motion'

// 页面容器：进场错峰上浮 + 去模糊，退场更快更轻
export function Page({ className, children }: { className?: string, children: React.ReactNode }) {
  return (
    <motion.section variants={pageVariants} initial="initial" animate="enter" exit="exit" className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      {children}
    </motion.section>
  )
}

export function Rise({ className, children, ...props }: React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div variants={riseItem} className={className} {...props}>
      {children}
    </motion.div>
  )
}

// 页内顶栏：浮在内容上的半透明材质
export function Toolbar({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn('glass-2 absolute inset-x-0 top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 bg-glass-2/70 px-5 backdrop-blur-2xl', className)}>
      {children}
    </div>
  )
}
