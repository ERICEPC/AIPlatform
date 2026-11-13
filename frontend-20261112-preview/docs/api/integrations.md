# 集成模块接口清单

- 代码：类型与请求函数 `src/api/integrations/*.ts`（入口 `@/api/integrations`），mock `src/api/mock/integrations/*.ts`。
- 路径相对控制台前缀 `/console/api`（`VITE_API_BASE`）。**插件市场搜索例外**：走独立服务，前缀 `VITE_MARKETPLACE_API`。
- 页面（侧栏名「MCP」，路由 id 仍为 `integrations`）：`#integrations` → 已接入的 MCP 服务（默认）；`#integrations/marketplace[/<connectorId>]` → 插件市场（MCP 连接器市场，带 id 打开详情，见 3.2）；`#integrations/marketplace/<tool|model>` → 原工具 / 模型插件市场（个人设置的模型页从这里安装供应商）。旧的 `#integrations/<model-provider|tools|...>` 深链接都落到「已接入」。
- 模型供应商（第 1 节）已移到个人设置的「模型」页；第 2、4–10 节、调试与权限目前没有页面入口，接口与 mock 保留供后端对接。
- 多语言字段为 `I18nText = { zh_Hans?, en_US }`，页面取 `zh_Hans`。插件图标 mock 用 `tile:<字>:<色>`，live 下为后端返回的 URL。
- mock 是有状态的内存数据：安装会生成一个约 2 秒后完成的任务并写入已安装列表；卸载、开关、凭据增删都会保留到刷新页面为止。本地包文件名含 `broken` 时模拟安装失败。

> RaccoonX 相对上游的扩展字段：`identity_mode`（MCP 转发用户身份）、`visibility`（工具凭据可见范围）、`preserve_credentials`（卸载保留凭据）、分类化已安装列表 `GET /workspaces/current/plugin/{category}/list`、按分类的自动更新 `auto-upgrade/fetch|change`。

---

## 公共（插件市场的安装、任务、自动更新；调试 / 权限暂无入口）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 调试面板 | `GET /workspaces/current/plugin/debugging-key` | — | `{ host, port, key }`，界面显示 `host:port` 与脱敏 key |
| 读权限 | `GET /workspaces/current/plugin/permission/fetch` | — | `{ install_permission, debug_permission }`，取值 `everyone \| admins \| noone` |
| 改权限（立即生效） | `POST /workspaces/current/plugin/permission/change` | `{ install_permission, debug_permission }` | `{ success }` |
| 分类已安装插件 | `GET /workspaces/current/plugin/{category}/list` | `page, page_size, query, tags[]` | `{ plugins: PluginDetail[], has_more }` |
| 安装任务（进行中时每 1.2s 轮询） | `GET /workspaces/current/plugin/tasks?page=1&page_size=100` | — | `{ tasks: [{ id, status, total_plugins, completed_plugins, plugins: [{ plugin_unique_identifier, plugin_id, status, message, icon, labels }] }] }` |
| 清除一条任务记录 | `POST /workspaces/current/plugin/tasks/{task_id}/delete/{identifier}` | — | `{ success }` |
| 自动更新（读） | `GET /workspaces/current/plugin/auto-upgrade/fetch?category=` | — | `{ auto_upgrade: { strategy_setting: disabled\|fix_only\|latest, upgrade_time_of_day(UTC 秒), upgrade_mode: all\|exclude\|partial, exclude_plugins[], include_plugins[] } }` |
| 自动更新（写） | `POST /workspaces/current/plugin/auto-upgrade/change` | `{ category, auto_upgrade }` | `{ success }` |

### 安装

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 从插件市场安装 | `POST /workspaces/current/plugin/install/marketplace` | `{ plugin_unique_identifiers: string[] }` | `{ all_installed, task_id }` |
| GitHub：解析包 | `POST /workspaces/current/plugin/upload/github` | `{ repo, version, package }` | `{ unique_identifier, manifest }` |
| GitHub：安装 | `POST /workspaces/current/plugin/install/github` | `{ repo, version, package, plugin_unique_identifier }` | `{ all_installed, task_id }` |
| 本地包：上传 | `POST /workspaces/current/plugin/upload/pkg` | multipart `pkg`（插件包 / 插件集合包） | `{ unique_identifier, manifest }` |
| 本地包：安装 | `POST /workspaces/current/plugin/install/pkg` | `{ plugin_unique_identifiers }` | `{ all_installed, task_id }` |

