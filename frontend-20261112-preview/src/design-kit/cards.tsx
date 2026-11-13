import { RiAddLine, RiArrowRightLine, RiBookOpenLine, RiInbox2Line, RiSearchLine } from '@remixicon/react'
import { motion } from 'motion/react'
import { lazy, Suspense, useState } from 'react'
import raccoonPeek from '@/assets/raccoon-peek.png'
import { Button } from '@/components/ui/button'
import { CountUp, Sparkline, SpotlightCard, TypingDots } from '@/components/ui/effects'
import { Avatar, Badge, EmptyState, Kbd, Panel, Progress, Skeleton } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Tip } from '@/components/ui/tooltip'
import { agents, delegations, me, teammates } from '@/data'
import { asset } from '@/lib/asset'
import { spring } from '@/lib/motion'

const AgentConstellation = lazy(() => import('@/three/AgentConstellation'))
const CollabNetwork = lazy(() => import('@/three/CollabNetwork'))
const kitNodes = [me, ...teammates].map(p => ({ id: p.id, label: p.owner, kind: 'assistant' as const, status: p.presence === 'off' ? 'offline' as const : p.presence, avatar: p.avatar }))

export type Category = 'style' | 'color' | 'type' | 'material' | 'motion' | 'component' | 'three' | 'layout' | 'brand'

export const categories: { id: Category, label: string, hint: string }[] = [
  { id: 'style', label: '风格', hint: '整体定位和气质' },
  { id: 'color', label: '颜色', hint: '色板、角色、渐变' },
  { id: 'type', label: '字体', hint: '字号、字重、字距' },
  { id: 'material', label: '材质', hint: '毛玻璃、光效、纹理' },
  { id: 'motion', label: '动效', hint: '弹簧、进场、微交互' },
  { id: 'component', label: '组件', hint: '标准组件和状态' },
  { id: 'three', label: '3D', hint: 'Three.js 场景' },
  { id: 'layout', label: '布局', hint: '页面骨架和模式' },
  { id: 'brand', label: '品牌', hint: 'Logo、吉祥物、头像' },
]

export type KitCard = {
  id: string
  cat: Category
  title: string
  summary: string
  preview: (ctx: { theme: 'dark' | 'light', replay: number }) => React.ReactNode
  replayable?: boolean
  code?: string
  use: string[]
  avoid: string[]
  prompt: string
  keywords: string[]
}

/** 拼接提示词时放在最前面的全局风格说明 */
export const basePrompt = `【设计系统】Raccoon X「曜黑石 × 深蓝」（Obsidian × Blue）。定位：面向企业的智能体协作平台，未来感、极简、AI 感，参考 Sogaso 式的深色控制台审美。
- 底色：深色 #060708（浅色主题 #EEF0EC），两套主题同等精修
- 强调色：深蓝 #C6F432 只用于高对比元素（主按钮、选中、未读、关键数字）并配霓虹光；辅色电光青 #3FE0F5 用于数据、连线、3D；状态色薄荷 #6EE7A8 / 琥珀 #FFB547 / 玫瑰 #FF5D73
- 材质：三级毛玻璃（3% / 5.5% / 86% 不透明）+ 顶部高光边；背景是呼吸的网格渐变光斑 + 点阵暗纹 + 边缘数字暗纹 + 颗粒
- 字体：Geist Variable + 苹方；大标题字重 600、字距 -0.03em，正文 14–15px
- 圆角：面板 22–28px，按钮全圆角胶囊
- 动效：motion 弹簧（snappy 520/38、smooth 260/30），进场错峰上浮 + 去模糊，退场更快；必须尊重 prefers-reduced-motion
- 技术栈：React 19 + Tailwind v4 + Base UI + motion 12 + three.js（@react-three/fiber），组件 API 对齐 dify-ui（variant / size / tone / loading）`

const Swatch = ({ name, v, ink }: { name: string, v: string, ink?: boolean }) => (
  <div className="flex-1">
    <div className="h-14 rounded-xl border border-line" style={{ background: v, boxShadow: name.includes('Volt') ? '0 0 24px rgb(27 71 127 / 0.35)' : undefined }} />
    <p className={`mt-1.5 text-[12px] font-medium ${ink ? 'text-ink' : 'text-ink-2'}`}>{name}</p>
    <p className="text-[11px] text-ink-3 uppercase">{v}</p>
  </div>
)

function SegDemo() {
  const [v, setV] = useState<'a' | 'b' | 'c'>('a')
  return <Segmented value={v} onValueChange={setV} aria-label="示例" options={[{ value: 'a', label: '全部', count: 6 }, { value: 'b', label: '已发布', count: 3 }, { value: 'c', label: '草稿', count: 3 }]} />
}

