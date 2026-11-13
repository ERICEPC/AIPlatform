import { RiInformationLine } from '@remixicon/react'
import { useQuery } from '@/api/hooks'
import { getStackStatus } from '@/api/stack'
import { StatusTag } from '@/components/console'
import { isSuper } from '@/api/access'
import { useSession } from '@/lib/session'

/* 用户端只读的组件状态条：开发者能看到依赖组件是否正常，配置入口只对超级管理员显示 */
export function StatusStrip({ ids, go }: { ids: string[], go: (p: string) => void }) {
  const q = useQuery(getStackStatus, [])
  const { perms } = useSession()
  const list = (q.data?.data ?? []).filter(c => ids.includes(c.id))
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-solid px-5 py-3 text-[13px]">
      <span className="flex items-center gap-1.5 text-ink-3"><RiInformationLine className="size-4" />依赖的平台组件</span>
      {list.map(c => <span key={c.id} className="flex items-center gap-2" title={c.user_side}>{c.name}<StatusTag status={c.status} /></span>)}
      <span className="ml-auto text-[12px] text-ink-3">{isSuper(perms) ? <button type="button" className="cursor-pointer text-volt-text hover:underline" onClick={() => go('admin/stack')}>去配置组件连接</button> : '组件连接由超级管理员在管理后台配置'}</span>
    </div>
  )
}
