/*
  待我确认（人机决策交接入口）接口层。依据《产品介绍与使用指南》9.5：
  智能体遇到信息不足、证据冲突、超出职责或权限、必须由人判断的事项，整理成确认事项交给有权限的人，
  而不是自行猜测或把任务标为完成。确认只授权该事项；「已确认」不等于「已执行成功」，执行状态单独显示。
*/
import { request } from './http'

export type InboxType = 'decision' | 'memory' | 'release' | 'handoff'
export type InboxState = 'pending' | 'confirmed' | 'returned' | 'cancelled' | 'expired'
export type ExecState = 'waiting' | 'running' | 'succeeded' | 'failed'
export type InboxItem = {
  id: string
  type: InboxType
  title: string
  from: string
  source: string
  created_at: string
  due: string
  question: string
  why_blocked: string
  evidence: { label: string, ref: string }[]
  options: { id: string, label: string, impact: string, recommended?: boolean }[]
  after_confirm: string
  state: InboxState
  exec: ExecState
  link?: string
}
export type InboxAction = 'confirm' | 'confirm_edit' | 'supplement' | 'return' | 'transfer'

const now = Date.now()
const t = (h: number) => new Date(now - h * 3600000).toISOString()
let items: InboxItem[] = [
  { id: 'ib-1', type: 'decision', title: '客户预算有两个版本，方案按哪个报价', from: '叶源的助手', source: '售前方案攻坚组 · 报价单第 2 版', created_at: t(1.2), due: '今天 18:00', question: '客户材料里出现了需求说明和最新纪要两个预算口径，报价测算需要以哪一个为准？', why_blocked: '两个来源都来自客户，助手不能自行判断哪个有效；报价会写进对外方案。', evidence: [{ label: '客户需求说明 v2 · 第 3 页', ref: 'kb' }, { label: '10/30 会议纪要 · 第 2 段', ref: 'kb' }], options: [{ id: 'a', label: '以最新纪要的预算为准', impact: '方案保留私有化部署与两期实施', recommended: true }, { id: 'b', label: '以需求说明的预算为准', impact: '方案改为一期实施，部分模块列为可选' }], after_confirm: '报价测算按所选口径继续，方案正文的报价概要同步更新；对外发送仍需你再确认一次。', state: 'pending', exec: 'waiting', link: 'collab' },
  { id: 'ib-2', type: 'handoff', title: '两位专家结论冲突：是否存在数据出境风险', from: '售前协调者（团长）', source: '智能体团队 · 售前方案团队', created_at: t(3.5), due: '明天 12:00', question: '合规检查认为存在数据出境风险，方案撰写认为部署在境内不涉及。以哪条为准？', why_blocked: '专家结论冲突，团长不能代替负责人判断。', evidence: [{ label: '合规检查结果 · 运行 #86', ref: 'teams' }, { label: '方案撰写结果 · 运行 #86', ref: 'teams' }], options: [{ id: 'a', label: '按存在风险处理', impact: '方案补充数据不出境的部署说明' }, { id: 'b', label: '按不涉及处理', impact: '保持当前方案' }], after_confirm: '团长按你的决定继续汇总，并把这次判断记为团队复盘依据。', state: 'pending', exec: 'waiting', link: 'teams/presales/chat' },
  { id: 'ib-3', type: 'memory', title: '一条经验适合分享给团队吗', from: '记忆体检', source: '个人智能体优化 · 记忆', created_at: t(6), due: '本周', question: '「上线评估先跑评测集回放」近 21 天被使用 18 次，是否分享到「FDE 交付中心」团队记忆？', why_blocked: '个人记忆默认私有，分享需要本人决定。', evidence: [{ label: '使用记录 · 18 次', ref: 'tune/memory' }], options: [{ id: 'a', label: '提交分享（进入团队审查）', impact: '审查通过后团队成员的助手可检索', recommended: true }, { id: 'b', label: '保持私有', impact: '不变' }], after_confirm: '生成去除个人信息的团队候选，交给团队维护人审查。', state: 'pending', exec: 'waiting', link: 'tune/memory' },
  { id: 'ib-4', type: 'release', title: '「拜访纪要整理」发布申请被退回', from: '蒋磊（普通管理员）', source: '我的发布', created_at: t(20), due: '—', question: '审批意见：请补充三条真实样例的测试结果，并把可见范围从「组织内」改为「北区东区」。', why_blocked: '发布需要管理员审批通过才能对其他用户可见。', evidence: [{ label: '发布申请 RQ-2026-1107-03', ref: 'releases' }], options: [{ id: 'a', label: '修改后重新提交', impact: '回到发布申请继续编辑', recommended: true }], after_confirm: '打开发布申请，补充后重新提交审批。', state: 'pending', exec: 'waiting', link: 'releases' },
  { id: 'ib-5', type: 'decision', title: '会议纪要没有明确负责人', from: '个人助手', source: '个人助手 · 周会纪要整理', created_at: t(30), due: '—', question: '第 3 项行动「补齐评测集」没有写负责人，是否指派给智能体开发？', why_blocked: '负责人与日期不能推断。', evidence: [{ label: '11/06 周会录音转写', ref: 'assistant' }], options: [{ id: 'a', label: '指派给智能体开发', impact: '写入待办并通知' }], after_confirm: '写入纪要并同步到协作群。', state: 'confirmed', exec: 'succeeded' },
]

/** GET /inbox 待我确认事项（type、state 可选） */
export const listInbox = (q: { type?: InboxType | '', state?: 'pending' | 'done' } = {}) =>
  request<{ data: InboxItem[] }>({ method: 'GET', path: '/inbox', query: q }, () => ({ data: items.filter(i => (!q.type || i.type === q.type) && (!q.state || (q.state === 'pending' ? i.state === 'pending' : i.state !== 'pending'))) }))
/** POST /inbox/{id}/actions 确认 / 修改后确认 / 补充信息 / 退回 / 转交（一次确认只授权该事项，重复提交幂等） */
export const actInbox = (id: string, b: { action: InboxAction, option?: string, comment?: string, transfer_to?: string }) =>
  request<InboxItem>({ method: 'POST', path: `/inbox/${id}/actions`, body: b }, () => {
    const it = items.find(i => i.id === id)
    if (!it)
      throw new Error('事项不存在或已处理')
    const state: InboxState = b.action === 'return' ? 'returned' : b.action === 'transfer' || b.action === 'supplement' ? 'pending' : 'confirmed'
    Object.assign(it, { state, exec: state === 'confirmed' ? 'running' : it.exec })
    if (b.action === 'transfer')
      items = items.filter(i => i.id !== id)
    return it
  })

export const INBOX_TYPE: Record<InboxType, string> = { decision: '业务决策', handoff: '团队协作', memory: '记忆', release: '发布' }
export const INBOX_STATE: Record<InboxState, [string, 'amber' | 'mint' | 'rose' | 'neutral']> = { pending: ['待处理', 'amber'], confirmed: ['已确认', 'mint'], returned: ['已退回', 'rose'], cancelled: ['已取消', 'neutral'], expired: ['已过期', 'neutral'] }
export const EXEC_STATE: Record<ExecState, string> = { waiting: '待执行', running: '执行中', succeeded: '执行成功', failed: '执行失败' }