function LayoutMini({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[150px] gap-1.5 rounded-xl border border-line bg-bg p-1.5">{children}</div>
}
const Blk = ({ className = '', label }: { className?: string, label?: string }) => (
  <div className={`grid place-items-center rounded-lg border border-line bg-glass-2 text-[10.5px] text-ink-3 ${className}`}>{label}</div>
)

export const cards: KitCard[] = [
  /* ---------------- 风格 ---------------- */
  {
    id: 'style-obsidian-volt',
    cat: 'style',
    title: '曜黑石 × 深蓝',
    summary: '整套门户的总风格：深空底 + 毛玻璃层次 + 一种高亮霓虹色。安静的界面里只有关键信息在发光。',
    preview: () => (
      <div className="relative h-[150px] overflow-hidden rounded-xl border border-line" style={{ background: '#060708' }}>
        <div className="absolute -top-10 right-0 size-48 rounded-full blur-3xl" style={{ background: 'rgb(27 71 127 / 0.25)' }} />
        <div className="absolute -bottom-16 left-0 size-52 rounded-full blur-3xl" style={{ background: 'rgb(63 224 245 / 0.22)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1.4px)', backgroundSize: '16px 16px' }} />
        <div className="glass-2 glass-edge absolute inset-x-6 top-6 rounded-2xl p-4 text-white">
          <p className="text-[18px] font-semibold tracking-[-0.02em]">让每个人的助手协同工作</p>
          <button type="button" className="mt-3 rounded-full bg-[#1b477f] px-4 py-1.5 text-[12.5px] font-semibold text-[#ffffff] shadow-[0_0_20px_rgb(27_71_127/0.5)]">进入工作台</button>
        </div>
      </div>
    ),
    use: ['新页面、新模块先套用这套总风格，再挑具体组件', '一屏里只让 1–3 个元素发光：主操作、关键数字、未读提示', '深浅两套主题都要检查，浅色下霓虹光要减弱'],
    avoid: ['不要大面积铺深蓝（只做点缀）', '不要混入紫色、渐变按钮等别的 AI 产品配色', '不要给每张卡片都加霓虹边，会失去重点'],
    prompt: '整体风格采用「曜黑石 × 深蓝」：深空黑底 #060708，三级毛玻璃面板分层，深蓝 #C6F432 只用于主操作和关键数字并带霓虹光晕，电光青 #3FE0F5 用于数据和连线，背景有缓慢呼吸的渐变光斑、点阵暗纹和颗粒质感，整体未来感、极简、AI 感。',
    keywords: ['obsidian dark UI', 'electric lime accent', 'glassmorphism layers', 'futuristic minimal', 'AI console aesthetic'],
  },
  {
    id: 'style-principles',
    cat: 'style',
    title: '四层搭建原则',
    summary: '材质打底、动效呼吸、3D 空间、标准组件。每个页面按这四层自查。',
    preview: () => (
      <div className="grid h-[150px] grid-cols-2 gap-2">
        {[['1 材质', '毛玻璃 / 柔阴影 / 渐变网格 / 颗粒'], ['2 动效', '微交互 / 进场 / 弹簧'], ['3 3D', '粒子场 / 节点网络 / 视差'], ['4 组件', '统一 API / 完整状态']].map(([t, d]) => (
          <div key={t} className="glass-2 rounded-xl p-3">
            <p className="text-[13px] font-semibold text-volt-text">{t}</p>
            <p className="mt-1 text-[11.5px] text-ink-3">{d}</p>
          </div>
        ))}
      </div>
    ),
    use: ['评审设计稿时逐层打分：材质是否有层次、操作是否有反馈、3D 是否有信息量、组件是否来自组件库', '3D 只放在登录页和协同网络这类"值得"的地方'],
    avoid: ['不要为了氛围在内容页大面积放 3D（影响阅读和电量）', '不要手写一次性样式，先找组件库'],
    prompt: '按四层搭建：1）CSS 材质打底（毛玻璃、柔阴影、渐变网格、颗粒纹理）；2）动效呼吸感（微交互、错峰进场、弹簧动画）；3）Three.js 3D 空间只用于有信息量的场景；4）全部使用标准组件并补齐 hover / focus / active / disabled / loading / empty 状态。',
    keywords: ['layered materials', 'micro-interactions', 'spring motion', 'three.js accents', 'component system'],
  },

  /* ---------------- 颜色 ---------------- */
  {
    id: 'color-core',
    cat: 'color',
    title: '核心色板',
    summary: '一个底、一个主强调、一个辅强调。强调色永远少量出现。',
    preview: () => (
      <div className="flex h-[150px] items-start gap-2 pt-2">
        <Swatch name="Obsidian 底" v="#060708" ink />
        <Swatch name="Volt 主强调" v="#1b477f" ink />
        <Swatch name="Cyan 辅强调" v="#3fe0f5" ink />
        <Swatch name="Ink 文字" v="#eef2ee" ink />
      </div>
    ),
    code: `--bg: #060708;  --volt: #1b477f;  --volt-ink: #ffffff;\n--cyan: #3fe0f5;  --ink: #eef2ee;  --ink-2: #a4adba;  --ink-3: #6c7787;`,
    use: ['Volt 上的文字一律用 --volt-ink 深色，保证对比度', 'Cyan 用在 @提及、连线、数据标签、知识库标签', '正文用 --ink，次要信息用 --ink-2，说明文字用 --ink-3'],
    avoid: ['Volt 和 Cyan 不要作为文字紧挨着（对比度只有约 1.4）', '不要在组件里写死 hex，一律用 token'],
    prompt: '配色使用 token：底 --bg #060708，主强调 --volt #C6F432（上面的文字用 #0B0F02），辅强调 --cyan #3FE0F5，正文 --ink #EEF2EE，次要 --ink-2 #A2AAA5，说明 --ink-3 #6B736E。强调色只少量点缀。',
    keywords: ['#060708', '#C6F432 volt', '#3FE0F5 cyan', 'semantic color tokens'],
  },
  {
    id: 'color-status',
    cat: 'color',
    title: '状态色',
    summary: '薄荷 = 完成/在线，琥珀 = 进行中/需核对，玫瑰 = 错误/驳回。都配 12% 的浅底。',
    preview: () => (
      <div className="flex h-[150px] flex-col justify-center gap-3">
        <div className="flex flex-wrap gap-2"><Badge tone="mint" dot>运行中</Badge><Badge tone="amber" dot>进行中</Badge><Badge tone="rose">已驳回</Badge><Badge tone="volt" dot>等你核对</Badge><Badge tone="cyan">知识库</Badge><Badge>草稿</Badge></div>
        <div className="flex gap-2"><Swatch name="Mint" v="#83b3ed" /><Swatch name="Amber" v="#ffb547" /><Swatch name="Rose" v="#ff5d73" /></div>
      </div>
    ),
    code: `<Badge tone="mint" dot>运行中</Badge>\n<Badge tone="amber" dot>进行中</Badge>\n<Badge tone="rose">已驳回</Badge>`,
    use: ['进行中的状态加呼吸点 dot，表示"活着"', '需要人处理的事项用 volt（最醒目）'],
    avoid: ['不要只靠颜色表达状态，必须有文字', '0 或无变化时用中性灰，不要用状态色'],
    prompt: '状态用带 12% 浅底的胶囊徽标：完成/在线用薄荷 #6EE7A8，进行中用琥珀 #FFB547 并带呼吸点，错误用玫瑰 #FF5D73，需要本人处理的用深蓝；徽标里必须有文字。',
    keywords: ['status pills', 'mint success', 'amber in-progress', 'rose error', 'breathing dot'],
  },
  {
    id: 'color-light',
    cat: 'color',
    title: '浅色主题「瓷白」',
    summary: '同一套强调色，换成瓷白底和白色毛玻璃；强调文字改用深橄榄绿保证可读。',
    preview: () => (
      <div className="flex h-[150px] items-start gap-2 pt-2">
        <Swatch name="瓷白底" v="#eef1f5" ink />
        <Swatch name="白玻璃" v="#ffffffc7" ink />
        <Swatch name="强调文字" v="#1b477f" ink />
        <Swatch name="Cyan 深" v="#0aa6c2" ink />
      </div>
    ),
    code: `[data-theme='light'] { --bg: #eef1f5; --volt-text: #1b477f; --cyan: #0aa6c2; }`,
    use: ['所有组件只写 token，切主题自动生效', '浅色下霓虹光改成柔和投影（--glow-volt 已处理）'],
    avoid: ['浅色下不要用 #C6F432 做文字颜色', '不要单独为浅色写一套组件'],
    prompt: '同时支持浅色主题：瓷白底 #EEF0EC，白色毛玻璃 55%–92% 不透明，强调文字用 #4A6800，辅色 #0AA6C2；通过 [data-theme] 切换 CSS 变量，组件不改。',
    keywords: ['light theme porcelain', 'data-theme tokens', 'accessible contrast'],
  },
  {
    id: 'color-gradient',
    cat: 'color',
    title: '品牌渐变',
    summary: '青柠 → 青 的渐变，只用在标题强调词、工作空间图标、群组图标三处。',
    preview: () => (
      <div className="flex h-[150px] flex-col justify-center gap-4">
        <p className="text-[30px] font-semibold tracking-[-0.03em]">协同<span className="text-gradient">工作</span></p>
        <div className="flex gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-volt to-cyan text-[14px] font-bold text-volt-ink">大</span>
          <div className="h-10 flex-1 rounded-xl bg-gradient-to-r from-volt to-cyan" />
        </div>
      </div>
    ),
    code: `.text-gradient { background: linear-gradient(100deg, var(--ink) 30%, var(--volt-text) 70%, var(--cyan)); background-clip: text; color: transparent; }\n<span className="bg-gradient-to-br from-volt to-cyan" />`,
    use: ['登录页主标题的最后一个词', '工作空间、群组这类"身份"图标'],
    avoid: ['不要做渐变按钮', '不要给正文或长句加渐变'],
    prompt: '品牌渐变为深蓝 #C6F432 → 电光青 #3FE0F5，只用于主标题强调词（渐变文字）和身份类小图标，不用于按钮和大面积背景。',
    keywords: ['lime to cyan gradient', 'gradient text accent'],
  },

  /* ---------------- 字体 ---------------- */
  {
    id: 'type-scale',
    cat: 'type',
    title: '字号阶梯',
    summary: 'Geist Variable + 苹方。三档主力字号：展示 40–56、标题 15、正文 14–15。',
    preview: () => (
      <div className="flex h-[150px] flex-col justify-center gap-1.5">
        <p className="text-[40px] leading-none font-semibold tracking-[-0.035em]">Agents 4,006</p>
        <p className="text-[15px] font-semibold">卡片标题 15 / 600</p>
        <p className="text-[14px] text-ink-2">正文 14–15 / 400，行高 1.5–1.7</p>
        <p className="text-[12px] text-ink-3">说明 12 / 400，最小不低于 11</p>
      </div>
    ),
    code: `展示 52 / 600 / -0.035em   页面标题 32–40 / 600 / -0.03em\n卡片标题 15–16 / 600       正文 14–15 / 400 / 1.6\n说明 12–12.5 / 400         徽标 11–12 / 500`,
    use: ['数字一律等宽数字（tabular-nums），方便对齐', '大字号负字距，正文字距 0'],
    avoid: ['不要用全大写加字距的小标签', '一屏不超过 5 种字号'],
    prompt: '字体用 Geist Variable + 苹方。字号：展示 52px/600/-0.035em，页面标题 32–40px/600/-0.03em，卡片标题 15–16px/600，正文 14–15px/行高 1.6，说明 12px；数字使用等宽数字。',
    keywords: ['Geist Variable', 'tight display tracking', 'tabular numbers', 'type scale'],
  },

  /* ---------------- 材质 ---------------- */
  {
    id: 'material-glass',
    cat: 'material',
    title: '三级毛玻璃',
    summary: 'glass-1 背景层、glass-2 内容卡片、glass-3 浮层/输入框。层级越高越实，越靠近用户。',
    preview: () => (
      <div className="relative h-[150px] overflow-hidden rounded-xl">
        <div className="absolute top-2 left-6 size-24 rounded-full bg-volt blur-2xl opacity-60" />
        <div className="absolute right-6 bottom-0 size-24 rounded-full bg-cyan blur-2xl opacity-50" />
        <div className="relative flex h-full items-center gap-2 p-2">
          {[1, 2, 3].map(l => <Panel key={l} level={l as 1 | 2 | 3} radius="md" className="grid h-24 flex-1 place-items-center text-[12px] text-ink-2">glass-{l}</Panel>)}
        </div>
      </div>
    ),
    code: `<Panel level={1} />  // 页面主区域\n<Panel level={2} />  // 卡片、侧栏、抽屉\n<Panel level={3} />  // 输入框、弹层、登录卡（带浮起阴影）`,
    use: ['毛玻璃下面必须有"东西"可模糊（光斑、3D、内容），否则看不出效果', '同一层级用同一级玻璃'],
    avoid: ['不要浅玻璃叠浅玻璃（可读性崩）', '开启"减少透明度"时自动退化为实色，已内置'],
    prompt: '面板使用三级毛玻璃：glass-1（白 3%，blur 24px）做页面底板，glass-2（白 5.5%）做卡片/侧栏，glass-3（86% 实色，blur 32px，浮起阴影）做输入框和弹层；所有玻璃带 1px 细边和顶部高光边。',
    keywords: ['glassmorphism 3 levels', 'backdrop-filter blur saturate', 'top highlight edge'],
  },
  {
    id: 'material-neon',
    cat: 'material',
    title: '霓虹光效',
    summary: '高对比元素专属：主按钮悬停光、开关打开光、流动霓虹描边、发光文字。',
    preview: () => (
      <div className="flex h-[150px] items-center justify-around">
        <Button variant="primary">悬停看光</Button>
        <Switch defaultChecked aria-label="示例" />
        <Panel level={2} radius="md" glow="volt" className="grid h-20 w-28 place-items-center text-[12px] text-ink-2">流动描边</Panel>
        <span className="text-[22px] font-semibold text-glow-volt">82.4%</span>
      </div>
    ),
    code: `shadow-glow-volt        // 0 0 0 1px + 18px + 42px 三层光\n<Panel glow="volt" />   // conic-gradient 沿边框 6s 一圈\n.text-glow-volt          // 关键数字发光`,
    use: ['一屏一个流动描边（登录卡、核心 KPI）', '关键数字（解决率、调用量）用发光文字'],
    avoid: ['不要给普通卡片加流动描边', '浅色主题下光效自动减弱，不要强行加亮'],
    prompt: '高对比元素加霓虹光：主按钮悬停时出现三层青柠光晕，开关打开发光，核心面板使用沿边框缓慢流动的青柠→青 conic 渐变描边（6 秒一圈），关键数字使用发光文字；一屏最多一个流动描边。',
    keywords: ['neon glow', 'animated conic border', 'glowing numbers', 'box-shadow glow'],
  },
  {
    id: 'material-backdrop',
    cat: 'material',
    title: '背景：呼吸光斑 + 暗纹 + 颗粒',
    summary: '四层叠加：网格渐变光斑（14–22 秒呼吸）、点阵暗纹、边缘数字暗纹、颗粒噪点。',
    preview: () => (
      <div className="relative h-[150px] overflow-hidden rounded-xl border border-line bg-bg">
        <motion.div className="absolute -top-8 right-4 size-40 rounded-full blur-2xl" style={{ background: 'var(--mesh-a)' }} animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 6, repeat: Infinity }} />
        <motion.div className="absolute -bottom-10 left-4 size-44 rounded-full blur-2xl" style={{ background: 'var(--mesh-b)' }} animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 8, repeat: Infinity }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(var(--dot) 1px, transparent 1.4px)', backgroundSize: '16px 16px' }} />
        <div className="absolute inset-y-0 left-0 w-1/3 font-mono text-[9px] leading-4 text-volt-text opacity-25">01 7f a3<br />0x4e 11<br />1101 08<br />c6 f4 32<br />agt.07<br />3fe0 f5</div>
        <p className="absolute right-3 bottom-2 text-[11px] text-ink-3">光斑 · 点阵 · 数字 · 颗粒</p>
      </div>
    ),
    code: `<Backdrop />  // .rx-mesh .rx-dots .rx-digits .rx-grain，全屏固定在内容下面`,
    use: ['整个应用只放一个 <Backdrop />', '数字暗纹只出现在屏幕左右边缘，中间淡出'],
    avoid: ['不要在卡片内部再叠光斑', '颗粒透明度别调高，超过 0.5 会脏'],
    prompt: '背景四层叠加：1）三个大号径向渐变光斑（青柠/青/薄荷，低透明度，blur 60px，14–22 秒缓慢呼吸位移）；2）22px 间距点阵暗纹，中心向外淡出；3）屏幕左右边缘极淡的十六进制数字暗纹缓慢上移；4）SVG feTurbulence 颗粒噪点 overlay。',
    keywords: ['breathing mesh gradient', 'dot grid pattern', 'data digits texture', 'film grain overlay'],
  },

  /* ---------------- 动效 ---------------- */
  {
    id: 'motion-tokens',
    cat: 'motion',
    title: '动效 token',
    summary: '微交互 100–150ms，界面切换 200–300ms，页面 300–500ms；进场用弹簧，退场更快更轻。',
    preview: ({ replay }) => (
      <div key={replay} className="flex h-[150px] flex-col justify-center gap-3">
        {[['snappy 520/38', spring.snappy], ['smooth 260/30', spring.smooth], ['bouncy 320/18', spring.bouncy]].map(([n, t]) => (
          <div key={n as string} className="flex items-center gap-3">
            <span className="w-28 text-[12px] text-ink-2">{n as string}</span>
            <div className="relative h-7 flex-1 rounded-full bg-hover">
              <motion.span className="absolute top-1 left-1 size-5 rounded-full bg-volt shadow-[0_0_10px_var(--volt)]" initial={{ x: 0 }} animate={{ x: 220 }} transition={t as object} />
            </div>
          </div>
        ))}
      </div>
    ),
    replayable: true,
    code: `import { spring } from '@/lib/motion'\nspring.snappy  // 选中块、开关、导航\nspring.smooth  // 列表重排、抽屉内容\nspring.bouncy  // 只给拖拽、甩出这类有动量的手势`,
    use: ['用的越频繁，动效越短越轻', '只动 transform 和 opacity'],
    avoid: ['不要超过 500ms', '不要 ease-in 进场、不要 scale 到 0', '不要给菜单淡入加回弹'],
    prompt: '动效使用 motion 弹簧：snappy（stiffness 520 / damping 38）用于选中块与开关，smooth（260/30）用于列表与面板，bouncy（320/18）仅用于有动量的手势；微交互 100–150ms，界面切换 200–300ms，页面 300–500ms；只动 transform/opacity，尊重 prefers-reduced-motion。',
    keywords: ['spring physics', 'motion/react', 'interruptible animation', 'reduced motion'],
  },
  {
    id: 'motion-page',
    cat: 'motion',
    title: '页面进场：错峰上浮 + 去模糊',
    summary: '页面容器 0.42s 去模糊淡入，子元素 60ms 错峰上浮 16px；离开时 0.18s 轻退。',
    preview: ({ replay }) => (
      <motion.div key={replay} initial="i" animate="e" variants={{ e: { transition: { staggerChildren: 0.08 } } }} className="flex h-[150px] flex-col justify-center gap-2">
        {['页面标题', '一行说明文字', '第一张卡片', '第二张卡片'].map((t, i) => (
          <motion.div key={t} variants={{ i: { opacity: 0, y: 16, filter: 'blur(6px)' }, e: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } } }} className={i === 0 ? 'text-[20px] font-semibold' : 'glass-2 rounded-lg px-3 py-1.5 text-[12.5px] text-ink-2'}>{t}</motion.div>
        ))}
      </motion.div>
    ),
    replayable: true,
    code: `<Page>            // pageVariants：initial → enter → exit\n  <Rise>…</Rise>  // riseItem：错峰上浮\n</Page>`,
    use: ['每个页面根节点用 <Page>，需要错峰的块用 <Rise>', '路由切换包在 AnimatePresence mode="wait" 里'],
    avoid: ['不要每个小元素都单独做进场', '内容必须默认可见，脚本失败不能留空白'],
    prompt: '页面进场：容器从 y+12、blur 6px 淡入（0.42s，expo-out），子元素按 60ms 错峰上浮 16px；离开时 0.18s 轻微上移淡出；路由切换使用 AnimatePresence mode="wait"。',
    keywords: ['staggered reveal', 'blur-in transition', 'AnimatePresence'],
  },
  {
    id: 'motion-micro',
    cat: 'motion',
    title: '微交互合集',
    summary: '按下微缩、选中块滑动、数字滚动、呼吸点、打字点、进度条流光。',
    preview: ({ replay }) => (
      <div key={replay} className="grid h-[150px] grid-cols-2 content-center gap-3 text-[12px] text-ink-2">
        <div className="flex items-center gap-2"><Button size="small">按下微缩</Button></div>
        <div className="flex items-center gap-2 text-[22px] font-semibold text-ink tabular-nums"><CountUp value={2416} /></div>
        <div className="flex items-center gap-2"><i className="breathe-dot size-2 rounded-full bg-amber text-amber" />呼吸点</div>
        <div className="flex items-center gap-2"><TypingDots />打字中</div>
        <div className="col-span-2"><Progress value={72} /></div>
      </div>
    ),
    replayable: true,
    code: `active:scale-[0.97]          // 所有按钮\n<CountUp value={4006} />      // 进入视口滚动\n<i className="breathe-dot" /> // 进行中状态\n<TypingDots /> <Progress value={72} />`,
    use: ['反馈在按下瞬间出现，不等松手', '进行中的任务、正在工作的助手用呼吸点'],
    avoid: ['不要让循环动画太多（一屏 ≤ 3 个）', '数字滚动只用于首屏关键数据'],
    prompt: '补齐微交互：所有按钮按下 scale 0.97；关键数字进入视口时从 0 滚动到目标值（1.4s）；进行中状态用向外扩散的呼吸点；助手思考时显示三点跳动；进度条从 0 填充并带同色光晕。',
    keywords: ['press feedback', 'count up', 'pulse dot', 'typing indicator', 'progress glow'],
  },
  {
    id: 'motion-layout',
    cat: 'motion',
    title: '共享布局动画',
    summary: '导航选中块、分段控件、设置目录用 layoutId 在选项之间弹簧滑动。',
    preview: () => <div className="grid h-[150px] place-items-center"><SegDemo /></div>,
    code: `{active && <motion.span layoutId="nav-active" transition={spring.snappy} />}`,
    use: ['同一组选项共用一个 layoutId', '选中块上可以带一条青柠竖光'],
    avoid: ['不同组件之间不要复用同一个 layoutId'],
    prompt: '选中态使用共享布局动画：选中背景块通过 motion layoutId 在选项之间以 snappy 弹簧滑动，而不是瞬间切换。',
    keywords: ['layoutId', 'shared layout animation', 'sliding indicator'],
  },

  /* ---------------- 组件 ---------------- */
  {
    id: 'cmp-button',
    cat: 'component',
    title: 'Button 按钮',
    summary: '5 种 variant × 5 种 size，支持 tone="destructive" 和 loading。API 与 dify-ui 一致。',
    preview: () => (
      <div className="flex h-[150px] flex-col justify-center gap-3">
        <div className="flex flex-wrap gap-2"><Button variant="primary">主操作</Button><Button>次要</Button><Button variant="outline">描边</Button><Button variant="ghost">幽灵</Button><Button variant="ghost-accent">强调</Button></div>
        <div className="flex flex-wrap items-center gap-2"><Button variant="primary" loading>保存中</Button><Button disabled>不可用</Button><Button variant="ghost" tone="destructive">驳回</Button><Button variant="secondary" size="icon" aria-label="新建"><RiAddLine className="size-4" /></Button></div>
      </div>
    ),
    code: `<Button variant="primary" size="large">进入工作台</Button>\n<Button variant="secondary" loading>保存</Button>\n<Button variant="ghost" tone="destructive">驳回</Button>\n<Button variant="ghost" size="icon" aria-label="历史"><RiHistoryLine /></Button>`,
    use: ['一个区域只有一个 primary', '纯图标按钮必须有 aria-label 和 Tooltip'],
    avoid: ['不要做渐变按钮', '不要把危险操作做成 primary 青柠色'],
    prompt: '按钮使用 Button 组件：variant 取 primary（青柠底 + 深色字 + 悬停霓虹光）/ secondary（玻璃）/ outline / ghost / ghost-accent，size 取 small / medium / large / icon，危险操作用 tone="destructive"，异步操作传 loading；全部为胶囊圆角，按下 scale 0.97。',
    keywords: ['button variants', 'pill buttons', 'loading state', 'destructive tone'],
  },
  {
    id: 'cmp-form',
    cat: 'component',
    title: '输入框 / 开关 / 分段',
    summary: '输入框聚焦时青柠描边 + 霓虹光；Switch 基于 Base UI；Segmented 基于 RadioGroup。',
    preview: () => (
      <div className="flex h-[150px] flex-col justify-center gap-3">
        <label className="flex h-10 items-center gap-2 rounded-2xl border border-line-strong bg-hover px-3 text-ink-3 transition-[border-color,box-shadow] focus-within:border-volt focus-within:shadow-glow-volt">
          <RiSearchLine className="size-4" />
          <input placeholder="点我看聚焦光效" className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" />
          <Kbd>⌘K</Kbd>
        </label>
        <div className="flex items-center gap-4"><Switch defaultChecked aria-label="开" /><Switch aria-label="关" /><Switch disabled aria-label="禁用" /><SegDemo /></div>
      </div>
    ),
    code: `<Switch defaultChecked aria-label="深度思考" />\n<Segmented value={v} onValueChange={setV} options={[{ value: 'a', label: '全部', count: 6 }]} />\nfocus-within:border-volt focus-within:shadow-glow-volt`,
    use: ['输入框一律有可见标签（label），不只靠占位符', '开关必须有 aria-label'],
    avoid: ['不要去掉焦点环', '分段选项不要超过 4 个'],
    prompt: '表单控件：输入框 rounded-2xl、聚焦时边框变青柠并出现霓虹光；开关用 Base UI Switch，打开为青柠底发光；分段控件基于 RadioGroup，选中块弹簧滑动并显示计数。',
    keywords: ['focus glow input', 'Base UI Switch', 'segmented control'],
  },
  {
    id: 'cmp-display',
    cat: 'component',
    title: '徽标 / 头像 / 提示 / 进度',
    summary: 'Badge 6 种 tone、Avatar 带在线状态环、Tooltip 只放短文字、Progress 带光。',
    preview: () => (
      <div className="flex h-[150px] flex-col justify-center gap-4">
        <div className="flex items-center gap-3">
          <Avatar src={me.avatar} size={40} presence="idle" ring />
          {teammates.map(t => <Avatar key={t.id} src={t.avatar} size={34} presence={t.presence} />)}
          <Tip label="这是一个提示"><Button variant="ghost" size="small">悬停看提示</Button></Tip>
        </div>
        <Progress value={62} tone="cyan" />
      </div>
    ),
    code: `<Avatar src={a.avatar} presence="busy" ring />\n<Tip label="项目文件"><Button size="icon" … /></Tip>\n<Progress value={62} tone="volt" />`,
    use: ['助手头像统一用小浣熊行业表情（raccoon-emoji-v1）', 'presence：busy 琥珀呼吸、idle 薄荷、off 灰'],
    avoid: ['Tooltip 里不要放按钮或链接（需要的话用 Popover）'],
    prompt: '展示组件：头像为圆形小浣熊行业表情，右下角在线状态点（忙碌琥珀呼吸/空闲薄荷/离线灰），当前用户加青柠环；提示用 Base UI Tooltip，只放短文字；进度条 4px 高，填充带同色光晕。',
    keywords: ['avatar presence ring', 'tooltip', 'progress bar glow'],
  },
  {
    id: 'cmp-card',
    cat: 'component',
    title: '聚光卡片 + 迷你趋势',
    summary: '列表卡片：鼠标处出现柔和青柠光斑，悬停上浮 2px；底部调用数 + 发光趋势线。',
    preview: () => {
      const a = agents[1]
      return (
        <div className="h-[150px]">
          <SpotlightCard>
            <div className="flex h-[150px] flex-col p-4">
              <div className="flex items-center gap-3"><img src={a.avatar} alt="" className="size-10 rounded-xl border border-line" /><div className="flex-1"><p className="font-semibold">{a.name}</p><p className="text-[12px] text-ink-3">{a.kind}</p></div><Badge tone="mint" dot>运行中</Badge></div>
              <p className="mt-2 line-clamp-2 flex-1 text-[12.5px] text-ink-2">{a.desc}</p>
              <div className="flex items-end justify-between text-[12px] text-ink-3"><span><b className="text-ink">1,284</b> 次调用</span><Sparkline data={a.trend} /></div>
            </div>
          </SpotlightCard>
        </div>
      )
    },
    code: `<SpotlightCard>…</SpotlightCard>\n<Sparkline data={[3, 4, 3, 6, 5, 7, 9]} />`,
    use: ['Agents、Skills、知识库等"同类对象"列表用它', '没有数据时不显示趋势线'],
    avoid: ['不要嵌套卡片', '一行不要放超过 4 张'],
    prompt: '列表卡片使用聚光卡片：glass-2 圆角 22px，鼠标位置出现 360px 半径的青柠柔光，悬停上浮 2px 并加深边框；头部头像 + 名称 + 状态徽标，中部两行简介，底部调用次数与发光迷你趋势线。',
    keywords: ['spotlight card', 'cursor glow', 'sparkline', 'hover lift'],
  },
  {
    id: 'cmp-states',
    cat: 'component',
    title: '空状态 / 骨架屏',
    summary: '每个列表都要有加载、空、错误三种状态。空状态告诉用户下一步做什么。',
    preview: () => (
      <div className="grid h-[150px] grid-cols-2 gap-3">
        <div className="space-y-2 pt-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-16 w-full" /></div>
        <div className="-mt-10 scale-[0.8]"><EmptyState icon={<RiInbox2Line className="size-6" />} title="都处理完了" hint="新的核对请求会出现在这里" /></div>
      </div>
    ),
    code: `<Skeleton className="h-4 w-2/3" />\n<EmptyState icon={…} title="都处理完了" hint="…" action={<Button>…</Button>} />`,
    use: ['空状态文案说"接下来会发生什么 / 你可以做什么"', '骨架屏形状和真实内容一致'],
    avoid: ['不要用道歉口吻的报错', '不要只显示一个转圈'],
    prompt: '补齐状态：加载时显示与内容同形的骨架屏（脉冲），空状态显示图标 + 一句结论 + 下一步提示 + 可选操作按钮，错误说明原因和恢复办法，不道歉。',
    keywords: ['empty state', 'skeleton loading', 'error recovery'],
  },
  {
    id: 'cmp-composer',
    cat: 'component',
    title: '对话输入区',
    summary: '浮在内容上的 glass-3 输入框，聚焦时整体发光；上方是快捷指令胶囊，下方是知识库标签和发送按钮。',
    preview: () => (
      <div className="flex h-[150px] flex-col justify-center gap-2">
        <div className="flex gap-1.5">{['再做一版英文的', '总结成 3 句话'].map(p => <span key={p} className="glass-1 rounded-full px-2.5 py-1 text-[11.5px] text-ink-2">{p}</span>)}</div>
        <div className="glass-3 rounded-[22px] shadow-float transition-shadow focus-within:shadow-glow-volt">
          <input placeholder="让助手帮你做点什么" className="w-full bg-transparent px-4 pt-3 text-[13.5px] outline-none placeholder:text-ink-3" />
          <div className="flex items-center gap-1.5 px-2 pt-1 pb-2"><Badge tone="cyan"><RiBookOpenLine className="size-3" />城市资料</Badge><Button variant="primary" size="icon-small" className="ml-auto" aria-label="发送"><RiArrowRightLine className="size-4" /></Button></div>
        </div>
      </div>
    ),
    use: ['个人助手和协同群都用同一个输入区', '底部用渐变遮罩让内容从输入框下面滑过'],
    avoid: ['不要把输入框做成固定在底部的实色条'],
    prompt: '对话输入区为浮在内容上方的 glass-3 圆角 26px 面板，聚焦时出现青柠霓虹光；上方一排快捷指令胶囊，底部左侧附件和已关联知识库（青色标签），右侧圆形青柠发送按钮；内容从输入框下面滚过，用底部渐变遮罩过渡。',
    keywords: ['floating composer', 'prompt chips', 'AI chat input'],
  },

  /* ---------------- 3D ---------------- */
  {
    id: 'three-constellation',
    cat: 'three',
    title: '协同星座（登录页）',
    summary: '14 个助手节点围绕中枢，粒子沿弯曲连线流动；鼠标视差，中枢呼吸。只用光晕贴图，不用后处理。',
    preview: ({ theme }) => (
      <div className="h-[150px] overflow-hidden rounded-xl border border-line bg-bg">
        <Suspense fallback={null}><AgentConstellation theme={theme} /></Suspense>
      </div>
    ),
    code: `const AgentConstellation = lazy(() => import('@/three/AgentConstellation'))\n<Suspense fallback={null}><AgentConstellation theme={theme} /></Suspense>`,
    use: ['只放在登录页、首页 Hero 这类停留时间短的页面', '必须懒加载，并在减少动态时停帧'],
    avoid: ['不要压在文字或表单下面，放在文字旁边', '不要在内容页常驻'],
    prompt: '用 react-three-fiber 做"智能体协同星座"：斐波那契球面分布 14 个发光节点（电光青），中心是线框二十面体中枢（深蓝，呼吸光晕），弯曲连线上有粒子流动，背景少量星点；鼠标视差缓动；用径向光晕贴图 + Additive 混合代替 bloom；懒加载，prefers-reduced-motion 时停帧。',
    keywords: ['react-three-fiber', 'particle network', 'glowing nodes', 'mouse parallax', 'additive blending'],
  },
  {
    id: 'three-network',
    cat: 'three',
    title: '助手协同网络（协同页）',
    summary: '有信息量的 3D：节点 = 同事的助手，有向粒子 = 委派关系。可拖动旋转、点击查看委派。',
    preview: ({ theme }) => {
      const [sel, setSel] = useState('lpc')
      return (
        <div className="relative h-[150px] overflow-hidden rounded-xl border border-line bg-bg">
          <Suspense fallback={null}><CollabNetwork theme={theme} nodes={kitNodes} edges={delegations} selectedId={sel} onSelect={setSel} /></Suspense>
        </div>
      )
    },
    code: `<CollabNetwork theme={theme} nodes={members} edges={delegations} selectedId={id} onSelect={setId} />`,
    use: ['头像标签用 DOM 叠加层 + 每帧投影定位（不要用 drei <Html>，React 19 下会丢标签）', '选中节点的连线加亮、粒子加速'],
    avoid: ['节点超过 30 个时改成 2D 图', '不要开缩放，避免迷失'],
    prompt: '协同页右侧放一个可交互的 3D 助手网络：节点为同事助手头像（DOM 叠加层，每帧把 3D 坐标投影到屏幕），有向弯曲连线表示委派，粒子从委派方流向接收方；悬停/点击高亮相关连线；OrbitControls 自动慢转、禁止缩放；状态色光晕表示忙碌/空闲/离线。',
    keywords: ['3D graph', 'directed edges particles', 'OrbitControls autoRotate', 'DOM label overlay'],
  },

  /* ---------------- 布局 ---------------- */
  {
    id: 'layout-shell',
    cat: 'layout',
    title: '应用骨架',
    summary: '背景层之上，左侧 252px 浮动玻璃侧栏，右侧 glass-1 主区域；间距 12px，大圆角 28px。',
    preview: () => <LayoutMini><Blk className="w-1/4" label="侧栏 glass-2" /><Blk className="flex-1" label="主区域 glass-1" /></LayoutMini>,
    code: `<Backdrop />\n<div className="flex h-full gap-3 p-3">\n  <Sidebar />\n  <Panel level={1} radius="xl">…</Panel>\n</div>`,
    use: ['侧栏分两组：工作台（个人助手/智能体协同/待我核对）+ 平台能力', '页内顶栏是半透明材质，内容从下面滚过'],
    avoid: ['不要在侧栏用深色实底条', '侧栏选中态不要整条涂色'],
    prompt: '应用骨架：全屏背景层之上，左侧 252px 浮动毛玻璃侧栏（logo、工作空间切换、⌘K 搜索、分组导航、用户卡片与主题切换），右侧 glass-1 主区域，外边距与间距 12px，圆角 28px；页内顶栏 64px 半透明并在底部渐隐。',
    keywords: ['floating sidebar', 'app shell', 'translucent toolbar'],
  },
  {
    id: 'layout-chat-drawer',
    cat: 'layout',
    title: '对话 + 右侧抽屉',
    summary: '居中 760px 对话流，右侧 372px 抽屉（3D 网络 + 详情 + 成员），抽屉从右进从右出。',
    preview: () => <LayoutMini><Blk className="flex-1" label="对话流 760" /><Blk className="w-1/3" label="抽屉 372" /></LayoutMini>,
    use: ['智能体协同页', '抽屉开关放在顶栏右侧'],
    avoid: ['抽屉不要盖住输入框'],
    prompt: '协同页布局：左侧居中 760px 对话流（用户消息右对齐、青柠浅底气泡；助手消息左侧头像 + 名称 + 角色），助手间交接用居中的系统行；右侧 372px 抽屉，上面是 3D 协同网络，下面是选中助手的委派详情和成员列表，抽屉从右侧滑入滑出。',
    keywords: ['chat with side drawer', 'agent handoff line'],
  },
  {
    id: 'layout-inbox',
    cat: 'layout',
    title: '列表 + 详情（待我核对）',
    summary: '左 360px 列表，选中项浮起并带青柠竖光；右侧详情：类型徽标、大标题、引用块、依据/影响/截止、操作。',
    preview: () => <LayoutMini><div className="flex w-1/3 flex-col gap-1"><Blk className="h-8" label="选中项" /><Blk className="h-8" /><Blk className="h-8" /></div><Blk className="flex-1" label="详情" /></LayoutMini>,
    use: ['所有"需要人拍板"的事项', '处理完的项用退场动画移出列表'],
    avoid: ['不要用表格展示核对事项'],
    prompt: '待我核对页采用邮件式双栏：左侧 360px 列表（头像、来源助手、时间、标题、两行摘要，选中项 glass-3 浮起并带青柠竖光），右侧详情（类型徽标、30px 标题、左侧青柠竖线引用块、依据/影响/截止三格信息、确认并发出/修改/驳回）；处理后条目滑出，全部处理完显示空状态。',
    keywords: ['list detail layout', 'approval inbox'],
  },
  {
    id: 'layout-settings',
    cat: 'layout',
    title: '设置分组列表（助手配置）',
    summary: '左侧目录 + 右侧 720px 分组卡片，每行"标题 + 说明 + 控件"，像系统设置。',
    preview: () => <LayoutMini><div className="flex w-1/4 flex-col gap-1">{[1, 2, 3, 4].map(i => <Blk key={i} className="h-5" />)}</div><div className="flex flex-1 flex-col gap-1.5"><Blk className="h-12" label="角色与指令" /><Blk className="h-10" label="知识库" /><Blk className="h-10" label="定时任务" /></div></LayoutMini>,
    use: ['个人助手配置：角色与指令、模型、知识库、Skills、定时任务、记忆、协同与权限', '自动保存，用薄荷徽标提示'],
    avoid: ['不要做"保存"按钮弹窗确认'],
    prompt: '助手配置页参考 Codex/系统设置：左侧 220px 目录（选中块弹簧滑动），右侧 720px 内容，按分组展示 glass-2 卡片，每行左侧标题与说明、右侧开关/选择器/时间标签；定时任务行显示青色时间徽标；右上角"已自动保存"。',
    keywords: ['settings grouped list', 'auto save'],
  },
  {
    id: 'layout-bento',
    cat: 'layout',
    title: '概览 KPI（Bento）',
    summary: '一大两小：主 KPI 带流动描边和趋势线，次 KPI 只放数字和一句说明。',
    preview: () => <LayoutMini><Blk className="flex-[1.4]" label="主 KPI" /><Blk className="flex-1" label="次" /><Blk className="flex-1" label="次" /></LayoutMini>,
    use: ['列表页顶部的概览', '数字用 CountUp'],
    avoid: ['不要给每个 KPI 加图标方块', '不要编造虚荣数字'],
    prompt: '列表页顶部放一大两小的 KPI：主卡 1.4 倍宽、流动霓虹描边、40px 数字滚动、同比徽标和发光趋势线；两张次卡只放数字、单位和一句说明。',
    keywords: ['bento KPI', 'hero metric'],
  },

  /* ---------------- 品牌 ---------------- */
  {
    id: 'brand-logo',
    cat: 'brand',
    title: 'Logo',
    summary: '横版中文 Logo，深色主题用白色版，浅色主题用藏青版，通过 --logo 自动切换。',
    preview: () => (
      <div className="flex h-[150px] flex-col justify-center gap-4">
        <div className="logo-mark h-10 w-56" />
        <div className="flex gap-2 text-[11.5px] text-ink-3"><span>/brand-assets/horizontal-zh-white.svg</span><span>/brand-assets/horizontal-zh-navy.svg</span></div>
      </div>
    ),
    code: `<div className="logo-mark h-10 w-56" role="img" aria-label="Raccoon X" />`,
    use: ['Logo 不变，保持原有比例'],
    avoid: ['不要给 Logo 加光效或渐变'],
    prompt: '使用现有 Raccoon X 横版中文 Logo（深色主题白色版、浅色主题藏青版），不改变比例和颜色。',
    keywords: ['brand logo'],
  },
  {
    id: 'brand-raccoon',
    cat: 'brand',
    title: '吉祥物：趴在卡片上的小浣熊',
    summary: '小浣熊在卡片后面探出头和肩，两只爪子搭在卡片上沿，头部轻轻摆动。',
    preview: () => (
      <div className="relative h-[150px] pt-[70px]">
        <img src={raccoonPeek} alt="" className="absolute top-0 right-16 z-0 w-[120px]" />
        <Panel level={3} radius="lg" className="relative z-10 h-20 p-4 text-[13px] text-ink-2">登录卡片</Panel>
      </div>
    ),
    code: `import raccoonPeek from '@/assets/raccoon-peek.png' // 已去掉举起的手，头部完整\n<img src={raccoonPeek} className="absolute -top-[98px] right-10 z-0 w-[184px]" />\n<Paw className="-top-[12px] right-[150px]" />`,
    use: ['登录页、空状态、新手引导这类"欢迎"场景', '身体藏在卡片后面，只露头和肩'],
    avoid: ['不要在工作内容页里放大号吉祥物', '不要裁切头部'],
    prompt: '登录卡片右上方放吉祥物小浣熊：身体藏在卡片后面只露出头和肩，两只深灰色爪子搭在卡片上沿，头部以 6 秒周期轻微摆动。',
    keywords: ['mascot peeking over card', 'brand character'],
  },
  {
    id: 'brand-avatars',
    cat: 'brand',
    title: '助手头像：小浣熊行业表情',
    summary: '104 个行业小浣熊（/raccoon-emoji-v1/），按成员岗位挑选，作为个人助手和 Agent 的头像。',
    preview: () => (
      <div className="grid h-[150px] grid-cols-8 content-center gap-2">
        {['004-programming', '005-data', '007-sales', '006-support', '010-legal', '030-review', '034-meeting', '036-leadership', '042-ai', '009-finance', '011-hr', '026-research', '045-testing', '101-community', '035-project', '028-planning'].map(f => (
          <img key={f} src={asset(`/raccoon-emoji-v1/${f}.webp`)} alt="" className="size-10 rounded-full border border-line bg-glass-2" />
        ))}
      </div>
    ),
    code: `/raccoon-emoji-v1/004-programming.webp  // 研发\n/raccoon-emoji-v1/007-sales.webp        // 销售\n/raccoon-emoji-v1/036-leadership.webp   // 管理`,
    use: ['个人助手头像按主人岗位选', 'Agent 头像按用途选'],
    avoid: ['不要用 emoji 字符代替头像'],
    prompt: '助手和 Agent 的头像使用小浣熊行业表情素材（/raccoon-emoji-v1/*.webp），按岗位或用途挑选，圆形裁切、1px 细边。',
    keywords: ['raccoon avatars', 'role-based avatar'],
  },
]

