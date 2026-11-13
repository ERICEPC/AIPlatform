# Agents 模块接口清单

- 代码：`src/api/agents.ts`（类型 + 请求函数），`src/api/mock/agents.ts`（有状态内存 mock）
- 前缀：控制台接口均相对 `/console/api`（`http.ts` 的 `request` 自动加），Cookie 会话 + `X-CSRF-Token`
- 时间戳：Unix 秒；列表分页统一 `{ data, has_more, page, limit, total }`
- 字段名沿用 `frontend/packages/contracts/generated/api/console/agent/types.gen.ts`，类型按页面需要做了裁剪
- 标 **RaccoonX 扩展** 的是原控制台契约里没有、为新前端约定的接口或字段，后端接入时需确认

## 列表 `#agents`

页面顶部分组「企服 / 我的」：`#agents/enterprise[/<buddy>]`、`#agents/mine`；`#agents` 恢复上次选择的分组（localStorage `rx-agents-tab`，默认企服）。`enterprise` / `mine` / `builtin` 是保留 id，不会和 Agent id 冲突。

### 企服 `#agents/enterprise/<buddy>`

四个 Buddy 页签：`sales`（SalesBuddy，默认）、`project`（ProjectBuddy）、`hr`（HRBuddy）、`service`（客服 Buddy）。页签上显示状态（已上线 / 接入中），当前页签下方是 Buddy 简介、能力标签和「对话」。

| 操作 | 接口 | 请求 | 响应 / 说明 |
| --- | --- | --- | --- |
| Buddy 状态、简介、能力（**RaccoonX 扩展**，mock） | `GET /agents/enterprise` | — | `{ data: EnterpriseAgent[] }`：`id, name, tagline, description, capabilities[], status: online\|onboarding, icon_url, owner_team, version, updated_at`。Buddy → 条目 id 的对应在 `BUDDY_ENTERPRISE_ID`（`ent-salesbuddy / ent-projectbuddy / ent-hrbuddy / ent-servicebuddy`） |
| Buddy 的内置 Agent 列表 | `GET /agent?scope=roster&page=1&limit=100` | `scope=roster, page, limit` | `{ page, limit, total, has_more, data: BuiltinAgentItem[] }`：`AgentAppPartial` 的列表字段 + `scope, version(展示版本号), version_note`（后三个取自旧门户导出，接入时确认字段名） |
| 搜索 / 正式·BETA / 分组（拜访·商机·客户·周报·经营） | （前端） | — | 按名称、角色、简介过滤；名称末尾的 `-V1` / `-BETA` / `-独立验收-20260915` 解析成标签，前缀「销售智助」「Raccoon SalesBuddy」去掉；分组按名称关键词归类 |
| 对话 | （前端） | — | 只有 `online` 的 Buddy 可用，跳 `#assistant` |

**Buddy ↔ 内置 Agent 归属（RaccoonX 扩展）**：原后端只有 `scope=roster`（企业名册）这一层，没有 Buddy 字段。目前约定所有 `scope=roster` 的 Agent 都属于 SalesBuddy（`listBuiltinAgents('sales')`）；其他 Buddy 暂无内置 Agent，前端直接返回空列表、显示「接入中」。后端增加归属字段（例如 `buddy=sales`）后只需改 `listBuiltinAgents`。

mock 数据：`src/api/mock/data/builtin-agents-full.json`（旧门户 18 个 SalesBuddy 内置 Agent 的原始接口返回：列表、详情、composer、各版本快照，只去掉凭据字段），由 `src/api/mock/builtin-agents.ts` 载入 Agent 主存储，配置原样不改。

### 内置 Agent 详情 `#agents/<id>`（与「我的」共用）

内置 Agent 点开后进入和自建 Agent 完全相同的详情页（配置 / 访问 / 日志 / 监控），接口同下文「详情」各节，按 `agent_id` 读写，可编辑、保存草稿、发布。区别只有：
- 列表来源是 `GET /agent?scope=roster`，不出现在「我的」；详情里 `scope: 'roster'` 时左上角返回「SalesBuddy」（`#agents/enterprise/sales`）。
- 图标字段是旧门户的 `rx:<name>`（如 `rx:finance`），前端映射成浣熊表情图。
- 旧地址 `#agents/builtin/<id>` 自动跳到 `#agents/<id>`。
- 后端需确认：普通成员能否编辑 / 发布 roster Agent（权限按 `permission_keys`）。

