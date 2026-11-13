/*
 * dsh-dify compatibility adapter.
 *
 * The public dsh-dify package (staff-os/dsh-dify) targets the 0.1.x DSH ABI,
 * while this deployment runs DeepSeek Harness 0.2.x. Installing that package
 * directly would make the worker fail during plugin loading. This adapter
 * keeps the same provider/consumer contract (dify_chat and dify_retrieve) and
 * is exposed through the current Harness MCP seam.
 */
export const DSH_DIFY_COMPAT = {
  sourceRepo: 'https://github.com/staff-os/dsh-dify',
  abiTarget: 'dsh 0.1.x',
  runtimeAbi: 'dsh 0.2.x',
  mode: 'compatibility-adapter',
}

export function createDifyTools(config) {
  const dify = config || {}
  if (!dify.enabled || !dify.apiKey || !dify.appId) return []
  return [
    {
      name: 'dify_chat',
      description: '调用已授权的 Dify Agent 应用，适合执行企业内部业务问答和已配置的 Dify 能力。',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: '发送给 Dify Agent 的自然语言问题或任务' }, conversationId: { type: 'string' } }, required: ['query'], additionalProperties: false },
      kind: 'dify_chat',
    },
    {
      name: 'dify_retrieve',
      description: '检索已授权的 Dify 知识库，并返回带来源的文档片段。',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: '知识库检索问题' }, datasetId: { type: 'string' } }, required: ['query'], additionalProperties: false },
      kind: 'dify_retrieve',
    },
  ]
}

export async function callDify(config, kind, args = {}) {
  const dify = config || {}
  const base = String(dify.baseURL || 'https://api.dify.ai/v1').replace(/\/$/, '')
  const headers = { authorization: `Bearer ${dify.apiKey}`, 'content-type': 'application/json', accept: 'application/json' }
  let url, body
  if (kind === 'dify_chat') {
    url = `${base}/chat-messages`
    body = { query: String(args.query || ''), user: String(dify.user || 'dsh-user'), response_mode: 'blocking', inputs: {} }
    if (args.conversationId) body.conversation_id = String(args.conversationId)
  } else {
    const dataset = String(args.datasetId || dify.datasetId || '')
    if (!dataset) throw new Error('Dify 知识库未配置 datasetId')
    url = `${base}/datasets/${encodeURIComponent(dataset)}/retrieve`
    body = { query: String(args.query || '') }
  }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Dify 请求失败（${response.status}）：${payload.message || '请检查 API Key、地址和应用配置'}`)
  if (kind === 'dify_chat') {
    if (!payload.answer) throw new Error('Dify 未返回 answer')
    return { answer: payload.answer, conversationId: payload.conversation_id, messageId: payload.message_id }
  }
  return { chunks: (payload.records || []).map(record => ({
    content: record.segment?.content || '', documentName: record.segment?.document_name || record.document?.name || '',
    documentId: record.segment?.document_id || record.document?.id || '', score: record.score,
  })).filter(chunk => chunk.content) }
}
