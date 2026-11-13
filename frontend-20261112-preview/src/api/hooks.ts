import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './http'

/** 读接口：加载、错误、重新加载；deps 变化时自动重取。pollMs 可选轮询（例如运行中的任务）。 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[], opts: { enabled?: boolean, pollMs?: number | false } = {}) {
  const { enabled = true, pollMs = false } = opts
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [loading, setLoading] = useState(enabled)
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const load = useCallback(async (silent = false) => {
    const id = ++seq.current
    if (!silent)
      setLoading(true)
    try {
      const d = await fnRef.current()
      if (id === seq.current) {
        setData(d)
        setError(null)
      }
    }
    catch (e) {
      if (id === seq.current)
        setError(e as Error)
    }
    finally {
      if (id === seq.current)
        setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled)
      load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  useEffect(() => {
    if (!enabled || !pollMs)
      return
    const t = setInterval(() => load(true), pollMs)
    return () => clearInterval(t)
  }, [enabled, pollMs, load])

  return { data, setData, error, loading, reload: () => load(), refresh: () => load(true) }
}

/** 写接口：记录进行中状态和错误 */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const run = useCallback(async (...args: A) => {
    setPending(true)
    setError(null)
    try {
      return await fn(...args)
    }
    catch (e) {
      setError(e as Error)
      throw e
    }
    finally {
      setPending(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { run, pending, error }
}
