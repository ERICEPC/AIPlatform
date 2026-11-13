/*
  个人设置接口层（控制台前缀 /console/api）。
  路径、字段与原 RaccoonX 账号设置一致（account-page、preference-page、useLogout）；mock 见 ./mock/settings.ts。
  修改类接口成功时返回 { result: 'success' }。
*/
import { request } from './http'
import * as db from './mock/settings'
import { signOut } from './mock/governance'

/* ---------------- 类型 ---------------- */
export type InterfaceLanguage = 'zh-Hans' | 'en-US'

/** GET /account/profile 的返回 */
export type AccountProfile = {
  id: string
  name: string
  email: string
  avatar: string
  avatar_url: string | null
  is_password_set: boolean
  interface_language: InterfaceLanguage
  timezone: string
  /** 新前端展示用：岗位 / 角色（原接口无此字段，来自工作空间成员角色） */
  role?: string
  created_at?: number
}

export type CommonResult = { result: 'success' }
export type UploadedAvatar = { id: string, url?: string | null }

export type ChangePasswordBody = {
  /** 当前密码；首次设置密码时可不传 */
  password?: string
  new_password: string
  repeat_new_password: string
}

/* ---------------- 接口 ---------------- */
/** GET /account/profile 读取当前登录账号资料 */
export const getAccountProfile = () =>
  request<AccountProfile>({ method: 'GET', path: '/account/profile' }, () => db.profile())

/** POST /account/name 修改显示名称 */
export const updateAccountName = (name: string) =>
  request<CommonResult>({ method: 'POST', path: '/account/name', body: { name } }, () => db.setName(name))

/** POST /account/avatar 修改头像（avatar 为上传后的文件 ID，传空字符串表示移除） */
export const updateAccountAvatar = (avatar: string) =>
  request<CommonResult>({ method: 'POST', path: '/account/avatar', body: { avatar } }, () => db.setAvatar(avatar))

/** POST /files/upload 上传头像文件；头像保存仍通过 /account/avatar 绑定文件 ID。 */
export const uploadAccountAvatar = (file: File) =>
  request<UploadedAvatar>({ method: 'POST', path: '/files/upload', form: (() => { const f = new FormData(); f.append('file', file); return f })() }, async () => {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('头像读取失败'))
      reader.readAsDataURL(file)
    })
    return { id: url, url }
  })

/** POST /account/password 修改密码 */
export const changePassword = (body: ChangePasswordBody) =>
  request<CommonResult>({ method: 'POST', path: '/account/password', body }, () => db.changePassword(body))

/** POST /account/interface-language 修改界面语言 */
export const updateInterfaceLanguage = (interface_language: InterfaceLanguage) =>
  request<CommonResult>({ method: 'POST', path: '/account/interface-language', body: { interface_language } }, () => db.setLanguage(interface_language))

/** POST /account/timezone 修改时区（IANA 名称，例如 Asia/Shanghai） */
export const updateTimezone = (timezone: string) =>
  request<CommonResult>({ method: 'POST', path: '/account/timezone', body: { timezone } }, () => db.setTimezone(timezone))

/** POST /logout 退出登录（清除会话 Cookie） */
export const logout = () =>
  request<CommonResult>({ method: 'POST', path: '/logout' }, () => { signOut(); return db.ok() })
