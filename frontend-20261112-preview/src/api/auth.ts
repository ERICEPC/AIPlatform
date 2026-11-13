import { request } from './http'
const call = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => request<T>({ method, path, body }, () => { throw new Error('登录必须连接真实服务') })
export const setupStatus = () => call<{step: string}>('GET', '/setup')
export const initStatus = () => call<{status: string}>('GET', '/init')
export const validateInit = (password: string) => call('POST', '/init', {password})
export const setupAdmin = (email: string, name: string, password: string) => call('POST', '/setup', {email, name, password, language: 'zh-Hans'})
export const login = (email: string, password: string, remember_me: boolean) => call<{result: string; message?: string}>('POST', '/login', {email, password: btoa(String.fromCharCode(...new TextEncoder().encode(password))), remember_me})
