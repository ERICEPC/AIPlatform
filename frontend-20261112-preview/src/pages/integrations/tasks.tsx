/* 安装任务指示器 + 自动更新设置 */
import type { AutoUpgradeMode, AutoUpgradeSetting, AutoUpgradeStrategy, PluginCategory, PluginTask } from '@/api/integrations'
import { RiCheckboxCircleFill, RiCloseCircleFill, RiCloseLine, RiInstallLine, RiLoader4Line, RiTimerFlashLine } from '@remixicon/react'
import { useEffect, useRef, useState } from 'react'
import { changeAutoUpgrade, clearTaskPlugin, fetchAutoUpgrade, fetchPluginTasks, listInstalledPlugins, tr } from '@/api/integrations'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Tip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { ChoiceCard, errMsg, PluginTile, Pop } from './kit'

/* ---------------- 安装任务 ---------------- */
export function TasksIndicator({ watching, onIdle, onFinished }: { watching: number, onIdle: () => void, onFinished: () => void }) {
  const toast = useToast()
  const [active, setActive] = useState(false)
  const { data, setData } = useQuery(fetchPluginTasks, [watching], { pollMs: active ? 1200 : false })
  const prev = useRef<Record<string, string>>({})
  const tasks = data?.tasks ?? []
  const items = tasks.flatMap(t => t.plugins.map(p => ({ ...p, task: t })))
  const running = items.filter(i => i.status === 'running').length
  const failed = items.filter(i => i.status === 'failed').length

  useEffect(() => {
    if (watching)
      setActive(true)
  }, [watching])

  useEffect(() => {
    if (!data)
      return
    let finished = 0
    for (const i of items) {
      const k = `${i.task.id}:${i.plugin_unique_identifier}`
      if (prev.current[k] === 'running' && i.status !== 'running') {
        finished++
        if (i.status === 'success')
          toast(`${tr(i.labels)} 安装完成`)
        else
          toast(`${tr(i.labels)} 安装失败`, 'info')
      }
      prev.current[k] = i.status
    }
    if (finished)
      onFinished()
    if (running && !active)
      setActive(true)
    if (!running && active) {
      setActive(false)
      onIdle()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (!items.length)
    return null

  const clear = async (t: PluginTask, uid: string) => {
    setData(d => d && { tasks: d.tasks.map(x => (x.id === t.id ? { ...x, plugins: x.plugins.filter(p => p.plugin_unique_identifier !== uid) } : x)).filter(x => x.plugins.length) })
    try {
      await clearTaskPlugin(t.id, uid)
    }
    catch (e) {
      toast(errMsg(e), 'info')
    }
  }

  return (
    <Pop
      className="w-[340px] p-2"
      trigger={(
        <button type="button" aria-label="安装任务" className={cn('relative grid size-9 cursor-pointer place-items-center rounded-full border transition-colors', failed ? 'border-rose/40 bg-rose-soft text-rose' : running ? 'border-volt/50 bg-volt-soft text-volt-text' : 'border-line text-ink-2 hover:bg-hover')}>
          {running ? <RiLoader4Line className="size-4 animate-spin" /> : failed ? <RiCloseCircleFill className="size-4" /> : <RiInstallLine className="size-4" />}
          <span className={cn('absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums', failed ? 'bg-rose text-white' : 'bg-volt text-volt-ink')}>{running || failed || items.length}</span>
        </button>
      )}
    >
      <p className="px-2.5 pt-1.5 pb-2 text-[12.5px] text-ink-3">{running ? `正在安装 ${running} 个插件` : failed ? `${failed} 个插件安装失败` : '最近的安装任务'}</p>
      <div className="max-h-[320px] space-y-0.5 overflow-auto">
        {items.map(i => (
          <div key={`${i.task.id}-${i.plugin_unique_identifier}`} className="group flex items-start gap-3 rounded-2xl px-2.5 py-2 hover:bg-hover">
            <PluginTile icon={i.icon} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{tr(i.labels)}</p>
              <p className={cn('text-[12px]', i.status === 'failed' ? 'text-rose' : 'text-ink-3')}>
                {i.status === 'running' ? '安装中…' : i.status === 'success' ? '已安装' : i.message || '安装失败'}
              </p>
            </div>
            {i.status === 'running' && <RiLoader4Line className="mt-1 size-4 animate-spin text-volt-text" />}
            {i.status === 'success' && <RiCheckboxCircleFill className="mt-1 size-4 text-mint" />}
            {i.status !== 'running' && (
              <Tip label="清除记录">
                <button type="button" aria-label="清除记录" onClick={() => clear(i.task, i.plugin_unique_identifier)} className="grid size-6 cursor-pointer place-items-center rounded-full text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-press hover:text-ink focus-visible:opacity-100">
                  <RiCloseLine className="size-3.5" />
                </button>
              </Tip>
            )}
          </div>
        ))}
      </div>
    </Pop>
  )
}

/* ---------------- 自动更新 ---------------- */
const strategies: { value: AutoUpgradeStrategy, title: string, desc: string }[] = [
  { value: 'disabled', title: '不自动更新', desc: '有新版本时只在插件上提示，手动更新。' },
  { value: 'fix_only', title: '仅修复版本', desc: '只自动安装补丁版本（如 1.2.3 → 1.2.4），不改变功能。' },
  { value: 'latest', title: '始终最新', desc: '自动更新到最新版本，可能包含功能变化。' },
]
const hours = Array.from({ length: 24 }, (_, h) => h)
const pad = (n: number) => String(n).padStart(2, '0')
// 后端存 UTC 秒数，界面按本地时区显示
const offset = -new Date().getTimezoneOffset() / 60
const toLocalHour = (sec: number) => (Math.floor(sec / 3600) + offset + 24) % 24
const toUtcSec = (h: number) => (((h - offset) % 24 + 24) % 24) * 3600

export function AutoUpgradeButton({ category, label }: { category: PluginCategory, label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tip label={`${label}插件自动更新`}>
        <Button variant="secondary" size="icon" aria-label="自动更新" onClick={() => setOpen(true)}><RiTimerFlashLine className="size-4" /></Button>
      </Tip>
      <Dialog open={open} onOpenChange={setOpen} title="自动更新" description={`设置「${label}」类插件何时、如何自动更新。`} size="md">
        {open && <AutoUpgradeForm category={category} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  )
}

function AutoUpgradeForm({ category, onDone }: { category: PluginCategory, onDone: () => void }) {
  const toast = useToast()
  const { data, error, loading, reload } = useQuery(() => fetchAutoUpgrade(category), [category])
  const plugins = useQuery(() => listInstalledPlugins(category), [category])
  const [s, setS] = useState<AutoUpgradeSetting | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (data)
      setS(data.auto_upgrade)
  }, [data])

  if (error)
    return <ErrorBar error={error} onRetry={reload} />
  if (loading || !s)
    return <div className="space-y-3 pb-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>

  const list = s.upgrade_mode === 'exclude' ? s.exclude_plugins : s.include_plugins
  const toggle = (pid: string) => {
    const key = s.upgrade_mode === 'exclude' ? 'exclude_plugins' : 'include_plugins'
    setS({ ...s, [key]: list.includes(pid) ? list.filter(x => x !== pid) : [...list, pid] })
  }
  return (
    <div className="space-y-5 pb-2">
      <div className="space-y-2">
        {strategies.map(o => <ChoiceCard key={o.value} on={s.strategy_setting === o.value} onClick={() => setS({ ...s, strategy_setting: o.value })} title={o.title} desc={o.desc} />)}
      </div>
      {s.strategy_setting !== 'disabled' && (
        <>
          <Field label="更新时间" hint={`每天在这个时间检查并更新（你的时区 UTC${offset >= 0 ? '+' : ''}${offset}）。`}>
            <Select value={String(toLocalHour(s.upgrade_time_of_day))} onValueChange={v => setS({ ...s, upgrade_time_of_day: toUtcSec(Number(v)) })} options={hours.map(h => ({ value: String(h), label: `${pad(h)}:00` }))} />
          </Field>
          <Field label="更新范围">
            <Segmented
              value={s.upgrade_mode}
              onValueChange={(v: AutoUpgradeMode) => setS({ ...s, upgrade_mode: v })}
              aria-label="更新范围"
              options={[{ value: 'all', label: '全部插件' }, { value: 'exclude', label: '排除部分' }, { value: 'partial', label: '只更新选中' }]}
            />
          </Field>
          {s.upgrade_mode !== 'all' && (
            <div className="max-h-[220px] space-y-1 overflow-auto rounded-2xl border border-line p-1.5">
              {(plugins.data?.plugins ?? []).filter(p => p.source === 'marketplace').map(p => (
                <label key={p.plugin_id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-hover">
                  <input type="checkbox" checked={list.includes(p.plugin_id)} onChange={() => toggle(p.plugin_id)} className="size-4 accent-[var(--volt)]" />
                  <PluginTile icon={p.declaration.icon} size={26} />
                  <span className="flex-1 text-[13.5px]">{tr(p.declaration.label)}</span>
                  <span className="text-[12px] text-ink-3">{p.version}</span>
                </label>
              ))}
              {plugins.data && !plugins.data.plugins.some(p => p.source === 'marketplace') && <p className="px-3 py-4 text-center text-[12.5px] text-ink-3">这一类还没有来自插件市场的插件</p>}
            </div>
          )}
        </>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onDone}>取消</Button>
        <Button
          variant="primary"
          loading={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await changeAutoUpgrade(category, s)
              toast('自动更新设置已保存')
              onDone()
            }
            catch (e) {
              toast(errMsg(e), 'info')
            }
            finally {
              setSaving(false)
            }
          }}
        >
          保存
        </Button>
      </div>
    </div>
  )
}
