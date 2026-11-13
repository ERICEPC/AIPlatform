/* 技术栈（用户端）mock（演示数据） */
import type { BuddyApp, DataResource, ModelDefaults, MonitorData, Template } from '../stack'
import { ApiError } from '../http'
import { components } from './admin'

const iso = (h: number) => new Date(Date.now() - h * 3600000).toISOString()

export const status = () => ({ data: components().data.map(c => ({ id: c.id, name: c.name, product: c.product, category: c.category, status: c.status, user_side: c.user_side })) })

let dataList: DataResource[] = [
  { id: 'd1', kind: 'schema', name: 'sales_growth', space: '销售管理', purpose: '业绩增长带教应用的业务表', owner: '叶源', usage: 1.4, quota: 5, unit: 'GB', status: 'ok', objects: [{ name: 'coach_plan', detail: '带教计划 · 1,284 行' }, { name: 'visit_review', detail: '拜访复盘 · 6,930 行' }, { name: 'battle_map', detail: '作战地图 · 312 行' }], access: [{ label: '连接方式', value: '平台签发的应用凭据（在应用运行时注入）' }, { label: 'Schema', value: 'biz_sales_growth' }, { label: '权限', value: '读写本 schema；不能访问其他业务' }] },
  { id: 'd2', kind: 'vector', name: 'fde_kb', space: 'FDE 交付', purpose: 'FDE 交付规范知识库的向量索引', owner: '周玮', usage: 0.6, quota: 2, unit: 'GB', status: 'ok', objects: [{ name: '索引', detail: '38 份材料 · 4,120 个切片 · 已完成' }], access: [{ label: '使用方式', value: '通过知识库接口检索，不直接连接' }] },
  { id: 'd3', kind: 'bucket', name: 'raccoonx/fde/deliverables', space: 'FDE 交付', purpose: '交付物与导出包', owner: '叶源', usage: 12.3, quota: 50, unit: 'GB', status: 'ok', objects: [{ name: 'B020/', detail: '86 个文件' }, { name: 'exports/', detail: '12 个文件' }], access: [{ label: '使用方式', value: '平台签发的临时访问地址（15 分钟有效）' }] },
  { id: 'd4', kind: 'cache', name: '会话与热记忆', space: '个人', purpose: '个人助手会话上下文（热数据，72 小时后转存为长期记忆）', owner: '我', usage: 38, quota: 200, unit: 'MB', status: 'ok', objects: [{ name: '活跃会话', detail: '6 个' }], access: [{ label: '使用方式', value: '平台自动管理' }] },
]
export const data = () => ({ data: dataList })
export function createData(b: { kind: DataResource['kind'], name: string, space: string, purpose: string }) {
  if (!/^[a-z][a-z0-9_/]{2,40}$/.test(b.name))
    throw new ApiError('名称只能用小写字母、数字、下划线和斜杠，3–40 个字符', 400)
  const r: DataResource = { id: `d${Date.now()}`, kind: b.kind, name: b.name, space: b.space, purpose: b.purpose, owner: '我', usage: 0, quota: b.kind === 'schema' ? 5 : 10, unit: 'GB', status: 'ok', objects: [], access: [{ label: '状态', value: '已在业务空间配额内创建' }] }
  dataList = [...dataList, r]
  return r
}

let defaults: ModelDefaults = { chat: 'SenseNova-6.8-Flash', light: 'SenseNova-6.8-Flash-Lite', reasoning: 'deepseek-reasoner', by_task: true }
export const models = () => ({
  models: [
    { id: 'SenseNova-6.8-Flash', name: 'SenseNova-6.8-Flash', kind: 'chat' as const, provider: '商汤日日新', available: true, note: '默认对话与智能体' },
    { id: 'SenseNova-6.8-Flash-Lite', name: 'SenseNova-6.8-Flash-Lite', kind: 'light' as const, provider: '商汤日日新', available: true, note: '分类、抽取、改写等轻任务' },
    { id: 'deepseek-reasoner', name: 'DeepSeek-R1', kind: 'reasoning' as const, provider: '深度求索', available: true, note: '复杂推理' },
    { id: 'deepseek-chat', name: 'DeepSeek-V3', kind: 'chat' as const, provider: '深度求索', available: true, note: '' },
    { id: 'embedding-default', name: '向量化模型', kind: 'embedding' as const, provider: '平台默认', available: true, note: '知识库与记忆' },
    { id: 'rerank-default', name: '重排序模型', kind: 'rerank' as const, provider: '平台默认', available: true, note: '检索重排序' },
  ],
  quotas: [
    { space: '销售管理', monthly: 5000, used: 3120, unit: '万 Token', by_object: [{ name: '拜访纪要整理', used: 1180 }, { name: '周报生成', used: 940 }, { name: '业绩增长带教', used: 610 }, { name: '其他', used: 390 }] },
    { space: '个人', monthly: 800, used: 412, unit: '万 Token', by_object: [{ name: '个人助手', used: 356 }, { name: '我的智能体（调试）', used: 56 }] },
  ],
  defaults,
})
export function saveDefaults(d: ModelDefaults) {
  defaults = d
  return { defaults }
}

