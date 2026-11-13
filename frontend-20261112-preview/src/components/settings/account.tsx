/* 设置 → 账号：头像、名称、邮箱、角色，修改密码、登出 */
import type { AccountProfile } from '@/api/settings'
import { RiCheckLine, RiImageAddLine, RiLockPasswordLine, RiLogoutBoxRLine, RiMailLine, RiShieldUserLine, RiUser3Line } from '@remixicon/react'
import { useEffect, useState } from 'react'
import { updateAccountAvatar, updateAccountName, uploadAccountAvatar } from '@/api/settings'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Field, Input } from '@/components/ui/form'
import { Avatar, Badge, Skeleton } from '@/components/ui/primitives'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { currentUser as me } from '@/lib/current-user'
import { asset } from '@/lib/asset'
import { RACCOON_ICONS } from '@/pages/agents/shared'
import { errText, SettingsGroup } from './kit'

function InfoRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>, label: string, children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 shrink-0 text-ink-3" />
      <span className="w-16 shrink-0 text-[13px] text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{children}</span>
    </div>
  )
}

export function AccountTab({ profile, error, onRetry, onProfile, onLogout, loggingOut }: {
  profile?: AccountProfile
  error: Error | null
  onRetry: () => void
  onProfile: (p: AccountProfile) => void
  onLogout: () => void
  loggingOut: boolean
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarSearch, setAvatarSearch] = useState('')

  useEffect(() => {
    if (profile)
      setName(profile.name)
  }, [profile?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !profile)
    return <ErrorBar error={error} onRetry={onRetry} />
  if (!profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[92px] rounded-[20px]" />
        <Skeleton className="h-[72px] rounded-2xl" />
        <Skeleton className="h-[120px] rounded-2xl" />
      </div>
    )
  }

  const trimmed = name.trim()
  const nameError = !trimmed ? '名称不能为空' : trimmed.length > 30 ? '名称不能超过 30 个字' : undefined
  const dirty = trimmed !== profile.name

  const saveName = async () => {
    if (nameError || !dirty)
      return
    setSaving(true)
    try {
      await updateAccountName(trimmed)
      onProfile({ ...profile, name: trimmed })
      toast('名称已更新')
    }
    catch (e) {
      toast(errText(e), 'info')
    }
    finally {
      setSaving(false)
    }
  }

  const saveAvatar = async (value: string, preview?: string) => {
    setAvatarBusy(true)
    try {
      // 内置小浣熊是公开静态资源，持久化为绝对 URL；后端对上传文件则保存文件 ID。
      const persisted = value.startsWith('/') ? new URL(asset(value), location.origin).toString() : value
      await updateAccountAvatar(persisted)
      const url = preview || (persisted.startsWith('data:') ? persisted : persisted.startsWith('http') ? persisted : `/console/api/account/avatar?avatar=${encodeURIComponent(persisted)}`)
      me.avatar = url
      onProfile({ ...profile, avatar: persisted, avatar_url: url })
      setAvatarOpen(false)
      toast('头像已更新')
    }
    catch (e) { toast(errText(e), 'info') }
    finally { setAvatarBusy(false) }
  }

  const uploadAvatar = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('请选择图片文件', 'info'); return }
    if (file.size > 5 * 1024 * 1024) { toast('图片不能超过 5 MB', 'info'); return }
    setAvatarBusy(true)
    try {
      const uploaded = await uploadAccountAvatar(file)
      const preview = uploaded.url || undefined
      await updateAccountAvatar(uploaded.id)
      const url = preview || `/console/api/account/avatar?avatar=${encodeURIComponent(uploaded.id)}`
      me.avatar = url
      onProfile({ ...profile, avatar: uploaded.id, avatar_url: url })
      setAvatarOpen(false)
      toast('本地头像已上传')
    }
    catch (e) { toast(errText(e), 'info') }
    finally { setAvatarBusy(false) }
  }

  return (
    <div className="space-y-7">
      <div className="glass-2 glass-edge flex items-center gap-4 rounded-[20px] p-5">
        <Avatar src={profile.avatar_url || me.avatar} size={60} ring />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{profile.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-ink-3">{profile.email}</p>
          {profile.role && <Badge tone="volt" className="mt-2 h-5 px-2 text-[11px]">{profile.role}</Badge>}
        </div>
        <Button variant="secondary" size="small" onClick={() => setAvatarOpen(true)}>更换头像</Button>
      </div>

      <Dialog open={avatarOpen} onOpenChange={setAvatarOpen} title="更换头像" description="选择一个小浣熊头像，或上传一张本地图片。" size="lg" footer={<Button variant="ghost" onClick={() => setAvatarOpen(false)}>关闭</Button>}>
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-glass-2 p-4">
            <Avatar src={profile.avatar_url || me.avatar} size={56} ring />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">当前头像</p><p className="mt-1 text-xs text-ink-3">头像会显示在个人助手、协同记录和成员列表中。</p></div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-sm hover:bg-hover">
              <RiImageAddLine className="size-4" />上传图片<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={avatarBusy} onChange={e => { void uploadAvatar(e.target.files?.[0]); e.currentTarget.value = '' }} />
            </label>
          </div>
          <div className="flex items-center gap-3"><Input aria-label="搜索小浣熊头像" placeholder="搜索头像编号，例如 042" value={avatarSearch} onChange={e => setAvatarSearch(e.target.value)} /><span className="shrink-0 text-xs text-ink-3">104 个头像</span></div>
          <div className="grid max-h-[360px] grid-cols-6 gap-3 overflow-auto pr-1 sm:grid-cols-8">
            {RACCOON_ICONS.filter(path => !avatarSearch.trim() || path.includes(avatarSearch.trim())).map(path => {
              const selected = (profile.avatar_url || me.avatar) === asset(path)
              return <button key={path} type="button" disabled={avatarBusy} aria-label={`选择头像 ${path.split('/').pop()?.replace('.webp', '')}`} onClick={() => void saveAvatar(path)} className={`group relative rounded-2xl border p-2 transition ${selected ? 'border-volt bg-volt-soft ring-1 ring-volt' : 'border-line bg-glass-2 hover:border-line-strong hover:bg-hover'}`}><img src={asset(path)} alt="" className="aspect-square w-full rounded-xl object-cover" />{selected && <span className="absolute right-1.5 bottom-1.5 grid size-5 place-items-center rounded-full bg-volt text-volt-ink"><RiCheckLine className="size-3.5" /></span>}</button>
            })}
          </div>
          {avatarBusy && <p className="text-center text-xs text-ink-3">正在保存头像…</p>}
        </div>
      </Dialog>

      <SettingsGroup title="基本信息">
        <form
          className="flex items-start gap-3"
          onSubmit={(e) => { e.preventDefault(); saveName() }}
        >
          <Field label="显示名称" error={dirty ? nameError : undefined} hint="会显示在协同记录、核对单和团队成员列表里。" className="flex-1">
            <Input value={name} onChange={e => setName(e.target.value)} maxLength={40} invalid={dirty && !!nameError} aria-label="显示名称" />
          </Field>
          <Button type="submit" variant="primary" className="mt-[26px] h-11" disabled={!dirty || !!nameError} loading={saving}>保存</Button>
        </form>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
          <InfoRow icon={RiMailLine} label="邮箱">{profile.email}</InfoRow>
          <InfoRow icon={RiShieldUserLine} label="角色">{profile.role ?? '成员'}</InfoRow>
          <InfoRow icon={RiUser3Line} label="账号 ID"><span className="font-mono text-[12.5px] text-ink-2">{profile.id}</span></InfoRow>
        </div>
      </SettingsGroup>

      <SettingsGroup title="安全">
        <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
          <RiLockPasswordLine className="size-4 shrink-0 text-ink-3" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] text-ink">登录密码</p>
            <p className="text-[12px] text-ink-3">{profile.is_password_set ? '已设置。建议定期更换，至少 8 位并包含字母和数字。' : '还没有设置密码，目前只能用邮箱验证码登录。'}</p>
          </div>
          <Button variant="ghost-accent" size="small" onClick={() => toast('修改密码将在后续版本开放，如需重置请联系管理员', 'info')}>
            {profile.is_password_set ? '修改密码' : '设置密码'}
          </Button>
        </div>
      </SettingsGroup>

      <div className="flex items-center gap-3 rounded-2xl border border-rose/30 bg-rose-soft/40 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-ink">退出登录</p>
          <p className="text-[12px] text-ink-3">退出后需要重新登录才能访问工作空间。</p>
        </div>
        <Button variant="secondary" tone="destructive" size="small" loading={loggingOut} onClick={onLogout}>
          <RiLogoutBoxRLine className="size-4" />登出
        </Button>
      </div>
    </div>
  )
}
