/**
 * Raccoon X Super-Agent orchestration contract.
 *
 * This is deliberately a prompt-level orchestrator around DeepSeek Harness:
 * the Harness remains the execution engine, while this layer makes the
 * lifecycle explicit and machine-readable for the UI and audit log.
 */
export const SUPER_AGENT_VERSION = '1.0.0'

const DEFAULT_PHASES = [
  { id: 'plan', label: '规划', required: true },
  { id: 'execute', label: '执行', required: true },
  { id: 'verify', label: '验证', required: true },
  { id: 'deliver', label: '交付', required: true },
]

export function buildSuperAgentPrompt(userPrompt, config = {}) {
  const resources = [
    ...(config.skills || []).map(name => `Skill:${name}`),
    ...(config.mcps || []).map((_, index) => `MCP:${index + 1}`),
  ]
  const resourceText = resources.length ? resources.join(', ') : '平台原生工具与文件工作区'
  return {
    version: SUPER_AGENT_VERSION,
    phases: DEFAULT_PHASES,
    prompt: [
      '你是 Raccoon X 个人 Super-Agent。请把下面任务作为一个可交付的工作项处理。',
      '必须按四个阶段推进，但规划、工具调用和验证过程只写入执行记录，不要把内部阶段说明、目标拆解、约束分析或 todo 清单原文展示给用户。',
      '1. 规划：在内部确认目标、输入、约束、成功标准和最小可行步骤；复杂任务用 todo_write 建立任务清单。',
      '2. 执行：优先调用已授权的 Skill、MCP 和工作区工具完成实际工作，不要只给伪代码或操作建议。',
      '3. 验证：重新读取或运行检查，验证文件存在、格式可打开、关键结果可复现；对 PPT、PDF、图片、网页和表格做相应结构或渲染检查。',
      '4. 交付：只向用户说明完成了什么、产物在哪里、验证结果和下一步建议。只有真实产物已生成时才报告“完成”。最终回复必须是面向用户的自然语言，禁止输出阶段标题、内部规划、DSML、XML、JSON、工具调用标记或内部协议片段。',
      '工具选择规则：先用专用 Skill，再用 MCP；工具不可用时说明缺口并给出可执行的替代步骤。不要假称已经调用了未注册的工具。',
      '安全规则：个人记忆、企业知识库和其他 Agent 只能按授权范围读取；发送消息、登录、删除、发布或其他不可逆操作必须有用户明确授权；本轮用户已明确要求的创建、修改、发布及开放 Web/API 可直接执行，不重复索要相同授权。',
      `当前已授权能力：${resourceText}。`,
      '',
      '用户任务：',
      String(userPrompt || '').trim(),
    ].join('\n'),
  }
}

export function summarizeOrchestration(events = []) {
  const calls = events.filter(event => event.type === 'tool/call')
  const results = events.filter(event => event.type === 'tool/result')
  return {
    tool_calls: calls.length,
    tool_results: results.length,
    plan_created: calls.some(event => event.data?.name === 'todo_write'),
    execution_started: calls.length > 0,
    verification_attempted: calls.some(event => ['read', 'bash', 'web_fetch'].includes(event.data?.name)),
  }
}