let apps: BuddyApp[] = [
  { id: 'app-growth', name: '业绩增长带教', base: 'SalesBuddy', space: '销售管理', owner: '叶源', framework: '4.3', latest: '4.3', parts: ['带教（coach）', '管理（manager）', '知识（knowledge）'], capabilities: ['智能体', '知识库', '记忆'], build: 'ok', deploy_url: 'https://growth.example.internal', via: 'ProjectBuddy', release: 'pending', updated_at: iso(40) },
  { id: 'app-kefu', name: '客服坐席台', base: '客服小浣熊', space: '客服中心', owner: '周玮', framework: '4.1', latest: '4.3', parts: ['来电', '工单', '知识'], capabilities: ['智能体', '知识库', '智能体团队'], build: 'warn', deploy_url: 'https://kefu-desk.example.internal', via: 'CLI', release: 'approved', updated_at: iso(200) },
  { id: 'app-delivery', name: '交付看板', base: 'ProjectBuddy', space: 'FDE 交付', owner: '叶源', framework: '4.3', latest: '4.3', parts: ['项目', '任务', '交付物'], capabilities: ['智能体', '记忆', '数据库与存储'], build: 'ok', deploy_url: '本地开发中', via: 'ProjectBuddy', release: 'draft', updated_at: iso(6) },
]
export const accelerator = () => ({
  version: '4.3',
  layers: [
    { area: '外框与导航', path: 'client/src/shell/', desc: '侧栏、顶栏、面包屑、按角色隐藏菜单' },
    { area: '登录与会话', path: 'client/src/auth/', desc: '统一身份登录；401 先保存编辑中的内容再退出' },
    { area: '请求层', path: 'contract/client.ts', desc: '错误体统一、超时、幂等键；网络中断返回「结果待核对」' },
    { area: '写操作钩子', path: 'client/src/api/hooks.ts', desc: '成功后刷新相关查询；409 版本冲突保留输入' },
    { area: '组件与样式', path: 'client/src/ui/ · styles/', desc: '页面头、筛选栏、三态视图、表单；颜色只用变量' },
    { area: '参考后端', path: 'server/', desc: '零依赖 Node：路由、错误格式、幂等重放、按角色的可见范围' },
  ],
  apps,
  sdk: [
    { name: '个人助手入口', desc: '在业务页面里唤起个人助手，带上当前客户、商机、项目等上下文' },
    { name: '专家智能体目录', desc: '按名称发现并调用已发布的专家智能体，结构化输入输出' },
    { name: '知识库检索', desc: '带出处的检索与问答，按调用者权限过滤' },
    { name: '记忆服务', desc: '读写经确认的个人与团队记忆，分层隔离' },
    { name: '智能体团队', desc: '提交任务、读取执行轨迹，在业务页面里展示对话窗口' },
    { name: '权限与审计', desc: '统一身份映射到平台权限，调用全程留痕' },
  ],
})
export function syncApp(id: string) {
  const a = apps.find(x => x.id === id)
  if (!a)
    throw new ApiError('应用不存在', 404)
  a.framework = a.latest
  a.build = 'ok'
  return a
}

