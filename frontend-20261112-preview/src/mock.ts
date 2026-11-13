import { asset } from '@/lib/asset'

// 平台能力页的示例数据：只为体验交互，不代表真实业务
const emoji = (f: string) => asset(`/raccoon-emoji-v1/${f}.webp`)

/* ---------- Agent 详情 ---------- */
export const agentPrompts: Record<string, string> = {
  'yifei-cs': '你是翼飞终端的售后客服。先确认用户的设备型号和问题现象，再从知识库里找处理办法。能自助解决的给出分步操作；涉及维修、退换货的创建工单并告知时效；用户情绪激动或问题超出知识库时转人工。',
  'biz-opps': '你是销售助理。记录用户口述的商机信息（客户、预算、阶段、下一步），缺失字段要追问。每周五 17:00 汇总本周新增和推进的商机，按阶段分组生成周报草稿，发出前交给负责人核对。',
  'solution-review': '你是 FDE 方案评审员。按评审清单逐项检查：业务目标、数据来源、模型选型、上线标准、回滚方案、成本估算。每一项给出「通过 / 有风险 / 缺失」和理由，最后列出必须补充的内容。',
  'meeting-notes': '读取飞书妙记全文，整理成：会议结论、待办（负责人 + 截止时间）、未决问题。待办同步到项目群并 @ 负责人。',
  'contract-check': '对照公司标准合同模板，检查付款节点、交付验收、违约责任、知识产权、保密条款。标出偏离标准的条款，说明风险等级和建议改法。',
  'test': '',
}

export const agentReplies: Record<string, string[]> = {
  'yifei-cs': ['您好，我是翼飞售后小助手。请问您用的是哪个型号？比如「翼飞 X3」或「翼飞 Pro」。', '收到。X3 无法开机通常是电量耗尽或系统卡死：1）先充电 30 分钟；2）长按电源键 15 秒强制重启。如果还是不行，我帮您创建维修工单，预计 2 个工作日内联系您。'],
  'biz-opps': ['好的，记下了。这个商机的预算大概是多少？现在处在哪个阶段（线索 / 需求确认 / 方案 / 商务）？', '已记录：华东某银行，预算 120 万，方案阶段，下一步是 11 月 8 日的方案汇报。周五的周报会包含这一条。'],
  'solution-review': ['请把方案文档发给我，或者直接贴出关键章节。', '初步检查完成：业务目标、模型选型通过；上线标准有风险（没写解决率阈值）；回滚方案缺失。建议补充灰度比例和回滚触发条件。'],
  'meeting-notes': ['请提供妙记链接，我来整理结论和待办。', '整理好了：结论 3 条，待办 5 条（已识别负责人 4 位），未决问题 1 个。需要我现在同步到项目群吗？'],
  'contract-check': ['请上传合同文件或粘贴条款。', '发现 2 处偏离：付款节点为 5-5（标准为 3-4-3），违约金上限缺失。风险等级：中。建议改为 3-4-3 并补充违约金不超过合同总额 20%。'],
  'test': ['（这个 Agent 还没有配置指令）'],
}

export const agentRuns = [
  { id: 'run-4821', user: '叶源', input: '翼飞 X3 无法开机怎么办', status: 'ok', latency: 1.6, tokens: 812, time: '今天 11:42' },
  { id: 'run-4820', user: '周玮', input: '帮我查一下工单 #20931 的进度', status: 'ok', latency: 2.1, tokens: 1034, time: '今天 11:20' },
  { id: 'run-4819', user: '访客', input: '退货需要多久到账', status: 'handoff', latency: 1.9, tokens: 655, time: '今天 10:58' },
  { id: 'run-4818', user: '访客', input: '你们客服电话是多少', status: 'ok', latency: 1.2, tokens: 402, time: '今天 10:31' },
  { id: 'run-4817', user: '蒋磊', input: '批量导入 300 条历史工单', status: 'error', latency: 8.4, tokens: 0, time: '昨天 18:05' },
]

/* ---------- Agent Teams ---------- */
export type TeamMember = { id: string, name: string, role: string, avatar: string, output: string }

