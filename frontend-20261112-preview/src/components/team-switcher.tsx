import { useQuery } from '@/api/hooks'
import { request } from '@/api/http'
import { Menu } from '@/components/ui/menu'
import { RiExpandUpDownLine } from '@remixicon/react'
import { useState } from 'react'

type Space = { id: string, name: string, current: boolean }
export function TeamSwitcher() {
  const q = useQuery(() => request<{ workspaces: Space[] }>({ method: 'GET', path: '/workspaces' }, () => ({ workspaces: [] })), [])
  const members = useQuery(() => request<{ accounts: { id: string }[] }>({ method: 'GET', path: '/workspaces/current/members' }, () => ({ accounts: [] })), [])
  const [error, setError] = useState('')
  const spaces = q.data?.workspaces || []
  const current = spaces.find(s => s.current)
  const name = current?.name || (q.loading ? '正在加载团队…' : '工作空间')
  const pick = async (id: string) => {
    if (id === current?.id) return
    try {
      await request({ method: 'POST', path: '/workspaces/switch', body: { tenant_id: id } }, () => null)
      location.reload()
    } catch (e) { setError((e as Error).message) }
  }
  return <div>
    <Menu align="start" trigger={
      <button aria-label={`切换工作空间：${name}`} className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-volt">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#18231d] ring-1 ring-white/10">
          <img src="/new-ui/raccoon-emoji-v1/042-ai.webp" alt="" className="size-full object-cover" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-5 text-ink" title={name}>{name}</span>
          <span className="block text-[11px] leading-4 text-ink-3">{members.data ? `${members.data.accounts.length} 位员工` : members.loading ? '正在加载员工…' : '团队工作空间'}</span>
        </span>
        <RiExpandUpDownLine aria-hidden="true" className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-ink" />
      </button>
    } items={spaces.map(s => ({ label: s.name + (s.current ? ' ✓' : ''), onSelect: () => pick(s.id) }))} />
    {(error || q.error) && <p role="alert" className="mt-2 text-xs text-rose">{error || q.error?.message}</p>}
  </div>
}
