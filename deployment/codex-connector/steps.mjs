// Public activity summaries only: never expose commands, arguments or reasoning.
export function summarizeSteps(events) {
  const steps = []
  const seen = new Set()
  for (const event of events) {
    if (event.type !== 'item.completed') continue
    const item = event.item || {}
    let label
    if (item.type === 'command_execution') {
      const command = String(item.command || '')
      label = /\b(pytest|vitest|jest|unittest)\b|npm (run )?test/.test(command) ? '运行测试'
        : /\b(ls|pwd|find|rg|cat|head|tail|sed)\b/.test(command) ? '检查文件与工作目录' : '执行工作区命令'
    } else if (item.type === 'file_change') label = '编辑文件'
    else if (item.type === 'web_search') label = '联网搜索'
    else if (item.type === 'mcp_tool_call' || item.type === 'dynamic_tool_call') {
      label = item.server === 'raccoon_browser' ? '操作浏览器'
        : item.server === 'cua_repl' ? '操作本机应用' : '调用工具'
    }
    else if (item.type === 'agent_message') continue
    if (!label) continue
    const status = item.status === 'failed' || item.error || (item.exit_code != null && item.exit_code !== 0) ? 'error' : 'done'
    const key = `${label}:${status}`
    if (!seen.has(key)) { steps.push({label, status}); seen.add(key) }
  }
  if (events.some(e => e.type === 'item.completed' && e.item?.type === 'agent_message')) steps.push({label:'生成回复', status:'done'})
  return steps.length ? steps : [{label:'请求处理结束', status:'unknown'}]
}
