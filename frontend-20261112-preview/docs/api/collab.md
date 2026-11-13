# 智能体协同（群聊）接口清单

- 代码：`src/api/collab.ts`（类型 + 请求函数）、`src/api/mock/collab.ts`（有状态内存 mock）
- 页面：`src/pages/Collab.tsx`（入口，`#collab`）+ `src/pages/collab/*`
- 控制台接口前缀：`/console/api`（`VITE_API_BASE`）。时间字段均为 **Unix 秒**。
- 这是新前端提出的接口，原 RaccoonX 源码中没有对应实现，字段供后端参考。

## 页面 → 操作 → 接口

| 页面区域 | 操作 | 接口 |
|---|---|---|
| 左侧「群聊」列 | 打开页面、新建后刷新、发言后刷新最近消息 | `GET /collab/groups` |
| 左侧「群聊」列 / 顶栏「+」 | 新建群聊（群名称、选择成员：同事的助手 / Agent、群目标） | `POST /collab/groups` |
| 新建群聊 / 添加成员 →「Agent」分段 | 列出可拉进群的 Agent（企服 + 我的） | `GET /agents/enterprise`、`GET /agent`（Agents 模块接口，只读） |
| 顶栏「成员」/ 右栏「本群成员 · 添加」 | 给已有群添加成员 | `POST /collab/groups/{id}/members` |
| 中间消息流 | 切换群、被 @ 的助手回复后刷新 | `GET /collab/groups/{id}/messages` |
| 底部输入框 | 发言（可含「@某某的助手」「@Agent 名称」） | `POST /collab/groups/{id}/messages` |
| 顶栏文件夹 →「协作产出物」 | 查看产出物、筛选、预览、跳转到消息 | `GET /collab/groups/{id}/artifacts` |

「下载」用产出物的 `url`（缺省时页面只提示）；「存入知识库」目前只给提示，后续接知识库导入接口。消息卡片上的「确认 / 驳回」目前只改页面状态，后续接核对接口。

## 接口

### GET /collab/groups

当前用户所在的全部群聊，按 `updated_at` 倒序。

```json
{ "data": [CollabGroup] }
```

### POST /collab/groups

```json
{ "name": "华东城商行 POC 协作群", "assistant_ids": ["yy", "zw"], "agent_ids": ["ent-salesbuddy", "agt-review"], "description": "两周内完成 POC" }
```

- `name` 必填，≤30 字；`assistant_ids` + `agent_ids` 合计至少 1 个；`description` 选填，≤200 字。
- `agent_ids` 只接受可用的 Agent：企服 Agent `status=online`（接入中的不行），我的 Agent 需已发布（`active_config_is_published=true`）。页面上不可用的显示为置灰并写明原因。
- 当前用户自己的助手由后端自动加入 `members`，且排在第一位。
- 返回新建的 `CollabGroup`（`unread=0`、`last_message=null`、`delegations=[]`）。
- 400：`{"message": "请填写群名称"}` / `群名称不超过 30 个字` / `至少选择一位成员（同事的助手或 Agent）` / `「HRBuddy」还在接入中，暂时不能拉进群` / `「合同条款检查」还没有发布，暂时不能拉进群`。

### POST /collab/groups/{id}/members

```json
{ "assistant_ids": ["jyw"], "agent_ids": ["agt-meeting"] }
```

- 往已有群里添加成员，规则同新建；已在群里的 id 忽略。
- 返回更新后的 `CollabGroup`。
- 400：`选中的成员都已经在群里了` 及上面的 Agent 可用性错误；404：`群聊不存在或已解散`。

### GET /collab/groups/{id}/messages

按时间正序返回群消息；读取后该群对当前用户的 `unread` 清零。404：`群聊不存在或已解散`。

```json
{ "data": [CollabMessage] }
```

### POST /collab/groups/{id}/messages

```json
{ "content": "@叶源的助手 下周三前出一版上线评估" }
```

- 后端负责把「@某某的助手」「@Agent 名称」解析成 `{ "at": "<成员 id>" }` 片段（按成员名最长匹配），返回发出的 `CollabMessage`（`kind: "user"`）。
- 被 @ 的成员异步回复（助手回 `kind: "assistant"`，Agent 回 `kind: "agent"`），并新增一条委派 `{from: 当前用户的助手, to: 被 @ 的成员}`；页面约 1.5 秒后重新拉取消息与群（mock 中约 1.2 秒后回复）。
- 400：`消息不能为空`。

### GET /collab/groups/{id}/artifacts

群内助手与 Agent 产出的文档、数据、决策（需核对的结论）与任务。新群返回空数组。

```json
{ "data": [CollabArtifact] }
```

## 数据结构

| 类型 | 字段 |
|---|---|
| CollabGroup | `id` `name` `icon: node\|presales\|support\|bank\|report\|team` `description` `members: CollabMember[]`（自己的助手在第一位）`running_tasks` `unread` `last_message{author, text, created_at}\|null` `delegations[{from, to, task}]`（群内委派关系，from/to 为成员 id，可以是助手也可以是 Agent；右栏协同网络只画这些）`created_at` `updated_at` |
| CollabMember（助手） | `kind: assistant` `id`（助手 id，如 `yy`）`name`（「叶源的助手」）`owner` `role` `avatar` `status: busy\|idle\|offline` `status_text` |
| CollabMember（Agent） | `kind: agent` `id`（企服 `ent-xxx` / 我的 `agt-xxx`，与 Agents 模块一致）`name` `avatar` `source: enterprise\|mine` `description`（一句话）`status: busy\|idle\|offline`（接入中 / 未发布算 offline）`status_text` |
| Seg（正文片段） | `string` 普通文字 / `{at: 成员 id}` 提及（助手或 Agent）/ `{em: string}` 强调数字 |
| CollabMessage | 公共 `id` `created_at`；`kind: user` → `author`（人名）`content: Seg[]`；`kind: assistant` → `assistant_id` `content: Seg[]` `card?`；`kind: agent` → `agent_id` `content: Seg[]` `card?`（页面带「Agent」标记）；`kind: handoff` → `from` `to` `task`（成员 id） |
| TaskCard | `kind: task` `title` `due`（截止说明）`subtasks[{title, assignee_id（成员 id）, progress 0–100, state: running\|done\|review}]` |
| ReviewCard | `kind: review` `id` `label`（对外承诺/报价/…）`text` `reviewer_id` `state: pending\|confirmed\|rejected` |
| FileCard | `kind: file` `artifact_id` `name` `size` |
| CollabArtifact | `id` `type: doc\|data\|decision\|task` `title` `ext?: docx\|pdf\|xlsx\|csv\|md\|pptx` `size?` `url?` `author_id`（产出者成员 id：助手或 Agent）`task`（关联任务）`message_id`（来源消息）`status` `reviewer_id?`（决策）`progress?` `subtasks?[{title, assignee_id, progress}]`（任务）`preview{paragraphs?[], table?{columns[], rows[][]}}` `created_at` |

`status` 取值：文档 `draft` 草稿 / `final` 定稿；数据 `exported` 已导出；决策 `pending` 待核对 / `confirmed` 已确认 / `rejected` 已驳回；任务 `running` 进行中 / `done` 已完成。

## 路由

当前群存在组件状态 + `localStorage`（`raccoonx.collab.group`），群聊列表收起状态存 `raccoonx.collab.listCollapsed`。以后接 `#collab/<groupId>` 时，入口导出的 `CollabGroupId` 类型即群 id。
