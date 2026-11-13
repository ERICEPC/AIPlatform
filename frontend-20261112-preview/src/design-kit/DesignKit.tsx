import { RiArrowRightUpLine, RiCheckLine, RiClipboardLine, RiCloseLine, RiDownload2Line, RiMoonClearLine, RiRefreshLine, RiSearchLine, RiSunLine } from '@remixicon/react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Backdrop } from '@/components/shell'
import { Button } from '@/components/ui/button'
import { Badge, Panel } from '@/components/ui/primitives'
import { TipProvider } from '@/components/ui/tooltip'
import { isStandalone } from '@/lib/asset'
import { cn } from '@/lib/cn'
import { ease, spring } from '@/lib/motion'
import { useTheme } from '@/lib/theme'
import type { Category, KitCard } from './cards'
import { basePrompt, cards, categories } from './cards'

/* ---------------- 使用 SOP ---------------- */
const sops = {
  design: {
    label: '设计 / 产品',
    steps: [
      ['明确页面任务', '先写清楚这个页面让谁、完成什么。工作类页面（Operate）以清晰为先，展示类页面（登录、首页）可以用 3D 和大标题。'],
      ['挑「风格」卡', '每个新页面都先选「曜黑石 × 电光青柠」和「四层搭建原则」，它们会作为提示词开头。'],
      ['挑「布局」卡', '从 5 种骨架里选最接近的：应用骨架、对话 + 抽屉、列表 + 详情、设置分组、概览 KPI。'],
      ['挑「组件」和「材质」卡', '按页面上实际出现的元素勾选，例如按钮、输入区、聚光卡片、三级毛玻璃。'],
      ['按需加「动效」和「3D」', '工作页只加微交互和页面进场；3D 只用于登录页和协同网络这类有信息量的场景。'],
      ['生成组合提示词', '点底部「生成提示词」，复制给 AI 工具或附在需求文档里交给开发。'],
      ['四层自查', '交付前逐层检查：材质有层次、操作有反馈、3D 不挡内容、所有组件都有完整状态，深浅两套都看一遍。'],
    ],
  },
  dev: {
    label: '开发',
    steps: [
      ['启动', 'cd new-frontend && pnpm install --registry=https://registry.npmmirror.com && pnpm dev，门户 http://127.0.0.1:5180，设计包 /design-kit.html。'],
      ['只用 token', '颜色、阴影、圆角都用 src/styles/index.css 里的变量和 Tailwind 映射（bg-volt、text-ink-2、shadow-glow-volt…），不写死 hex。'],
      ['先找组件', 'src/components/ui 里有 Button / Segmented / Switch / Tip / Panel / Badge / Avatar / Progress / SpotlightCard / EmptyState / Skeleton。API 对齐 dify-ui，可以直接迁移到 frontend/packages/dify-ui。'],
      ['页面结构', '每个页面根节点用 <Page>，错峰块用 <Rise>，页内顶栏用 <Toolbar>；整个应用只放一个 <Backdrop />。'],
      ['动效约束', '弹簧用 lib/motion 的 spring.snappy / smooth / bouncy；只动 transform / opacity；全局 MotionConfig reducedMotion="user"。'],
      ['3D 约束', '3D 组件一律 lazy + Suspense；减少动态时 frameloop="demand"；标签用 DOM 叠加层投影，不用 drei <Html>。'],
      ['验收', 'pnpm build 通过；1440 和 1024 宽各截一次图；深浅主题、键盘焦点、空状态、加载态都检查。'],
    ],
  },
  ai: {
    label: 'AI 提示词',
    steps: [
      ['勾选卡片', '按页面需要勾选卡片，风格类卡片建议每次都选。'],
      ['生成', '点「生成提示词」，得到：设计系统说明 + 每张卡的具体要求 + 英文关键词 + 自查清单。'],
      ['补充页面内容', '在提示词末尾写清楚这个页面的真实内容和数据（不要让 AI 编造业务数字）。'],
      ['指定技术栈', '提示词里已写 React 19 + Tailwind v4 + Base UI + motion + R3F；如果要出静态 HTML，就在末尾改成「单文件 HTML」。'],
      ['回来对照', '拿 AI 的产出对照卡片里的「避免」清单逐条检查。'],
    ],
  },
} as const

function readSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem('rx-kit-picked') ?? '[]')
  }
  catch {
    return []
  }
}

function buildPrompt(picked: KitCard[]) {
  const by = categories.map(c => ({ c, list: picked.filter(p => p.cat === c.id) })).filter(g => g.list.length)
  const parts = [basePrompt, '', '【本页面采用的设计元素】']
  for (const g of by) {
    parts.push(`\n## ${g.c.label}`)
    g.list.forEach((p, i) => parts.push(`${i + 1}. ${p.title}：${p.prompt}`))
  }
  const avoid = [...new Set(picked.flatMap(p => p.avoid))]
  if (avoid.length) {
    parts.push('\n【避免】')
    avoid.forEach(a => parts.push(`- ${a}`))
  }
  parts.push('\n【英文关键词】', [...new Set(picked.flatMap(p => p.keywords))].join(', '))
  parts.push('\n【交付前自查】', '- 材质：毛玻璃有层次、只有关键元素发光', '- 动效：所有操作有即时反馈，尊重减少动态', '- 3D：不压文字和表单，懒加载', '- 组件：hover / focus / active / disabled / loading / empty 状态齐全', '- 深色、浅色两套主题都检查过')
  parts.push('\n【页面内容】（在这里写清楚真实内容和数据）')
  return parts.join('\n')
}

