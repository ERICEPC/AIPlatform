/*
  智能体协同 mock 的示例数据：群（成员 = 同事的助手 + Agent）、消息、委派关系。
  产出物见 ./collab-artifacts.ts。成员对象由 ./collab.ts 的 assistantMember / agentMember 组装。
*/
import type { CollabDelegation, CollabGroup, CollabMember, CollabMessage } from '../collab'

const t0 = Math.floor(Date.now() / 1000)
export const ago = (min: number) => t0 - Math.round(min * 60)

/** 成员引用：a=助手、g=Agent；可覆盖状态（例如某个 Agent 正在本群干活） */
export type MemberRef = { kind: CollabMember['kind'], id: string, status?: CollabMember['status'], status_text?: string }
const a = (id: string, status?: MemberRef['status'], status_text?: string): MemberRef => ({ kind: 'assistant', id, status, status_text })
const g = (id: string, status?: MemberRef['status'], status_text?: string): MemberRef => ({ kind: 'agent', id, status, status_text })

export type GroupSeed = Omit<CollabGroup, 'members' | 'last_message' | 'updated_at'> & { members: MemberRef[], delegations: CollabDelegation[] }

/* ---------------- 消息 ---------------- */
export const seedMessages: Record<string, CollabMessage[]> = {
  'g-product': [
    { id: 'm-p1', kind: 'user', author: '李鹏程', created_at: ago(190), content: [{ at: 'yy' }, ' ', { at: 'zw' }, ' 下周三前给翼飞客服 Agent 出一版上线评估，要有效果数据和风险'] },
    {
      id: 'm-p2',
      kind: 'assistant',
      assistant_id: 'yy',
      created_at: ago(186),
      content: ['收到。我负责效果评测，评测集回放交给 ', { at: 'agt-yifei' }, '，数据统计交给 ', { at: 'zw' }, '，风险部分整理好后请李鹏程核对。'],
      card: {
        kind: 'task',
        title: '翼飞客服 Agent 上线评估',
        due: '11 月 11 日截止，还剩 6 天',
        subtasks: [
          { title: '效果评测', assignee_id: 'yy', progress: 62, state: 'running' },
          { title: '评测集回放', assignee_id: 'agt-yifei', progress: 100, state: 'done' },
          { title: '数据统计', assignee_id: 'zw', progress: 100, state: 'done' },
          { title: '风险评估', assignee_id: 'yy', progress: 90, state: 'review' },
        ],
      },
    },
    { id: 'm-p3', kind: 'handoff', from: 'yy', to: 'zw', task: '数据统计', created_at: ago(185) },
    { id: 'm-p3a', kind: 'handoff', from: 'yy', to: 'agt-yifei', task: '评测集回放', created_at: ago(185) },
    {
      id: 'm-p3b',
      kind: 'agent',
      agent_id: 'agt-yifei',
      created_at: ago(120),
      content: ['600 题评测集回放完成，通过率', { em: '87%' }, '；退款与售后类最低（79%），失败用例已标注原因。'],
      card: { kind: 'file', artifact_id: 'a-p4', name: '效果评测集结果.csv', size: '340 KB' },
    },
    {
      id: 'm-p4',
      kind: 'assistant',
      assistant_id: 'zw',
      created_at: ago(72),
      content: ['近 30 天的会话数据拉好了：解决率', { em: '82.4%' }, '，转人工率 11.2%，平均响应 1.8 秒。明细放在项目文件里。'],
      card: { kind: 'file', artifact_id: 'a-p3', name: '近 30 天会话数据明细.xlsx', size: '2.4 MB' },
    },
    {
      id: 'm-p5',
      kind: 'assistant',
      assistant_id: 'yy',
      created_at: ago(10),
      content: ['风险评估初稿好了。其中上线时间要对客户承诺，按规则需要李鹏程确认。'],
      card: { kind: 'review', id: 'rv-p1', label: '对外承诺', text: '向客户承诺 11 月 20 日灰度上线，首周覆盖 20% 流量。', reviewer_id: 'lpc', state: 'pending' },
    },
  ],
  'g-presales': [
    { id: 'm-s1', kind: 'user', author: '蒋磊', created_at: ago(300), content: ['华东城商行要私有化方案。', { at: 'ent-salesbuddy' }, ' 先把客户画像和历史拜访整理出来，', { at: 'lpc' }, ' 周五前出架构初稿，初稿请 ', { at: 'agt-review' }, ' 过一遍'] },
    {
      id: 'm-s2',
      kind: 'agent',
      agent_id: 'ent-salesbuddy',
      created_at: ago(296),
      content: ['客户画像整理好了：资产规模约', { em: '3,200 亿' }, '，近一年拜访 7 次，最关心数据不出行和等保三级。'],
      card: { kind: 'file', artifact_id: 'a-s2', name: '华东城商行客户画像.pdf', size: '1.3 MB' },
    },
    {
      id: 'm-s3',
      kind: 'assistant',
      assistant_id: 'jl',
      created_at: ago(292),
      content: ['任务拆好了，报价单我来出，价格部分最后请李鹏程核对。'],
      card: {
        kind: 'task',
        title: '华东城商行私有化方案',
        due: '11 月 7 日截止，还剩 2 天',
        subtasks: [
          { title: '客户画像', assignee_id: 'ent-salesbuddy', progress: 100, state: 'done' },
          { title: '架构方案初稿', assignee_id: 'lpc', progress: 70, state: 'running' },
          { title: '方案评审', assignee_id: 'agt-review', progress: 40, state: 'running' },
          { title: '报价单', assignee_id: 'jl', progress: 95, state: 'review' },
        ],
      },
    },
    { id: 'm-s4', kind: 'handoff', from: 'lpc', to: 'agt-review', task: '方案评审', created_at: ago(130) },
    {
      id: 'm-s5',
      kind: 'agent',
      agent_id: 'agt-review',
      created_at: ago(110),
      content: ['32 项评审已完成', { em: '26' }, '项，发现 3 个风险：缺少灾备 RTO 指标、GPU 扩容路径不清晰、验收标准未量化。'],
      card: { kind: 'file', artifact_id: 'a-s5', name: '方案评审意见.md', size: '9 KB' },
    },
    {
      id: 'm-s6',
      kind: 'assistant',
      assistant_id: 'jl',
      created_at: ago(60),
      content: ['报价单第 2 版出来了，涉及价格，需要李鹏程核对后再发客户。'],
      card: { kind: 'review', id: 'rv-s1', label: '报价', text: '私有化部署报价 128 万元，含一年运维与两次版本升级；付款节点 3-4-3。', reviewer_id: 'lpc', state: 'pending' },
    },
  ],
  'g-support': [
    {
      id: 'm-c1',
      kind: 'assistant',
      assistant_id: 'zw',
      created_at: ago(60 * 20),
      content: ['昨日翼飞客服数据：会话 3,412 通，解决率', { em: '84.1%' }, '，退款类问题转人工占比最高（37%）。'],
      card: { kind: 'file', artifact_id: 'a-c1', name: '翼飞客服日报 11-04.xlsx', size: '420 KB' },
    },
    { id: 'm-c2', kind: 'user', author: '李鹏程', created_at: ago(60 * 19.5), content: [{ at: 'yy' }, ' 退款类先统一转人工，FAQ 补一下高频问题；', { at: 'ent-servicebuddy' }, ' 按新规则把昨天的退款工单重新分类'] },
    {
      id: 'm-c3',
      kind: 'assistant',
      assistant_id: 'yy',
      created_at: ago(60 * 19),
      content: ['已新增 12 条 FAQ，退款类意图改为直接转人工。'],
      card: { kind: 'review', id: 'rv-c1', label: '服务规则', text: '退款、赔付类问题一律转人工客服，助手不做承诺。', reviewer_id: 'lpc', state: 'confirmed' },
    },
    {
      id: 'm-c4',
      kind: 'agent',
      agent_id: 'ent-servicebuddy',
      created_at: ago(60 * 18),
      content: ['昨日 612 通退款类工单已按新规则重新分类，抽检 50 条，准确率', { em: '94%' }, '；其中 23 条涉及赔付，已标记转人工。'],
      card: { kind: 'file', artifact_id: 'a-c3', name: '退款工单重新分类结果.csv', size: '88 KB' },
    },
  ],
  'g-bank': [
    { id: 'm-b1', kind: 'user', author: '李鹏程', created_at: ago(60 * 26), content: [{ at: 'zw' }, ' 整理一下银行项目的验收清单，下周一和客户过'] },
    {
      id: 'm-b2',
      kind: 'assistant',
      assistant_id: 'zw',
      created_at: ago(60 * 25),
      content: ['清单按功能、性能、安全三部分整理，安全部分请 ', { at: 'yy' }, ' 补渗透测试结果。'],
      card: {
        kind: 'task',
        title: '银行项目验收准备',
        due: '11 月 10 日截止，还剩 5 天',
        subtasks: [
          { title: '功能验收清单', assignee_id: 'zw', progress: 100, state: 'done' },
          { title: '性能压测报告', assignee_id: 'zw', progress: 45, state: 'running' },
          { title: '渗透测试结果', assignee_id: 'yy', progress: 20, state: 'running' },
        ],
      },
    },
    { id: 'm-b3', kind: 'handoff', from: 'zw', to: 'yy', task: '渗透测试结果', created_at: ago(60 * 25) },
    {
      id: 'm-b3a',
      kind: 'agent',
      agent_id: 'ent-projectbuddy',
      created_at: ago(60 * 8),
      content: ['里程碑跟踪：验收准备整体完成', { em: '55%' }, '，渗透测试只有 20%，按当前速度 11 月 10 日有延期风险，建议今天确认测试排期。'],
    },
    { id: 'm-b3b', kind: 'handoff', from: 'ent-projectbuddy', to: 'yy', task: '渗透测试排期', created_at: ago(60 * 8) },
    {
      id: 'm-b4',
      kind: 'assistant',
      assistant_id: 'jyw',
      created_at: ago(60 * 3),
      content: ['ISV 侧接口联调还差两个，建议对客户说明延期。'],
      card: { kind: 'review', id: 'rv-b1', label: '对外承诺', text: '接口联调整体延期到 12 月 5 日完成。', reviewer_id: 'lpc', state: 'rejected' },
    },
    { id: 'm-b5', kind: 'user', author: '李鹏程', created_at: ago(60 * 2.5), content: ['延期不行，', { at: 'jyw' }, ' 先拉 ISV 开个会，看能不能并行联调'] },
  ],
  'g-weekly': [
    {
      id: 'm-w0',
      kind: 'agent',
      agent_id: 'agt-meeting',
      created_at: ago(60 * 31),
      content: ['周会纪要整理好了：决议 4 条、待办 9 条，负责人已逐一 @ 到位。'],
      card: { kind: 'file', artifact_id: 'a-w3', name: '第 45 周周会纪要.md', size: '14 KB' },
    },
    {
      id: 'm-w1',
      kind: 'agent',
      agent_id: 'ent-salesbuddy',
      created_at: ago(60 * 30),
      content: ['本周商机周报草稿：新增商机', { em: '6' }, '个，推进到方案阶段 3 个；华东区两家客户进入 POC。'],
      card: { kind: 'review', id: 'rv-w1', label: '对外发送', text: '发出前请过目：商机周报草稿（本周新增 6 个，方案阶段 3 个）。', reviewer_id: 'lpc', state: 'pending' },
    },
    { id: 'm-w2', kind: 'assistant', assistant_id: 'jl', created_at: ago(60 * 29), content: ['东区补充两条：杭州某物流客户预算已批，宁波制造客户约了下周演示。'] },
  ],
}