### 我的 `#agents/mine`


| 操作 | 接口 | 请求 | 响应 / 说明 |
| --- | --- | --- | --- |
| 列表 / 搜索 / 排序 / 加载更多 | `GET /agent` | `page`, `limit=30`, `sort_by=last_modified\|recently_created\|earliest_created`, `name`, `is_created_by_me` | `AgentAppPartial[]`：`id, app_id, name, role, description, icon_type, icon, icon_background, icon_url, active_config_is_published, published_reference_count, author_name, created_by, created_at, updated_at` |
| 状态筛选 全部/已发布/草稿 | （前端） | — | 后端没有状态参数，按已加载数据的 `active_config_is_published` 过滤；KPI 也按已加载数据统计 |
| 从空白创建 | `POST /agent` | `{ name(≤255,必填), role, description, icon_type, icon, icon_background }` | `AgentAppDetailWithSite`，成功后跳 `#agents/<id>/configure` |
| 导入 DSL | `POST /apps/imports` | `{ mode: 'yaml-content'\|'yaml-url', yaml_content \| yaml_url, name? }` | `{ id, status: completed\|completed-with-warnings\|pending\|failed, app_id, current_dsl_version, imported_dsl_version, error }` |
| 版本不一致时继续导入 | `POST /apps/imports/{import_id}/confirm` | — | 同上 |
| ⋯ 编辑信息 | `PUT /agent/{agent_id}` | `{ name, description, role, icon_type, icon, icon_background }` | `AgentAppDetailWithSite` |
| ⋯ 复制 | `POST /agent/{agent_id}/copy` | 同上，默认名称「{name} 副本」 | `AgentAppDetailWithSite`，成功后进入新 Agent |
| ⋯ 导出 DSL | `GET /apps/{app_id}/export?include_secret=false` | — | `{ data: yaml }`，前端下载 `{name}.yml` |
| ⋯ 删除 | `DELETE /agent/{agent_id}` | — | 确认框里先调 `GET /agent/{id}/referencing-workflows` 提示受影响的工作流 |

## 详情外壳 `#agents/<id>`

| 操作 | 接口 | 响应 |
| --- | --- | --- |
| 身份区（头像、名称、角色、发布状态） | `GET /agent/{agent_id}` | `AgentAppDetailWithSite`：`id, app_id, name, role, description, icon*, enable_site, enable_api, access_ready, api_base_url, site{access_token, app_base_url, title, ...}, debug_conversation_id` |
| 发布状态徽标 | `GET /agent/{agent_id}/composer` | 取 `active_config_is_published` 和 `active_config_snapshot` 是否存在 |

## 配置 `#agents/<id>/configure`

### 配置读写

| 操作 | 接口 | 请求 / 响应 |
| --- | --- | --- |
| 读取 | `GET /agent/{agent_id}/composer` | `{ agent_soul, active_config_snapshot, active_config_is_published, draft{id, draft_type, updated_at} }` |
| 自动保存（停止输入 0.8 秒后） | `PUT /agent/{agent_id}/composer` | `{ variant: 'agent_app', save_strategy: 'save_to_current_version', agent_soul }` → 同读取 |

`agent_soul` 用到的字段：`prompt.system_prompt`；`model{model, model_provider, model_settings{temperature, top_p, max_tokens, presence_penalty, frequency_penalty}, fallback{model, model_provider, model_settings, first_chunk_timeout: 8} | null}`；`app_features{opening_statement, suggested_questions, suggested_questions_after_answer, text_to_speech, speech_to_text, file_upload{enabled, allowed_file_types, allowed_file_upload_methods, number_limits}, retriever_resource}`；`config_skills[]{name, description, file_id, size, is_missing}`；`config_files[]{name, file_id, file_kind, mime_type, size, is_missing, knowledge_base_id, knowledge_base_name}`；`config_files_kb[]{knowledge_base_id, name}`（RaccoonX 扩展）；`tools.dify_tools[]{provider_type, provider_id, provider, tool_name, name, runtime_parameters, credential_type, enabled}`；`tools.cli_tools[]{id, name, install_command, enabled, env.variables}`；`knowledge.sets[]{id, name, datasets[{id,name}], query{mode, value}, retrieval{mode, top_k, score_threshold, reranking_enable, reranking_model}, metadata_filtering{mode, logical_operator, conditions}}`；`env.variables[]{key, value}`；`config_note`。