function CardItem({ card, picked, toggle, theme }: { card: KitCard, picked: boolean, toggle: () => void, theme: 'dark' | 'light' }) {
  const [replay, setReplay] = useState(0)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }
    catch {}
  }
  const Preview = card.preview
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.4, ease: ease.out }}
      className={cn('glass-2 glass-edge relative flex flex-col rounded-[22px] p-4 transition-[border-color,box-shadow] duration-200', picked && 'border-volt/60 shadow-glow-volt')}
    >
      <div className="relative">
        <Preview theme={theme} replay={replay} />
        {card.replayable && (
          <button type="button" onClick={() => setReplay(r => r + 1)} aria-label="重播动效" className="absolute top-1 right-1 grid size-7 cursor-pointer place-items-center rounded-full bg-press text-ink-2 hover:text-ink">
            <RiRefreshLine className="size-3.5" />
          </button>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-semibold tracking-[-0.01em]">{card.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{card.summary}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={picked}
          aria-label={picked ? '取消挑选' : '挑选这张卡'}
          className={cn('grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border transition-all duration-200 active:scale-90', picked ? 'border-transparent bg-volt text-volt-ink shadow-glow-volt' : 'border-line-strong text-ink-3 hover:border-volt hover:text-volt-text')}
        >
          <RiCheckLine className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.keywords.slice(0, 4).map(k => <span key={k} className="rounded-full bg-hover px-2 py-0.5 text-[11px] text-ink-3">{k}</span>)}
      </div>

      <button type="button" onClick={() => setOpen(o => !o)} className="mt-3 w-fit cursor-pointer text-[12.5px] text-volt-text hover:underline">
        {open ? '收起使用说明' : '使用提示、提示词、代码'}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: ease.out }} className="overflow-hidden">
            <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed">
              <div>
                <p className="mb-1 font-semibold text-mint">什么时候用</p>
                <ul className="space-y-0.5 text-ink-2">{card.use.map(u => <li key={u}>· {u}</li>)}</ul>
              </div>
              <div>
                <p className="mb-1 font-semibold text-rose">避免</p>
                <ul className="space-y-0.5 text-ink-2">{card.avoid.map(u => <li key={u}>· {u}</li>)}</ul>
              </div>
              <div className="rounded-xl border border-line bg-hover p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="font-semibold">提示词</p>
                  <Button variant="ghost-accent" size="small" onClick={copy}>{copied ? <RiCheckLine className="size-3.5" /> : <RiClipboardLine className="size-3.5" />}{copied ? '已复制' : '复制'}</Button>
                </div>
                <p className="text-ink-2">{card.prompt}</p>
              </div>
              {card.code && <pre className="overflow-auto rounded-xl border border-line bg-solid p-3 font-mono text-[11.5px] leading-5 text-ink-2">{card.code}</pre>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

export default function DesignKit() {
  const { theme, toggle } = useTheme()
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [q, setQ] = useState('')
  const [sop, setSop] = useState<keyof typeof sops>('design')
  const [picked, setPicked] = useState<string[]>(readSaved)
  const [showPrompt, setShowPrompt] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('rx-kit-picked', JSON.stringify(picked))
    }
    catch {}
  }, [picked])

  const shown = cards.filter(c => (cat === 'all' || c.cat === cat) && (!q || `${c.title}${c.summary}${c.keywords.join(' ')}`.toLowerCase().includes(q.toLowerCase())))
  const pickedCards = useMemo(() => cards.filter(c => picked.includes(c.id)), [picked])
  const prompt = useMemo(() => buildPrompt(pickedCards), [pickedCards])
  const toggleCard = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
    catch {}
  }
  const download = () => {
    const blob = new Blob([`# Raccoon X 设计包组合提示词\n\n${prompt}\n`], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'raccoonx-design-prompt.md'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <MotionConfig reducedMotion="user">
      <TipProvider delay={300}>
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-[1360px] px-8 pb-40">
          {/* 顶栏 */}
          <header className="flex h-20 items-center gap-4">
            <div className="logo-mark h-9 w-48" role="img" aria-label="Raccoon X" />
            <span className="h-5 w-px bg-line-strong" />
            <span className="text-[14px] font-medium text-ink-2">设计包 v1</span>
            <div className="ml-auto flex items-center gap-2">
              {!isStandalone && <a href={`${import.meta.env.BASE_URL}#assistant`} className="flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] text-ink-2 hover:bg-hover hover:text-ink">打开门户原型<RiArrowRightUpLine className="size-4" /></a>}
              <Button variant="secondary" size="icon" aria-label="切换主题" onClick={toggle}>{theme === 'dark' ? <RiSunLine className="size-4" /> : <RiMoonClearLine className="size-4" />}</Button>
            </div>
          </header>

          {/* 介绍 */}
          <motion.section initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.7, ease: ease.out }} className="grid grid-cols-[1.3fr_1fr] gap-6 pt-8">
            <div>
              <h1 className="text-[52px] leading-[1.05] font-semibold tracking-[-0.035em]">Raccoon X <span className="text-gradient">设计包</span></h1>
              <p className="mt-4 max-w-[600px] text-[16px] leading-relaxed text-ink-2">
                新前端「曜黑石 × 电光青柠」用到的全部元素：风格、颜色、字体、材质、动效、组件、3D、布局、品牌。每张卡片都是真组件的实时渲染，挑好卡片就能生成一份完整的提示词。
              </p>
              <div className="mt-6 flex gap-8">
                {[[cards.length, '张卡片'], [categories.length, '个类别'], [2, '套主题']].map(([n, l]) => (
                  <div key={l as string}><p className="text-[28px] font-semibold tabular-nums">{n}</p><p className="text-[12.5px] text-ink-3">{l}</p></div>
                ))}
              </div>
            </div>
            <Panel level={2} radius="xl" className="p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">使用 SOP</p>
                <div className="flex gap-1 rounded-full bg-hover p-1">
                  {(Object.keys(sops) as (keyof typeof sops)[]).map(k => (
                    <button key={k} type="button" onClick={() => setSop(k)} className={cn('relative cursor-pointer rounded-full px-3 py-1 text-[12.5px]', sop === k ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}>
                      {sop === k && <motion.span layoutId="sop-tab" transition={spring.snappy} className="absolute inset-0 rounded-full bg-glass-3 shadow-float" />}
                      <span className="relative">{sops[k].label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <AnimatePresence mode="wait">
                <motion.ol key={sop} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="mt-4 space-y-3">
                  {sops[sop].steps.map(([t, d], i) => (
                    <li key={t} className="flex gap-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-volt-soft text-[11.5px] font-semibold text-volt-text tabular-nums">{i + 1}</span>
                      <div className="text-[13px] leading-relaxed"><p className="font-medium">{t}</p><p className="text-ink-3">{d}</p></div>
                    </li>
                  ))}
                </motion.ol>
              </AnimatePresence>
            </Panel>
          </motion.section>

          {/* 筛选 */}
          <div className="sticky top-0 z-30 -mx-8 mt-12 px-8 py-4 backdrop-blur-xl [mask-image:linear-gradient(#000_80%,transparent)]">
            <div className="flex flex-wrap items-center gap-2">
              {[{ id: 'all' as const, label: '全部' }, ...categories].map(c => {
                const n = c.id === 'all' ? cards.length : cards.filter(x => x.cat === c.id).length
                return (
                  <button key={c.id} type="button" onClick={() => setCat(c.id)} className={cn('relative h-9 cursor-pointer rounded-full px-4 text-[13px] transition-colors', cat === c.id ? 'text-volt-ink' : 'glass-1 text-ink-2 hover:text-ink')}>
                    {cat === c.id && <motion.span layoutId="kit-cat" transition={spring.snappy} className="absolute inset-0 rounded-full bg-volt shadow-glow-volt" />}
                    <span className="relative font-medium">{c.label}<span className="ml-1.5 opacity-60 tabular-nums">{n}</span></span>
                  </button>
                )
              })}
              <label className="glass-1 ml-auto flex h-9 w-[240px] items-center gap-2 rounded-full px-3.5 text-ink-3 focus-within:border-volt focus-within:shadow-glow-volt">
                <RiSearchLine className="size-4" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索卡片或关键词" className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
              </label>
            </div>
          </div>

          {/* 卡片 */}
          <motion.div layout className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] items-start gap-4">
            <AnimatePresence mode="popLayout">
              {shown.map(c => <CardItem key={c.id} card={c} picked={picked.includes(c.id)} toggle={() => toggleCard(c.id)} theme={theme} />)}
            </AnimatePresence>
          </motion.div>
          {!shown.length && <p className="py-20 text-center text-ink-3">没有匹配的卡片，换个关键词试试。</p>}
        </div>

        {/* 底部已选栏 */}
        <AnimatePresence>
          {picked.length > 0 && (
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring.smooth} className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-6">
              <div className="glass-3 flex max-w-[920px] flex-1 items-center gap-3 rounded-full py-2 pr-2 pl-5 shadow-float">
                <Badge tone="volt">已选 {picked.length} 张</Badge>
                <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
                  {pickedCards.slice(0, 5).map(p => <span key={p.id} className="truncate rounded-full bg-hover px-2.5 py-1 text-[12px] whitespace-nowrap text-ink-2">{p.title}</span>)}
                  {pickedCards.length > 5 && <span className="py-1 text-[12px] text-ink-3">+{pickedCards.length - 5}</span>}
                </div>
                <Button variant="ghost" size="small" onClick={() => setPicked([])}>清空</Button>
                <Button variant="primary" onClick={() => setShowPrompt(true)}>生成提示词</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 提示词面板 */}
        <AnimatePresence>
          {showPrompt && (
            <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowPrompt(false)} />
              <motion.aside initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ duration: 0.4, ease: ease.sheet }} className="glass-3 relative m-3 flex w-[620px] flex-col rounded-[28px] shadow-float">
                <div className="flex items-center gap-3 p-5 pb-3">
                  <div className="flex-1">
                    <p className="text-[17px] font-semibold">组合提示词</p>
                    <p className="text-[12.5px] text-ink-3">设计系统说明 + {pickedCards.length} 张卡片要求 + 避免清单 + 关键词 + 自查清单</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="关闭" onClick={() => setShowPrompt(false)}><RiCloseLine className="size-5" /></Button>
                </div>
                <pre className="mx-5 min-h-0 flex-1 overflow-auto rounded-2xl border border-line bg-solid p-4 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{prompt}</pre>
                <div className="flex gap-2 p-5">
                  <Button variant="primary" size="large" className="flex-1" onClick={copyAll}>{copied ? <RiCheckLine className="size-[18px]" /> : <RiClipboardLine className="size-[18px]" />}{copied ? '已复制' : '复制提示词'}</Button>
                  <Button variant="secondary" size="large" onClick={download}><RiDownload2Line className="size-[18px]" />下载 .md</Button>
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
      </TipProvider>
    </MotionConfig>
  )
}
