import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { usePrefersReducedMotion } from '@/lib/theme'
import { glowTexture, scenePalette } from './glow'

/*
  协同网络：节点 = 当前群的成员（同事的助手 / Agent），有向连线 = 群内委派关系，
  粒子从委派方流向接收方。悬停高亮相关连线，点击选中成员。
  助手是圆形头像，Agent 是圆角方形头像 + 青色描边，便于区分。
  头像标签是画布上方的一层 DOM，每帧把 3D 坐标投影到屏幕再写 transform
  （不用 drei <Html>：它在 React 19 下会在渲染中卸载 root，导致标签丢失）。
*/

export type NetworkNode = {
  id: string
  label: string
  kind: 'assistant' | 'agent'
  status: 'busy' | 'idle' | 'offline'
  avatar: string
}
export type NetworkEdge = { from: string, to: string, active?: boolean }

const statusColor = { busy: '#ffb547', idle: '#83b3ed', offline: '#6c7787' }

type Vecs = Map<string, THREE.Vector3>
type LabelRefs = React.RefObject<Record<string, HTMLButtonElement | null>>

/*
  布局（2–10 个节点，可视范围约 ±2.4 × ±2.1）：
  1 个居中；2 个左右并排；3 个及以上第一个（自己的助手）居中，其余沿椭圆均匀排开，z 轴错落让旋转时有纵深。
*/
function layout(ids: string[]): Vecs {
  const m: Vecs = new Map()
  const n = ids.length
  if (n === 1) {
    m.set(ids[0], new THREE.Vector3(0, 0, 0))
    return m
  }
  if (n === 2) {
    m.set(ids[0], new THREE.Vector3(-1.15, 0.15, 0.2))
    m.set(ids[1], new THREE.Vector3(1.15, -0.15, -0.2))
    return m
  }
  m.set(ids[0], new THREE.Vector3(0, 0, 0))
  const ring = ids.slice(1)
  const k = ring.length
  // 人少时椭圆收小一点，避免节点散得太开
  const rx = k <= 3 ? 1.55 : 1.85
  const ry = k <= 3 ? 1.05 : 1.25
  ring.forEach((id, i) => {
    const a = Math.PI * 0.75 + (i / k) * Math.PI * 2
    m.set(id, new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, Math.sin(a * 2 + i) * 0.55))
  })
  return m
}

function Link({ from, to, active, color, blending, still }: { from: THREE.Vector3, to: THREE.Vector3, active: boolean, color: string, blending: THREE.Blending, still: boolean }) {
  const curve = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0.25))
    return new THREE.QuadraticBezierCurve3(from, mid, to)
  }, [from, to])
  const line = useMemo(() => new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)),
    new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }),
  ), [curve])
  useEffect(() => () => {
    line.geometry.dispose()
    ;(line.material as THREE.Material).dispose()
  }, [line])
  const mat = line.material as THREE.LineBasicMaterial
  mat.color.set(color)
  mat.opacity = active ? 0.75 : 0.18

  const n = 4
  const pos = useMemo(() => new Float32Array(n * 3), [])
  const off = useMemo(() => Float32Array.from({ length: n }, (_, i) => i / n), [])
  const attr = useRef<THREE.BufferAttribute>(null)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    for (let i = 0; i < n; i++) {
      if (!still)
        off[i] = (off[i] + dt * (active ? 0.45 : 0.22)) % 1
      curve.getPoint(off[i], tmp)
      pos.set([tmp.x, tmp.y, tmp.z], i * 3)
    }
    if (attr.current)
      attr.current.needsUpdate = true
  })
  return (
    <group>
      <primitive object={line} />
      <points>
        <bufferGeometry>
          <bufferAttribute ref={attr} attach="attributes-position" args={[pos, 3]} />
        </bufferGeometry>
        <pointsMaterial map={glowTexture()} color={color} size={active ? 0.22 : 0.14} transparent depthWrite={false} blending={blending} />
      </points>
    </group>
  )
}

function Halo({ seed, position, lit, color, blending }: { seed: number, position: THREE.Vector3, lit: boolean, color: string, blending: THREE.Blending }) {
  const ref = useRef<THREE.Sprite>(null)
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.scale.setScalar((lit ? 1.25 : 0.95) + Math.sin(clock.getElapsedTime() * 2 + seed) * 0.06)
  })
  return (
    <sprite ref={ref} position={position}>
      <spriteMaterial map={glowTexture()} color={color} transparent opacity={lit ? 0.9 : 0.45} depthWrite={false} blending={blending} />
    </sprite>
  )
}

