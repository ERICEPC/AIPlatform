/*
  连接器目录快照（一）：精选自 github.com/punkpeye/awesome-mcp-servers 的常用服务。
  办公协作 · 开发工具 · 代码托管 · 数据库 · 数据与分析。
  少数官方服务（飞书、Notion 官方、Linear、Atlassian 等）awesome 列表未收录或只收录了社区实现，按官方仓库 / 文档补入。
  远程地址、命令、参数里的 {KEY} 在连接时替换为同名字段的值。
*/
import type { ConnectorDef } from './connectors-kit'
import { bearer, cmd, docker, field, gh, http, mcpRef, npx, optional, secret, sse, uvx } from './connectors-kit'

export const awesomeOffice: ConnectorDef[] = [
  {
    id: 'feishu', name: '飞书', brand: 'feishu', color: '#3370ff', mono: '飞书', publisher: 'official', repo_url: gh('larksuite/lark-openapi-mcp'), category: 'office', tags: ['消息', '云文档', '多维表格', '日历'], featured: true, popularity: 21480,
    description: '飞书开放平台官方 MCP：发消息、读写云文档与多维表格、查日程、管理群聊，覆盖大部分 OpenAPI。',
    capabilities: ['im.v1.message.create 发送消息', 'docx 读写云文档', 'bitable 多维表格记录增删改查', 'calendar 日程查询与创建', 'wiki 知识库检索'],
    local: npx('@larksuite/lark-mcp', 'mcp', '-a', '{APP_ID}', '-s', '{APP_SECRET}'), auth: 'env',
    fields: [field('APP_ID', 'App ID', { placeholder: 'cli_a1b2c3…', hint: '在飞书开放平台创建企业自建应用后获取' }), secret('APP_SECRET', 'App Secret')],
  },
  {
    id: 'dingtalk', name: '钉钉', brand: 'dingtalk', color: '#0089ff', publisher: 'official', repo_url: gh('open-dingtalk/dingtalk-mcp'), category: 'office', tags: ['消息', '通讯录', '待办', '日程'], popularity: 9320,
    description: '钉钉开放平台官方 MCP：机器人发消息、查通讯录、建待办与日程、发起审批。',
    capabilities: ['发送工作通知 / 群消息', '按姓名查询员工', '创建待办', '创建日程', '查询考勤'],
    local: npx('dingtalk-mcp@latest'), auth: 'env',
    fields: [field('DINGTALK_Client_ID', 'Client ID（AppKey）'), secret('DINGTALK_Client_Secret', 'Client Secret（AppSecret）'), optional('ACTIVE_PROFILES', '启用的能力', { placeholder: 'dingtalk-contacts,dingtalk-calendar' })],
  },
  {
    id: 'wecom-bot', name: '企业微信群机器人', brand: 'wecom', color: '#2b7cff', mono: '企微', publisher: 'community', repo_url: gh('gotoolkits/mcp-wecombot-server'), category: 'office', tags: ['群消息', 'Markdown', '图片'], popularity: 4210,
    description: '通过企业微信群机器人 Webhook 发送文本、Markdown、图片、图文和文件消息。',
    capabilities: ['send_text 文本消息', 'send_markdown Markdown 消息', 'send_image 图片', 'send_news 图文', 'upload_file 文件'],
    local: cmd('mcp-wecombot-server'), auth: 'env',
    fields: [secret('WECOM_BOT_WEBHOOK_KEY', 'Webhook Key', { hint: '群设置 → 群机器人 → Webhook 地址中 key= 后面的部分' })],
  },
  {
    id: 'notion', name: 'Notion', brand: 'notion', color: '#191919', publisher: 'official', repo_url: gh('makenotion/notion-mcp-server'), category: 'office', tags: ['页面', '数据库', '搜索'], featured: true, popularity: 16820,
    description: 'Notion 官方 MCP：搜索工作区、读写页面与数据库、添加评论。远程方式用 Notion 账号授权即可。',
    capabilities: ['search 搜索页面与数据库', 'fetch 读取页面', 'create-pages 新建页面', 'update-page 更新内容', 'query-database 查询数据库'],
    remote: http('https://mcp.notion.com/mcp'), local: npx('@notionhq/notion-mcp-server'), auth: 'oauth',
    fields: [secret('NOTION_TOKEN', 'Integration Token', { placeholder: 'ntn_…', hint: '本地方式需要：在 Notion → 设置 → 集成 创建内部集成并共享页面' })],
  },
  {
    id: 'slack', name: 'Slack', brand: 'slack', color: '#4a154b', publisher: 'community', repo_url: gh('korotovsky/slack-mcp-server'), category: 'office', tags: ['频道', '私信', '搜索'], popularity: 11240,
    description: '读取频道与私信历史、搜索消息、发送消息；支持 Bot / 用户 Token，不需要管理员审批。',
    capabilities: ['conversations_history 频道历史', 'conversations_replies 线程回复', 'conversations_search_messages 搜索', 'conversations_add_message 发消息', 'channels_list 频道列表'],
    local: npx('slack-mcp-server@latest', '--transport', 'stdio'), auth: 'env',
    fields: [secret('SLACK_MCP_XOXP_TOKEN', 'User OAuth Token', { placeholder: 'xoxp-…' }), optional('SLACK_MCP_ADD_MESSAGE_TOOL', '允许发消息的频道', { placeholder: '留空为只读；true 为全部' })],
  },
  {
    id: 'google-workspace', name: 'Google Workspace', brand: 'google', color: '#4285f4', publisher: 'community', repo_url: gh('taylorwilsdon/google_workspace_mcp'), category: 'office', tags: ['Gmail', '日历', 'Drive', 'Docs'], popularity: 8930,
    description: '一个服务覆盖 Gmail、Google 日历、Drive、Docs、Sheets、Forms 与 Chat，使用 Google OAuth 登录。',
    capabilities: ['search_gmail_messages 搜索邮件', 'send_gmail_message 发邮件', 'get_events / create_event 日程', 'search_drive_files 搜索文件', 'get_doc_content 读取文档'],
    local: uvx('workspace-mcp', '--tool-tier', 'core'), auth: 'env',
    fields: [field('GOOGLE_OAUTH_CLIENT_ID', 'OAuth Client ID'), secret('GOOGLE_OAUTH_CLIENT_SECRET', 'OAuth Client Secret')],
  },
  {
    id: 'google-drive', name: 'Google Drive', brand: 'google-drive', color: '#1fa463', publisher: 'official', repo_url: mcpRef('gdrive', true), category: 'office', tags: ['文件', '搜索'], popularity: 5120,
    description: 'MCP 参考实现：搜索 Google Drive 文件并读取内容，文档、表格、幻灯片自动转成文本。',
    capabilities: ['search 搜索文件', 'gdrive:///<id> 读取文件内容'],
    local: npx('@modelcontextprotocol/server-gdrive'), auth: 'env',
    fields: [field('GDRIVE_CREDENTIALS_PATH', '凭据文件路径', { placeholder: '/data/gdrive/.gdrive-server-credentials.json', hint: '首次运行 auth 子命令完成 OAuth 后生成' })],
  },
  {
    id: 'ms-365', name: 'Microsoft 365', brand: 'microsoft', color: '#0078d4', publisher: 'community', repo_url: gh('softeria/ms-365-mcp-server'), category: 'office', tags: ['Outlook', 'Teams', 'OneDrive', 'Excel'], popularity: 7340,
    description: '通过 Microsoft Graph 访问 Outlook 邮件与日历、OneDrive、Excel、To Do、Teams 与 SharePoint。',
    capabilities: ['list-mail-messages 邮件', 'create-calendar-event 日程', 'list-drive-items 文件', 'get-excel-range 读表格', 'list-chats Teams 会话'],
    local: npx('@softeria/ms-365-mcp-server', '--org-mode'), auth: 'none', fields: [],
  },
  {
    id: 'atlassian-rovo', name: 'Atlassian', brand: 'atlassian', color: '#0052cc', publisher: 'official', repo_url: gh('atlassian/atlassian-mcp-server'), category: 'office', tags: ['Jira', 'Confluence', 'Compass'], popularity: 9870,
    description: 'Atlassian 官方远程 MCP（Rovo）：用 Atlassian 账号授权后搜索、创建、更新 Jira 工单与 Confluence 页面。',
    capabilities: ['searchJiraIssuesUsingJql 搜索工单', 'createJiraIssue 新建工单', 'getConfluencePage 读页面', 'createConfluencePage 写页面'],
    remote: sse('https://mcp.atlassian.com/v1/sse'), auth: 'oauth', fields: [],
  },
  {
    id: 'mcp-atlassian', name: 'Jira & Confluence', brand: 'jira', color: '#2684ff', mono: 'JC', publisher: 'community', repo_url: gh('sooperset/mcp-atlassian'), category: 'office', tags: ['Jira', 'Confluence', 'Server/DC'], popularity: 8410,
    description: '同时支持 Atlassian Cloud 与私有部署（Server / Data Center）的 Jira、Confluence，适合内网环境。',
    capabilities: ['jira_search JQL 搜索', 'jira_create_issue 新建工单', 'jira_transition_issue 流转状态', 'confluence_search CQL 搜索', 'confluence_update_page 更新页面'],
    local: uvx('mcp-atlassian'), auth: 'env',
    fields: [field('JIRA_URL', 'Jira 地址', { placeholder: 'https://jira.example.com' }), optional('JIRA_USERNAME', 'Jira 用户名 / 邮箱'), secret('JIRA_API_TOKEN', 'Jira API Token / PAT'), optional('CONFLUENCE_URL', 'Confluence 地址'), optional('CONFLUENCE_API_TOKEN', 'Confluence Token', { secret: true })],
  },
  {
    id: 'linear', name: 'Linear', brand: 'linear', color: '#5e6ad2', publisher: 'official', repo_url: 'https://linear.app/docs/mcp', category: 'office', tags: ['Issue', '项目', '迭代'], popularity: 6920,
    description: 'Linear 官方远程 MCP：查找、创建、更新 Issue、项目与评论，用 Linear 账号授权。',
    capabilities: ['list_issues 查询 Issue', 'create_issue 新建', 'update_issue 更新', 'list_projects 项目', 'create_comment 评论'],
    remote: http('https://mcp.linear.app/mcp'), auth: 'oauth', fields: [],
  },
  {
    id: 'asana', name: 'Asana', brand: 'asana', color: '#f06a6a', publisher: 'official', repo_url: 'https://developers.asana.com/docs/using-asanas-mcp-server', category: 'office', tags: ['任务', '项目'], popularity: 3260,
    description: 'Asana 官方远程 MCP：查询与创建任务、项目、目标，汇总进度。',
    capabilities: ['asana_search_tasks 搜索任务', 'asana_create_task 新建任务', 'asana_get_project 项目详情', 'asana_list_goals 目标'],
    remote: sse('https://mcp.asana.com/sse'), auth: 'oauth', fields: [],
  },
  {
    id: 'airtable', name: 'Airtable', brand: 'airtable', color: '#fcb400', publisher: 'community', repo_url: gh('domdomegg/airtable-mcp-server'), category: 'office', tags: ['表格', '记录'], popularity: 4580,
    description: '读取 Base 结构，查询、新增、更新、删除记录，也能新建表和字段。',
    capabilities: ['list_bases', 'describe_table 表结构', 'list_records / search_records', 'create_record / update_records', 'create_table'],
    local: npx('airtable-mcp-server'), auth: 'api_key',
    fields: [secret('AIRTABLE_API_KEY', 'Personal Access Token', { placeholder: 'pat…' })],
  },
  {
    id: 'excel', name: 'Excel', brand: 'excel', color: '#107c41', mono: 'X', publisher: 'community', repo_url: gh('haris-musa/excel-mcp-server'), category: 'office', tags: ['xlsx', '图表', '透视表'], popularity: 6750,
    description: '无需安装 Office 即可创建和编辑 Excel：读写单元格、公式、格式、图表与数据透视表。',
    capabilities: ['create_workbook', 'read_data_from_excel', 'write_data_to_excel', 'apply_formula', 'create_chart', 'create_pivot_table'],
    local: uvx('excel-mcp-server', 'stdio'), auth: 'none', fields: [],
  },
  {
    id: 'pandoc', name: 'Pandoc 文档转换', brand: 'pandoc', color: '#6b7280', mono: 'Pd', publisher: 'community', repo_url: gh('vivekVells/mcp-pandoc'), category: 'office', tags: ['Markdown', 'DOCX', 'PDF'], popularity: 2380,
    description: '用 Pandoc 在 Markdown、HTML、DOCX、PDF、EPUB 等格式之间转换文档。',
    capabilities: ['convert-contents 格式转换'],
    local: uvx('mcp-pandoc'), auth: 'none', fields: [],
  },
  {
    id: 'discord', name: 'Discord', brand: 'discord', color: '#5865f2', publisher: 'community', repo_url: gh('SaseQ/discord-mcp'), category: 'office', tags: ['频道', '消息', '机器人'], popularity: 3120,
    description: '让 Discord 机器人读写频道消息、管理频道、角色与 Webhook。',
    capabilities: ['send_message', 'read_messages', 'create_text_channel', 'add_reaction', 'create_webhook'],
    local: docker('saseq/discord-mcp:latest', ['DISCORD_TOKEN']), auth: 'env',
    fields: [secret('DISCORD_TOKEN', 'Bot Token'), optional('DISCORD_GUILD_ID', '默认服务器 ID')],
  },
]

