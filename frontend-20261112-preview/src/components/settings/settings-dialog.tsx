/* 个人设置对话框：左侧分区（通用 / 模型供应商 / 默认模型 / 账号），右侧内容。上下方向键切换分区。 */
import type { SettingsTab } from './events'
import { Tabs } from '@base-ui/react/tabs'
import { RiCpuLine, RiEqualizerLine, RiSettings3Line, RiUser3Line } from '@remixicon/react'
import { motion } from 'motion/react'
import { useCallback } from 'react'
import { useQuery } from '@/api/hooks'
import { getAccountProfile } from '@/api/settings'
import { Dialog } from '@/components/ui/dialog'
import { Avatar } from '@/components/ui/primitives'
import { currentUser as me } from '@/lib/current-user'
import { cn } from '@/lib/cn'
import { ease, spring } from '@/lib/motion'
import { DefaultModelPanel, ModelProviderPanel } from '@/pages/integrations/models'
import { AccountTab } from './account'
import { GeneralTab } from './general'
import { useLogout } from './kit'

type TabDef = { id: SettingsTab, label: string, desc: string, icon: React.ComponentType<{ className?: string }> }
const groups: { title: string, tabs: TabDef[] }[] = [
  { title: '偏好', tabs: [{ id: 'general', label: '通用', desc: '外观主题、界面语言和时区。', icon: RiSettings3Line }] },
  {
    title: '模型',
    tabs: [
      { id: 'models', label: '模型供应商', desc: '管理大模型服务商的凭据、模型和负载均衡。', icon: RiCpuLine },
      { id: 'default-model', label: '默认模型', desc: '各功能没有单独指定模型时使用这里的设置。只能选择已启用的模型。', icon: RiEqualizerLine },
    ],
  },
  { title: '账号', tabs: [{ id: 'account', label: '账号', desc: '个人资料、登录安全与退出登录。', icon: RiUser3Line }] },
]
const allTabs = groups.flatMap(g => g.tabs)

export function SettingsDialog({ open, onOpenChange, tab, onTabChange, go }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  go: (path: string) => void
}) {
  const profile = useQuery(getAccountProfile, [open], { enabled: open })
  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  const leave = useCallback((path: string) => { onOpenChange(false); go(path) }, [onOpenChange, go])
  const out = useLogout(go, close)
  const current = allTabs.find(t => t.id === tab) ?? allTabs[0]!

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="设置" size="xl">
      <Tabs.Root
        value={tab}
        onValueChange={v => onTabChange(v as SettingsTab)}
        orientation="vertical"
        className="-mx-6 -mb-4 flex h-[min(640px,calc(86vh-72px))] border-t border-line"
      >
        <div className="flex w-[196px] shrink-0 flex-col border-r border-line p-3">
          <Tabs.List aria-label="设置分区" className="flex-1 space-y-0.5">
            {groups.map((g, gi) => (
              <div key={g.title} className={cn(gi > 0 && 'pt-3')}>
                <p className="px-3 pb-1.5 text-[11.5px] font-medium text-ink-3">{g.title}</p>
                {g.tabs.map((t) => {
                  const active = t.id === tab
                  return (
                    <Tabs.Tab
                      key={t.id}
                      value={t.id}
                      className={cn(
                        'relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[13.5px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-volt',
                        active ? 'text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink',
                      )}
                    >
                      {active && (
                        <motion.span layoutId="settings-tab" transition={spring.snappy} className="absolute inset-0 rounded-xl border border-line-strong bg-glass-2">
                          <span className="absolute top-2 bottom-2 -left-px w-[3px] rounded-full bg-volt shadow-[0_0_10px_var(--volt)]" />
                        </motion.span>
                      )}
                      <t.icon className={cn('relative size-4', active ? 'text-volt-text' : 'text-ink-3')} />
                      <span className={cn('relative', active && 'font-semibold')}>{t.label}</span>
                    </Tabs.Tab>
                  )
                })}
              </div>
            ))}
          </Tabs.List>
          <button
            type="button"
            onClick={() => onTabChange('account')}
            className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-hover"
          >
            <Avatar src={profile.data?.avatar_url || me.avatar} size={28} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12.5px] font-medium">{profile.data?.name ?? me.owner}</span>
              <span className="block truncate text-[11px] text-ink-3">{profile.data?.email ?? me.role}</span>
            </span>
          </button>
        </div>

        <Tabs.Panel value={tab} className="min-w-0 flex-1 overflow-auto outline-none">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: ease.out }}
            className="px-7 pt-5 pb-8"
          >
            <div className="mb-5">
              <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{current.label}</h3>
              <p className="mt-0.5 text-[12.5px] text-ink-3">{current.desc}</p>
            </div>
            {tab === 'general' && <GeneralTab profile={profile.data} onProfile={p => profile.setData(p)} />}
            {tab === 'models' && <ModelProviderPanel go={leave} onOpenDefault={() => onTabChange('default-model')} />}
            {tab === 'default-model' && <DefaultModelPanel />}
            {tab === 'account' && (
              <AccountTab
                profile={profile.data}
                error={profile.error}
                onRetry={profile.reload}
                onProfile={p => profile.setData(p)}
                onLogout={out.run}
                loggingOut={out.pending}
              />
            )}
          </motion.div>
        </Tabs.Panel>
      </Tabs.Root>
    </Dialog>
  )
}