GitHub 的 Release / 资产列表在原实现中由前端直接请求 GitHub API，本前端 mock 用固定的三个版本演示（`install.tsx` 中 `fakeReleases`），接入时替换。

### 插件「⋯」菜单（所有分类通用）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 检查更新 | `GET {插件市场}/plugins/{org}/{name}` | — | `{ data: { plugin, version: { version, unique_identifier } } }` |
| 更新 | `POST /workspaces/current/plugin/upgrade/marketplace` | `{ original_plugin_unique_identifier, new_plugin_unique_identifier }` | `{ all_installed, task_id }` |
| 查看 README | `GET /workspaces/current/plugin/readme` | `plugin_unique_identifier, language=zh_Hans` | `{ readme }`（Markdown） |
| 插件信息 | —（来自列表字段 `source, meta{repo,version,package}, plugin_unique_identifier`） | | |
| 移除 | `POST /workspaces/current/plugin/uninstall` | `{ plugin_installation_id, preserve_credentials }` | `{ success }` |

### 插件市场（独立服务）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 搜索 / 分类浏览 | `POST {VITE_MARKETPLACE_API}/plugins/search/advanced` | `{ category, query, page, page_size, sort_by: install_count, sort_order: DESC }`（mock 额外支持 `exclude_installed`） | `{ data: { plugins: MarketplacePlugin[], total } }`；条目字段 `org, name, plugin_id, label, brief, icon, install_count, tags, verified, latest_version, latest_package_identifier` |

---

## 1. 模型供应商

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 供应商列表 | `GET /workspaces/current/model-providers` | — | `{ data: ModelProvider[] }`：`provider, label, icon_small, supported_model_types, configurate_methods, provider_credential_schema, model_credential_schema, preferred_provider_type, custom_configuration{status, current_credential_id, current_credential_name, available_credentials[]}, system_configuration{enabled, quota_configurations[]}`；RaccoonX 附带插件字段 `plugin_id, plugin_unique_identifier, installation_id, version, latest_version, source, author` |
| 模型列表 | `GET /workspaces/current/model-providers/{provider}/models` | — | `{ data: ModelItem[] }`：`model, label, model_type, features[], fetch_from, status, model_properties{context_size, mode}, deprecated, load_balancing_enabled, has_invalid_load_balancing_configs` |
| 启用 / 停用模型 | `PATCH .../models/enable` \| `.../models/disable` | `{ model, model_type }` | `{ result }` |
| 移除自定义模型 | `DELETE .../models` | `{ model, model_type }` | `{ result }` |
| 读一条凭据（编辑回填） | `GET .../credentials?credential_id=` | — | `{ credentials }` |
| 新增凭据 | `POST .../credentials` | `{ credentials, name }` | `{ result }` |
| 修改凭据 | `PUT .../credentials` | `{ credential_id, credentials, name }` | `{ result }` |
| 删除凭据 | `DELETE .../credentials` | `{ credential_id }` | `{ result }` |
| 切换使用中的凭据 | `POST .../credentials/switch` | `{ credential_id }` | `{ result }` |
| 添加自定义模型 | `POST .../models/credentials` | `{ model, model_type, credentials, name }` | `{ result }` |
| 读模型负载均衡 | `GET .../models/credentials?model=&model_type=` | — | `{ credentials, load_balancing{enabled, configs[]}, available_credentials[] }` |
| 保存负载均衡 | `POST .../models` | `{ model, model_type, load_balancing: { enabled, configs: [{ id?, name, enabled, credential_id? }] } }`；`name: "__inherit__"` 表示沿用供应商凭据 | `{ result }` |
| 使用优先级 | `POST .../preferred-provider-type` | `{ preferred_provider_type: system \| custom }` | `{ result }` |
| 默认模型（读） | `GET /workspaces/current/default-model?model_type=` | `llm \| text-embedding \| rerank \| speech2text \| tts` | `{ data: { model, model_type, provider{provider, icon_small, label} } \| null }` |
| 默认模型（写） | `POST /workspaces/current/default-model` | `{ model_settings: [{ model_type, provider, model }] }` | `{ result }` |