export const awesomeDev: ConnectorDef[] = [
  {
    id: 'context7', name: 'Context7', brand: 'context7', color: '#10b981', mono: 'C7', publisher: 'official', repo_url: gh('upstash/context7'), category: 'devtools', tags: ['文档', '代码示例', '版本'], featured: true, popularity: 19750,
    description: '为 Agent 实时拉取各类开源库的最新文档与代码示例，避免照着过期 API 写代码。',
    capabilities: ['resolve-library-id 查找库', 'get-library-docs 获取指定版本文档'],
    remote: http('https://mcp.context7.com/mcp'), local: npx('@upstash/context7-mcp'), auth: 'none',
    fields: [optional('CONTEXT7_API_KEY', 'API Key（可选，提高限额）', { secret: true })],
  },
  {
    id: 'filesystem', name: 'Filesystem', brand: 'folder', color: '#f59e0b', publisher: 'official', repo_url: mcpRef('filesystem'), category: 'devtools', tags: ['文件', '目录', '参考实现'], popularity: 15230,
    description: 'MCP 参考实现：在允许的目录内读写、移动、搜索文件。只放开必要的目录。',
    capabilities: ['read_text_file', 'write_file', 'edit_file', 'list_directory', 'search_files', 'move_file'],
    local: npx('@modelcontextprotocol/server-filesystem', '{ALLOWED_DIR}'), auth: 'env',
    fields: [field('ALLOWED_DIR', '允许访问的目录', { placeholder: '/data/workspace', hint: '服务端路径；Agent 只能访问这个目录及子目录' })],
  },
  {
    id: 'e2b', name: 'E2B 代码沙箱', brand: 'e2b', color: '#ff8800', mono: 'E2B', publisher: 'official', repo_url: gh('e2b-dev/mcp-server'), category: 'devtools', tags: ['沙箱', 'Python', '代码执行'], popularity: 5840,
    description: '在 E2B 云端隔离沙箱里运行 Python / JS 代码，返回输出、图表和文件。',
    capabilities: ['run_code 执行代码'],
    local: npx('@e2b/mcp-server'), auth: 'api_key',
    fields: [secret('E2B_API_KEY', 'API Key', { placeholder: 'e2b_…' })],
  },
  {
    id: 'sentry', name: 'Sentry', brand: 'sentry', color: '#362d59', publisher: 'official', repo_url: gh('getsentry/sentry-mcp'), category: 'devtools', tags: ['报错', '性能', 'Seer'], popularity: 6210,
    description: 'Sentry 官方 MCP：查询 Issue、错误详情与堆栈、发布版本，并可调用 Seer 分析根因。',
    capabilities: ['find_issues 搜索问题', 'get_issue_details 堆栈与上下文', 'find_releases 版本', 'analyze_issue_with_seer 根因分析'],
    remote: http('https://mcp.sentry.dev/mcp'), local: npx('@sentry/mcp-server'), auth: 'oauth',
    fields: [secret('SENTRY_ACCESS_TOKEN', 'User Auth Token', { hint: '本地方式需要' }), optional('SENTRY_HOST', '私有部署地址', { placeholder: 'sentry.example.com' })],
  },
  {
    id: 'jetbrains', name: 'JetBrains IDE', brand: 'jetbrains', color: '#000000', mono: 'JB', publisher: 'official', repo_url: gh('JetBrains/mcp-jetbrains'), category: 'devtools', tags: ['IDEA', 'PyCharm', '重构'], popularity: 4370,
    description: '连接本机运行的 JetBrains IDE，读取项目文件、运行配置、查看问题与执行终端命令。',
    capabilities: ['get_open_in_editor_file_text', 'find_files_by_name_substring', 'get_project_problems', 'execute_terminal_command', 'run_configuration'],
    local: npx('@jetbrains/mcp-proxy'), auth: 'none', fields: [optional('IDE_PORT', 'IDE 端口', { placeholder: '63342' })],
  },
  {
    id: 'next-devtools', name: 'Next.js DevTools', brand: 'vercel', color: '#000000', mono: 'N', publisher: 'official', repo_url: gh('vercel/next-devtools-mcp'), category: 'devtools', tags: ['Next.js', '路由', '诊断'], popularity: 2960,
    description: 'Vercel 官方：读取 Next.js 开发服务器的运行时错误、路由与日志，查文档、给出升级指引。',
    capabilities: ['nextjs_runtime 运行时诊断', 'nextjs_docs 文档检索', 'upgrade_nextjs_16 升级指引'],
    local: npx('next-devtools-mcp@latest'), auth: 'none', fields: [],
  },
]

