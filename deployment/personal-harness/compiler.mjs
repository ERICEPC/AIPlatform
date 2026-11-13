import path from 'node:path'
export function compile(config, root = '/data') {
  if (!config.model?.id || !config.model?.baseURL || !config.model?.key) throw new Error('模型缺少服务端配置')
  const url = new URL(config.model.baseURL)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('模型地址无效')
  const patch = [
    { id: 'session-log-deepseek', disabled: true },
    { id: 'tool-plugin-manager', disabled: true },
    { id: 'tool-schedule', disabled: true },
    { id: 'schedule', disabled: true },
    { id: 'plugin-package-inventory-deepseek', disabled: true },
    { id: 'llm-pi-ai', config: { providers: { platform: {
      apiKeyEnv: 'PLATFORM_MODEL_KEY', api: 'openai-completions', baseURL: config.model.baseURL,
      models: [{ id: config.model.id, contextWindow: config.model.contextWindow || 32768, maxTokens: config.maxTokens || 4096 }],
    } } } },
    { id: 'system-prompt', config: { personaPrefix: [config.name, config.role, config.instructions,
      config.memoryEnabled ? config.memory : '',
      config.agentCLI ? '用户要求在平台创建、修改、配置或发布智能体时，使用 agent_manager 工具完成真实操作，不要只生成 JSON 文件。先查询 list/resources/get，资源必须来自实际目录，修改带最新 revision。只执行用户要求的改动；要求发布才 publish，要求 Web/API 才 external_access=true。完成后返回真实名称、状态、Web 链接和 API 接入地址，API Key 由访问页管理。发布若待审批必须如实说明。' : '',
      '仅使用已授权的资源。任何对外发送、承诺或不可逆操作都须先向用户确认。'].filter(Boolean).join('\n\n') } },
    { id: 'sandbox-policy', config: { mode: 'workspace-write', workspaceRoot: `${root}/workspace` } },
    { id: 'skill-filesystem', config: { includeDefaultRoots: false, customSkillDirs: [`${root}/skills`], watch: false } },
  ]
  if (!config.executionEnabled) patch.push({ id: 'bash-sandbox', disabled: true }, { id: 'pwsh-sandbox', disabled: true })
  const inserts = (config.mcps || []).map((m, i) => ({ id: `platform-mcp-${i}`, name: '@deepseek-ai/dsh-mcp-client', config: {
    serverName: `platform_${i}`, transport: 'streamable-http', url: m.url, headers: m.headers || {}, failOnStartupError: true, startupTimeoutMs: 20000,
  } }))
  inserts.push({ id: 'raccoon-runtime-inspector', name: new URL('./inspect.mjs', import.meta.url).pathname, config: { path: `${root}/readiness.json` } })
  if (config.bridge) inserts.push({ id: 'platform-resources', name: '@deepseek-ai/dsh-mcp-client', config: {
    serverName: 'raccoon', transport: 'stdio', command: 'node', args: ['/app/bridge.mjs'],
    env: { PLATFORM_BRIDGE: JSON.stringify(config.bridge), DIFY_CONFIG: JSON.stringify(config.dify || {}) }, failOnStartupError: true, startupTimeoutMs: 15000,
  } })
  if (config.desktopBridge) inserts.push({ id: 'local-device', name: '@deepseek-ai/dsh-mcp-client', config: {
    serverName: 'local_device', transport: 'stdio', command: 'node', args: ['/app/device-bridge.mjs'],
    env: { DESKTOP_BRIDGE: JSON.stringify(config.desktopBridge) }, failOnStartupError: true, startupTimeoutMs: 15000,
  } })
  if (config.agentCLI) inserts.push({id:'agent-manager',name:'@deepseek-ai/dsh-mcp-client',config:{serverName:'agent_manager',transport:'stdio',command:'node',args:['/app/agent-manager.mjs'],env:{AGENT_MANAGER_CAPABILITY:JSON.stringify(config.agentCLI)},failOnStartupError:true,startupTimeoutMs:15000}})
  if (inserts.length) patch.push({ insert: inserts })
  return patch
}
export function safeSkillPath(root, name, file) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name) || !file || file.includes('\\') || file.split('/').includes('..') || path.isAbsolute(file)) throw new Error('技能包路径无效')
  return path.join(root, name, file)
}