凭据表单由 `credential_form_schemas` 驱动：`variable, label, type(text-input|secret-input|select|radio|boolean|number), required, default, options[{label, value, show_on}], placeholder, show_on[{variable, value}]`。添加模型时以 `__model_type` 作为 show_on 的上下文变量。

## 2. 工具插件

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 列表 | `GET /workspaces/current/plugin/tool/list` | `page, page_size, query, tags[]` | `{ plugins: PluginDetail[], builtin_tools: ToolCollection[], has_more }` |
| 动作列表 | `GET /workspaces/current/tool-provider/builtin/{provider}/tools` | — | `ToolAction[]`（`name, label, description, parameters[]`） |
| 授权信息 | `GET .../builtin/{provider}/credential/info` | — | `{ supported_credential_types: (api-key\|oauth2)[], credentials: [{ id, name, credential_type, is_default, visibility, created_by }], is_oauth_custom_client_enabled }` |
| API Key 表单 | `GET .../builtin/{provider}/credential/schema/api-key` | — | `CredentialFormSchema[]` |
| 添加凭据 | `POST .../builtin/{provider}/add` | `{ credentials, type: 'api-key', name, visibility: only_me \| all_team_members }` | `{ result }` |
| 改名 / 编辑 / 改可见范围 | `POST .../builtin/{provider}/update` | `{ credential_id, credentials?, name?, visibility? }` | `{ result }` |
| 删除 | `POST .../builtin/{provider}/delete` | `{ credential_id }` | `{ result }` |
| 设为默认 | `POST .../builtin/{provider}/default-credential` | `{ id }` | `{ result }` |
| OAuth 授权地址 | `GET /oauth/plugin/{provider}/tool/authorization-url?visibility=` | — | `{ authorization_url, state, context_id }`；前端新窗口打开并轮询 `credential/info` |
| OAuth 客户端（读） | `GET .../builtin/{provider}/oauth/client-schema` | — | `{ schema, is_oauth_custom_client_enabled, is_system_oauth_params_exists, client_params, redirect_uri }` |
| OAuth 客户端（写） | `POST .../builtin/{provider}/oauth/custom-client` | `{ client_params, enable_oauth_custom_client }` | `{ result }` |

## 3. MCP

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 列表 | `GET /workspaces/current/tools/mcp` | — | `ToolCollection[]`（含 `server_url, server_identifier, is_team_authorization, tools[], timeout, sse_read_timeout, masked_headers, is_dynamic_registration, authentication, identity_mode, updated_at`；RaccoonX 扩展 `transport, command, args[], masked_env, imported_from`） |
| 添加 | `POST /workspaces/current/tool-provider/mcp` | `{ name, transport: streamable_http\|sse\|stdio, server_url（远程必填）, command + args[] + env{}（stdio 必填）, icon_type, icon, icon_background, server_identifier, timeout(30), sse_read_timeout(300), headers{}, authentication{client_id, client_secret}\|null, is_dynamic_registration, identity_mode: idp_token \| off }` | `ToolCollection` |
| 修改 | `PUT /workspaces/current/tool-provider/mcp` | 同上 + `provider_id` | `{ result }` |
| 移除 | `DELETE /workspaces/current/tool-provider/mcp` | `{ provider_id }` | `{ result }` |
| 授权 / 重新授权 | `POST /workspaces/current/tool-provider/mcp/auth` | `{ provider_id, authorization_code? }` | `{ result }` 或 `{ authorization_url }`（需用户登录时） |
| 获取工具 | `GET /workspaces/current/tool-provider/mcp/tools/{provider_id}` | — | `{ tools }` |
| 更新工具（需确认） | `GET /workspaces/current/tool-provider/mcp/update/{provider_id}` | — | `{ tools }` |

页面：「已接入」顶部三种添加方式——手动添加（URL / 命令）、从其他工具导入（扫描 / 粘贴配置 JSON）、从插件市场安装（切到插件市场）；下面是服务卡片，点开为详情抽屉（授权、工具、连接设置、编辑、移除）。

