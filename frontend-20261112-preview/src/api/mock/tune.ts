/* 个人智能体优化 mock（演示数据） */
import type { DesktopState, ExpertLink, PersonalSkill, RouterRule, RouterSettings, RouteTest, TuneOverview } from '../tune'

const iso = (h: number) => new Date(Date.now() - h * 3600000).toISOString()

let rules: RouterRule[] = [
  { id: 'r1', when: '涉及本机文件、文件夹或需要运行命令', target: { type: 'local', name: '桌面连接器 · 默认工作区' }, confirm: false, enabled: true, priority: 1, hits_7d: 46, success_rate: 96 },
  { id: 'r2', when: '问产品、方案、制度、案例等资料', target: { type: 'kb', name: 'GTM 弹药库 · FDE 交付规范' }, confirm: false, enabled: true, priority: 2, hits_7d: 38, success_rate: 91 },
  { id: 'r3', when: '整理周报、拜访记录、会议纪要', target: { type: 'expert', name: '周报生成（专家智能体）' }, confirm: false, enabled: true, priority: 3, hits_7d: 21, success_rate: 93 },
  { id: 'r4', when: '售前方案、报价与合规一起处理', target: { type: 'team', name: '售前方案团队（工作流）' }, confirm: false, enabled: true, priority: 4, hits_7d: 6, success_rate: 88 },
  { id: 'r5', when: '生成 Word、PPT、Excel 文件', target: { type: 'skill', name: 'Word 文档 · 演示文稿 · Excel 表格' }, confirm: false, enabled: true, priority: 5, hits_7d: 17, success_rate: 94 },
  { id: 'r6', when: '对外发送、写入业务系统、涉及报价或承诺', target: { type: 'human', name: '待我确认' }, confirm: true, enabled: true, priority: 0, hits_7d: 9, success_rate: 100 },
]
let settings: RouterSettings = { mode: 'auto', fallback: 'ask', confidence: 0.7, prefer_local_files: true, max_parallel: 3, model_by_task: true, explain_route: true }

export const router = () => ({ rules, settings })
export function saveRouter(b: { rules: RouterRule[], settings: RouterSettings }) {
  rules = b.rules
  settings = b.settings
  return router()
}
export function testRoute(text: string): RouteTest {
  const t = text.trim()
  const steps: RouteTest['steps'] = []
  let matched: string | undefined
  if (/文件|文件夹|目录|本机|命令/.test(t)) {
    steps.push({ target: { type: 'local', name: '桌面连接器 · 默认工作区' }, reason: '任务要读取本机文件，按规则在桌面端执行', where: 'desktop' })
    matched = 'r1'
  }
  if (/方案|产品|案例|制度|资料/.test(t))
    steps.push({ target: { type: 'kb', name: 'GTM 弹药库' }, reason: '需要依据资料，先检索知识库并保留出处', where: 'cloud' })
  if (/周报|拜访|纪要/.test(t)) {
    steps.push({ target: { type: 'expert', name: '周报生成' }, reason: '已发布的专家智能体更稳定，委派给它整理', where: 'cloud' })
    matched ??= 'r3'
  }
  if (/报价|合规|售前/.test(t)) {
    steps.push({ target: { type: 'team', name: '售前方案团队' }, reason: '需要多个角色接力，交给智能体团队，由团长分派', where: 'cloud' })
    matched ??= 'r4'
  }
  if (/PPT|Word|Excel|文档|表格|演示/.test(t))
    steps.push({ target: { type: 'skill', name: '演示文稿 / Word 文档' }, reason: '需要生成文件，调用办公 Skill', where: 'cloud' })
  if (/发给|发送|客户|对外|写入/.test(t))
    steps.push({ target: { type: 'human', name: '待我确认' }, reason: '对外发送前必须由你确认', where: 'human' })
  if (!steps.length)
    steps.push({ target: { type: 'cloud', name: '个人助手（云端）' }, reason: '没有命中规则，由助手直接处理；把握不足时先向你提问', where: 'cloud' })
  return { confidence: steps.length > 1 ? 0.86 : 0.74, steps, matched_rule: matched }
}

