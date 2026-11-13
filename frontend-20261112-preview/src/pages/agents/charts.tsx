import type { StatPoint } from '@/api/agents'
import { motion } from 'motion/react'
import { useId, useState } from 'react'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'

/* 内联 SVG 面积折线图：volt / cyan 发光描边 + 渐变填充，悬停显示数值 */
export function AreaChart({ data, tone = 'volt', format = v => v.toLocaleString('zh-CN'), height = 150 }: { data: StatPoint[], tone?: 'volt' | 'cyan', format?: (v: number) => string, height?: number }) {
  const gid = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = 400
  const H = height
  const pad = { t: 10, r: 6, b: 22, l: 6 }
  const color = `var(--${tone})`
  if (!data.length)
    return <div className="grid place-items-center text-[12.5px] text-ink-3" style={{ height }}>暂无数据</div>
  const max = Math.max(...data.map(d => d.value), 0) || 1
  const min = 0
  const x = (i: number) => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - (v - min) / (max * 1.12 - min)) * (H - pad.t - pad.b)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`
  const step = Math.max(1, Math.ceil(data.length / 6))
  const h = hover != null ? data[hover] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1)))))
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="var(--line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
        <motion.path d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: ease.out }} />
        <motion.path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${color})` }} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: ease.out }} />
        {/* A single-day series has a zero-length SVG path. Keep the value visible even
            when the selected range contains only one day of telemetry. */}
        {data.map((d, i) => (
          <circle
            key={`point-${i}`}
            cx={x(i)}
            cy={y(d.value)}
            r={data.length === 1 ? 4.5 : 2.5}
            fill={color}
            stroke="var(--panel)"
            strokeWidth={data.length === 1 ? 2 : 1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke={color} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r={3.5} fill={color} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18px]">
        {data.map((d, i) => (i % step === 0 || i === data.length - 1) && (
          <span key={i} className="absolute -translate-x-1/2 text-[10.5px] text-ink-3 tabular-nums" style={{ left: `${(x(i) / W) * 100}%` }}>{d.date}</span>
        ))}
      </div>
      {h && (
        <div className={cn('glass-3 pointer-events-none absolute top-0 rounded-lg px-2 py-1 text-[11.5px] whitespace-nowrap shadow-float', hover! > data.length / 2 ? '-translate-x-full' : '')} style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <span className="text-ink-3">{h.date}</span> <b className="tabular-nums">{format(h.value)}</b>
        </div>
      )}
    </div>
  )
}
