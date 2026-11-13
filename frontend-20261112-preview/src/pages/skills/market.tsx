import type { MarketCategory, MarketSkill } from '@/api/skills'
import type { Go } from './shared'
import { RiExternalLinkLine, RiGithubFill, RiKey2Line, RiSearchLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { installMarketSkill, listMarketSkills } from '@/api/skills'
import { Button } from '@/components/ui/button'
import { ErrorBar } from '@/components/ui/data'
import { SpotlightCard } from '@/components/ui/effects'
import { Badge, EmptyState, Panel, Skeleton } from '@/components/ui/primitives'
import { Tip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import MarketDrawer, { InstallButton, repoSkillUrl } from './market-drawer'
import { CATEGORY, CATEGORY_ORDER, dateTime, errText, IconTile, itemVariants, useDebounced } from './shared'

/** 市场安装：记录进行中的技能，安装后刷新列表（依赖技能状态也会变） */
export function useMarketInstall(onDone: () => void) {
  const toast = useToast()
  const [pending, setPending] = useState<Set<string>>(new Set())
  const install = async (name: string) => {
    setPending(p => new Set(p).add(name))
    try {
      const r = await installMarketSkill(name)
      toast(r.installed_dependencies.length ? `已安装 ${name}，并安装依赖 ${r.installed_dependencies.join('、')}` : `已安装 ${name}，可在「本地」管理`)
      onDone()
    }
    catch (e) {
      toast(`安装失败：${errText(e)}`, 'info')
    }
    finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(name)
        return n
      })
    }
  }
  return { pending, install }
}

export default function MarketTab({ detail, open, go }: { detail?: string, open: (id?: string) => void, go: Go }) {
  const [category, setCategory] = useState<MarketCategory | 'all'>('all')
  const [kw, setKw] = useState('')
  const keyword = useDebounced(kw.trim())
  const q = useQuery(() => listMarketSkills({ category: category === 'all' ? undefined : category, keyword: keyword || undefined }), [category, keyword])
  const { pending, install } = useMarketInstall(q.refresh)
  const data = q.data
  const total = data?.categories.reduce((s, c) => s + c.count, 0) ?? 0
  const installed = data?.data.filter(s => s.installed).length ?? 0

  return (
    <div className="space-y-5">
      <motion.div variants={itemVariants}>
        <Panel level={1} radius="md" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[12.5px] text-ink-3">
          <span className="flex items-center gap-1.5 text-ink-2"><RiGithubFill className="size-4" />来源：<a href={data?.source.url ?? 'https://github.com/OpenSenseNova/SenseNova-Skills'} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-volt-text hover:underline">SenseNova-Skills</a></span>
          {data
            ? <span>同步于 {dateTime(data.source.synced_at)}{data.source.commit && <> · 提交 <span className="font-mono">{data.source.commit}</span></>}</span>
            : <Skeleton className="h-3 w-48" />}
          <span>遵循 Agent Skills 规范 · MIT 许可</span>
          <span className="ml-auto">共 {total} 个技能{installed > 0 && `，当前列表已安装 ${installed} 个`}</span>
        </Panel>
      </motion.div>

      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-2">
        <Chip active={category === 'all'} onClick={() => setCategory('all')} label="全部" count={total} />
        {CATEGORY_ORDER.map((c) => {
          const n = data?.categories.find(x => x.id === c)?.count
          if (data && !n)
            return null
          const Icon = CATEGORY[c].icon
          return <Chip key={c} active={category === c} onClick={() => setCategory(c)} label={CATEGORY[c].label} count={n} icon={<Icon className="size-3.5" />} />
        })}
        <label className="glass-1 ml-auto flex h-9 w-[240px] items-center gap-2 rounded-full px-3.5 text-[13px]">
          <RiSearchLine className="size-4 text-ink-3" />
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索名称、标签或描述" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
        </label>
      </motion.div>

      <ErrorBar error={q.error} onRetry={q.reload} />

      {q.loading && !data
        ? <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</div>
        : data && data.data.length === 0
          ? (
              <Panel level={2}>
                <EmptyState
                  icon={<RiSearchLine className="size-5" />}
                  title={keyword ? `没有找到「${keyword}」` : '这个分类下暂时没有技能'}
                  hint="换个关键词，或者切到「全部」看看；找不到的技能可以从 GitHub 导入到本地。"
                  action={<Button variant="secondary" onClick={() => go('skills/local')}>从 GitHub 导入</Button>}
                />
              </Panel>
            )
          : (
              <div className={cn('grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 transition-opacity', q.loading && 'opacity-60')}>
                {data?.data.map(s => <MarketCard key={s.name} s={s} pending={pending.has(s.name)} onOpen={() => open(s.name)} onInstall={() => install(s.name)} />)}
              </div>
            )}

      <MarketDrawer name={detail} list={data?.data} pending={detail ? pending.has(detail) : false} onClose={() => open()} onInstall={install} go={go} />
    </div>
  )
}

function Chip({ active, onClick, label, count, icon }: { active: boolean, onClick: () => void, label: string, count?: number, icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] transition-[background-color,border-color,color] duration-150',
        active ? 'border-transparent bg-volt font-medium text-volt-ink' : 'border-line text-ink-2 hover:border-line-strong hover:bg-hover hover:text-ink',
      )}
    >
      {icon}
      {label}
      {count !== undefined && <span className={cn('tabular-nums', active ? 'opacity-70' : 'text-ink-3')}>{count}</span>}
    </button>
  )
}

function MarketCard({ s, pending, onOpen, onInstall }: { s: MarketSkill, pending: boolean, onOpen: () => void, onInstall: () => void }) {
  const cat = CATEGORY[s.category]
  return (
    <SpotlightCard>
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => e.key === 'Enter' && onOpen()} className="flex h-full min-h-[200px] cursor-pointer flex-col p-5 focus-visible:outline-none">
        <div className="flex items-start gap-3">
          <IconTile icon={cat.icon} tone={cat.tone} size={42} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[14px] font-semibold">{s.name}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <Badge tone="cyan" className="max-w-full truncate">{s.tag}</Badge>
              {s.requires.length > 0 && (
                <Tip label={s.requires.join('；')}>
                  <span className="grid size-[22px] place-items-center rounded-full bg-amber-soft text-amber"><RiKey2Line className="size-3" /></span>
                </Tip>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 line-clamp-3 flex-1 text-[13px] leading-relaxed text-ink-2">{s.description}</p>
        <div className="mt-4 flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <a href={repoSkillUrl(s.name)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-volt-text hover:underline">
            在 GitHub 查看<RiExternalLinkLine className="size-3.5" />
          </a>
          <InstallButton s={s} pending={pending} onInstall={onInstall} className="ml-auto" />
        </div>
      </div>
    </SpotlightCard>
  )
}

function CardSkeleton() {
  return (
    <Panel level={2} className="min-h-[200px] space-y-3 p-5">
      <div className="flex gap-3"><Skeleton className="size-[42px] rounded-[14px]" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-36" /><Skeleton className="h-4 w-20 rounded-full" /></div></div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </Panel>
  )
}
