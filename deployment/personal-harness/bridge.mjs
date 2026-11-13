import readline from 'node:readline'
import { createDifyTools, callDify, DSH_DIFY_COMPAT } from './dsh-dify-compat.mjs'
const bridge = JSON.parse(process.env.PLATFORM_BRIDGE || '{}')
const dify = JSON.parse(process.env.DIFY_CONFIG || '{}')
const tools = []
for (const kind of ['kb', 'agents']) for (const resource of bridge.resources?.[kind] || []) tools.push({
  name: `${kind}_${resource.id.replaceAll('-', '')}`,
  description: `${kind === 'kb' ? '检索知识库' : '委派任务给已发布 Agent'}：${resource.name}。${resource.hint || ''}`.slice(0, 1200),
  inputSchema: { type: 'object', properties: { query: { type: 'string', description: '检索问题或任务内容' } }, required: ['query'], additionalProperties: false },
  _kind: kind, _id: resource.id,
})
for (const tool of createDifyTools(dify)) tools.push({ ...tool, _kind: tool.kind })
for await (const line of readline.createInterface({ input: process.stdin })) {
  let message
  try {
    message = JSON.parse(line)
    if (message.id === undefined) continue
    let result
    if (message.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'raccoon-platform-dsh-dify-compat', version: '1.0.0', ...DSH_DIFY_COMPAT } }
    else if (message.method === 'ping') result = {}
    else if (message.method === 'tools/list') result = { tools: tools.map(({ _id, _kind, ...tool }) => tool) }
    else if (message.method === 'tools/call') {
      const tool = tools.find(t => t.name === message.params.name)
      if (!tool) throw new Error('未授权的资源')
      if (tool._kind === 'dify_chat' || tool._kind === 'dify_retrieve') {
        result = { content: [{ type: 'text', text: JSON.stringify(await callDify(dify, tool._kind, message.params.arguments || {})) }] }
      } else {
        const response = await fetch(bridge.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridge.token}` }, body: JSON.stringify({ kind: tool._kind, id: tool._id, query: message.params.arguments?.query }), signal: AbortSignal.timeout(180000) })
        if (!response.ok) throw new Error(`平台资源调用失败（${response.status}），请检查发布状态和权限`)
        result = { content: [{ type: 'text', text: JSON.stringify(await response.json()) }] }
      }
    } else throw new Error('不支持此方法')
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n')
  } catch (error) {
    if (message?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } }) + '\n')
  }
}
