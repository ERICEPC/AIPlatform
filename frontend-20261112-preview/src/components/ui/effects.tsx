import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { riseItem } from '@/lib/motion'

/* 聚光卡片：鼠标位置处出现柔和光斑 + 描边高亮 */
export function SpotlightCard({ className, children, ...props }: React.ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`)
    ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <motion.div variants={riseItem} className="h-full">
      <div
        ref={ref}
        onPointerMove={onMove}
        className={cn(
          'group glass-2 glass-edge relative h-full overflow-hidden rounded-xl transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-line-strong',
          className,
        )}
        {...props}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: 'radial-gradient(360px circle at var(--mx) var(--my), var(--volt-soft), transparent 65%)' }}
        />
        <div className="relative h-full">{children}</div>
      </div>
    </motion.div>
  )
}

/* 迷你趋势线，带发光 */
export function Sparkline({ data, className }: { data: readonly number[], className?: string }) {
  const max = Math.max(...data, 1)
  const w = 96
  const h = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('h-7 w-24 overflow-visible', className)} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--volt)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px var(--volt))' }} />
    </svg>
  )
}

/* 数字滚动：进入视口时从 0 计到目标值 */
export function CountUp({ value, suffix = '', decimals = 0 }: { value: number, suffix?: string, decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const text = useTransform(mv, v => `${v.toLocaleString('zh-CN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${suffix}`)
  useEffect(() => {
    if (inView)
      animate(mv, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1] })
  }, [inView, mv, value])
  return <motion.span ref={ref}>{text}</motion.span>
}

/* 打字中三点 */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="正在输入">
      {[0, 1, 2].map(i => (
        <motion.i
          key={i}
          className="size-1.5 rounded-full bg-volt"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  )
}