### 3.1 导入（RaccoonX 扩展，`src/api/integrations/mcp-import.ts`）

浏览器读不到本机文件：扫描由后端经已连接的 RaccoonX 本机助手读取 `~/.claude.json`（及项目 `.mcp.json`）、`~/.kiro/settings/mcp.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json` 后返回。env / headers 的值只在服务端流转，扫描结果只给变量名。

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 扫描（`scanMcpImports`） | `POST /workspaces/current/tool-provider/mcp/import/scan` | `{ sources?: (claude_code\|kiro\|codex\|cursor)[] }`，缺省全部 | `{ scan_id, scanned_at, device?, sources: [{ source, label, config_path, detected, servers: [{ ref, name, transport, server_url?, command?, args?, env_keys?, header_keys?, imported, provider_id? }] }] }`；本机助手未连接时 409 |
| 导入（`importMcpServers`） | `POST /workspaces/current/tool-provider/mcp/import` | 扫描结果 `{ scan_id, refs[] }`，或粘贴配置 `{ servers: [{ name, server_identifier?, transport, server_url?, command?, args?, env?, headers? }] }`；可带 `identity_mode` | `{ imported: ToolCollection[], skipped: [{ name, reason }] }`；相同地址 / 命令已接入的进 skipped，标识重名自动加后缀，新建的为待授权；扫描过期 410 |

粘贴配置在前端解析（`mcp/parse-config.ts`），兼容 `mcpServers` / `servers` / `mcp_servers` / 直接粘贴服务器表或片段；`url|serverUrl|httpUrl` 视为远程（`type: sse` 或地址以 `/sse` 结尾为 SSE），`command` 视为 stdio。

### 3.2 连接器市场（RaccoonX 扩展，`src/api/integrations/connectors.ts`）

