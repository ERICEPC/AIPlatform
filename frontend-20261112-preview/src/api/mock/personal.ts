/*
  个人助手配置的演示 mock（仅 VITE_API_MODE=mock 时使用）。
  只模拟配置读写与资源目录，便于离线演示「配置」页与记忆入口；对话、文件与工作区选择仍需连接 Raccoon X 服务端。
*/
import type { PersonalSession, PersonalState, PersonalTurn, Resources } from '../personal'

let state: PersonalState = {
  revision: 3,
  applied_revision: 3,
  config: {
    workspacePath: '',
    name: '李鹏程的助手',
    role: 'FDE Leader 的工作助手，负责方案、评审、周报和跨团队协作。',
    instructions: '先给结论，再给依据；资料不足先提问。涉及报价、对外承诺或发送给客户的内容，先由我核对。',
    provider: 'sensenova',
    model: 'SenseNova-6.8-Flash',
    maxTokens: 8192,
    agents: ['ag-weekly', 'ag-visit-qa'],
    kb: ['kb-gtm'],
    skills: ['sk-word', 'sk-ppt', 'sk-excel'],
    mcps: ['mcp-feishu'],
    collaborationEnabled: true,
    memoryEnabled: true,
    memory: '我负责 FDE 交付中心；对外材料署名写「商汤科技」。',
    executionEnabled: true,
  },
}

const resources: Resources = {
  models: [
    { id: 'SenseNova-6.8-Flash', provider: 'sensenova', name: 'SenseNova-6.8-Flash', available: true },
    { id: 'SenseNova-6.8-Flash-Lite', provider: 'sensenova', name: 'SenseNova-6.8-Flash-Lite', available: true },
    { id: 'deepseek-chat', provider: 'deepseek', name: 'DeepSeek-V3', available: true },
  ],
  agents: [
    { id: 'ag-weekly', name: '周报生成', hint: '销售周报 · 已发布 v2', available: true, version: '2' },
    { id: 'ag-visit-qa', name: '拜访记录质检', hint: '销售拜访 · 已发布 v2', available: true, version: '2' },
    { id: 'ag-opportunity', name: '商机经营建议', hint: '销售商机 · 未发布', available: false },
  ],
  kb: [
    { id: 'kb-gtm', name: 'GTM 弹药库', hint: '产品介绍、方案与案例 · 214 份材料', available: true },
    { id: 'kb-fde', name: 'FDE 交付规范', hint: '交付流程与模板 · 38 份材料', available: true },
  ],
  skills: [
    { id: 'sk-word', name: 'Word 文档', hint: '创建、编辑和分析 Word 文档', available: true },
    { id: 'sk-ppt', name: '演示文稿', hint: '按大纲生成演示文稿', available: true },
    { id: 'sk-excel', name: 'Excel 表格', hint: '读写表格、公式计算', available: true },
    { id: 'sk-research', name: '深度研究', hint: '多轮检索、交叉验证', available: true },
  ],
  mcps: [
    { id: 'mcp-feishu', name: '飞书', hint: '消息、文档、日程与多维表格', available: true },
    { id: 'mcp-crm', name: '商机系统', hint: '只读查询商机与拜访记录', available: true },
  ],
}

export const load = () => state
export const listResources = () => resources
export function save(next: PersonalState) {
  state = { ...next, revision: state.revision + 1 }
  return state
}
export function apply() {
  state = { ...state, applied_revision: state.revision }
  return state
}

/* 演示问答：展示个人 Router 的执行过程（仅 mock 模式） */
const sessions = new Map<string, PersonalSession & { turns: PersonalTurn[] }>()
export const listSessions = () => ({ data: [...sessions.values()].map(({ turns: _t, ...x }) => x).reverse(), has_more: false })
export function getSession(id: string) {
  const s = sessions.get(id)
  if (!s)
    throw new Error('演示模式下没有这段历史对话')
  return { ...s, can_continue: true }
}
export function send(prompt: string, sessionId?: string, newSessionId?: string) {
  const weekly = /周报|拜访/.test(prompt)
  const steps = weekly
    ? [
        { label: '个人 Router：任务需要本机文件 → 桌面端执行', status: 'done' as const, duration: 0.4 },
        { label: '桌面连接器：读取 ~/Work/客户A/拜访记录（3 个文件）', status: 'done' as const, duration: 1.8 },
        { label: '委派专家智能体「周报生成」：按「风险 · 进展 · 下周计划」整理', status: 'done' as const, duration: 6.2 },
        { label: '调用 Skill「演示文稿」：生成 6 页周报 PPT', status: 'done' as const, duration: 9.5 },
        { label: '对外发送需要你确认 → 已生成「待我确认」', status: 'done' as const, duration: 0.2 },
      ]
    : [
        { label: '个人 Router：检索知识库「GTM 弹药库」并保留出处', status: 'done' as const, duration: 1.2 },
        { label: '完成模型回复', status: 'done' as const, duration: 3.1 },
      ]
  const answer = weekly
    ? '本周周报已整理好，按你的习惯**先写风险**：\n\n**风险**\n1. 客户预算有两个口径（需求说明与最新纪要不一致），报价以哪个为准待你确认。\n2. 上线评估缺少评测集，需要补齐后再评估。\n\n**进展**\n- 完成 3 次拜访，需求清单已确认 6 项，2 项待确认。\n\n**下周计划**\n- 周二前补齐评测集；周四提交方案初稿。\n\n已生成 6 页 PPT。发给客户前需要你确认，已放入「待我确认」。'
    : '根据「GTM 弹药库」中的资料整理如下（每条都附出处，可点开核对）。资料中没有找到的内容，我已标为待确认。'
  const id = sessionId ?? newSessionId ?? `demo-${Date.now()}`
  const duration = steps.reduce((s, x) => s + x.duration, 0)
  const artifacts = weekly ? [{ id: 'f1', name: '本周周报.pptx', size: 486000 }] : []
  const prev = sessions.get(id)
  const turns = [...(prev?.turns ?? []), { q: prompt, a: answer, status: 'done', duration, steps, artifacts }]
  sessions.set(id, { session_id: id, title: prev?.title ?? prompt.slice(0, 18), run_state: 'done', revision: turns.length, updated_at: new Date().toISOString(), workspace_path: '~/Work', turns })
  return { answer, sessionId: id, finishReason: 'stop', duration, steps, artifacts }
}