// 每帧把节点投影到屏幕，直接写 DOM，不触发 React 渲染
function LabelSync({ vecs, labels }: { vecs: Vecs, labels: LabelRefs }) {
  const p = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const [id, v] of vecs) {
      const el = labels.current?.[id]
      if (!el)
        continue
      p.copy(v).project(camera)
      el.style.transform = `translate3d(${(p.x * 0.5 + 0.5) * size.width}px, ${(-p.y * 0.5 + 0.5) * size.height}px, 0) translate(-50%, -50%)`
      el.style.zIndex = String(Math.round((1 - p.z) * 1000))
    }
  })
  return null
}

function Graph({ theme, nodes, edges, vecs, focus, selected, labels, still }: { theme: 'dark' | 'light', nodes: NetworkNode[], edges: NetworkEdge[], vecs: Vecs, focus: string | null, selected: string | null, labels: LabelRefs, still: boolean }) {
  const pal = scenePalette(theme)
  return (
    <group>
      {edges.map((d) => {
        const from = vecs.get(d.from)
        const to = vecs.get(d.to)
        return from && to && (
          <Link
            key={`${d.from}->${d.to}`}
            from={from}
            to={to}
            active={d.active || d.from === focus || d.to === focus}
            color={d.active || d.from === focus ? pal.flow : pal.edge}
            blending={pal.blending}
            still={still}
          />
        )
      })}
      {nodes.map((p, i) => (
        <Halo key={p.id} seed={i * 1.7} position={vecs.get(p.id)!} lit={p.status === 'busy' || p.id === focus} color={p.status === 'busy' ? statusColor.busy : p.id === selected ? pal.core : statusColor[p.status]} blending={pal.blending} />
      ))}
      <LabelSync vecs={vecs} labels={labels} />
    </group>
  )
}

export default function CollabNetwork({ theme, nodes, edges, selectedId, onSelect }: {
  theme: 'dark' | 'light'
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const reduced = usePrefersReducedMotion()
  const [hover, setHover] = useState<string | null>(null)
  const labels = useRef<Record<string, HTMLButtonElement | null>>({})
  const focus = hover ?? selectedId

  // 只在成员集合变化时重新布局（节点状态变化不动位置）
  const key = nodes.map(n => n.id).join('\n')
  const vecs = useMemo(() => layout(key ? key.split('\n') : []), [key])
  // 同一对成员之间可能有多项委派，只画一条线
  const uniq = useMemo(() => {
    const seen = new Set<string>()
    return edges.filter((e) => {
      const k = `${e.from}->${e.to}`
      if (e.from === e.to || seen.has(k) || !vecs.has(e.from) || !vecs.has(e.to))
        return false
      seen.add(k)
      return true
    })
  }, [edges, vecs])

  return (
    <div className="absolute inset-0 isolate">
      <Canvas camera={{ position: [0, 0.2, 5.2], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} frameloop={reduced ? 'demand' : 'always'}>
        <Graph theme={theme} nodes={nodes} edges={uniq} vecs={vecs} focus={focus} selected={selectedId} labels={labels} still={reduced} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={!reduced} autoRotateSpeed={0.6} minPolarAngle={Math.PI / 3} maxPolarAngle={(Math.PI * 2) / 3} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0">
        {nodes.map((p) => {
          const isSel = p.id === selectedId
          const agent = p.kind === 'agent'
          return (
            <button
              key={p.id}
              ref={(el) => { labels.current[p.id] = el }}
              type="button"
              onPointerEnter={() => setHover(p.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onSelect(p.id)}
              aria-label={agent ? `Agent：${p.label}` : p.label}
              aria-pressed={isSel}
              data-status={p.status}
              className="pointer-events-auto absolute top-0 left-0 flex cursor-pointer flex-col items-center gap-1 will-change-transform"
            >
              <span className="relative">
                {p.status === 'busy' && <span className="absolute -inset-1 rounded-xl border border-amber-400 motion-safe:animate-pulse" />}
                <img
                  src={asset(p.avatar)}
                  alt=""
                  className={cn(
                    'size-9 border-2 bg-glass-3 object-cover transition-transform duration-200 ease-out hover:scale-110',
                    agent ? 'rounded-[11px]' : 'rounded-full',
                    p.status === 'busy' ? 'scale-110 border-amber-400 shadow-[0_0_18px_#fbbf2480] ring-4 ring-amber-400/20' : isSel ? 'scale-110 border-volt shadow-glow-volt' : agent ? 'border-cyan ' : 'border-line-strong',
                    p.status === 'offline' && !isSel && 'opacity-60 grayscale',
                  )}
                />
                {agent && <i className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-[4px] bg-cyan text-[8px] leading-none font-bold not-italic text-bg">A</i>}
              </span>
              <span className={cn('glass-3 max-w-[92px] truncate rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap', isSel ? 'text-volt-text' : agent ? 'text-cyan' : 'text-ink')}>{p.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