「插件市场」页签。目录是两个上游仓库的快照，由后端定期同步：[awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) 精选的常用服务（102 个，含少量 awesome 未收录、按官方仓库补入的官方服务）+ [volcengine/mcp-server](https://github.com/volcengine/mcp-server) `server/` 下全部 84 个火山引擎官方服务。mock 数据在 `src/api/mock/integrations/connectors-data-*.ts`。

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 目录（`listConnectors`） | `GET /workspaces/current/tool-provider/mcp/connectors` | `category?, source?: awesome\|volcengine, keyword?, featured?` | `{ data: Connector[], total, categories: [{ id, count }]（受来源与关键词影响）, sources: [{ id, name, url, synced_at, commit, total }]（只受关键词影响） }`，按 `popularity` 降序 |
| 详情（`getConnector`） | `GET /workspaces/current/tool-provider/mcp/connectors/{id}` | — | `Connector`；不存在 404 |
| OAuth 授权地址（`getConnectorOAuthUrl`） | `GET /workspaces/current/tool-provider/mcp/connectors/{id}/oauth/authorization-url` | — | `{ authorization_url }`，新窗口打开，回调拿到 code |
| 一键接入（`connectConnector`） | `POST /workspaces/current/tool-provider/mcp/connectors/{id}/connect` | `{ name, transport: streamable_http\|sse\|stdio, server_url?, command?, args?, credentials?: { [field.key]: value }, authorization_code? }` | 新建的 MCP 服务 `ToolCollection`（出现在「已接入」，已授权、带工具列表）；已连接 409，缺必填字段 / 未授权 400 |

`Connector`：`id, name, brand?（品牌标识，前端映射图标）, color?, mono?（图标短字）, publisher: official|community|volcengine, source: awesome|volcengine, repo_url, category, tags[], description, capabilities[]（主要工具 / 能力）, remote?: { transport, url, auth_header?: { name, value } }, local?: { command, args[] }, auth: oauth|api_key|env|none, fields: [{ key, label, secret?, required?, placeholder?, hint }], featured?, popularity, connected, provider_id? }`。

分类 `category`：office 办公协作 · devtools 开发工具 · code 代码托管 · database 数据库 · data 数据与分析 · search 搜索与网页 · browser 浏览器与设备自动化 · cloud 云平台与运维 · design 设计与内容 · life 地图与生活 · finance 金融支付 · ai AI 与知识 · security 安全 · other 其他。火山引擎服务按产品映射进这些分类，另用 `source` 区分。

接入规则（前后端一致，纯函数 `connectorFields` / `fillTemplate` 在接口文件中）：
- 本地命令（stdio）：需要全部 `fields`；值写入 `env`，同时替换 `args` 里的 `{KEY}` 占位符。
- 远程：只需要 `remote.url` / `remote.auth_header.value` 里引用到的字段；`auth = oauth` 时须先授权，带 `authorization_code`。
- 服务标识取连接器 id，重名自动加 `-2`…；返回的 `server_url` / `args` 中密钥值脱敏，后端保存原值。
- `connected` 由「连接器 → 服务」关联判断，服务在「已接入」被移除后自动恢复为未连接。

## 4. 工作流即工具

工作流工具在工作流编排页「发布 → 发布为工具」时创建，这里只管理。

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 列表 | `GET /workspaces/current/tools/workflow` | — | `ToolCollection[]` |
| 详情 | `GET /workspaces/current/tool-provider/workflow/get?workflow_tool_id=` | — | `{ workflow_app_id, workflow_tool_id, name(调用名), label, description, icon{content, background}, parameters[{name, description, form: llm\|form, required, type}], output_schema, privacy_policy, labels, synced }` |
| 保存 | `POST /workspaces/current/tool-provider/workflow/update` | `{ workflow_tool_id, name, label, description, icon, parameters, labels, privacy_policy }` | `{ result }` |
| 删除 | `POST /workspaces/current/tool-provider/workflow/delete` | `{ workflow_tool_id }` | `{ result }` |

## 5. API 即工具（OpenAPI / Swagger）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 列表 | `GET /workspaces/current/tools/api` | — | `ToolCollection[]` |
| 详情 | `GET /workspaces/current/tool-provider/api/get?provider=` | — | `{ provider, credentials, icon, schema_type, schema, privacy_policy, custom_disclaimer, labels }` |
| 从 URL 导入 | `GET /workspaces/current/tool-provider/api/remote?url=` | — | `{ schema }` |
| 解析 Schema（输入后 600ms 自动） | `POST /workspaces/current/tool-provider/api/schema` | `{ schema }` | `{ parameters_schema: [{ operation_id, summary, server_url, method, parameters[] }], schema_type }` |
| 测试 | `POST /workspaces/current/tool-provider/api/test/pre` | `{ provider_name, tool_name, credentials, schema_type, schema, parameters }` | `{ result }` 或 `{ error }` |
| 新建 / 保存 | `POST .../api/add` \| `POST .../api/update` | `ApiToolProvider`（更新时带 `original_provider`） | `{ result }` |
| 删除 | `POST /workspaces/current/tool-provider/api/delete` | `{ provider }` | `{ result }` |

`credentials`：`{ auth_type: none \| api_key_header \| api_key_query, api_key_header, api_key_value, api_key_header_prefix: basic \| bearer \| custom, api_key_query_param }`。

## 6. 数据来源（`{key}` = `plugin_id/provider`）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 列表 | `GET /auth/plugin/datasource/list` | — | `[{ author, provider, plugin_id, plugin_unique_identifier, icon, label, description, credential_schema[], oauth_schema?, credentials_list[{ id, name, type, is_default, credential }] }]` |
| 添加 API Key | `POST /auth/plugin/datasource/{key}` | `{ credentials, type: 'api-key', name }` | `{ result }` |
| 添加 OAuth | `GET /oauth/plugin/{key}/datasource/get-authorization-url` | — | `{ authorization_url }` |
| 设为默认 | `POST /auth/plugin/datasource/{key}/default` | `{ id }` | `{ result }` |
| 重命名 | `POST /auth/plugin/datasource/{key}/update-name` | `{ credential_id, name }` | `{ result }` |
| 编辑 | `POST /auth/plugin/datasource/{key}/update` | `{ credential_id, credentials, name }` | `{ result }` |
| 删除 | `POST /auth/plugin/datasource/{key}/delete` | `{ credential_id }` | `{ result }` |

## 7. 触发器（`{provider}` = `plugin_id/name`）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 触发器插件 | `GET /workspaces/current/triggers` | — | `[{ plugin_id, name, label, icon, events[], supported_creation_methods: (APIKEY\|OAUTH\|MANUAL)[], subscription_constructor{credentials_schema, parameters}, subscription_schema }]` |
| 详情 | `GET /workspaces/current/trigger-provider/{provider}/info` | — | 同上单条 |
| 订阅列表 | `GET .../{provider}/subscriptions/list` | — | `[{ id, name, credential_type: api-key\|oauth2\|unauthorized, endpoint, parameters, properties, workflows_in_use }]` |
| 新建草稿 | `POST .../{provider}/subscriptions/builder/create` | `{ credential_type }` | `{ subscription_builder }` |
| 更新草稿 | `POST .../{provider}/subscriptions/builder/update/{builder_id}` | `{ name?, parameters?, properties?, credentials? }` | 草稿 |
| 校验凭据（API Key） | `POST .../{provider}/subscriptions/builder/verify-and-update/{builder_id}` | `{ credentials }` | `{ verified }` |
| 生成订阅 | `POST .../{provider}/subscriptions/builder/build/{builder_id}` | `{ name, parameters }` | `{ result }` |
| 手动回调请求日志（每 2s 轮询） | `GET .../{provider}/subscriptions/builder/logs/{builder_id}` | — | `{ logs: [{ id, endpoint, request{method, url, headers, data}, response{status_code, data}, created_at }] }` |
| OAuth 客户端（读 / 写） | `GET` / `POST .../{provider}/oauth/client` | 写：`{ client_params, enabled }` | `{ configured, custom_enabled, system_configured, redirect_uri, oauth_client_schema, params }` |
| OAuth 授权 | `GET .../{provider}/subscriptions/oauth/authorize` | — | `{ authorization_url, subscription_builder }` |
| 重命名订阅 | `POST /workspaces/current/trigger-provider/{subscription_id}/subscriptions/update` | `{ name }` | `{ result }` |
| 删除订阅 | `POST /workspaces/current/trigger-provider/{subscription_id}/subscriptions/delete` | — | `{ result }` |

创建流程：API Key = 填凭据 → verify-and-update → 填名称与参数 → update + build；OAuth = 客户端设置 → authorize（新窗口）→ 名称与参数 → build；手动 = create(unauthorized) → 展示 `endpoint` 与日志轮询 → 名称 → build。

## 8. Agent 策略

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 列表 | `GET /workspaces/current/agent-providers` | — | `[{ provider, plugin_id, declaration: { identity{name, author, label, description, icon}, strategies[] } }]` |
| 详情 | `GET /workspaces/current/agent-provider/{provider}` | — | 单条，`strategies[]`：`identity{name, label}, description, parameters[{name, label, type, required, help, default}], output_schema` |

## 9. 扩展（插件端点）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 扩展插件 | `GET /workspaces/current/plugin/extension/list` | — | `PluginDetail[]`（`endpoints_setups / endpoints_active`，`declaration.endpoint.settings`） |
| 端点列表 | `GET /workspaces/current/endpoints/list/plugin?plugin_id&page=1&page_size=100` | — | `{ endpoints: [{ id, name, enabled, url, hook_id, settings, declaration{settings, endpoints[{path, method, hidden}]} }] }` |
| 新建 | `POST /workspaces/current/endpoints/create` | `{ plugin_unique_identifier, settings, name }` | `{ result }` |
| 修改 | `POST /workspaces/current/endpoints/update` | `{ endpoint_id, settings, name }` | `{ result }` |
| 删除 | `POST /workspaces/current/endpoints/delete` | `{ endpoint_id }` | `{ result }` |
| 启用 / 停用（停用需确认） | `POST /workspaces/current/endpoints/enable` \| `/disable` | `{ endpoint_id }` | `{ result }` |

## 10. 自定义端点（API 扩展）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 列表 | `GET /api-based-extension` | — | `[{ id, name, api_endpoint, api_key }]` |
| 详情 | `GET /api-based-extension/{id}` | — | 单条 |
| 新建 | `POST /api-based-extension` | `{ name, api_endpoint, api_key(≥5) }` | 单条 |
| 修改 | `POST /api-based-extension/{id}` | 同上 | 单条 |
| 删除 | `DELETE /api-based-extension/{id}` | — | `{ result }` |
