# Agent Teams 接口清单

- 代码：`src/api/teams.ts`（类型 + 请求函数）、`src/api/mock/teams.ts`（有状态内存 mock + 运行引擎）
- 页面：`src/pages/teams/`（`#teams`、`#teams/<id>/<members|run|access|logs|monitoring>`；旧地址 `#teams/<id>/orchestrate` 自动替换为 `members`）
- 控制台接口前缀：`/console/api`（`VITE_API_BASE`）。时间字段均为 **Unix 秒**。
- 后端来源：`installer/runtime/build/api/code/team_hub/api.py`（团队、运行、Key）、`channel_hub/api.py`（消息渠道）。

## 通用约定

### revision 与 409

团队上的所有修改（保存草稿、发布、编辑信息、复制、删除）都要带当前 `revision`。后端发现不一致时返回：

```http
HTTP/1.1 409 Conflict
{"message": "团队已被更新，请刷新后再操作"}
```

页面处理：详情/列表顶部弹出提示条「团队已被更新，请刷新后再操作 [刷新]」，点刷新后以服务端配置覆盖本地草稿。删除时如果还有排队/运行中的任务，也返回 409（`团队仍有排队或运行中的任务…`），在删除确认框里展示原因。消息渠道启停/删除同理，渠道自己的 `revision` 不一致时 409（`配置已更新，请刷新后重试`）。

### 错误

非 2xx 统一 `{"message": "..."}`（渠道接口是 `{"error": "..."}`），前端抛 `ApiError(message, status)`。

### 数据结构

| 类型 | 字段 |
|---|---|
| Agent（已发布名册 Agent，即 Agents 模块里已发布的 Agent） | `id` `name` `description` `snapshot_id` `version` |
| Member（参与的 Agent） | `agent_id` `responsibility`（页面「负责什么」；后端必填 ≤1000，页面选填，留空时前端用 Agent 简介补上）`input_hint`（页面「输入说明」，≤2000） |
| Config | `avatar?{type:'emoji'\|'image', icon, background?}` `name`（≤80）`description`（≤400）`goal`（团队任务；「分工方式」以 `\n\n【分工方式】\n` 拼在末尾，合计 ≤6000）`leader_id` `members`（1–8）`output`（≤3000）`parallelism` 1–3（默认 2）`max_calls` 1–12（4）`max_rounds` 1–4（2）`timeout` 30–300 秒（120） |
| Team | `id` `name` `revision` `config` `published_id\|null` `published_version?` `versions?[{id, version, revision, created_at}]` `updated_at` `created_at` `created_by` |
| RunSummary | `id` `snapshot_id`（`draft:<revision>` 表示草稿预览）`source` `query` `state` `error_code` `created_at` `started_at` `finished_at` `expert_calls` `published_version` |
| RunDetail | RunSummary 去掉 `expert_calls/published_version`，加 `answer` `cancelled` `config.agents{id:{name}}` `steps[]` |
| Step | `id` `kind: director\|expert` `agent_id` `snapshot_id` `round` `task` `state` `result` `error_code` `started_at` `finished_at` |
| Metrics | `total` `queued` `running` `succeeded` `failed` `timed_out` `interrupted` `cancelled` `model_calls` `expert_calls` `recorded_calls` `total_tokens` `success_rate`（0–100）`avg_latency`（秒）`avg_queue`（秒） |

- `state`：`queued` 排队中 / `running` 执行中 / `succeeded` 已完成 / `failed` 失败 / `timed_out` 超时 / `interrupted` 执行中断 / `cancelled` 已取消
- `source`：`console` Web 运行 / `api` 后端服务 API / `channel` 消息渠道 / `preview` 草稿预览 / `other` 其他
- `error_code` → 文案：`director_failed` `invalid_plan` `unknown_expert` `no_expert_called` `context_limit` `runtime_error` `worker_restarted` `queue_expired` `timed_out` `cancelled`（见 `runReasons`）

## 列表页 `#teams`

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 加载列表、KPI、可选 Agent | `GET /agent-teams` | — | `{teams: Team[], agents: Agent[], workspace_id}` |
| 卡片成员头像、新建对话框的 Agent 下拉 | `GET /agent?page=1&limit=100&sort_by=last_modified`（Agents 模块 `listAgents`，只读） | — | 取名称、头像、简介、创建人；只有出现在 `agents` 名册里的（已发布）可选 |
| 新建团队 | `POST /agent-teams` | `Config` | `Team`（201），随后跳到 `#teams/<id>` |
| 卡片 ⋯ 编辑信息 | `POST /agent-teams/{id}/info` | `{revision, name, description, avatar}` | `Team` |
| 卡片 ⋯ 复制 | `POST /agent-teams/{id}/copy` | `{revision, name, description}` | `Team`（201；只复制配置，不含 Key、渠道、运行、发布版本） |
| 卡片 ⋯ 导出 DSL | `GET /agent-teams/{id}/export` | — | `{name, revision, data}`，前端把 `data`（YAML）下载为 `{name}.team.yml` |
| 卡片 ⋯ 删除 | `POST /agent-teams/{id}/delete` | `{revision}` | `{ok}`；Key 失效、渠道停用、Agent 保留；有活动任务时 409 |

