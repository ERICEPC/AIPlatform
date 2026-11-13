import { RiAddLine, RiFlashlightLine, RiSearchLine } from '@remixicon/react'
import { useState } from 'react'
import { Page, Rise } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { SpotlightCard } from '@/components/ui/effects'
import { Badge } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { templates } from '@/mock'

const cats = ['全部', ...new Set(templates.map(t => t.cat))]

export default function Studio({ go }: { go: (path: string) => void }) {
  const [cat, setCat] = useState('全部')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<(typeof templates)[number] | null>(null)
  const [creating, setCreating] = useState(false)
  const toast = useToast()
  const shown = templates.filter(t => (cat === '全部' || t.cat === cat) && (!q || (t.name + t.desc).includes(q)))

  const create = () => {
    setCreating(true)
    setTimeout(() => {
      setCreating(false)
      toast(`已用模板「${pick?.name}」创建 Agent，正在打开编排页`)
      setPick(null)
      go('agents/agt-yifei')
    }, 900)
  }

  return (
    <Page className="overflow-auto">
      <div className="px-10 pt-10 pb-16">
        <Rise className="flex items-end gap-4">
          <div>
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.035em]">工作室</h1>
            <p className="mt-3 text-[14.5px] text-ink-2">从模板开始搭建 Agent，几分钟就能跑起来，之后再按需调整指令和工具。</p>
          </div>
          <Button variant="primary" className="mb-0.5 ml-auto" onClick={() => go('agents/agt-test')}><RiAddLine className="size-[18px]" />从空白创建</Button>
        </Rise>

        <Rise className="mt-8 flex flex-wrap items-center gap-2">
          {cats.map(c => (
            <button key={c} type="button" onClick={() => setCat(c)} className={cn('h-9 cursor-pointer rounded-full px-4 text-[13px] font-medium transition-colors', c === cat ? 'bg-volt text-volt-ink shadow-glow-volt' : 'glass-1 text-ink-2 hover:text-ink')}>{c}</button>
          ))}
          <label className="glass-1 ml-auto flex h-9 w-[240px] items-center gap-2 rounded-full px-3.5 text-ink-3 focus-within:border-volt focus-within:shadow-glow-volt">
            <RiSearchLine className="size-4" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索模板" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
          </label>
        </Rise>

        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {shown.map(t => (
            <SpotlightCard key={t.id} className="cursor-pointer" onClick={() => setPick(t)}>
              <div className="flex h-full min-h-[168px] flex-col p-5">
                <div className="flex items-center gap-3">
                  <img src={t.avatar} alt="" className="size-11 rounded-2xl border border-line bg-glass-3" />
                  <div className="flex-1"><p className="text-[15.5px] font-semibold">{t.name}</p><p className="text-[12.5px] text-ink-3">{t.cat}</p></div>
                </div>
                <p className="mt-3 flex-1 text-[13.5px] text-ink-2">{t.desc}</p>
                <p className="mt-3 text-[12px] text-ink-3"><b className="text-ink tabular-nums">{t.uses}</b> 个团队在用</p>
              </div>
            </SpotlightCard>
          ))}
        </div>
        {!shown.length && <p className="py-16 text-center text-ink-3">没有匹配的模板。</p>}
      </div>

      <Drawer
        open={!!pick}
        onClose={() => setPick(null)}
        title={pick && (
          <div className="flex items-center gap-3">
            <img src={pick.avatar} alt="" className="size-12 rounded-2xl border border-line" />
            <div><p className="text-[18px] font-semibold">{pick.name}</p><p className="text-[13px] text-ink-3">{pick.cat}模板，{pick.uses} 个团队在用</p></div>
          </div>
        )}
        footer={<><Button variant="primary" size="large" className="flex-1" loading={creating} onClick={create}>用这个模板创建</Button><Button variant="secondary" size="large" onClick={() => setPick(null)}>取消</Button></>}
      >
        {pick && (
          <div className="space-y-5 text-[14px]">
            <p className="leading-relaxed text-ink-2">{pick.desc}</p>
            <div>
              <p className="mb-2 font-semibold">包含</p>
              <div className="space-y-2">
                {['预置指令和开场白', '推荐的模型与温度', '1 个示例知识库（可替换）'].map(x => <p key={x} className="flex items-center gap-2 text-ink-2"><RiFlashlightLine className="size-4 text-volt-text" />{x}</p>)}
              </div>
            </div>
            <div>
              <p className="mb-2 font-semibold">需要的 Skills</p>
              <div className="flex flex-wrap gap-2"><Badge tone="cyan">网页搜索</Badge><Badge tone="cyan">办公文件生成</Badge></div>
            </div>
            <div className="glass-1 rounded-2xl p-4 text-[13px] leading-relaxed text-ink-2">
              <p className="mb-1 font-medium text-ink">试一句</p>
              「帮我把这份 20 页的方案总结成 5 条要点，并列出需要客户确认的问题。」
            </div>
          </div>
        )}
      </Drawer>
    </Page>
  )
}
