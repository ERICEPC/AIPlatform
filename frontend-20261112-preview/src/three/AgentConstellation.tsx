import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { usePrefersReducedMotion } from '@/lib/theme'
import { fibonacciSphere, glowTexture, scenePalette } from './glow'

/*
  登录页主视觉：每位成员的助手是一个发光节点，围绕中枢分布；
  数据粒子沿连线在助手之间流动，表达"智能体协同"。鼠标带来视差。
*/

const NODE_COUNT = 14
const FLOW_PER_EDGE = 5

function useGraph() {
  return useMemo(() => {
    const nodes = fibonacciSphere(NODE_COUNT, 2.6)
    const edges: [THREE.Vector3, THREE.Vector3][] = []
    const core = new THREE.Vector3(0, 0, 0)
    nodes.forEach((n, i) => {
      edges.push([n, core])
      const j = (i * 5 + 3) % NODE_COUNT
      if (j !== i)
        edges.push([n, nodes[j]])
    })
    // 每条边做成一条微弯曲线，粒子沿曲线走
    const curves = edges.map(([a, b]) => {
      const mid = a.clone().add(b).multiplyScalar(0.5)
      mid.add(mid.clone().normalize().multiplyScalar(0.45))
      return new THREE.QuadraticBezierCurve3(a, mid, b)
    })
    return { nodes, curves }
  }, [])
}

function Edges({ curves, color, opacity }: { curves: THREE.QuadraticBezierCurve3[], color: string, opacity: number }) {
  const geometry = useMemo(() => {
    const pts: number[] = []
    curves.forEach((c) => {
      const s = c.getPoints(24)
      for (let i = 0; i < s.length - 1; i++)
        pts.push(s[i].x, s[i].y, s[i].z, s[i + 1].x, s[i + 1].y, s[i + 1].z)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [curves])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  )
}

function Flow({ curves, color, blending, still }: { curves: THREE.QuadraticBezierCurve3[], color: string, blending: THREE.Blending, still: boolean }) {
  const count = curves.length * FLOW_PER_EDGE
  const offsets = useMemo(() => Float32Array.from({ length: count }, () => Math.random()), [count])
  const speeds = useMemo(() => Float32Array.from({ length: count }, () => 0.06 + Math.random() * 0.1), [count])
  const positions = useMemo(() => new Float32Array(count * 3), [count])
  const ref = useRef<THREE.BufferAttribute>(null)
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    for (let i = 0; i < count; i++) {
      if (!still)
        offsets[i] = (offsets[i] + speeds[i] * dt) % 1
      curves[Math.floor(i / FLOW_PER_EDGE)].getPoint(offsets[i], tmp)
      positions.set([tmp.x, tmp.y, tmp.z], i * 3)
    }
    if (ref.current)
      ref.current.needsUpdate = true
  })

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute ref={ref} attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={glowTexture()} color={color} size={0.13} sizeAttenuation transparent depthWrite={false} blending={blending} />
    </points>
  )
}

function Nodes({ nodes, color, blending }: { nodes: THREE.Vector3[], color: string, blending: THREE.Blending }) {
  return (
    <group>
      {nodes.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <sprite scale={0.62}>
            <spriteMaterial map={glowTexture()} color={color} transparent depthWrite={false} blending={blending} opacity={0.75} />
          </sprite>
        </group>
      ))}
    </group>
  )
}

function Core({ color, blending, still }: { color: string, blending: THREE.Blending, still: boolean }) {
  const shell = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Sprite>(null)
  useFrame(({ clock }) => {
    if (still)
      return
    const t = clock.getElapsedTime()
    if (shell.current) {
      shell.current.rotation.y = t * 0.25
      shell.current.rotation.x = t * 0.12
    }
    // 呼吸光
    if (halo.current)
      halo.current.scale.setScalar(2.2 + Math.sin(t * 1.3) * 0.25)
  })
  return (
    <group>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.62, 1]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.55} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.16, 2]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <sprite ref={halo} scale={2.2}>
        <spriteMaterial map={glowTexture()} color={color} transparent depthWrite={false} blending={blending} opacity={0.4} />
      </sprite>
    </group>
  )
}

function Stars({ color }: { color: string }) {
  const geometry = useMemo(() => {
    const n = 900
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 7 + Math.random() * 9
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      arr.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return g
  }, [])
  return (
    <points geometry={geometry}>
      <pointsMaterial color={color} size={0.025} sizeAttenuation transparent opacity={0.7} depthWrite={false} />
    </points>
  )
}

function Rig({ children, still }: { children: React.ReactNode, still: boolean }) {
  const group = useRef<THREE.Group>(null)
  const { pointer } = useThree()
  useFrame((_, dt) => {
    const g = group.current
    if (!g)
      return
    if (!still)
      g.rotation.y += dt * 0.06
    // 鼠标视差：缓慢追随，不跟手抖
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, pointer.y * 0.25, 2.5, dt)
    g.position.x = THREE.MathUtils.damp(g.position.x, pointer.x * 0.35, 2.5, dt)
  })
  return <group ref={group}>{children}</group>
}

function Scene({ theme, still }: { theme: 'dark' | 'light', still: boolean }) {
  const pal = scenePalette(theme)
  const { nodes, curves } = useGraph()
  return (
    <>
      <Stars color={pal.star} />
      <Rig still={still}>
        <Edges curves={curves} color={pal.edge} opacity={pal.edgeOpacity} />
        <Flow curves={curves} color={pal.flow} blending={pal.blending} still={still} />
        <Nodes nodes={nodes} color={pal.node} blending={pal.blending} />
        <Core color={pal.core} blending={pal.blending} still={still} />
      </Rig>
    </>
  )
}

export default function AgentConstellation({ theme }: { theme: 'dark' | 'light' }) {
  const reduced = usePrefersReducedMotion()
  return (
    <Canvas
      camera={{ position: [0, 0.4, 7.4], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={reduced ? 'demand' : 'always'}
      aria-hidden
    >
      <Scene theme={theme} still={reduced} />
    </Canvas>
  )
}
