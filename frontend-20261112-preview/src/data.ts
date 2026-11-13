import type { Presence } from '@/components/ui/primitives'
import { asset } from '@/lib/asset'

// 示例数据（人名取自现网截图），只用于效果演示
const emoji = (f: string) => asset(`/raccoon-emoji-v1/${f}.webp`)

export type Assistant = {
  id: string
  owner: string
  role: string
  avatar: string
  presence: Presence
  status: string
}

export const me: Assistant = { id: 'lpc', owner: '李鹏程', role: 'FDE Leader，架构师', avatar: emoji('036-leadership'), presence: 'idle', status: '待你核对 1 项' }

export const teammates: Assistant[] = [
  { id: 'yy', owner: '叶源', role: '智能体开发', avatar: emoji('004-programming'), presence: 'busy', status: '正在做效果评测' },
  { id: 'zw', owner: '周玮', role: '架构师', avatar: emoji('005-data'), presence: 'idle', status: '空闲' },
  { id: 'jl', owner: '蒋磊', role: '销售 Leader，东区', avatar: emoji('007-sales'), presence: 'busy', status: '正在整理报价' },
  { id: 'jyw', owner: '金豫玮', role: 'ISV 生态 Leader', avatar: emoji('101-community'), presence: 'off', status: '离线' },
]

// 协同网络里的委派关系：from 把任务交给 to
export const delegations: { from: string, to: string, task: string }[] = [
  { from: 'lpc', to: 'yy', task: '上线评估' },
  { from: 'lpc', to: 'zw', task: '上线评估' },
  { from: 'yy', to: 'zw', task: '数据统计' },
  { from: 'yy', to: 'lpc', task: '风险核对' },
  { from: 'jl', to: 'lpc', task: '报价核对' },
  { from: 'jl', to: 'jyw', task: '渠道资料' },
]

export const agents = [
  { id: 'yifei-cs', name: '翼飞客服 Agent', kind: '客服问答与工单分流', avatar: emoji('006-support'), desc: '面向翼飞终端用户的售后客服，回答常见问题、创建工单，复杂问题转人工。', status: 'draft', calls: 0, updated: '10 月 27 日', trend: [2, 3, 2, 4, 3, 5, 4] },
  { id: 'biz-opps', name: '商机管理', kind: '销售助理', avatar: emoji('007-sales'), desc: '记录商机、跟进状态和下一步动作，每周五自动整理商机周报。', status: 'live', calls: 1284, updated: '10 月 25 日', trend: [3, 5, 4, 6, 8, 7, 9] },
  { id: 'solution-review', name: '方案评审', kind: 'FDE 交付', avatar: emoji('030-review'), desc: '按 FDE 评审清单逐项检查技术方案，标出风险项和缺失的验收标准。', status: 'live', calls: 412, updated: '10 月 22 日', trend: [4, 4, 5, 3, 6, 5, 7] },
  { id: 'meeting-notes', name: '会议纪要', kind: '办公助理', avatar: emoji('034-meeting'), desc: '读取飞书妙记，整理决议、待办和负责人，同步到项目群。', status: 'live', calls: 2310, updated: '10 月 19 日', trend: [6, 7, 6, 8, 9, 8, 10] },
  { id: 'contract-check', name: '合同条款检查', kind: '法务', avatar: emoji('010-legal'), desc: '对照公司标准条款，标出付款、交付、违约责任中的偏离项。', status: 'draft', calls: 0, updated: '10 月 16 日', trend: [1, 1, 2, 1, 2, 2, 3] },
  { id: 'test', name: 'test', kind: '没有简介', avatar: emoji('045-testing'), desc: '', status: 'draft', calls: 0, updated: '10 月 14 日', trend: [0, 0, 0, 0, 0, 0, 0] },
] as const

export const reviews = [
  { id: 'r1', from: teammates[0], source: '产品开发协作群', title: '上线时间承诺', kind: '对外承诺', time: '10 分钟前', body: '向客户承诺 11 月 20 日灰度上线，首周覆盖 20% 流量；若解决率低于 80%，暂停扩量并回滚到人工客服。' },
  { id: 'r2', from: teammates[2], source: '华东商机推进', title: '报价单第 2 版', kind: '报价', time: '1 小时前', body: '私有化部署报价 128 万元，含一年运维与两次版本升级；付款节点 3-4-3。' },
  { id: 'r3', from: me, source: '定时任务', title: '商机周报草稿', kind: '我的助手', time: '昨天', body: '本周新增商机 6 个，推进到方案阶段 3 个；华东区两家客户进入 POC。发出前请过目。' },
]

export function assistantById(id: string) {
  return id === me.id ? me : teammates.find(t => t.id === id)!
}
