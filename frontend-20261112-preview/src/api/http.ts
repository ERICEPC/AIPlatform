/*
  前端接口层核心。
  - 全局开关 VITE_API_MODE：mock（默认）走本地示例数据；live 走真实后端。
  - 两套后端：
      console  RaccoonX 控制台接口，前缀 VITE_API_BASE（默认 /console/api），Cookie 会话 + X-CSRF-Token
      kb       Raccoon KnowledgeBase 服务端代理，固定 /console/api/knowledge-bridge，复用控制台会话；上游登录态仅保存在服务端
  - 每个接口函数都写成 request({ method, path, ... }, mock)，路径和字段与原源码一致，
    mock 只在 mock 模式下调用。后端接入时把 VITE_API_MODE 改成 live 即可，页面代码不用动。
*/

export type ApiMode = 'mock' | 'live'
export type Backend = 'console' | 'kb'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock'
const BASES: Record<Backend, string> = {
  console: import.meta.env.VITE_API_BASE ?? '/console/api',
  kb: '/console/api/knowledge-bridge',
}
/** 完整知识库应用地址（当前前端未覆盖的知识库功能跳转过去） */
export const KB_APP_URL: string = import.meta.env.VITE_KB_APP_URL ?? 'https://180.184.148.175/kb'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>

export type RequestSpec = {
  method: HttpMethod
  /** 不含前缀的路径，例如 /agent/{id}/composer（参数已替换） */
  path: string
  backend?: Backend
  query?: Query
  body?: unknown
  /** multipart 上传 */
  form?: FormData
  signal?: AbortSignal
}

function buildUrl(spec: RequestSpec) {
  const base = BASES[spec.backend ?? 'console']
  const url = new URL(`${base}${spec.path}`, location.origin)
  for (const [k, v] of Object.entries(spec.query ?? {})) {
    if (v === undefined || v === null || v === '')
      continue
    if (Array.isArray(v))
      v.forEach(item => url.searchParams.append(`${k}[]`, String(item)))
    else
      url.searchParams.set(k, String(v))
  }
  return url.toString()
}

function readCookie(name: string) {
  return document.cookie.split('; ').find(c => c.startsWith(`${name}=`))?.split('=')[1]
}

function authHeaders(_backend: Backend): Record<string, string> {
  const csrf = readCookie('csrf_token') ?? readCookie('__Host-csrf_token')
  return csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}
}

// Refresh cookies once for concurrent requests; coordinate rotating tokens across tabs.
let sessionRefresh: Promise<boolean> | null = null
async function renewSession(requestStarted: number): Promise<boolean> {
  if (sessionRefresh) return sessionRefresh
  const refresh = async () => {
    try { if (Number(localStorage.getItem('rx-session-renewed-at')) > requestStarted) return true } catch {}
    let response: Response
    try {
      response = await fetch(new URL(`${BASES.console}/refresh-token`, location.origin), {
        method: 'POST', credentials: 'include', headers: authHeaders('console'),
      })
    } catch { throw new ApiError('网络暂时不可用，登录状态已保留，请重试', 503) }
    if (response.status === 401) return false
    if (!response.ok) throw new ApiError('登录续期服务暂时不可用，请稍后重试', response.status)
    const result = await response.json()
    if (result.result !== 'success') throw new ApiError('登录续期返回异常，请重试', 503)
    try { localStorage.setItem('rx-session-renewed-at', String(Date.now())) } catch {}
    return true
  }
  const pending = (async () => navigator.locks
    ? await navigator.locks.request('raccoonx-session-refresh', refresh)
    : await refresh())().finally(() => { sessionRefresh = null })
  sessionRefresh = pending
  return pending
}

async function liveFetch(spec: RequestSpec): Promise<Response> {
  const backend = spec.backend ?? 'console'
  const headers: Record<string, string> = { ...authHeaders(backend) }
  let body: BodyInit | undefined
  if (spec.form)
    body = spec.form
  else if (spec.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(spec.body)
  }
  const started = Date.now()
  const send = () => fetch(buildUrl(spec), { method: spec.method, headers: { ...headers, ...authHeaders(backend) }, body, credentials: 'include', signal: spec.signal })
  let res = await send()
  if (res.status === 401 && !['/login', '/logout', '/refresh-token', '/setup', '/init'].includes(spec.path)) {
    if (await renewSession(started)) {
      spec.signal?.throwIfAborted()
      res = await send()
    }
  }
  if (!res.ok) {
    let message = `请求失败（${res.status}）`
    let code: string | undefined
    try {
      const data = await res.json()
      message = data.message ?? data.error ?? message
      code = data.code
      if (backend === 'kb' && code === 'KB_AUTH_EXPIRED') dispatchEvent(new Event('rx-knowledge-session-expired'))
    }
    catch {}
    if (res.status === 401 && !['/login', '/account/profile'].includes(spec.path)) dispatchEvent(new Event('rx-session-expired'))
    if (res.status === 404 && message === `请求失败（${res.status}）`) message = '当前服务尚未提供此功能接口。请联系管理员检查服务配置。'
    throw new ApiError(message, res.status, code)
  }
  return res
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
// mock 返回深拷贝，避免页面改到示例数据本身
const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v))

/** 普通 JSON 接口 */
export async function request<T>(spec: RequestSpec, mock: () => T | Promise<T>): Promise<T> {
  if (API_MODE === 'mock') {
    await sleep(180 + Math.random() * 220)
    return clone(await mock())
  }
  const res = await liveFetch(spec)
  if (res.status === 204)
    return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** 文件下载类接口：返回 Blob */
export async function requestBlob(spec: RequestSpec, mock: () => Blob): Promise<Blob> {
  if (API_MODE === 'mock') {
    await sleep(200)
    return mock()
  }
  return (await liveFetch(spec)).blob()
}

export type StreamEvent = { event: string, [k: string]: unknown }

/**
 * SSE 流式接口（对话）。live 模式按 `data: {...}` 逐行解析；
 * mock 模式由 mock 生成器逐个产出事件，模拟打字效果。
 */
export async function stream(spec: RequestSpec, onEvent: (e: StreamEvent) => void, mock: () => AsyncGenerator<StreamEvent>): Promise<void> {
  if (API_MODE === 'mock') {
    for await (const e of mock()) {
      if (spec.signal?.aborted)
        return
      onEvent(e)
    }
    return
  }
  const res = await liveFetch(spec)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let completed = false
  while (true) {
    const { done, value } = await reader.read()
    buf += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:'))
        continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      if (payload === '[DONE]') { completed = true; continue }
      let event: StreamEvent
      try { event = JSON.parse(payload) } catch { throw new ApiError('服务器返回了无法解析的流式消息', 502) }
      if (spec.backend === 'kb') {
        if (event.type === 'error') throw new ApiError(String(event.content ?? event.message ?? '知识库问答失败'), 502)
        if (event.type === 'done') completed = true
      }
      onEvent(event)
    }
    if (done) break
  }
  if (spec.backend === 'kb' && spec.path !== '/chat/stream' && !completed) throw new ApiError('回答连接已中断，内容可能不完整，请重试。', 502)
}

/** mock 里模拟逐字输出的文本流 */
export async function* mockTextStream(text: string, event = 'message', extra: Record<string, unknown> = {}): AsyncGenerator<StreamEvent> {
  await sleep(500)
  for (let i = 0; i < text.length; i += 3) {
    await sleep(28)
    yield { event, answer: text.slice(i, i + 3), ...extra }
  }
  yield { event: 'message_end', ...extra }
}

/** 生成 mock id */
export const mockId = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 10)}`
export const nowIso = () => new Date().toISOString()
