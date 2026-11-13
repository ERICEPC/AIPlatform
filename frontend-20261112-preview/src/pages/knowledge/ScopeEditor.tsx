import type { KbAccessPolicy, KbLibraryItem, KbMaterial } from '@/api/knowledge'
import { RiCheckLine, RiEditLine, RiGlobalLine, RiLoader4Line, RiLock2Line, RiTeamLine, RiUserSharedLine } from '@remixicon/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { getDocumentPolicy, updateDocumentAccessMode, updateMaterialUsageScope } from '@/api/knowledge'
import { Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { ScopeBadge } from './MaterialTable'
import { ACCESS_META, Pop, presentation, USAGE_SCOPES } from './shared'

type Mode = KbAccessPolicy['accessMode']
const MODE_ICON: Record<Mode, React.ComponentType<{ className?: string }>> = { PRIVATE: RiLock2Line, INHERIT: RiUserSharedLine, TENANT: RiTeamLine, CUSTOM: RiGlobalLine }
const EDITABLE: Mode[] = ['PRIVATE', 'INHERIT', 'TENANT']

/*
  「我的」视图里材料的范围单元格：上面是内部可见范围（仅自己 / 跟随知识库 / 公司内可见），下面是对外使用范围标注。
  点击打开小弹层直接改，改完 toast 并通知列表刷新。
*/
export function ScopeCell({ m, library, onChanged }: { m: KbMaterial, library?: KbLibraryItem, onChanged: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const policy = useQuery(() => getDocumentPolicy(m.documentId), [m.documentId])
  const p = presentation(m)
  const mode = policy.data?.accessMode
  const ModeIcon = mode ? MODE_ICON[mode] : RiLock2Line
  const canEdit = !!policy.data?.permissions?.includes('SHARE') && !!policy.data.owner
  const libPrivate = library?.visibility === 'PRIVATE'
  const current = p.usageScopes[0] ?? ''

  const run = async (key: string, work: () => Promise<unknown>, ok: string) => {
    if (saving)
      return
    setSaving(key)
    setError('')
    try {
      await work()
      toast(ok)
      policy.refresh()
      onChanged()
    }
    catch (e) {
      setError((e as Error).message || '保存失败，请稍后重试')
    }
    finally {
      setSaving('')
    }
  }
  const setMode = (next: Mode) => {
    if (!policy.data || next === mode)
      return
    run(next, () => updateDocumentAccessMode(m.documentId, next, policy.data!.policyVersion), `已设为「${ACCESS_META[next].label}」`)
  }
  const setUsage = (next: string) => {
    if (next === current)
      return
    run(`u:${next}`, () => updateMaterialUsageScope(m.documentId, next), `对外使用范围已改为「${next}」`)
  }

  return (
    <Pop
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) setError('') }}
      className="w-[300px] p-3"
      trigger={(
        <button type="button" aria-label={`修改${p.title}的使用范围`} className="group/scope -mx-1.5 -my-1 flex max-w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-press">
          {policy.loading
            ? <Skeleton className="h-[22px] w-16 rounded-full" />
            : (
                <span className={cn('inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[12px] font-medium', mode === 'PRIVATE' ? 'border-volt/40 text-volt-text' : 'border-line-strong text-ink-2')}>
                  <ModeIcon className="size-3" />
                  {mode ? ACCESS_META[mode].label : '权限未知'}
                </span>
              )}
          {p.usageScopes.length ? p.usageScopes.map(s => <ScopeBadge key={s} scope={s} />) : <span className="text-[12px] text-ink-3">未标注</span>}
          <RiEditLine className="size-3.5 text-ink-3 opacity-0 transition-opacity group-hover/scope:opacity-100" />
        </button>
      )}
    >
      <p className="px-1 pt-0.5 text-[12px] font-medium text-ink-3">谁能看到</p>
      {policy.error
        ? <p className="px-1 py-2 text-[12.5px] text-rose">权限读取失败。<button type="button" className="cursor-pointer underline" onClick={policy.reload}>重试</button></p>
        : (
            <div className="mt-1 space-y-0.5">
              {[...EDITABLE, ...(mode === 'CUSTOM' ? ['CUSTOM' as Mode] : [])].map((k) => {
                const Icon = MODE_ICON[k]
                const on = k === mode
                const disabled = !canEdit || k === 'CUSTOM' || !!saving
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={disabled && !on}
                    onClick={() => setMode(k)}
                    className={cn('flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45', on ? 'bg-volt-soft' : 'hover:bg-hover')}
                  >
                    <Icon className={cn('mt-0.5 size-4 shrink-0', on ? 'text-volt-text' : 'text-ink-3')} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[13px]', on ? 'font-semibold text-ink' : 'text-ink')}>{ACCESS_META[k].label}</span>
                      <span className="block text-[11.5px] leading-snug text-ink-3">
                        {k === 'INHERIT' && library ? `与「${library.name}」的成员一致` : ACCESS_META[k].desc}
                      </span>
                    </span>
                    {saving === k ? <RiLoader4Line className="mt-0.5 size-4 animate-spin text-ink-3" /> : on && <RiCheckLine className="mt-0.5 size-4 text-volt-text" />}
                  </button>
                )
              })}
            </div>
          )}
      {libPrivate && mode === 'TENANT' && <p className="mt-1 px-1 text-[11.5px] leading-relaxed text-ink-3">「{library?.name}」本身仅自己可见，这份材料单独对公司内开放。</p>}
      {policy.data && !canEdit && <p className="mt-1 px-1 text-[11.5px] leading-relaxed text-ink-3">只有资料所有者可以修改可见范围。</p>}

      <div className="my-2.5 h-px bg-line" />
      <p className="px-1 text-[12px] font-medium text-ink-3">对外使用范围</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
        {USAGE_SCOPES.map((s) => {
          const on = s === current
          return (
            <button
              key={s}
              type="button"
              disabled={!!saving || !canEdit}
              onClick={() => setUsage(s)}
              aria-pressed={on}
              className={cn('flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50', on ? 'border-volt bg-volt-soft font-semibold text-volt-text' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink')}
            >
              {saving === `u:${s}` && <RiLoader4Line className="size-3 animate-spin" />}
              {s}
            </button>
          )
        })}
      </div>
      <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-ink-3">对外使用范围只是标注，决定能否对客分享；不改变内部谁能看到。</p>
      {error && <p className="mt-2 rounded-xl bg-rose-soft px-2.5 py-1.5 text-[12px] text-rose">{error}</p>}
    </Pop>
  )
}
