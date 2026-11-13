import type { Go } from './shared'
import { RiApps2Line, RiArrowRightUpLine, RiBuilding2Line, RiChat3Line, RiExternalLinkLine, RiSearchEyeLine, RiShieldCheckLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { getProfile } from '@/api/knowledge'
import { useQuery } from '@/api/hooks'
import { Page } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { KB_APP_HINT, kbAppUrl } from './shared'

/*
  知识库模块外壳：沿用知识库产品的信息架构 ——
  左栏 = 当前组织 + 找材料/问材料 + 分区内容（知识库列表或会话列表）+ 更多功能；右侧是主区。
*/
export function KbShell({ view, go, aside, children }: { view: 'workbench' | 'ask', go: Go, aside: React.ReactNode, children: React.ReactNode }) {
  const profile = useQuery(getProfile, [])
  const [more, setMore] = useState(false)
  const nav = [
    { id: 'workbench', label: '找材料', icon: RiSearchEyeLine, to: 'kb' },
    { id: 'ask', label: '问材料', icon: RiChat3Line, to: 'kb/ask' },
  ] as const
  return (
    <Page>
      <div className="flex min-h-0 flex-1">
        <aside aria-label="知识库导航" className="flex w-[248px] shrink-0 flex-col border-r border-line p-3">
          <div className="mb-3 flex items-center gap-2.5 px-1.5 pt-1">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-soft text-cyan"><RiBuilding2Line className="size-[18px]" /></span>
            <div className="min-w-0 leading-tight">
              {profile.loading
                ? <Skeleton className="h-4 w-28" />
                : <p className="truncate text-[13.5px] font-semibold">{profile.data?.organizationName ?? '当前组织'}</p>}
              <p className="mt-0.5 text-[11.5px] text-ink-3">当前组织 · 知识库</p>
            </div>
          </div>
          <nav className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-hover p-1">
            {nav.map((n) => {
              const on = n.id === view
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => go(n.to)}
                  aria-current={on ? 'page' : undefined}
                  className={cn('relative flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl text-[13px] transition-colors', on ? 'font-semibold text-ink' : 'text-ink-2 hover:text-ink')}
                >
                  {on && <motion.span layoutId="kb-nav" transition={spring.snappy} className="absolute inset-0 rounded-xl border border-line-strong bg-glass-3 shadow-float" />}
                  <n.icon className={cn('relative size-4', on ? 'text-volt-text' : 'text-ink-3')} />
                  <span className="relative">{n.label}</span>
                </button>
              )
            })}
          </nav>
          <div className="flex min-h-0 flex-1 flex-col">{aside}</div>
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <button type="button" onClick={() => setMore(true)} className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink">
              <RiApps2Line className="size-4 text-ink-3" />
              更多知识库功能
              <RiArrowRightUpLine className="ml-auto size-3.5 text-ink-3" />
            </button>
            <p className="flex gap-2 px-3 text-[11.5px] leading-relaxed text-ink-3"><RiShieldCheckLine className="mt-0.5 size-3.5 shrink-0" />只显示当前账号可访问的资料。</p>
          </div>
        </aside>
        <div className="relative flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
      <MoreFeaturesDialog open={more} onOpenChange={setMore} />
    </Page>
  )
}

/* ---------- 未移植功能：跳到完整知识库 ---------- */
const MORE_GROUPS: { title: string, items: { label: string, desc: string, path: string }[] }[] = [
  {
    title: '材料与对客分享',
    items: [
      { label: '做材料', desc: '基于知识库生成方案初稿并存回知识库', path: '/materials/write' },
      { label: '我的分享', desc: '管理已发出的对客分享链接、续期与撤销', path: '/materials/shares' },
      { label: '分享分析', desc: '打开次数、访客与留资转化漏斗', path: '/materials/share-analytics' },
      { label: '留资线索', desc: '客户在分享页留下的联系方式', path: '/materials/leads' },
    ],
  },
  {
    title: '管理端',
    items: [
      { label: '文档管理', desc: '解析产物、切块、索引重建与任务日志', path: '/admin/documents' },
      { label: '知识库管理', desc: '知识库配置、默认库与成员权限', path: '/admin/knowledge-bases' },
      { label: '知识路由', desc: '范围、主题与路由追踪', path: '/admin/knowledge-route' },
      { label: '可观测', desc: '问答链路、检索通道与各阶段耗时', path: '/admin/observability' },
      { label: '质量概览', desc: '路由成功率、置信度与文档处理趋势', path: '/admin/quality-overview' },
      { label: '回答反馈', desc: '成员对回答的赞踩与原因复核', path: '/admin/answer-feedback' },
    ],
  },
]

export function MoreFeaturesDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (v: boolean) => void }) {
  const configured = !!kbAppUrl('/')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="更多知识库功能"
      description={configured ? '这些功能暂未在这里提供，会在新标签页打开完整知识库。' : KB_APP_HINT}
    >
      <div className="space-y-5 pb-2">
        {MORE_GROUPS.map(g => (
          <section key={g.title}>
            <p className="mb-2 text-[12px] font-medium text-ink-3">{g.title}</p>
            <div className="grid grid-cols-2 gap-2">
              {g.items.map((it) => {
                const href = kbAppUrl(it.path)
                return (
                  <div key={it.path} className={cn('flex items-center gap-3 rounded-2xl border border-line p-3.5 transition-colors', href && 'hover:border-line-strong hover:bg-hover')}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold">{it.label}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{it.desc}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-small"
                      aria-label={`打开${it.label}`}
                      disabled={!href}
                      title={href ? undefined : KB_APP_HINT}
                      onClick={() => href && window.open(href, '_blank', 'noopener')}
                    >
                      <RiExternalLinkLine className="size-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