筛选（全部/已发布/草稿、搜索、我创建的、排序：最近修改/最近创建/最早创建）在前端完成，与原实现一致。

## 详情外壳（所有分区共用）

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 加载团队 | `GET /agent-teams/{id}` | — | `{team: Team(含 versions), agents: Agent[]}` |
| 保存草稿 | `POST /agent-teams/{id}` | `{...Config, revision}` | `Team` |
| 发布 | `POST /agent-teams/{id}/publish` | `{revision}` | `{snapshot_id, version, revision}`；有未保存修改时按钮禁用 |
| 版本下拉 | 读 `team.versions` | — | 点某个版本复制其快照 ID |
| ⋯ 编辑信息 / 复制 / 导出 / 删除 | 同列表页 | | |

## 成员 `#teams/<id>/members`（默认分区）

不定义工作流或节点：页面只决定「谁参与这个团队」，协作由后端框架里的团长按任务自动安排。没有任何布局/坐标字段。

| 页面区块 | 对应 Config 字段 | 说明 |
|---|---|---|
| 团长卡片 ·「更换团长」 | `leader_id` | 弹窗单选；候选 = Agents 模块列表（`GET /agent`），版本/是否已发布以 `agents` 名册为准。选中的 Agent 如果已在参与列表里，会从 `members` 移出 |
| 参与的 Agent 卡片网格（x/8） | `members[]`（上限 `MAX_MEMBERS = 8`） | 卡片显示头像、名称、版本、来源（创建人）、简介、负责什么 |
| 「添加 Agent」 | `members.push({agent_id, responsibility, input_hint: ''})` | 弹窗搜索 + 多选；已在团队 / 是团长 / 未发布的不可选；`responsibility` 默认填 Agent 简介 |
| 编辑「负责什么」 | `members[i].responsibility` / `input_hint` | 小对话框 |
| 移除 | `members.splice(i, 1)` | 二次确认 |
| 团队任务 / 答复要求 | `goal`（只编辑「分工方式」标记之前的部分，标记之后的旧内容原样保留）/ `output` | |
| 运行设置 | `parallelism` `max_calls` `max_rounds` `timeout` | 普通数字设置，范围见 `LIMITS` |

| 操作 | 接口 | 说明 |
|---|---|---|
| 候选 Agent | `GET /agent`（Agents 模块，只读） + `GET /agent-teams/{id}` 的 `agents` | 两者按 `id` 合并 |
| 所有修改 | 本地修改 Config | 「保存草稿」时整体提交 `POST /agent-teams/{id}`（`responsibility` 为空的先补成 Agent 简介） |
| 试运行 | `POST /agent-teams/{id}/runs` | `{query, preview: true, request_id, conversation: true}` → 202 `{id, state, snapshot_id, conversation_id}`；有未保存修改会先保存 |
| 试运行进度（右侧抽屉） | `GET /agent-teams/{id}/runs/{runId}` | 每 2 秒轮询，显示状态、调用了哪些 Agent、执行记录和最终答复 |
| 停止 | `POST /agent-teams/{id}/runs/{runId}/cancel` | `{}` |

## 运行 `#teams/<id>/run`

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 我的最近对话 | `GET /agent-teams/{id}/conversations?preview=true\|false` | — | `{runs: RunDetail[]}`（每个对话的首轮；有活动任务时 5 秒刷新） |
| 打开对话 | `GET /agent-teams/{id}/conversations/{cid}?preview=` | — | `{runs: RunDetail[]}`（`steps` 为空，带 `step_count`；活动中 2 秒刷新） |
| 发送 | `POST /agent-teams/{id}/runs` | `{query(≤32000), preview, request_id, conversation: true, conversation_id?}`；新对话且非草稿时带 `snapshot_id = published_id` | 202 `{id, state, snapshot_id, conversation_id}` |
| 展开「执行记录」 | `GET /agent-teams/{id}/runs/{runId}` | — | `RunDetail`，按轮次分组展示（团长规划 → 并行调用的 Agent → 团长汇总） |
| 停止任务 | `POST /agent-teams/{id}/runs/{runId}/cancel` | `{}` | `{ok}` |

幂等：`request_id` 每个新任务生成一次；网络异常（结果未知）时保留原编号，「重试提交」沿用同一编号，后端返回原任务，不会重复执行。

