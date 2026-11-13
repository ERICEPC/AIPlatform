/* 平台 MCP mock（演示数据）。地址为示例：https://x.example.internal/mcp/<服务> */
import type { Consumer, McpServer, McpTool, TryResult } from '../mcp-hub'
import { ApiError } from '../http'

const GW = 'https://x.example.internal/mcp'
const T = (name: string, title: string, desc: string, risk: McpTool['risk'], args: McpTool['args'], example: Record<string, unknown>): McpTool => ({ name, title, desc, risk, args, example })
const A = (name: string, type: string, desc: string, required = false) => ({ name, type, desc, required })

const list: McpServer[] = [
  { id: 'rx-agents', name: '智能体', desc: '发现并调用已发布的专家智能体；结构化输入输出，保留来源与失败原因。', endpoint: `${GW}/agents`, transport: 'streamable-http', status: 'ok', backed_by: ['orchestrator', 'model_gateway'], consumers: ['harness', 'orchestrator', 'salesbuddy', 'projectbuddy', 'kefu'], calls_7d: 9840,
    tools: [T('list_agents', '列出可调用的智能体', '按调用者权限返回已发布的专家智能体及输入说明。', 'read', [A('space', 'string', '业务空间，可选'), A('keyword', 'string', '关键词，可选')], { space: '销售管理' }), T('invoke_agent', '调用智能体', '把任务交给专家智能体，返回结果、依据与「待确认」项。', 'write', [A('agent_id', 'string', '智能体 ID', true), A('input', 'object', '按智能体的输入说明', true)], { agent_id: 'ex-weekly', input: { records: '本周拜访记录…' } }), T('get_run', '查询运行结果', '按运行 ID 取结果与执行步骤。', 'read', [A('run_id', 'string', '运行 ID', true)], { run_id: 'run-8c1f' })] },
  { id: 'rx-workflows', name: '智能体团队', desc: '提交任务给智能体团队，读取执行轨迹（对话窗口的数据来源）。', endpoint: `${GW}/workflows`, transport: 'streamable-http', status: 'ok', backed_by: ['orchestrator', 'memory'], consumers: ['harness', 'salesbuddy', 'projectbuddy', 'kefu'], calls_7d: 412,
    tools: [T('list_teams', '列出智能体团队', '已发布且调用者有权使用的团队。', 'read', [], {}), T('start_run', '提交任务', '交给团队的 Leader 统筹执行；到人工确认点会暂停。', 'write', [A('team_id', 'string', '团队 ID', true), A('query', 'string', '任务描述', true)], { team_id: 'presales', query: '根据附件需求输出售前方案包' }), T('get_trace', '读取执行轨迹', 'Leader 规划、成员执行、交接与确认点。', 'read', [A('run_id', 'string', '运行 ID', true)], { run_id: 'run-41aa' })] },
  { id: 'rx-knowledge', name: '知识库', desc: '带出处的检索与问答，按调用者权限过滤资料。', endpoint: `${GW}/knowledge`, transport: 'streamable-http', status: 'ok', backed_by: ['kb', 'vector', 'embedding', 'search'], consumers: ['harness', 'orchestrator', 'salesbuddy', 'projectbuddy', 'kefu', 'hr'], calls_7d: 22100,
    tools: [T('search', '检索资料', '返回相关片段与出处（文档、页码或时间点）。', 'read', [A('query', 'string', '问题或关键词', true), A('libraries', 'string[]', '知识库范围，可选'), A('top_k', 'number', '返回条数，默认 5')], { query: '私有化部署的交付周期', top_k: 3 }), T('ask', '问资料', '基于资料回答；资料不足时说明缺什么，不编造。', 'read', [A('question', 'string', '问题', true)], { question: '退换货政策的期限是多少？' }), T('get_source', '打开出处', '按引用 ID 取原文片段。', 'read', [A('ref', 'string', '引用 ID', true)], { ref: 'doc-12#p3' })] },
  { id: 'rx-memory', name: '记忆', desc: '读取经确认的个人与团队记忆；写入只能提交候选，确认后才生效。', endpoint: `${GW}/memory`, transport: 'streamable-http', status: 'ok', backed_by: ['memory', 'redis', 'vector'], consumers: ['harness', 'orchestrator', 'salesbuddy', 'projectbuddy'], calls_7d: 15400,
    tools: [T('recall', '取相关记忆', '按任务取个人、团队或 Leader 记忆，标明来源与有效期。', 'read', [A('task', 'string', '当前任务', true), A('layers', 'string[]', 'personal / team / leader')], { task: '整理本周周报', layers: ['personal'] }), T('propose', '提交候选记忆', '从任务中提取的内容进入候选，等本人确认。', 'write', [A('kind', 'string', '偏好 / 背景 / 经验 / 业务上下文', true), A('content', 'string', '内容', true), A('source', 'string', '来源', true)], { kind: 'preference', content: '周报先写风险', source: '对话 · 周报整理' })] },
  { id: 'rx-skills', name: 'Skills', desc: '列出并运行已安装的 Skill（脚本在沙箱中执行）。', endpoint: `${GW}/skills`, transport: 'streamable-http', status: 'ok', backed_by: ['sandbox', 'object'], consumers: ['harness', 'orchestrator', 'projectbuddy'], calls_7d: 3120,
    tools: [T('list_skills', '列出技能', '调用者可用的 Skill 与版本。', 'read', [], {}), T('run_skill', '运行技能', '按 SKILL.md 的约定执行，产物写入对象存储并返回文件卡。', 'write', [A('skill_id', 'string', 'Skill ID', true), A('input', 'object', '输入', true)], { skill_id: 'sk-ppt', input: { outline: '本周周报' } })] },
  { id: 'rx-data', name: '业务数据', desc: '在业务空间分配的 schema 与目录内读写；只读查询与写入分开授权。', endpoint: `${GW}/data`, transport: 'streamable-http', status: 'ok', backed_by: ['postgres', 'object'], consumers: ['projectbuddy', 'salesbuddy', 'orchestrator'], calls_7d: 5230,
    tools: [T('list_tables', '列出数据表', '本业务空间 schema 下的表与字段。', 'read', [A('space', 'string', '业务空间', true)], { space: '销售管理' }), T('query', '只读查询', '参数化只读查询，限制行数与超时。', 'read', [A('sql', 'string', 'SELECT 语句', true), A('params', 'array', '参数')], { sql: 'select stage, count(*) from opportunity group by stage' }), T('upsert', '写入记录', '按主键写入，带幂等键；超出 schema 的写入会被拒绝。', 'write', [A('table', 'string', '表名', true), A('rows', 'array', '记录', true)], { table: 'visit_review', rows: [{ id: 'v-1', note: '…' }] }), T('sign_url', '签发文件地址', '为对象存储里的文件签发临时访问地址。', 'read', [A('path', 'string', '文件路径', true)], { path: 'raccoonx/sales/report.pptx' })] },
  { id: 'rx-models', name: '模型', desc: '经 MaaS 模型网关调用对话、向量化与重排序；用量计到人和任务。', endpoint: `${GW}/models`, transport: 'streamable-http', status: 'ok', backed_by: ['model_gateway', 'embedding'], consumers: ['harness', 'orchestrator', 'projectbuddy'], calls_7d: 41200,
    tools: [T('chat', '对话生成', '按任务或指定模型生成。', 'read', [A('messages', 'array', '消息', true), A('model', 'string', '模型，可选')], { messages: [{ role: 'user', content: '用一句话总结' }] }), T('embed', '向量化', '把文本转成向量。', 'read', [A('input', 'string[]', '文本', true)], { input: ['示例'] })] },
  { id: 'rx-inbox', name: '待我确认', desc: '把智能体决定不了的事交给有权限的人，查询确认结果（人机交接）。', endpoint: `${GW}/inbox`, transport: 'streamable-http', status: 'ok', backed_by: ['orchestrator'], consumers: ['harness', 'orchestrator', 'salesbuddy', 'projectbuddy'], calls_7d: 640,
    tools: [T('create_review', '提交确认事项', '问题、依据、可选方案与确认后动作；返回事项 ID。', 'write', [A('title', 'string', '标题', true), A('question', 'string', '需要决定什么', true), A('options', 'array', '可选方案', true), A('assignee', 'string', '处理人，可选')], { title: '报价按哪个预算', question: '…', options: ['最新纪要口径', '需求说明口径'] }), T('get_review', '查询确认结果', '已确认 / 已退回 / 待处理，以及执行状态。', 'read', [A('id', 'string', '事项 ID', true)], { id: 'ib-1' })] },
  { id: 'rx-desktop', name: '桌面连接器', desc: '在本人电脑的授权工作区读写文件、运行已登记命令（只给个人助理）。', endpoint: `${GW}/desktop`, transport: 'streamable-http', status: 'ok', backed_by: ['connector'], consumers: ['harness'], calls_7d: 2210,
    tools: [T('fs_read', '读取文件', '只在授权工作区内。', 'read', [A('path', 'string', '相对工作区的路径', true)], { path: '客户A/拜访记录.md' }), T('fs_write', '写入文件', '写入工作区，产物同步回对话。', 'write', [A('path', 'string', '路径', true), A('content', 'string', '内容', true)], { path: '周报.md', content: '…' }), T('run_command', '运行命令', '只运行管理员登记且本人授权的命令。', 'write', [A('command', 'string', '命令', true)], { command: 'libreoffice --convert-to pdf 周报.pptx' })] },
  { id: 'rx-devkit', name: '开发套件', desc: 'Buddy 加速器与脚手架：生成工程、同步框架、申请数据资源（ProjectBuddy 开发用）。', endpoint: `${GW}/devkit`, transport: 'streamable-http', status: 'ok', backed_by: ['accelerator', 'scaffold', 'postgres'], consumers: ['projectbuddy', 'harness'], calls_7d: 186,
    tools: [T('list_templates', '列出模板', 'Buddy 应用、专家智能体、Skill、MCP 服务、智能体团队。', 'read', [], {}), T('generate_project', '生成工程', '按模板与配置生成工程，返回命令与文件清单。', 'write', [A('template', 'string', '模板', true), A('values', 'object', '配置', true)], { template: 'buddy-app', values: { slug: 'sales-coach', space: '销售管理' } }), T('request_schema', '申请数据 schema', '在业务空间配额内创建 schema。', 'write', [A('space', 'string', '业务空间', true), A('name', 'string', '名称', true)], { space: '销售管理', name: 'sales_coach' })] },
]
export const servers = () => ({ data: list, gateway: GW })
export function tryTool(server: string, tool: string, args: Record<string, unknown>): TryResult {
  const s = list.find(x => x.id === server)
  const t = s?.tools.find(x => x.name === tool)
  if (!s || !t)
    throw new ApiError('工具不存在或无权调用', 404)
  const missing = t.args.filter(a => a.required && (args[a.name] === undefined || args[a.name] === ''))
  if (missing.length)
    return { ok: false, latency_ms: 0, result: { error: `缺少参数：${missing.map(a => a.name).join('、')}` }, audit_id: '' }
  const dry = t.risk !== 'read'
  const result: Record<string, unknown> = {
    search: { hits: [{ text: '私有化部署交付周期一般分四个阶段……', source: '交付规范 · 第 3 页', ref: 'doc-12#p3', score: 0.86 }] },
    ask: { answer: '资料中写明自签收之日起 7 日内可无理由退换。', citations: [{ ref: 'doc-4#p2' }] },
    list_agents: { agents: [{ id: 'ex-weekly', name: '周报生成', input: '本周记录（文本或文件）' }, { id: 'ex-visit', name: '拜访记录质检', input: '一条拜访记录' }] },
    recall: { memories: [{ kind: 'preference', content: '周报先写风险，再写进展和下周计划', source: '对话中「记住」', valid_until: null }] },
    list_tables: { tables: [{ name: 'opportunity', columns: ['id', 'stage', 'amount_level', 'owner'] }, { name: 'visit_review', columns: ['id', 'visit_id', 'note'] }] },
    query: { rows: [{ stage: '方案', count: 12 }, { stage: '商务', count: 5 }], truncated: false },
  }[tool] ?? (dry ? { preview: '预演通过：参数完整、权限满足；真实调用时写入与对外动作按策略可能转「待我确认」' } : { ok: true })
  return { ok: true, latency_ms: 40 + Math.round(Math.random() * 160), result, audit_id: `au-${Math.random().toString(36).slice(2, 8)}`, note: dry ? '写入 / 对外工具在试调用中只做预演' : undefined }
}
export function clientConfig(consumer: Consumer) {
  const use = list.filter(s => s.consumers.includes(consumer))
  const auth = consumer === 'harness' || consumer === 'orchestrator'
    ? { Authorization: 'Bearer ${RX_SERVICE_TOKEN}', 'X-RX-On-Behalf-Of': '${USER_ID}' }
    : { 'Authorization': 'Bearer ${RX_APP_TOKEN}', 'X-RX-User-Token': '${END_USER_TOKEN}' }
  const json = JSON.stringify({ mcpServers: Object.fromEntries(use.map(s => [s.id, { type: 'streamable-http', url: s.endpoint, headers: auth }])) }, null, 2)
  const note = consumer === 'harness' ? '个人助理（DeepSeek Harness）用服务令牌连接，代表当前用户调用；桌面连接器只对本人可用。'
    : consumer === 'orchestrator' ? '编排引擎为智能体团队的 Leader 与成员调用，权限取发起人与团队授权的交集。'
      : '应用用应用令牌 ＋ 最终用户令牌连接；只能用「应用接入」里开放的能力，每次按最终用户权限校验。'
  return { json, note }
}