const tpl: Template[] = ([
  { id: 'buddy-app', kind: 'buddy-app', name: 'Buddy 业务应用', desc: '基于 Buddy 加速器的完整前端 ＋ 参考后端，接入 X 平台能力；适合用 ProjectBuddy 开发 SalesBuddy 这类业务应用。', files: ['client/', 'contract/', 'server/', 'BUDDY.md'], fields: [{ key: 'slug', label: '工程名', placeholder: 'sales-coach' }, { key: 'name', label: '中文名', placeholder: '销售带教' }, { key: 'space', label: '业务空间', placeholder: '销售管理' }, { key: 'parts', label: '业务部分', placeholder: 'coach,manager,knowledge' }] },
  { id: 'expert-agent', kind: 'expert-agent', name: '专家智能体', desc: '提示词、输入输出结构、测试样例与发布说明的标准目录。', files: ['agent.yaml', 'prompt.md', 'samples/', 'README.md'], fields: [{ key: 'name', label: '名称', placeholder: '报价测算' }, { key: 'role', label: '职责', placeholder: '按资源清单测算报价' }] },
  { id: 'skill', kind: 'skill', name: 'Skill 包', desc: 'SKILL.md、脚本与资源；可安装到个人助手或智能体。', files: ['SKILL.md', 'scripts/', 'assets/'], fields: [{ key: 'name', label: '名称', placeholder: '上线评估检查' }] },
  { id: 'mcp-service', kind: 'mcp-service', name: 'MCP 服务', desc: 'Streamable HTTP 的 MCP 服务模板，含鉴权与审计埋点。', files: ['server.ts', 'tools/', 'Dockerfile'], fields: [{ key: 'name', label: '服务名', placeholder: 'crm-readonly' }, { key: 'system', label: '对接系统', placeholder: '商机系统' }] },
  { id: 'workflow-team', kind: 'workflow-team', name: '智能体团队', desc: 'Leader、成员、团队 Router 与 Leader 记忆的初始配置。', files: ['team.yaml', 'leader/skills/', 'samples/'], fields: [{ key: 'name', label: '团队名', placeholder: '售前方案团队' }, { key: 'members', label: '成员', placeholder: '需求分析,方案撰写,报价测算' }] },
] as Template[]).map((t, i) => ({ ...t, version: ['v3.2', 'v2.1', 'v1.0', 'v1.2', 'v1.4'][i] ?? 'v1.0', available_in_projectbuddy: t.id !== 'skill', used_by: [3, 2, 4, 2, 1][i] ?? 0 }))
export const templates = () => ({ data: tpl, cli: '@raccoonx/create-buddy' })
export function updateTemplate(id: string, b: { available_in_projectbuddy: boolean }) {
  const t = tpl.find(x => x.id === id)
  if (!t)
    throw new ApiError('模板不存在', 404)
  t.available_in_projectbuddy = b.available_in_projectbuddy
  return t
}
export function generate(b: { template: string, values: Record<string, string> }) {
  const t = tpl.find(x => x.id === b.template)
  if (!t)
    throw new ApiError('模板不存在', 404)
  const name = b.values.slug || b.values.name || 'my-project'
  return {
    command: `npx @raccoonx/create-buddy@1.2 --template ${t.id} --config ./${name}.json --out ./${name}`,
    config: JSON.stringify({ template: t.id, ...b.values, platform: { api_base: '/console/api', space: b.values.space || '' } }, null, 2),
    files: t.files.map(f => `${name}/${f}`),
  }
}

export function monitor(period: '24h' | '7d' | '30d'): MonitorData {
  const k = { '24h': 0.14, '7d': 1, '30d': 4.2 }[period]
  const n = (x: number) => Math.round(x * k)
  return {
    period: { '24h': '近 24 小时', '7d': '近 7 天', '30d': '近 30 天' }[period],
    calls: n(6840), success: 96.2, p95_ms: 4200, tokens: n(1460),
    by_source: [{ name: 'SalesBuddy', calls: n(3920) }, { name: 'ProjectBuddy', calls: n(1180) }, { name: 'Web 对话', calls: n(860) }, { name: '后端 API', calls: n(520) }, { name: '飞书', calls: n(360) }],
    by_object: [
      { name: '拜访纪要整理', kind: '智能体', calls: n(2810), success: 97, p95_ms: 3800 },
      { name: '周报生成', kind: '智能体', calls: n(1260), success: 98, p95_ms: 5200 },
      { name: '售前方案团队', kind: '智能体团队', calls: n(86), success: 94, p95_ms: 96000, last_error: '报价测算超时（1 次）' },
      { name: 'GTM 弹药库', kind: '知识库', calls: n(2210), success: 99, p95_ms: 900 },
      { name: '业绩增长带教', kind: 'Buddy 应用', calls: n(474), success: 92, p95_ms: 2600, last_error: '记忆接口 403：应用未获开放「记忆」能力' },
    ],
    daily: [820, 940, 1010, 990, 1120, 1040, 920],
    errors: [
      { time: iso(3), object: '业绩增长带教', source: 'SalesBuddy', message: '记忆接口 403：应用未获开放「记忆」能力，请业务管理员在应用接入里开放' },
      { time: iso(9), object: '售前方案团队', source: 'Web 对话', message: '报价测算超时 120 秒，Leader 已按规则退回需求分析补充' },
      { time: iso(30), object: '拜访纪要整理', source: '飞书', message: '渠道回调签名不一致（已自动重试成功）' },
    ],
  }
}