## 访问 `#teams/<id>/access`

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| Web 应用 | — | URL：`${origin}/agent-teams/{id}/run?mode=published` | |
| API Key 列表 | `GET /agent-teams/{id}/keys` | — | `{keys: [{id, label, suffix, created_at}]}` |
| 创建 Key | `POST /agent-teams/{id}/keys` | `{label}` | `{id, token}`（完整 token 只返回这一次） |
| 撤销 Key | `DELETE /agent-teams/{id}/keys/{keyId}` | — | `{ok}` |
| 渠道列表 | `GET /message-channels/teams/{id}` | — | `{channels: Channel[]}`（`id agent_id kind name enabled revision status status_label error account_id created_at updated_at`） |
| 新建渠道 | `POST /message-channels/teams/{id}` | `{kind: wecom\|feishu\|dingtalk}` | `{channel}`（201；团队需已发布） |
| 扫码授权 | `POST /message-channels/teams/{id}/{cid}/qr` | — | `{ticket, svg, expires_in}` |
| 轮询扫码 | `POST /message-channels/teams/{id}/{cid}/qr/poll` | `{ticket, verify_code}` | `{status: wait\|scaned\|confirmed\|expired}`（每 2 秒） |
| 启用 / 暂停 | `POST /message-channels/teams/{id}/{cid}/enabled` | `{revision, enabled}` | `{channel}` |
| 最近事件 | `GET /message-channels/teams/{id}/{cid}/events` | — | `{events: [{id, state, error_code, duration, created_at, description, sender_id, chat_id}]}` |
| 删除渠道 | `DELETE /message-channels/teams/{id}/{cid}` | `{revision}` | `{ok}`（需先暂停，否则 409） |
| 已发布版本表 | 读 `team.versions` | | |

### 公开 API（在「API 参考」对话框中展示，前端不直接调用）

前缀为站点根（不是 `/console/api`），鉴权 `Authorization: Bearer <团队 API Key>`。

| 方法 | 路径 | 请求 | 说明 |
|---|---|---|---|
| POST | `/v1/agent-teams/{id}/runs` | Header `Idempotency-Key`；Body `{user, query, snapshot_id?}` | 202 + 任务 ID；默认最新发布版本 |
| GET | `/v1/agent-teams/{id}/runs/{runId}?user=` | — | 每 1～2 秒查询；`succeeded` 时读 `answer` |
| POST | `/v1/agent-teams/{id}/runs/{runId}/cancel` | `{user}` | 需与提交时同一 Key 和 user |

## 日志 `#teams/<id>/logs`

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 列表（5 秒自动刷新） | `GET /agent-teams/{id}/runs` | `period=last7days\|last30days\|allTime&source&state&keyword&page&limit(10/25/50)&sort_by=created_at\|finished_at&sort_order=asc\|desc`（`source/state` 为 `all` 表示不过滤） | `{runs: RunSummary[], total, page, limit}` |
| 行详情抽屉 | `GET /agent-teams/{id}/runs/{runId}` | — | `RunDetail`（活动中 2 秒刷新）；分「对话结果 / 执行过程（N）」 |
| 停止任务 | `POST /agent-teams/{id}/runs/{runId}/cancel` | `{}` | `{ok}` |

## 监控 `#teams/<id>/monitoring`

| 操作 | 接口 | 请求 | 响应 |
|---|---|---|---|
| 统计（15 秒自动刷新） | `GET /agent-teams/{id}/statistics` | `start=YYYY-MM-DD&end=YYYY-MM-DD`（跨度 ≤30 天）`&timezone&source=all\|console\|api\|channel\|preview\|other` | `{summary: Metrics, daily: (Metrics & {date})[], timezone}` |

图表：全部任务数、任务成功率、平均响应时间、平均排队时间、Agent 调用次数（`expert_calls`）、Token 用量（附「已记录 recorded_calls / model_calls 次调用」）。

## Mock 行为

- 名册：团队种子里的示例 Agent ＋ Agents 模块 mock 里至少有一个版本的 Agent（实时读取，在 Agents 里发布后即可加入团队）。
- 种子数据：售前方案团队（已发布 v2，含 1 个 API Key、1 个飞书渠道）、客服升级处理（已发布 v1，草稿有改动）、周报汇总团队（未发布，由叶源创建）；每个团队约 30 天的历史任务。
- 运行引擎：创建任务时生成执行计划，读取时按当前时间推进：排队约 1–2 秒 → 团长规划第 1 轮 → 参与的 Agent 按 `parallelism` 分批并行 → 第 2 轮团长检查并追加一次复核（`max_rounds ≥ 2` 且调用次数有余）→ 团长汇总 → 已完成（Markdown 答复），全程约 15–20 秒。停止后约 0.8 秒进入「已取消」。
- 扫码：轮询第 3 次返回 `scaned`，第 5 次 `confirmed`。
