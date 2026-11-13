import { fileURLToPath } from 'node:url'

const browserCLI = fileURLToPath(new URL('./node_modules/@playwright/mcp/cli.js', import.meta.url))

// Per-invocation overrides: do not alter the user's desktop Codex configuration.
export function capabilityArgs(work) {
  const settings = {
    web_search: 'live',
    'sandbox_workspace_write.network_access': true,
    'features.apps': true,
    'features.shell_tool': true,
    'features.view_image': true,
    'features.image_generation': true,
    'features.computer_use': true,
    'features.browser_use': true,
    'mcp_servers.raccoon_browser.command': process.execPath,
    'mcp_servers.raccoon_browser.args': [browserCLI, '--browser', 'chrome', '--isolated', '--output-dir', work],
    'mcp_servers.raccoon_browser.startup_timeout_sec': 60,
    'mcp_servers.raccoon_browser.tool_timeout_sec': 90,
    // This installed browser is explicitly enabled for unattended assistant jobs.
    // Business actions still follow the user's request and platform review rules.
    'mcp_servers.raccoon_browser.default_tools_approval_mode': 'approve',
  }
  return Object.entries(settings).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`])
}

export function capabilityEnvironment(base) {
  const env = { ...base }
  // A desktop conversation's browser bridge identity is not a service credential.
  // Native desktop tools can connect independently; browser tasks use our MCP.
  for (const key of ['BROWSER_USE_ACCESS_EXECUTOR_ID', 'BROWSER_USE_ACCESS_PIPE_PATH', 'BROWSER_USE_ACCESS_VERIFYING_IDENTITY']) delete env[key]
  delete env.CODEX_CONNECTOR_TOKEN
  return env
}

export const capabilityInstructions = `
本机工具能力：继承本机 Codex 已启用的 Skills、MCP 和插件，可按任务使用文件读写、代码执行、测试、联网搜索、图片理解/生成、文档/PPT/表格/PDF 工具。按实际可用工具判断，不能声称未调用的工具已执行。
网页自动化优先使用 raccoon_browser MCP：独立 Chrome、每次运行隔离浏览器会话，不依赖当前聊天客户端，不会自动继承用户登录态。可打开网页、读取内容、点击、输入、截图。任务完成后关闭自己创建的浏览器；需要登录或人工确认时说明并等待，不自行获取浏览器密码。
操作本机应用使用 cua_repl，先遵守工具入口及说明。CUA 的桌面入口与浏览器入口是不同能力；若其浏览器入口报告 host unavailable，改用 raccoon_browser 处理网页任务。不要复制其他会话的浏览器桥接身份或修改系统权限来绕过错误。
本机应用操作发生在连接器所在电脑，并非云端。仅按用户明确要求操作应用，不自行发送消息、提交表单、发布或删除资源。本机应用的授权请求由连接器转交本机确认页面，等待用户真实点击后继续。若拒绝或超时则停止相应操作，不重试绕过。其他业务决定仍需向用户询问。平台发布审批继续使用平台 CLI 原有规则。
Skills 按会话提供的目录加载；不把 Skill 文件存在或插件已启用等同于外部服务已授权。服务缺少登录、权限或配置时如实说明，不能虚报已完成。
`

export const configuredCapabilities = {
  filesAndCode: 'workspace-write',
  webSearch: 'live',
  skillsAndPlugins: 'inherit-local-codex',
  browser: 'playwright-chrome-isolated',
  desktop: 'native-cua-requires-local-permissions',
  imageGeneration: 'enabled-subject-to-account',
}
