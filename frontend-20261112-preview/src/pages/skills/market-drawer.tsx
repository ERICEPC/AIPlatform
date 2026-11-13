import type { MarketSkill } from '@/api/skills'
import type { Go } from './shared'
import { RiArrowRightLine, RiCheckLine, RiDownload2Line, RiExternalLinkLine, RiInformationLine, RiKey2Line, RiLinksLine } from '@remixicon/react'
import { useQuery } from '@/api/hooks'
import { listMarketSkills } from '@/api/skills'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { CATEGORY, IconTile } from './shared'

export const repoSkillUrl = (name: string) => `https://github.com/OpenSenseNova/SenseNova-Skills/tree/main/skills/${name}`

export function InstallButton({ s, pending, onInstall, size = 'small', className }: { s: MarketSkill, pending: boolean, onInstall: () => void, size?: 'small' | 'large', className?: string }) {
  if (s.installed) {
    return (
      <span className={cn('flex items-center gap-1 rounded-full bg-mint-soft font-medium text-mint', size === 'small' ? 'h-7 px-3 text-[12.5px]' : 'h-11 justify-center px-6 text-[15px]', className)}>
        <RiCheckLine className="size-4" />已安装
      </span>
    )
  }
  return (
    <Button variant="primary" size={size} loading={pending} className={className} onClick={onInstall}>
      {!pending && <RiDownload2Line className="size-3.5" />}
      {pending ? '安装中' : '安装'}
    </Button>
  )
}

/** 市场技能详情：#skills/market/<name>。当前筛选结果里没有时单独查一次 */
export default function MarketDrawer({ name, list, pending, onClose, onInstall, go }: {
  name?: string
  list?: MarketSkill[]
  pending: boolean
  onClose: () => void
  onInstall: (name: string) => Promise<void>
  go: Go
}) {
  const inList = list?.find(s => s.name === name)
  const fallback = useQuery(() => listMarketSkills({ keyword: name }), [name], { enabled: !!name && !!list && !inList })
  const s = inList ?? fallback.data?.data.find(x => x.name === name)
  const loading = !!name && !s && (fallback.loading || !list)
  const missing = !!name && !s && !loading

  const install = () => s && onInstall(s.name).then(() => fallback.refresh())
  const cat = s ? CATEGORY[s.category] : null

  return (
    <Drawer
      open={!!name}
      onClose={onClose}
      title={s && cat
        ? (
            <div className="flex items-center gap-3">
              <IconTile icon={cat.icon} tone={cat.tone} size={48} />
              <div className="min-w-0">
                <p className="truncate font-mono text-[17px] font-semibold">{s.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5"><Badge tone="cyan">{s.tag}</Badge><Badge>{cat.label}</Badge></div>
              </div>
            </div>
          )
        : <p className="text-[17px] font-semibold">技能详情</p>}
      footer={s && (
        s.installed
          ? <Button variant="secondary" size="large" className="flex-1" onClick={() => go(s.local_id ? `skills/local/${s.local_id}` : 'skills/local')}><RiCheckLine className="size-4 text-mint" />已安装，去本地管理<RiArrowRightLine className="size-4" /></Button>
          : <InstallButton s={s} pending={pending} onInstall={install} size="large" className="flex-1" />
      )}
    >
      {loading && <div className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-24 w-full" /></div>}
      {missing && <p className="text-[14px] text-ink-3">市场中没有找到「{name}」，可能已下架或改名。</p>}
      {s && (
        <div className="space-y-6 text-[14px]">
          <p className="leading-relaxed text-ink-2">{s.description}</p>

          <section>
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><RiKey2Line className="size-4 text-amber" />使用前准备</p>
            {s.requires.length
              ? (
                  <ul className="space-y-1.5">
                    {s.requires.map(r => <li key={r} className="rounded-xl bg-amber-soft px-3.5 py-2 text-[13px] text-amber">{r}</li>)}
                  </ul>
                )
              : <p className="text-[13px] text-ink-3">无需额外的 API Key 或本地依赖，安装即可使用。</p>}
            <p className="mt-2 text-[12px] text-ink-3">API Key 等凭证按技能说明配置为环境变量，不要写进技能文件。</p>
          </section>

          {s.depends_on.length > 0 && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><RiLinksLine className="size-4 text-cyan" />依赖技能</p>
              <div className="flex flex-wrap gap-1.5">
                {s.depends_on.map(d => (
                  <button key={d} type="button" onClick={() => go(`skills/market/${d}`)} className="cursor-pointer rounded-full border border-line px-3 py-1 font-mono text-[12.5px] text-ink-2 transition-colors hover:border-line-strong hover:bg-hover hover:text-ink">{d}</button>
                ))}
              </div>
              {!s.installed && <p className="mt-2 text-[12px] text-ink-3">安装时会一并安装尚未安装的依赖技能。</p>}
            </section>
          )}

          <section className="rounded-2xl border border-line bg-hover p-4 text-[13px] text-ink-2">
            <p className="flex items-center gap-1.5 font-medium text-ink"><RiInformationLine className="size-4" />安装后</p>
            <p className="mt-1.5 leading-relaxed">技能会出现在「本地」，来源标为「市场」，默认启用；可以随时停用、拉取更新或删除，删除后能在这里重新安装。</p>
          </section>

          <a href={repoSkillUrl(s.name)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] text-volt-text hover:underline">
            在 GitHub 查看 SKILL.md 与使用指南<RiExternalLinkLine className="size-3.5" />
          </a>
        </div>
      )}
    </Drawer>
  )
}