export const teams = [
  {
    id: 'presales',
    name: '售前方案团队',
    desc: '从客户需求出发，自动完成需求梳理、方案撰写、报价测算和合规检查，最后交给销售负责人核对。',
    runs: 86,
    success: 94,
    updated: '今天',
    lead: { name: '协调者', avatar: emoji('028-planning') },
    members: [
      { id: 'm1', name: '需求分析', role: '把客户材料整理成结构化需求', avatar: emoji('026-research'), output: '识别出 6 项核心需求，2 项待确认' },
      { id: 'm2', name: '方案撰写', role: '按 FDE 模板撰写技术方案', avatar: emoji('033-writing'), output: '生成方案初稿 12 页' },
      { id: 'm3', name: '报价测算', role: '按资源清单测算报价', avatar: emoji('061-accounting'), output: '私有化部署报价 128 万元' },
      { id: 'm4', name: '合规检查', role: '检查数据安全和合同条款', avatar: emoji('010-legal'), output: '发现 1 处数据出境风险，已标注' },
    ] as TeamMember[],
  },
  {
    id: 'cs-escalation',
    name: '客服升级处理',
    desc: '一线客服 Agent 处理不了的问题自动升级：诊断、查工单历史、给出处理建议并通知值班同事。',
    runs: 312,
    success: 89,
    updated: '昨天',
    lead: { name: '协调者', avatar: emoji('006-support') },
    members: [
      { id: 'c1', name: '问题诊断', role: '判断问题类型和紧急程度', avatar: emoji('039-quality'), output: '判定为硬件故障，紧急程度：高' },
      { id: 'c2', name: '工单检索', role: '查询该用户的历史工单', avatar: emoji('043-database'), output: '找到 2 条相关历史工单' },
      { id: 'c3', name: '值班通知', role: '通知值班工程师并同步上下文', avatar: emoji('034-meeting'), output: '已通知值班工程师周玮' },
    ] as TeamMember[],
  },
  {
    id: 'weekly',
    name: '周报汇总团队',
    desc: '每周五收集各成员助手的工作记录，按项目汇总进展、风险和下周计划，生成团队周报。',
    runs: 24,
    success: 100,
    updated: '上周五',
    lead: { name: '协调者', avatar: emoji('035-project') },
    members: [
      { id: 'w1', name: '记录收集', role: '读取各成员助手本周的工作记录', avatar: emoji('031-archive'), output: '收集 12 位成员的 186 条记录' },
      { id: 'w2', name: '进展汇总', role: '按项目归类并提炼进展', avatar: emoji('005-data'), output: '汇总 5 个项目的进展' },
      { id: 'w3', name: '周报撰写', role: '按三段式撰写周报', avatar: emoji('025-note-taking'), output: '周报草稿已生成，等待核对' },
    ] as TeamMember[],
  },
]

/* ---------- 工作室：模板 ---------- */
export const templates = [
  { id: 't1', name: '客服问答', cat: '客服', avatar: emoji('006-support'), desc: '基于知识库回答常见问题，答不了时转人工。', uses: 128 },
  { id: 't2', name: '文档总结', cat: '办公', avatar: emoji('001-reading'), desc: '上传长文档，输出摘要、要点和行动项。', uses: 342 },
  { id: 't3', name: '周报生成', cat: '办公', avatar: emoji('025-note-taking'), desc: '从工作记录生成三段式周报。', uses: 210 },
  { id: 't4', name: '销售线索跟进', cat: '销售', avatar: emoji('007-sales'), desc: '记录线索、提醒跟进、生成商机周报。', uses: 96 },
  { id: 't5', name: 'SQL 助手', cat: '数据', avatar: emoji('043-database'), desc: '用自然语言查询数据库并解释结果。', uses: 154 },
  { id: 't6', name: '招聘初筛', cat: 'HR', avatar: emoji('011-hr'), desc: '按岗位要求筛选简历并给出面试问题。', uses: 77 },
  { id: 't7', name: '合同审查', cat: '法务', avatar: emoji('010-legal'), desc: '对照标准条款标出风险项。', uses: 63 },
  { id: 't8', name: '会议纪要', cat: '办公', avatar: emoji('034-meeting'), desc: '整理会议结论、待办和负责人。', uses: 288 },
  { id: 't9', name: '竞品分析', cat: '销售', avatar: emoji('026-research'), desc: '收集公开信息，按维度对比竞品。', uses: 58 },
]

/* ---------- 知识库 ---------- */
export const knowledgeBases = [
  { id: 'fde', name: 'FDE 交付方案库', desc: '历史交付方案、评审清单、上线复盘', docs: 128, size: '412 MB', scope: '团队共享', updated: '今天' },
  { id: 'yifei', name: '翼飞产品手册', desc: '翼飞全系产品说明书、FAQ、维修政策', docs: 64, size: '186 MB', scope: '团队共享', updated: '昨天' },
  { id: 'city', name: '城市资料', desc: '上海、北京、深圳城市介绍与生活指南', docs: 34, size: '52 MB', scope: '仅自己', updated: '10 月 30 日' },
  { id: 'legal', name: '合同模板库', desc: '标准合同模板与条款解释', docs: 22, size: '18 MB', scope: '团队共享', updated: '10 月 21 日' },
]