export const awesomeCode: ConnectorDef[] = [
  {
    id: 'github', name: 'GitHub', brand: 'github', color: '#24292f', publisher: 'official', repo_url: gh('github/github-mcp-server'), category: 'code', tags: ['仓库', 'PR', 'Issue', 'Actions'], featured: true, popularity: 24610,
    description: 'GitHub 官方 MCP：浏览代码、管理 Issue 与 PR、查看 Actions 运行和安全告警。',
    capabilities: ['search_repositories / get_file_contents', 'create_issue / list_issues', 'create_pull_request / merge_pull_request', 'list_workflow_runs Actions', 'list_code_scanning_alerts'],
    remote: http('https://api.githubcopilot.com/mcp/', bearer('GITHUB_PERSONAL_ACCESS_TOKEN')),
    local: docker('ghcr.io/github/github-mcp-server', ['GITHUB_PERSONAL_ACCESS_TOKEN'], 'stdio'), auth: 'api_key',
    fields: [secret('GITHUB_PERSONAL_ACCESS_TOKEN', 'Personal Access Token', { placeholder: 'github_pat_…', hint: 'GitHub → Settings → Developer settings 生成，按需勾选仓库权限' })],
  },
  {
    id: 'gitlab', name: 'GitLab', brand: 'gitlab', color: '#fc6d26', publisher: 'official', repo_url: mcpRef('gitlab', true), category: 'code', tags: ['仓库', 'MR', 'Issue', '私有部署'], popularity: 8120,
    description: 'MCP 参考实现：管理 GitLab 项目、文件、分支、Issue 与 Merge Request，支持自建实例。',
    capabilities: ['search_repositories', 'get_file_contents / push_files', 'create_issue', 'create_merge_request', 'create_branch'],
    local: npx('@modelcontextprotocol/server-gitlab'), auth: 'env',
    fields: [secret('GITLAB_PERSONAL_ACCESS_TOKEN', 'Personal Access Token', { placeholder: 'glpat-…' }), optional('GITLAB_API_URL', 'API 地址', { placeholder: 'https://gitlab.example.com/api/v4' })],
  },
  {
    id: 'gitee', name: 'Gitee', brand: 'gitee', color: '#c71d23', publisher: 'official', repo_url: 'https://gitee.com/oschina/mcp-gitee', category: 'code', tags: ['仓库', 'PR', 'Issue', '国内'], popularity: 5260,
    description: 'Gitee 官方 MCP：仓库、Issue、Pull Request 与通知管理，适合国内代码托管。',
    capabilities: ['list_user_repos', 'get_file_content', 'create_issue', 'create_pull', 'merge_pull'],
    local: npx('@gitee/mcp-gitee@latest'), auth: 'api_key',
    fields: [secret('GITEE_ACCESS_TOKEN', '私人令牌'), optional('GITEE_API_BASE', 'API 地址（企业版）')],
  },
  {
    id: 'bitbucket', name: 'Bitbucket', brand: 'bitbucket', color: '#2684ff', publisher: 'community', repo_url: gh('aashari/mcp-server-atlassian-bitbucket'), category: 'code', tags: ['仓库', 'PR'], popularity: 1980,
    description: '浏览 Bitbucket Cloud 工作区与仓库，查看、评论、创建 Pull Request。',
    capabilities: ['bb_ls_repos', 'bb_get_file', 'bb_ls_prs', 'bb_add_pr_comment', 'bb_add_pr'],
    local: npx('@aashari/mcp-server-atlassian-bitbucket'), auth: 'env',
    fields: [field('ATLASSIAN_USER_EMAIL', 'Atlassian 邮箱'), secret('ATLASSIAN_API_TOKEN', 'API Token')],
  },
  {
    id: 'azure-devops', name: 'Azure DevOps', brand: 'azure', color: '#0078d4', mono: 'ADO', publisher: 'community', repo_url: gh('Tiberriver256/mcp-server-azure-devops'), category: 'code', tags: ['Repos', 'Boards', 'Pipelines'], popularity: 2440,
    description: '管理 Azure DevOps 的仓库、工作项、Pull Request 与流水线。',
    capabilities: ['list_repositories', 'get_work_item / create_work_item', 'list_pull_requests', 'list_pipelines / trigger_pipeline'],
    local: npx('@tiberriver256/mcp-server-azure-devops'), auth: 'env',
    fields: [field('AZURE_DEVOPS_ORG_URL', '组织地址', { placeholder: 'https://dev.azure.com/your-org' }), field('AZURE_DEVOPS_AUTH_METHOD', '认证方式', { placeholder: 'pat' }), secret('AZURE_DEVOPS_PAT', 'Personal Access Token')],
  },
  {
    id: 'git', name: 'Git', brand: 'git', color: '#f05032', publisher: 'official', repo_url: mcpRef('git'), category: 'code', tags: ['本地仓库', 'diff', 'log', '参考实现'], popularity: 9640,
    description: 'MCP 参考实现：读取、搜索、操作服务端的本地 Git 仓库——状态、差异、提交、分支。',
    capabilities: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_create_branch / git_checkout'],
    local: uvx('mcp-server-git', '--repository', '{REPO_PATH}'), auth: 'env',
    fields: [field('REPO_PATH', '仓库路径', { placeholder: '/data/repos/raccoonx' })],
  },
]

