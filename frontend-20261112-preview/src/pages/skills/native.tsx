import type { NativeSkill, NativeSkillGroup } from '@/api/skills'
import type { Go } from './shared'
import { RiArrowRightUpLine, RiChat3Line, RiCheckLine, RiSearchLine, RiShieldCheckLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useQuery } from '@/api/hooks'
import { listNativeSkills } from '@/api/skills'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { Drawer } from '@/components/ui/drawer'
import { Badge, EmptyState, Panel, Skeleton } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { GroupTitle, IconTile, itemVariants, nativeIcon } from './shared'

const GROUPS: { id: NativeSkillGroup, label: string }[] = [
  { id: 'document', label: '文档处理' },
  { id: 'data', label: '数据与可视化' },
  { id: 'productivity', label: '效率' },
]

export default function NativeTab({ detail, open, go }: { detail?: string, open: (id?: string) => void, go: Go }) {
  const q = useQuery(listNativeSkills, [])
  const toast = useToast()
  const [kw, setKw] = useState('')
  const list = q.data?.data ?? []
  const shown = useMemo(() => {
    const k = kw.trim().toLowerCase()
    return k ? list.filter(s => `${s.name}${s.description}`.toLowerCase().includes(k)) : list
  }, [list, kw])
  const cur = list.find(s => s.id === detail)

  const use = (s: NativeSkill) => {
    toast(`在助手里直接描述需求即可使用「${s.name}」`, 'info')
    go('assistant')
  }

  return (
    <div className="space-y-6">
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <Panel level={2} radius="md" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-ink-2">
          <RiShieldCheckLine className="size-4 text-mint" />
          原生技能保持基本办公能力，始终启用，不占用本地技能名额
          {!q.loading && <Badge tone="mint" className="ml-1">{list.length} 项已启用</Badge>}
        </Panel>
        <label className="glass-1 ml-auto flex h-9 w-[240px] items-center gap-2 rounded-full px-3.5 text-[13px] focus-within:border-volt">
          <RiSearchLine className="size-4 text-ink-3" />
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索原生技能" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
        </label>
      </motion.div>

      <ErrorBar error={q.error} onRetry={q.reload} />

      {q.loading && !q.data
        ? <Panel level={2} className="divide-y divide-line">{Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} />)}</Panel>
        : shown.length === 0
          ? <EmptyState icon={<RiSearchLine className="size-5" />} title={kw ? `没有和「${kw.trim()}」相关的原生技能` : '暂无原生技能'} hint={kw ? '换个关键词，或去「市场」找更多技能' : '刷新页面重试'} />
          : GROUPS.map((g) => {
              const items = shown.filter(s => s.group === g.id)
              if (!items.length)
                return null
              return (
                <motion.section key={g.id} variants={itemVariants}>
                  <GroupTitle title={g.label} count={items.length} />
                  <Panel level={2} className="divide-y divide-line overflow-hidden">
                    {items.map(s => <NativeRow key={s.id} s={s} onOpen={() => open(s.id)} onUse={() => use(s)} />)}
                  </Panel>
                </motion.section>
              )
            })}

      <NativeDrawer skill={cur} onClose={() => open()} onUse={use} />
    </div>
  )
}

function NativeRow({ s, onOpen, onUse }: { s: NativeSkill, onOpen: () => void, onUse: () => void }) {
  const ic = nativeIcon(s.icon)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="group flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
    >
      <IconTile icon={ic.icon} tone={ic.tone} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium">{s.name}</p>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">{s.description}</p>
      </div>
      <span className="hidden items-center gap-1 text-[12.5px] text-mint sm:flex"><RiCheckLine className="size-4" />已启用</span>
      <Button
        variant="outline"
        size="small"
        className="w-16"
        onClick={(e) => {
          e.stopPropagation()
          onUse()
        }}
      >
        使用
      </Button>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Skeleton className="size-10 rounded-[14px]" />
      <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-64" /></div>
      <Skeleton className="h-7 w-16 rounded-full" />
    </div>
  )
}

function NativeDrawer({ skill, onClose, onUse }: { skill?: NativeSkill, onClose: () => void, onUse: (s: NativeSkill) => void }) {
  const ic = skill ? nativeIcon(skill.icon) : null
  return (
    <Drawer
      open={!!skill}
      onClose={onClose}
      title={skill && ic && (
        <div className="flex items-center gap-3">
          <IconTile icon={ic.icon} tone={ic.tone} size={48} />
          <div>
            <p className="text-[18px] font-semibold">{skill.name}</p>
            <div className="mt-1 flex items-center gap-2"><Badge tone="mint" dot>已启用</Badge><Badge>原生</Badge></div>
          </div>
        </div>
      )}
      footer={skill && <Button variant="primary" size="large" className="flex-1" onClick={() => onUse(skill)}><RiChat3Line className="size-4" />在助手中使用<RiArrowRightUpLine className="size-4" /></Button>}
    >
      {skill && (
        <div className="space-y-6 text-[14px]">
          <p className="leading-relaxed text-ink-2">{skill.description}。原生技能由平台维护并自动更新，始终对助手和所有 Agent 可用。</p>
          <section>
            <p className="mb-2 text-[13px] font-semibold">能做什么</p>
            <ul className="space-y-2">
              {skill.capabilities.map(c => (
                <li key={c} className="flex gap-2.5 text-ink-2"><RiCheckLine className="mt-0.5 size-4 shrink-0 text-volt-text" />{c}</li>
              ))}
            </ul>
          </section>
          {skill.file_types && skill.file_types.length > 0 && (
            <section>
              <p className="mb-2 text-[13px] font-semibold">支持的文件</p>
              <div className="flex flex-wrap gap-1.5">{skill.file_types.map(t => <Badge key={t} tone="cyan" className="font-mono">{t}</Badge>)}</div>
            </section>
          )}
          <section>
            <p className="mb-2 text-[13px] font-semibold">可以这样说</p>
            <div className="space-y-2">
              {skill.examples.map(e => (
                <div key={e} className="rounded-2xl border border-line bg-hover px-4 py-3 text-ink-2">「{e}」</div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Drawer>
  )
}