提示词里的引用写成 `[§kind:id:label§]`，kind ∈ `skill | file | tool | cli_tool | knowledge`；tool 的 id 是 `provider_id/tool_name`，knowledge 的 id 是检索组 id，skill/file 的 id 是名称。

### 各分区

| 分区 | 操作 | 接口 | 请求 / 响应 |
| --- | --- | --- | --- |
| 模型 | 可选模型 | `GET /workspaces/current/models/model-types/llm` | `{ data: [{ provider, label, status, models[{ model, label, status, features, model_properties{context_size} }] }] }` |
| 模型 | 参数规则 | `GET /workspaces/current/model-providers/{provider}/models/parameter-rules?model=` | `{ data: [{ name, label, type, default, min, max, precision, help }] }` |
| 模型 | 主模型 / 备用模型 / 参数 | 写入 `agent_soul.model`（自动保存） | 备用模型排除主模型，`first_chunk_timeout: 8` |
| Skills | Skill 库 | `GET /workspaces/current/skills?limit=20&page&keyword&tag[]` | 分页 `{ id, name, description, status, tags, updated_at }`，只能选 `published` |
| Skills | 标签 | `GET /tags?type=skill` | `[{ id, name, type }]` |
| Skills | 确认库选择（整体替换，≤20） | `PUT /workspaces/current/agents/{agent_id}/skills` | `{ skill_ids }` |
| Skills | 上传 skill.zip | `POST /agent/{agent_id}/config/skills/upload` | multipart `file`（.zip / .skill）→ `ConfigSkillRef` |
| Skills | 包内文件预览 | `GET /agent/{agent_id}/config/skills/{name}/files/preview?path=` | `{ path, type: dir\|file, entries[{name, path, type, size}], text, truncated }` |
| Skills | 下载 | `GET /agent/{agent_id}/config/skills/{name}/download` | `{ url }` |
| Skills | 移除 | `DELETE /agent/{agent_id}/config/skills/{name}` | — |
| 文件 | 上传 | `POST /files/upload` → `POST /agent/{agent_id}/config/files` | multipart → `{ id }`；再 `{ upload_file_id }` → `ConfigFileRef` |
| 文件 | 预览 | `GET /agent/{agent_id}/config/files/{name}/preview` | `{ text, binary, truncated, size }` |
| 文件 | 下载 / 删除 | `GET .../config/files/{name}/download` → `{ url }`；`DELETE /agent/{agent_id}/config/files/{name}` | `build_note.md` 显示「已生成」，不可删除 |
| 文件 | 关联知识库 / 取消关联 | 写入 `agent_soul.config_files_kb`（自动保存）；可选子库来自 `POST /manage/knowledge/base/list`（知识库模块，`backend: 'kb'`） | `config_files_kb[]{ knowledge_base_id, name }`，**RaccoonX 扩展**。只记录文件存放的子库，不参与检索；行内显示子库文件数，点击跳 `#kb/<knowledge_base_id>` |
| 文件 | 存入知识库（单个文件） | `POST /agent/{agent_id}/config/files/{name}/save-to-kb` | `{ knowledge_base_id }` → `ConfigFileRef`（带 `knowledge_base_id, knowledge_base_name`），**RaccoonX 扩展**；成功后若该子库未关联则自动加入 `config_files_kb`。`build_note.md` 不提供此操作 |
| 工具 | 目录（全部/插件/工作流/自定义 API/MCP） | `GET /workspaces/current/tools/{builtin\|api\|workflow\|mcp}` | `[{ id, name, author, label, description, icon, type, is_team_authorization, tools[{ name, label, description, parameters[{name, label, type, form, required, default, options}] }] }]` |
| 工具 | 添加 / 编辑参数 / 启停 / 移除 / 移除全部 / CLI 工具 | 写入 `agent_soul.tools`（自动保存） | 授权状态以目录 `is_team_authorization` 为准，未授权跳「集成 · 工具」 |
| 知识检索 | 知识库列表 | `GET /datasets?page&limit` | 分页 `{ id, name, description, document_count, word_count }` |
| 知识检索 | Rerank 模型 | `GET /workspaces/current/models/model-types/rerank` | 同 llm |
| 知识检索 / 高级 | 检索组、环境变量（含导入 .env） | 写入 `agent_soul.knowledge.sets` / `agent_soul.env.variables` | .env 在前端解析 |