export const kbDocs = [
  { name: 'FDE 方案评审清单 v3.pdf', size: '2.1 MB', chunks: 48, status: 'ready', updated: '今天 09:12' },
  { name: '翼飞客服上线复盘.docx', size: '860 KB', chunks: 31, status: 'ready', updated: '昨天' },
  { name: '银行私有化部署方案.pdf', size: '14.2 MB', chunks: 212, status: 'indexing', progress: 64, updated: '刚刚' },
  { name: '大模型选型对比 2026Q3.xlsx', size: '1.3 MB', chunks: 26, status: 'ready', updated: '10 月 28 日' },
  { name: '回滚方案模板.md', size: '24 KB', chunks: 6, status: 'ready', updated: '10 月 25 日' },
  { name: '扫描件-合同附件.png', size: '3.8 MB', chunks: 0, status: 'failed', updated: '10 月 24 日' },
]

export const kbHits = [
  { doc: 'FDE 方案评审清单 v3.pdf', score: 0.91, text: '上线标准必须包含可量化的阈值，例如解决率不低于 80%、P95 响应时间不超过 3 秒，并写明未达标时的回滚条件。' },
  { doc: '翼飞客服上线复盘.docx', score: 0.84, text: '首周灰度 20% 流量，解决率 82.4%，转人工率 11.2%；第二周扩大到 50%，期间触发一次回滚演练。' },
  { doc: '回滚方案模板.md', score: 0.77, text: '回滚触发条件：核心指标连续 2 小时低于阈值，或出现 P1 级客诉。回滚步骤：切流量、保留日志、通知负责人。' },
]

/* ---------- Skills ---------- */
export const skills = [
  { id: 's1', name: '办公文件生成', cat: '办公', avatar: emoji('027-presentation'), desc: '生成 PPT、Word、Excel 文件。', installed: true, by: '官方', inputs: '主题、大纲或数据', outputs: '.pptx / .docx / .xlsx' },
  { id: 's2', name: '方案评审', cat: 'FDE', avatar: emoji('030-review'), desc: '按 FDE 评审清单检查技术方案。', installed: true, by: 'FDE 团队', inputs: '方案文档', outputs: '逐项评审结论' },
  { id: 's3', name: '飞书日程', cat: '协作', avatar: emoji('028-planning'), desc: '查看忙闲、安排会议、预定会议室。', installed: false, by: '官方', inputs: '参会人、时间范围', outputs: '日程邀请' },
  { id: 's4', name: '网页搜索', cat: '信息', avatar: emoji('047-network'), desc: '搜索公开网页并给出来源。', installed: true, by: '官方', inputs: '查询词', outputs: '摘要 + 链接' },
  { id: 's5', name: 'SQL 查询', cat: '数据', avatar: emoji('043-database'), desc: '连接数据库，用自然语言查询。', installed: false, by: '数据团队', inputs: '问题描述', outputs: '查询结果与解释' },
  { id: 's6', name: '图表绘制', cat: '数据', avatar: emoji('005-data'), desc: '把表格数据画成图表。', installed: true, by: '官方', inputs: '表格数据', outputs: 'PNG / SVG 图表' },
  { id: 's7', name: '大纲生成', cat: '办公', avatar: emoji('029-brainstorm'), desc: '为文章或演示生成结构化大纲。', installed: true, by: '官方', inputs: '主题', outputs: '多级大纲' },
  { id: 's8', name: '翻译', cat: '信息', avatar: emoji('032-translation'), desc: '中英日韩互译，保留格式。', installed: false, by: '官方', inputs: '文本或文档', outputs: '译文' },
]

/* ---------- 集成 ---------- */
export const integrations = [
  { id: 'feishu', name: '飞书', desc: '消息、文档、日历、妙记', color: '#3370ff', letter: '飞', connected: true },
  { id: 'wecom', name: '企业微信', desc: '消息渠道、通讯录', color: '#07c160', letter: '企', connected: false },
  { id: 'dingtalk', name: '钉钉', desc: '消息渠道、审批', color: '#0089ff', letter: '钉', connected: false },
  { id: 'github', name: 'GitHub', desc: '代码仓库、Issue、PR', color: '#24292f', letter: 'G', connected: true },
  { id: 'jira', name: 'Jira', desc: '需求与缺陷跟踪', color: '#0052cc', letter: 'J', connected: false },
  { id: 'mysql', name: 'MySQL', desc: '业务数据库只读查询', color: '#00758f', letter: 'M', connected: false },
  { id: 'mcp', name: 'MCP 服务', desc: '接入自定义 MCP 工具服务器', color: '#6b736e', letter: 'MCP', connected: false },
  { id: 'webhook', name: 'Webhook', desc: '把 Agent 运行结果推送到你的系统', color: '#b86a00', letter: 'W', connected: true },
]
