/*
  个人设置的有状态内存 mock：改名、语言、时区即时生效（刷新页面后恢复示例数据）。
*/
import type { AccountProfile, ChangePasswordBody, CommonResult, InterfaceLanguage } from '../settings'
import { me } from '@/data'
import { ApiError } from '../http'

const ok = (): CommonResult => ({ result: 'success' })

let account: AccountProfile = {
  id: 'acc-lpc',
  name: me.owner,
  email: 'lipengcheng@sensetime.com',
  avatar: '',
  avatar_url: me.avatar,
  is_password_set: true,
  interface_language: 'zh-Hans',
  timezone: 'Asia/Shanghai',
  role: me.role,
  created_at: 1735689600,
}

export const profile = () => ({ ...account })

export function setName(name: string) {
  const v = name.trim()
  if (!v)
    throw new ApiError('名称不能为空', 400)
  if (v.length > 30)
    throw new ApiError('名称不能超过 30 个字', 400)
  account = { ...account, name: v }
  return ok()
}

export function setAvatar(avatar: string) {
  account = { ...account, avatar, avatar_url: avatar || null }
  return ok()
}

export function changePassword(body: ChangePasswordBody) {
  if (body.new_password !== body.repeat_new_password)
    throw new ApiError('两次输入的新密码不一致', 400)
  if (body.new_password.length < 8)
    throw new ApiError('密码至少 8 位，需同时包含字母和数字', 400)
  account = { ...account, is_password_set: true }
  return ok()
}

export function setLanguage(lang: InterfaceLanguage) {
  account = { ...account, interface_language: lang }
  return ok()
}

export function setTimezone(timezone: string) {
  account = { ...account, timezone }
  return ok()
}

export { ok }