### 右侧对话（构建 | 预览）

| 操作 | 接口 | 请求 / 响应 |
| --- | --- | --- |
| 构建：发送前签出草稿 | `POST /agent/{agent_id}/build-draft/checkout` | → `{ draft{ id, draft_type: 'debug_build' } }` |
| 构建 / 预览：流式对话 | `POST /agent/{agent_id}/chat-messages` | `{ response_mode: 'streaming', conversation_id, query, inputs, files, draft_type?: 'debug_build' }`；SSE 事件 `message{answer, message_id, conversation_id, task_id}` / `message_end` / `error` |
| 构建：读取待应用改动 | `GET /agent/{agent_id}/build-draft` | `{ draft, agent_soul }`，前端逐分区比对得出「N 项变更待应用」 |
| 构建：放弃 | `DELETE /agent/{agent_id}/build-draft` | — |
| 构建：应用 | `POST /agent/{agent_id}/build-chat/finalize` → `POST /agent/{agent_id}/build-draft/apply` | apply 返回 composer |
| 停止生成 | `POST /agent/{agent_id}/chat-messages/{task_id}/stop` | — |
| 下一步问题建议 | `GET /agent/{agent_id}/chat-messages/{message_id}/suggested-questions` | `{ data: string[] }` |
| 语音输入 | `POST /agent/{agent_id}/audio-to-text` | multipart `file` → `{ text }` |
| 附件 | `POST /files/upload` | 作为 `files[{ type, transfer_method: 'local_file', upload_file_id }]` 发送 |
| 新对话 | `POST /agent/{agent_id}/debug-conversation/refresh` | → `{ debug_conversation_id }`；构建模式先确认「清空会话并放弃改动？」并调 `DELETE build-draft` |
| 工作目录 | `GET /agent/{agent_id}/sandbox/files?caller_type&caller_id&path` | `caller_type`：预览 `conversation` / 构建 `build_draft`；`path` 根为 `~`（长期）或 `.`（临时）→ `{ data: [{ name, type, size, mtime }] }` |
| 工作目录：读取 / 下载 | `GET .../sandbox/files/read?caller_type&caller_id&path` → `{ content, truncated, binary }`；`POST .../sandbox/files/download` `{ caller_type, caller_id, path }` → `{ url }` | |
| 对话功能 | 写入 `agent_soul.app_features`（自动保存） | 开场白 + 建议问题、下一步建议、文字转语音、语音转文字、文件上传、引用和归属 |

### 发布栏

| 操作 | 接口 | 请求 / 响应 |
| --- | --- | --- |
| 发布前检查 | （前端） | 模型已选且可用、工具授权、知识检索完整、提示词引用存在 |
| 受影响的工作流 | `GET /agent/{agent_id}/referencing-workflows` | `{ data: [{ app_id, app_name, app_mode, app_icon, workflow_id, workflow_version, node_ids, app_updated_at }] }` |
| 发布 | `POST /agent/{agent_id}/publish` | `{ version_note }` → `{ result, active_config_snapshot_id }` |
| 版本历史 | `GET /agent/{agent_id}/versions` | `{ data: [{ id, version, display_version, version_note, created_at, created_by, created_by_name* }] }` |
| 查看版本（只读） | `GET /agent/{agent_id}/versions/{version_id}` | `{ ...summary, config_snapshot: agent_soul }` |
| 还原 | `POST /agent/{agent_id}/versions/{version_id}/restore` | 覆盖草稿，需重新发布 |

\* `created_by_name` 为 **RaccoonX 扩展**展示字段；没有时显示 `created_by`。「只看我的」按当前用户比对。

## 访问 `#agents/<id>/access`