export const awesomeData: ConnectorDef[] = [
  {
    id: 'postgres', name: 'PostgreSQL', brand: 'postgres', color: '#336791', mono: 'PG', publisher: 'community', repo_url: gh('crystaldba/postgres-mcp'), category: 'database', tags: ['SQL', '索引调优', '健康检查'], popularity: 12380,
    description: 'Postgres MCP Pro：查询表结构、执行 SQL（可限制只读），给出索引建议、慢查询与健康检查。',
    capabilities: ['list_schemas / list_objects', 'execute_sql', 'explain_query', 'analyze_workload_indexes 索引建议', 'analyze_db_health'],
    local: uvx('postgres-mcp', '--access-mode=restricted'), auth: 'env',
    fields: [secret('DATABASE_URI', '连接串', { placeholder: 'postgresql://user:pass@host:5432/db' })],
  },
  {
    id: 'mysql', name: 'MySQL', brand: 'mysql', color: '#00758f', publisher: 'community', repo_url: gh('designcomputer/mysql_mcp_server'), category: 'database', tags: ['SQL', '表结构'], popularity: 10560,
    description: '列出表、读取数据、执行 SQL，可配置访问控制；适合把业务库开放给 Agent 做只读分析。',
    capabilities: ['list_tables', 'read table 资源', 'execute_sql'],
    local: uvx('--from', 'mysql-mcp-server', 'mysql_mcp_server'), auth: 'env',
    fields: [field('MYSQL_HOST', '主机', { placeholder: '10.0.0.12' }), optional('MYSQL_PORT', '端口', { placeholder: '3306' }), field('MYSQL_USER', '用户名'), secret('MYSQL_PASSWORD', '密码'), field('MYSQL_DATABASE', '数据库')],
  },
  {
    id: 'sqlite', name: 'SQLite', brand: 'sqlite', color: '#0f80cc', publisher: 'official', repo_url: mcpRef('sqlite', true), category: 'database', tags: ['SQL', '本地文件', 'BI'], popularity: 6830,
    description: 'MCP 参考实现：对 SQLite 文件执行查询、建表，并把分析结论写进备忘录资源。',
    capabilities: ['read_query', 'write_query', 'create_table', 'list_tables / describe_table', 'append_insight'],
    local: uvx('mcp-server-sqlite', '--db-path', '{DB_PATH}'), auth: 'env',
    fields: [field('DB_PATH', '数据库文件路径', { placeholder: '/data/analytics.db' })],
  },
  {
    id: 'mongodb', name: 'MongoDB', brand: 'mongodb', color: '#00684a', publisher: 'official', repo_url: gh('mongodb-js/mongodb-mcp-server'), category: 'database', tags: ['文档数据库', 'Atlas', '聚合'], popularity: 7920,
    description: 'MongoDB 官方 MCP：查询集合、聚合分析、查看索引与 Schema，也能管理 Atlas 集群。',
    capabilities: ['find / aggregate', 'collection-schema', 'list-databases / list-collections', 'create-index', 'atlas-list-clusters'],
    local: npx('mongodb-mcp-server', '--readOnly'), auth: 'env',
    fields: [secret('MDB_MCP_CONNECTION_STRING', '连接串', { placeholder: 'mongodb+srv://…' })],
  },
  {
    id: 'redis', name: 'Redis', brand: 'redis', color: '#dc382d', publisher: 'official', repo_url: gh('redis/mcp-redis'), category: 'database', tags: ['缓存', 'KV', '向量'], popularity: 6140,
    description: 'Redis 官方 MCP：用自然语言读写字符串、哈希、列表、集合、Stream 与 JSON，支持向量检索。',
    capabilities: ['get / set', 'hset / hgetall', 'lpush / lrange', 'xadd / xrange', 'vector_search_hash'],
    local: uvx('--from', 'redis-mcp-server@latest', 'redis-mcp-server', '--url', '{REDIS_URL}'), auth: 'env',
    fields: [secret('REDIS_URL', '连接地址', { placeholder: 'redis://:password@host:6379/0' })],
  },
  {
    id: 'supabase', name: 'Supabase', brand: 'supabase', color: '#3ecf8e', publisher: 'official', repo_url: gh('supabase-community/supabase-mcp'), category: 'database', tags: ['Postgres', 'Edge Functions', '迁移'], popularity: 7460,
    description: 'Supabase 官方 MCP：管理表结构与迁移、执行 SQL、查看日志、部署 Edge Functions。',
    capabilities: ['list_tables', 'apply_migration', 'execute_sql', 'get_logs', 'deploy_edge_function'],
    remote: http('https://mcp.supabase.com/mcp'), local: npx('@supabase/mcp-server-supabase@latest', '--read-only', '--project-ref={PROJECT_REF}'), auth: 'oauth',
    fields: [secret('SUPABASE_ACCESS_TOKEN', 'Access Token', { hint: '本地方式需要' }), field('PROJECT_REF', 'Project Ref', { placeholder: 'abcdefghijklmnop' })],
  },
  {
    id: 'neon', name: 'Neon', brand: 'neon', color: '#00e599', publisher: 'official', repo_url: gh('neondatabase/mcp-server-neon'), category: 'database', tags: ['Serverless Postgres', '分支'], popularity: 3880,
    description: 'Neon 官方：创建和管理 Serverless Postgres 项目、数据库分支，执行 SQL 与迁移。',
    capabilities: ['list_projects / create_project', 'create_branch', 'run_sql', 'prepare_database_migration'],
    remote: http('https://mcp.neon.tech/mcp'), auth: 'oauth', fields: [],
  },
  {
    id: 'clickhouse', name: 'ClickHouse', brand: 'clickhouse', color: '#faff69', mono: 'CH', publisher: 'official', repo_url: gh('ClickHouse/mcp-clickhouse'), category: 'database', tags: ['OLAP', 'SQL', 'chDB'], popularity: 4690,
    description: 'ClickHouse 官方 MCP：浏览库表、执行只读 SQL，适合日志与指标分析。',
    capabilities: ['list_databases', 'list_tables', 'run_select_query', 'run_chdb_select_query'],
    local: uvx('mcp-clickhouse'), auth: 'env',
    fields: [field('CLICKHOUSE_HOST', '主机'), field('CLICKHOUSE_USER', '用户名'), secret('CLICKHOUSE_PASSWORD', '密码'), optional('CLICKHOUSE_PORT', '端口', { placeholder: '8443' })],
  },
  {
    id: 'elasticsearch', name: 'Elasticsearch', brand: 'elastic', color: '#00bfb3', mono: 'ES', publisher: 'community', repo_url: gh('cr7258/elasticsearch-mcp-server'), category: 'database', tags: ['检索', '索引', 'OpenSearch'], popularity: 4870,
    description: '查询索引与文档、查看映射与集群健康，兼容 Elasticsearch 7/8/9 与 OpenSearch。',
    capabilities: ['list_indices', 'get_mapping', 'search_documents', 'get_cluster_health', 'index_document'],
    local: uvx('elasticsearch-mcp-server'), auth: 'env',
    fields: [field('ELASTICSEARCH_HOSTS', '地址', { placeholder: 'https://es.example.com:9200' }), optional('ELASTICSEARCH_USERNAME', '用户名'), optional('ELASTICSEARCH_PASSWORD', '密码', { secret: true })],
  },
  {
    id: 'neo4j', name: 'Neo4j', brand: 'neo4j', color: '#018bff', publisher: 'official', repo_url: gh('neo4j-contrib/mcp-neo4j'), category: 'database', tags: ['图数据库', 'Cypher', '知识图谱'], popularity: 3540,
    description: '读取图模型、执行 Cypher 读写，也可以把 Neo4j 当作知识图谱记忆。',
    capabilities: ['get_neo4j_schema', 'read_neo4j_cypher', 'write_neo4j_cypher'],
    local: uvx('mcp-neo4j-cypher'), auth: 'env',
    fields: [field('NEO4J_URI', '地址', { placeholder: 'neo4j://localhost:7687' }), field('NEO4J_USERNAME', '用户名'), secret('NEO4J_PASSWORD', '密码')],
  },
  {
    id: 'antv-chart', name: 'AntV 图表', brand: 'antv', color: '#1677ff', mono: 'AntV', publisher: 'official', repo_url: gh('antvis/mcp-server-chart'), category: 'data', tags: ['可视化', '25+ 图表', '地图'], featured: true, popularity: 10920,
    description: '蚂蚁 AntV 官方：根据数据生成折线、柱状、饼图、桑基、地图等 25 种以上图表，返回图片链接。',
    capabilities: ['generate_line_chart', 'generate_column_chart', 'generate_pie_chart', 'generate_sankey_chart', 'generate_district_map'],
    local: npx('@antv/mcp-server-chart'), auth: 'none',
    fields: [optional('VIS_REQUEST_SERVER', '私有化渲染服务地址', { hint: '内网部署时指向自建的图表渲染服务' })],
  },
  {
    id: 'snowflake', name: 'Snowflake', brand: 'snowflake', color: '#29b5e8', publisher: 'official', repo_url: gh('Snowflake-Labs/mcp'), category: 'data', tags: ['数仓', 'Cortex', 'SQL'], popularity: 3170,
    description: 'Snowflake 官方：调用 Cortex Agent / Search / Analyst、执行 SQL、管理对象，带 RBAC 控制。',
    capabilities: ['cortex_search', 'cortex_analyst', 'run_snowflake_query', 'list_objects'],
    local: uvx('snowflake-labs-mcp', '--service-config-file', '{CONFIG_FILE}'), auth: 'env',
    fields: [field('SNOWFLAKE_ACCOUNT', 'Account'), field('SNOWFLAKE_USER', '用户名'), secret('SNOWFLAKE_PASSWORD', '密码 / PAT'), field('CONFIG_FILE', '服务配置文件', { placeholder: '/data/snowflake/tools_config.yaml' })],
  },
  {
    id: 'bigquery', name: 'BigQuery', brand: 'google-cloud', color: '#4285f4', mono: 'BQ', publisher: 'community', repo_url: gh('LucasHild/mcp-server-bigquery'), category: 'data', tags: ['数仓', 'SQL', 'GCP'], popularity: 2860,
    description: '查看 BigQuery 数据集与表结构，执行查询。',
    capabilities: ['list-tables', 'describe-table', 'execute-query'],
    local: uvx('mcp-server-bigquery', '--project', '{PROJECT}', '--location', '{LOCATION}'), auth: 'env',
    fields: [field('PROJECT', 'GCP 项目 ID'), field('LOCATION', '位置', { placeholder: 'asia-east1' }), optional('GOOGLE_APPLICATION_CREDENTIALS', '服务账号密钥路径')],
  },
  {
    id: 'dbt', name: 'dbt', brand: 'dbt', color: '#ff694b', publisher: 'official', repo_url: gh('dbt-labs/dbt-mcp'), category: 'data', tags: ['数据建模', '语义层', '血缘'], popularity: 2130,
    description: 'dbt 官方：运行 dbt 命令、查询模型元数据与血缘、通过语义层取指标。',
    capabilities: ['build / run / test', 'get_model_details', 'get_model_parents', 'query_metrics'],
    local: uvx('dbt-mcp'), auth: 'env',
    fields: [field('DBT_PROJECT_DIR', '项目目录'), optional('DBT_HOST', 'dbt Cloud 地址'), optional('DBT_TOKEN', 'dbt Cloud Token', { secret: true })],
  },
  {
    id: 'motherduck', name: 'DuckDB / MotherDuck', brand: 'duckdb', color: '#fff000', mono: 'Duck', publisher: 'official', repo_url: gh('motherduckdb/mcp-server-motherduck'), category: 'data', tags: ['DuckDB', 'Parquet', '本地分析'], popularity: 2650,
    description: '用 DuckDB 直接查询本地或 S3 上的 Parquet / CSV，也可连接 MotherDuck 云端。',
    capabilities: ['query 执行 SQL'],
    local: uvx('mcp-server-motherduck', '--db-path', ':memory:'), auth: 'none',
    fields: [optional('motherduck_token', 'MotherDuck Token', { secret: true })],
  },
  {
    id: 'posthog', name: 'PostHog', brand: 'posthog', color: '#f54e00', publisher: 'official', repo_url: gh('PostHog/posthog/tree/master/services/mcp'), category: 'data', tags: ['产品分析', '功能开关', '实验'], popularity: 1940,
    description: 'PostHog 官方：查询洞察与看板、管理功能开关与实验、检索错误。',
    capabilities: ['query-run 趋势查询', 'insights-get-all', 'feature-flag-get-all / create', 'experiment-get', 'list-errors'],
    remote: http('https://mcp.posthog.com/mcp', bearer('POSTHOG_API_KEY')), auth: 'api_key',
    fields: [secret('POSTHOG_API_KEY', 'Personal API Key', { placeholder: 'phx_…' })],
  },
]
