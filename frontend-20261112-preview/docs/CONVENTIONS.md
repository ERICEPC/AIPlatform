# 新前端开发约定（模块开发者必读）

## 原则
- **借鉴不复刻**：功能点和接口（路径、字段名）照搬原 RaccoonX 源码（`../frontend/web`，Dify 定制版），交互和信息架构按新前端重新组织。
- **界面上不出现 "Dify" 字样**（含 Marketplace → 「插件市场」、Dify 插件包 → 「插件包」等）。
- **只做前端和接口层**：类型 + 请求函数 + mock。不写业务逻辑；mock 只模拟后端返回（可以是有状态的内存数据，让增删改看得到效果）。
- 文案中文，简洁、具体；按钮写动作（「保存草稿」「发布」），错误说原因和办法。

## 技术栈与目录
React 19 + TypeScript strict + Tailwind v4 + Base UI + motion 12 + @remixicon/react。不新增依赖。
```
src/api/http.ts        request / requestBlob / stream / mockTextStream / mockId / nowIso / API_MODE / KB_APP_URL
src/api/hooks.ts       useQuery(fn, deps, {enabled, pollMs}) / useMutation(fn)
src/api/<module>.ts    模块类型 + 接口函数（每个函数上方 JSDoc 写「METHOD /path」和用途）
src/api/mock/<module>.ts  模块 mock 数据与内存状态
src/pages/<module>/    模块页面（index.tsx 是入口，接收 { param, sub, go, theme }）
docs/api/<module>.md   模块接口清单（页面 → 操作 → 接口 → 请求/响应字段）
```
接口函数写法：
```ts
/** GET /agent/{agent_id} 读取 Agent 详情 */
export const getAgent = (id: string) =>
  request<AgentDetail>({ method: 'GET', path: `/agent/${id}` }, () => db.agentDetail(id))
```
Raccoon KnowledgeBase 接口用 `backend: 'kb'`。全局开关 `VITE_API_MODE=mock|live`（默认 mock）。

## 路由
hash：`#模块/对象/分区`，例如 `#agents`、`#agents/<id>/configure`、`#teams/<id>/logs`、`#integrations/model-provider`、`#kb/<id>`。用 `go('agents/<id>/access')` 跳转。

## 设计系统（必须使用，不写死颜色）
- token：`bg-bg` `text-ink` `text-ink-2` `text-ink-3` `border-line` `border-line-strong` `bg-hover` `bg-press` `bg-solid`；强调 `volt`（主操作/选中/关键数字，上面文字用 `text-volt-ink`；强调文字 `text-volt-text`）、`cyan`（数据/引用/连线）、`mint` 成功、`amber` 进行中/待核对、`rose` 错误；各色有 `-soft` 浅底。
- 材质：`glass-1`（页底板）`glass-2`（卡片）`glass-3`（浮层/输入框）、`glass-edge` 顶部高光、`neon-ring` 流动霓虹描边（一屏最多一个）、`shadow-glow-volt` `shadow-float`、`text-glow-volt` `text-gradient`、`breathe-dot`。
- 圆角：卡片 20–22px、浮层 24–28px、输入框 16px、按钮全圆角胶囊。
- 组件（`@/components/...`）：
  - `ui/button` Button（variant primary/secondary/ghost/ghost-accent/outline，size small/medium/large/icon/icon-small，tone destructive，loading）
  - `ui/segmented` Segmented（选中块弹簧滑动） · `ui/switch` Switch · `ui/tooltip` Tip
  - `ui/primitives` Panel(level 1|2|3, radius md|lg|xl, glow volt) · Badge(tone neutral/volt/cyan/mint/amber/rose, dot) · Avatar(presence, ring) · Progress · Skeleton · EmptyState · Kbd
  - `ui/form` Field(label, hint, error, required, aside) · Input · Textarea · Select · NumberInput
  - `ui/dialog` Dialog(size sm|md|lg|xl, footer) · ConfirmDialog(danger)
  - `ui/drawer` Drawer（右侧抽屉，详情/编辑）
  - `ui/menu` Menu（「⋯」下拉，items 可 danger/disabled/separator）
  - `ui/data` DataTable(columns, rows, onRowClick, loading, empty) · CopyField(mask) · Pager · Stat · ErrorBar
  - `ui/effects` SpotlightCard · Sparkline · CountUp · TypingDots
  - `ui/toast` useToast()(text, 'ok'|'info')
  - `page` Page（页面根，进场动画）· Rise（错峰上浮）· Toolbar（半透明顶栏）
  - `detail-shell` DetailShell（二级左栏：返回 + 身份 + 分区导航）· SectionHeader
- 动效：`@/lib/motion` 的 spring.snappy / smooth / bouncy、ease.out / sheet；只动 transform/opacity；状态切换用 AnimatePresence。
- 每个列表/面板都要有：加载（Skeleton）、空状态（EmptyState，说清下一步）、错误（ErrorBar + 重试）。
- 示例数据要像真的：用现有人名（李鹏程、叶源、周玮、蒋磊、金豫玮）和业务（翼飞客服、售前方案、商机周报……），头像用 `asset('/raccoon-emoji-v1/<编号-名称>.webp')`（`@/lib/asset`，可用文件见 `public/raccoon-emoji-v1/`）。

## 验收
- `cd new-frontend && /Users/taro/local/node/bin/node node_modules/typescript/bin/tsc --noEmit` 通过（只修自己模块的错误）。
- 单文件不超过约 500 行，按分区拆分。
- 不改自己模块以外的文件；缺通用组件就放在自己模块目录里。