| 操作 | 接口 | 请求 / 响应 |
| --- | --- | --- |
| Web 应用地址 | 来自 `GET /agent/{id}` 的 `site` | `{app_base_url}/agent/{access_token}` |
| 开关 Web 应用（发布过才能开） | `POST /apps/{app_id}/site-enable` | `{ enable_site }` → `AgentAppDetailWithSite` |
| 刷新访问地址 | `POST /apps/{app_id}/site/access-token-reset` | → `site` |
| 品牌设置 | `POST /apps/{app_id}/site` | `{ title, description, chat_color_theme, copyright, privacy_policy, custom_disclaimer, default_language, input_placeholder, show_workflow_steps, use_icon_as_answer_icon }` |
| 嵌入代码 | （前端生成） | iframe / 右下角气泡脚本 |
| 后端服务 API 信息 | `GET /agent/{agent_id}/api-access` | `{ enabled, access_ready, service_api_base_url, chat_endpoint, stop_endpoint, messages_endpoint, conversations_endpoint, files_upload_endpoint, parameters_endpoint, api_key_count, api_rpm, api_rph, streaming_only }` |
| 开关 API | `POST /agent/{agent_id}/api-enable` | `{ enable_api }` |
| API Key 列表 / 新建 / 删除 | `GET` / `POST /agent/{agent_id}/api-keys`，`DELETE /agent/{agent_id}/api-keys/{api_key_id}` | `{ id, token, created_at, last_used_at }`；新建返回完整 token，只显示一次 |
| 消息渠道列表 | `GET /message-channels/agents/{agent_id}` | **RaccoonX 扩展** → `{ data: [{ id, channel_type: wecom\|feishu\|dingtalk, name, enabled, revision, status: connected\|pending\|error, bound_account, created_at }] }` |
| 新建渠道 | `POST /message-channels/agents/{agent_id}` | **RaccoonX 扩展** `{ channel_type, name }` |
| 启用 / 停用 | `POST /message-channels/agents/{agent_id}/{channel_id}/enabled` | **RaccoonX 扩展** `{ revision, enabled }`（乐观锁） |
| 删除 | `DELETE /message-channels/agents/{agent_id}/{channel_id}` | **RaccoonX 扩展** |
| 扫码绑定 | `POST .../{channel_id}/qr` → `{ ticket, qr_url, expires_at }`；`POST .../{channel_id}/qr/poll` `{ ticket }` → `{ status: waiting\|scanned\|confirmed\|expired, channel }` | **RaccoonX 扩展**，每 2 秒轮询 |
| 工作流引用表 | `GET /agent/{agent_id}/referencing-workflows` | 同发布栏 |

消息渠道接口对应原源码里嵌入的 `/message-channels/?agent_id=` 页面，路径与 Agent Teams 的 `/message-channels/teams/{team_id}` 对称，需要后端确认。

## 日志 `#agents/<id>/logs`

| 操作 | 接口 | 请求 / 响应 |
| --- | --- | --- |
| 来源筛选 | `GET /agent/{agent_id}/log-sources` | `{ data: [{ id, type: webapp\|workflow, app_id, app_name, workflow_id }], groups }` |
| 会话列表 | `GET /agent/{agent_id}/logs` | `page, limit, keyword, sources[], start, end（YYYY-MM-DD HH:mm）, sort_by=created_at\|updated_at, sort_order=asc\|desc` → 分页 `{ id, conversation_id, title, source, end_user_id, message_count, user_rate, operation_rate, unread, status, created_at, updated_at }` |
| 会话消息 | `GET /agent/{agent_id}/logs/{conversation_id}/messages?page&limit` | `{ id, message_id, query, answer, error, latency, message_tokens, answer_tokens, total_tokens, total_price, currency, feedbacks[{rating, content, from_source}], knowledge_retrieval[] }` |
| 管理员标注（赞 / 踩 / 备注 / 取消） | `POST /agent/{agent_id}/feedbacks` | `{ message_id, rating: 'like'\|'dislike'\|null, content }` |

## 监控 `#agents/<id>/monitoring`

| 操作 | 接口 | 请求 / 响应 |
| --- | --- | --- |
| 汇总 + 每日趋势 | `GET /agent/{agent_id}/statistics/summary` | `start, end（YYYY-MM-DD HH:mm）, source`（全部来源时不传）→ `{ summary{ total_messages, total_end_users, total_conversations, average_session_interactions, tokens_per_second, user_satisfaction_rate, total_tokens, total_price, currency, average_response_time }, charts{ daily_messages[{date, message_count}], daily_end_users[{date, terminal_count}], daily_conversations[{date, conversation_count}], average_session_interactions[{date, interactions}], tokens_per_second[{date, tps}], user_satisfaction_rate[{date, rate}], token_usage[{date, token_count, total_price, currency}], average_response_time[{date, latency}] }, source }` |
| 来源下拉 | `GET /agent/{agent_id}/log-sources` | 同日志 |

`charts` 按契约原样返回，`getStatistics` 在接口层统一映射成 `{ date, value }` 给页面画图。