/* ---------------- 群 ---------------- */
export const seedGroups: GroupSeed[] = [
  {
    id: 'g-product',
    name: '产品开发协作群',
    icon: 'node',
    description: '翼飞客服 Agent 从评测到上线的协作',
    members: [a('lpc'), a('yy'), a('zw'), a('jl'), g('agt-yifei', 'idle', '评测集回放已完成')],
    running_tasks: 2,
    unread: 0,
    delegations: [
      { from: 'lpc', to: 'yy', task: '上线评估' },
      { from: 'lpc', to: 'zw', task: '上线评估' },
      { from: 'yy', to: 'zw', task: '数据统计' },
      { from: 'yy', to: 'agt-yifei', task: '评测集回放' },
      { from: 'yy', to: 'lpc', task: '风险核对' },
    ],
    created_at: ago(60 * 24 * 20),
  },
  {
    id: 'g-presales',
    name: '售前方案攻坚组',
    icon: 'presales',
    description: '华东城商行私有化方案与报价',
    members: [a('lpc', 'busy', '正在写架构方案'), a('jl'), g('ent-salesbuddy', 'idle', '客户画像已交付'), g('agt-review', 'busy', '正在评审方案')],
    running_tasks: 2,
    unread: 3,
    delegations: [
      { from: 'jl', to: 'ent-salesbuddy', task: '客户画像' },
      { from: 'jl', to: 'lpc', task: '架构方案' },
      { from: 'lpc', to: 'agt-review', task: '方案评审' },
      { from: 'jl', to: 'lpc', task: '报价核对' },
    ],
    created_at: ago(60 * 24 * 9),
  },
  {
    id: 'g-support',
    name: '翼飞客服运营群',
    icon: 'support',
    description: '每日客服数据、FAQ 维护与服务规则',
    members: [a('lpc'), a('yy'), a('zw'), g('ent-servicebuddy', 'busy', '试运行中，正在分类工单')],
    running_tasks: 1,
    unread: 0,
    delegations: [
      { from: 'lpc', to: 'yy', task: 'FAQ 补充' },
      { from: 'lpc', to: 'ent-servicebuddy', task: '工单重新分类' },
      { from: 'zw', to: 'lpc', task: '日报' },
    ],
    created_at: ago(60 * 24 * 40),
  },
  {
    id: 'g-bank',
    name: '银行项目交付群',
    icon: 'bank',
    description: '银行项目验收、联调与对客沟通',
    members: [a('lpc'), a('zw'), a('yy'), a('jyw'), g('ent-projectbuddy', 'busy', '正在跟踪里程碑')],
    running_tasks: 1,
    unread: 5,
    delegations: [
      { from: 'lpc', to: 'zw', task: '验收清单' },
      { from: 'zw', to: 'yy', task: '渗透测试结果' },
      { from: 'lpc', to: 'jyw', task: 'ISV 联调' },
      { from: 'lpc', to: 'ent-projectbuddy', task: '里程碑跟踪' },
      { from: 'ent-projectbuddy', to: 'yy', task: '渗透测试排期' },
    ],
    created_at: ago(60 * 24 * 60),
  },
  {
    id: 'g-weekly',
    name: '周报汇总',
    icon: 'report',
    description: '每周五各区商机与项目进展汇总',
    members: [a('lpc'), a('jl'), a('yy'), a('zw'), a('jyw'), g('ent-salesbuddy'), g('agt-meeting')],
    running_tasks: 0,
    unread: 1,
    delegations: [
      { from: 'lpc', to: 'ent-salesbuddy', task: '商机周报' },
      { from: 'jl', to: 'ent-salesbuddy', task: '东区商机' },
      { from: 'jyw', to: 'lpc', task: '生态进展' },
      { from: 'agt-meeting', to: 'lpc', task: '周会纪要' },
    ],
    created_at: ago(60 * 24 * 90),
  },
]