export const skills: PersonalSkill[] = [
  { id: 'sk-word', name: 'Word 文档', desc: '创建、编辑和分析 Word 文档', source: 'native', version: '1.4', enabled: true, uses_30d: 42, success: 95, last_used: iso(3) },
  { id: 'sk-ppt', name: '演示文稿', desc: '按大纲生成演示文稿，检查版式', source: 'native', version: '2.1', enabled: true, uses_30d: 28, success: 89, last_used: iso(20), note: '3 次生成了大纲但没有文件，检查依赖' },
  { id: 'sk-excel', name: 'Excel 表格', desc: '读写表格、公式计算', source: 'native', version: '1.2', enabled: true, uses_30d: 19, success: 97, last_used: iso(30) },
  { id: 'sk-weekly', name: '周报三段式', desc: '进展 · 风险 · 下周计划，风险在前', source: 'memory', version: '0.9', enabled: true, uses_30d: 14, success: 100, last_used: iso(50), note: '由记忆「周报先写风险」沉淀' },
  { id: 'sk-eval', name: '上线评估检查', desc: '评测集回放 → 效果数据 → 风险评估', source: 'memory', version: '草稿', enabled: false, uses_30d: 0, success: 0, last_used: '', note: '记忆体检建议生成，待你检查后启用' },
  { id: 'sk-research', name: '深度研究', desc: '多轮检索、交叉验证、带出处', source: 'org', version: '1.0', enabled: true, uses_30d: 6, success: 83, last_used: iso(72) },
]
export const experts: ExpertLink[] = [
  { id: 'ex-weekly', name: '周报生成', desc: '把一周记录整理成可核对的周报', kind: 'org', owner: '销售管理业务', status: 'published', enabled: true, calls_30d: 21, success: 93, avg_latency: 18 },
  { id: 'ex-visit', name: '拜访记录质检', desc: '检查拜访记录完整性与下一步', kind: 'org', owner: '销售管理业务', status: 'published', enabled: true, calls_30d: 12, success: 91, avg_latency: 11 },
  { id: 'ex-eval', name: '上线评估助手', desc: '按检查清单出上线评估报告', kind: 'personal', owner: '我', status: 'reviewing', enabled: false, calls_30d: 0, success: 0, avg_latency: 0, issue: '发布审批中，通过后才能被他人调用' },
  { id: 'ex-quote', name: '报价测算', desc: '按资源清单测算报价', kind: 'org', owner: '售前方案团队', status: 'published', enabled: true, calls_30d: 7, success: 71, avg_latency: 42, issue: '近 30 天 2 次因缺部署方式失败，建议在委派时带上需求清单' },
  { id: 'ex-draft', name: '方案初稿（个人）', desc: '我的方案写作习惯', kind: 'personal', owner: '我', status: 'draft', enabled: true, calls_30d: 9, success: 88, avg_latency: 26 },
]
export function toggle<T extends { id: string, enabled: boolean }>(list: T[], id: string, enabled: boolean) {
  const x = list.find(i => i.id === id)
  if (!x)
    throw new Error('不存在或已删除')
  x.enabled = enabled
  return x
}

let desk: DesktopState = {
  connectors: [
    { id: 'c1', device: '办公笔记本（MacBook Pro）', os: 'macOS 15', status: 'online', last_seen: iso(0.02), workspace: '~/Work/Projects', version: '0.9.6', allowed: ['读写工作区文件', '运行已登记命令', '打开本机应用'] },
    { id: 'c2', device: '家用台式机', os: 'Windows 11', status: 'offline', last_seen: iso(52), workspace: 'D:\\Work', version: '0.9.4', allowed: ['读写工作区文件'] },
  ],
  cloud: { workers: 4, running: 2, queued: 0, region: '上海' },
  split_7d: { desktop: 46, cloud: 112, human: 9 },
  settings: { prefer_local_files: true, sync_artifacts: true, offline_queue: true, command_policy: 'deny_by_default' },
}
export const desktop = () => desk
export function saveDesktop(s: DesktopState['settings']) {
  desk = { ...desk, settings: s }
  return desk
}

export function draftTeam(text: string, agents: { id: string, name: string, description: string }[]) {
  const lead = agents.find(a => /协调/.test(a.name)) ?? agents[0]
  const pool = agents.filter(a => a.id !== lead?.id && !/协调/.test(a.name))
  const words = text.split(/[，,、。\s]+/).filter(Boolean)
  const picked = pool.filter(a => words.some(w => w.length > 1 && (a.name.includes(w.slice(0, 2)) || a.description.includes(w.slice(0, 2))))).slice(0, 4)
  const members = (picked.length ? picked : pool.slice(0, 3)).map(a => ({ agent_id: a.id, responsibility: a.description }))
  return { leader_id: lead?.id ?? '', members, goal: text, output: '按「结论 · 依据 · 待确认」输出；对外内容只出草稿。', name: `${text.slice(0, 8)}团队`, reason: `按任务关键词挑选了 ${members.length} 位成员；Leader 选用「${lead?.name ?? '—'}」负责拆解与汇总。` }
}

export const overview = (): TuneOverview => ({
  route_accuracy: 92, memory_score: 81, skills_active: skills.filter(s => s.enabled).length, experts_active: experts.filter(e => e.enabled).length,
  desktop_online: desk.connectors.some(c => c.status === 'online'), tasks_7d: 167, human_rate: 5.4, trend: [84, 86, 85, 88, 90, 91, 92],
  tips: [
    { id: 't1', title: '3 条候选记忆等你确认', detail: '确认前不会被任何助手使用。', to: 'tune/memory' },
    { id: 't2', title: '「上线评估检查」可以沉淀为 Skill', detail: '该做法 21 天用了 18 次、没有被纠正。', to: 'tune/skills' },
    { id: 't3', title: '「报价测算」委派成功率偏低', detail: '委派时带上需求清单，可减少失败。', to: 'tune/experts' },
    { id: 't4', title: '家用台式机连接器已离线 2 天', detail: '离线时需要本机的步骤会排队等待。', to: 'tune/desktop' },
  ],
})
