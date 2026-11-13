import * as THREE from 'three'

// 径向光晕贴图：节点和粒子共用，代替后处理 bloom，开销很低
let cached: THREE.Texture | null = null
export function glowTexture() {
  if (cached)
    return cached
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  cached = new THREE.CanvasTexture(canvas)
  cached.colorSpace = THREE.SRGBColorSpace
  return cached
}

export type ScenePalette = {
  core: string
  node: string
  edge: string
  flow: string
  star: string
  blending: THREE.Blending
  edgeOpacity: number
}

export function scenePalette(theme: 'dark' | 'light'): ScenePalette {
  return theme === 'dark'
    ? { core: '#2f6fed', node: '#38bdf8', edge: '#60a5fa', flow: '#8fb4ff', star: '#94a3b8', blending: THREE.AdditiveBlending, edgeOpacity: 0.16 }
    : { core: '#2563eb', node: '#0284c7', edge: '#3b82f6', flow: '#2f6fb3', star: '#8592a6', blending: THREE.NormalBlending, edgeOpacity: 0.22 }
}

// 斐波那契球面均匀分布
export function fibonacciSphere(n: number, radius: number) {
  const pts: THREE.Vector3[] = []
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const t = phi * i
    pts.push(new THREE.Vector3(Math.cos(t) * r * radius, y * radius * 0.78, Math.sin(t) * r * radius))
  }
  return pts
}
