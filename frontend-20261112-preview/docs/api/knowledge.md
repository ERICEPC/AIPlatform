# 知识库模块接口清单

后端：**Raccoon KnowledgeBase**（独立 Java 服务）。所有请求 `backend: 'kb'`，前缀 `VITE_KB_API_BASE`（默认同源相对路径），`Authorization: Bearer <admin_token>`（localStorage `admin_token`）。
路径、字段与知识库前端 `knowledgebase/vue/src/api/api.js` 一致。

- JSON 接口统一返回信封 `{ code: '0', message, data }`，`src/api/knowledge.ts` 的 `kb()` 解包后把 `data` 交给页面，`code !== '0'` 抛 `ApiError`。
- long 型 ID、计数、分页参数按**字符串**传输（`pageNo: '1'`、`total: '26'`）。
- 材料的产品 / 分类 / 使用范围放在 `metadataJson`（JSON 字符串）里：`product[]`、`category`、`sourceScope` / `usage_scope`、`sourceNotes`、`owner`、`department`、`sourceStatus`、`sourceTitle`。
- 状态码：`parseStatus` / `indexStatus` `'1'` 未开始、`'2'` 进行中、`'3'` 完成、`'4'` 失败；两者都为 `'3'` 才能问答。
- mock：`src/api/mock/knowledge.ts`（内存状态：上传会生成材料并推进到可问答；个人库可增改归档删；问答写入会话）。

路由：`#kb`（找材料 · 我的，默认打开最近更新的个人库）、`#kb/all`（全部可访问）、`#kb/<库id>`（我的库默认归「我的」视图，带 `?scope=all` 留在全部视图；`?doc=<材料id>` 打开详情抽屉）、`#kb/<库id|all>/reader?doc=`、`#kb/ask`（`?doc=` / `?kb=` / `?c=<会话id>`）。

## 找材料（工作台 `#kb`、`#kb/all`、`#kb/<库id>`）

交互层级：模式（找材料 / 问材料）→ 范围（我的 / 全部可访问，左栏顶部，我的在前默认选中）→ 子范围（知识库：「我的库」「共享给我的」两组，组内按最近更新）。
表头即筛选：材料名称（放大镜展开搜索）、产品/分类与对外使用范围（下拉筛选，带文件数）、更新时间（点击切换排序，仅对当前页排序——分页接口无排序参数）。有条件时表头上方出现筛选标签 + 清空。
「我的」视图里点击材料的范围标签可直接修改内部可见范围和对外使用范围。

> 分页接口只支持单个 `knowledgeBaseId`，没有「属于我」的过滤，所以「我的」视图总是落在某个个人库上（未指定时取最近更新的个人库）。

| 操作 | 接口 | 请求 | 响应 `data` |
| --- | --- | --- | --- |
| 当前组织（左栏顶部） | `GET /admin/auth/me` | — | `{ userId, displayName, organizationName, roleName }`（真实接口还含 permissions 等） |
| 可访问的知识库（左栏，含文件数） | `POST /manage/knowledge/base/list` | `{}` | `[{ id, baseName, description, documentCount, retrievableDocumentCount, visibility, isDefault, editTime }]` |
| 左栏分组「我的库 / 共享给我的」 | 上一行 + `GET /api/materials/libraries` 并行，按 id 合并 | — | 前端函数 `listKnowledgeBases()` 返回 `KbLibraryItem = KbLibrary & { name, count: number, ownedByMe }`，我的库在前、组内按 `editTime` 倒序；个人库接口失败时 `ownedByMe` 全为 false。`KbLibraryPicker` 也用它 |
| 查找材料 / 列表 / 分页 | `POST /manage/document/page/query` | `{ keyword, knowledgeBaseId, usageScope, product, category, pageNo, pageSize }`（页码字符串） | `{ pageNo, pageSize, total, records: Material[] }` |
| 筛选项及数量 | `POST /manage/document/filter/options/query` | `{ knowledgeBaseId? }` | `{ usageScopes, products, categories: [{ value, count }] }` |
| 展开行 / 抽屉概览 | `GET /api/materials/{id}/overview` | — | `{ documentId, summary, summarySource, keyPoints[], truncated, status: READY\|NOT_READY\|UNAVAILABLE }` |
| 材料详情（抽屉） | `POST /manage/document/detail/query` | `{ documentId }` | `Material` |
| 预览（抽屉、阅读器） | `GET /api/materials/{id}/preview` | — | `{ documentId, kind: MARKDOWN\|TEXT\|PDF\|OFFICE\|IMAGE\|SHEET\|MEDIA\|NONE, status, version(64 hex), content, contentSource, truncated, contentType }` |
| 版本列表 | `GET /api/materials/{id}/versions` | — | `[{ contentVersionId, versionNo, current, originalName, createdAt }]` |
| 权限快照（「我的」视图范围标签） | `POST /manage/document/access/snapshot?documentId=` | `{}` | `{ documentId, accessMode: PRIVATE\|INHERIT\|TENANT\|CUSTOM, policyVersion, canManage, owner, permissions: READ\|CONTRIBUTE\|SHARE\|MANAGE\|DOWNLOAD[] }` |
| 改内部可见范围（范围弹层） | `POST /manage/document/access/mode/update` | `{ documentId, accessMode: PRIVATE\|INHERIT\|TENANT, expectedPolicyVersion }` | 新的权限快照。需 SHARE 权限；仅所有者可设 PRIVATE / TENANT / INHERIT；父知识库为仅自己时非 PRIVATE 返回 409；版本不符 409。界面文案：仅自己 / 跟随知识库 / 公司内可见（CUSTOM「指定成员」只展示，不在这里设置） |
| 改对外使用范围（范围弹层） | `POST /api/materials/{id}/usage-scope` | `{ usageScope }`（待确认/仅内部/仅总代/可对伙伴/可对客/可公开） | `Material`。**知识库后端暂无此接口**（目前只能在上传表单 `usageScope` 里填写），为新前端提出、待后端补齐；mock 已实现 |
| 附件（已封装，界面暂未展示） | `GET /api/materials/{id}/attachments` | — | `{ attachments[], canAdd }` |
| 下载原件 | `GET /api/materials/{id}/original?version=` | version = 当前版本 `contentVersionId` | 文件流（Blob，服务端审计，需 DOWNLOAD 权限） |

`Material`：`documentId, documentName, originalFileName, knowledgeBaseId, knowledgeBaseName, fileType, fileTypeName, fileSize, parseStatus, parseStatusName, indexStatus, indexStatusName, metadataJson, editTime, updateTime`。

### 分享（行内「分享」、抽屉「分享」）

| 操作 | 接口 | 请求 | 响应 `data` |
| --- | --- | --- | --- |
| 能否对客分享 | `GET /api/materials/shares/eligibility/{documentId}` | — | `{ allowed, reason }`（`reason` 为不可分享原因，允许时为 `OK`） |
| 有效期设置 | `GET /api/materials/shares/settings` | — | `{ defaultDays, maxDays, linkCopy }` |
| 生成分享链接 | `POST /api/materials/shares` | `{ documentIds[], validDays, title, note }` | `{ id, path }`（链接 = `VITE_KB_APP_URL + path`；未配置时只显示 path） |

### 我的知识库（抽屉，从左栏「我的库」的设置图标 / 「新建私有库」打开）

| 操作 | 接口 | 请求 | 响应 `data` |
| --- | --- | --- | --- |
| 列表 | `GET /api/materials/libraries` | — | `[{ id, name, description, visibility, policyVersion, archived, documentCount }]` |
| 新建私有库 | `POST /manage/knowledge/base/save` | `{ baseName }` | 新知识库 `{ id, baseName, … }` |
| 改名 | `POST /api/materials/libraries/{id}/rename` | `{ expectedPolicyVersion, name, description }` | 个人库 |
| 设为仅自己 | `POST /manage/knowledge/access/visibility/update` | `{ knowledgeBaseId, visibilityCode: 'PRIVATE', expectedPolicyVersion }` | 个人库 |
| 归档 / 恢复 | `POST /api/materials/libraries/{id}/archive` · `/restore` | `{ expectedPolicyVersion }` | 个人库 |
| 删除（仅对已归档的库开放） | `POST /manage/knowledge/base/delete` | `{ id }` | `{ success }` |

### 上传材料（抽屉）

流程：`options` → 每个文件 `create`（multipart）→ `form`（写入目标库、使用范围）→ `confirm` → 轮询 `processing`（mock 1s，live 5s）→ 失败可 `processing/retry`。

| 操作 | 接口 | 请求 | 响应 `data` |
| --- | --- | --- | --- |
| 可上传的目标库 | `GET /api/materials/uploads/options` | — | `{ aiEnabled, targets: [{ id, name }], products, categories: [{ id, label, revision }] }` |
| 草稿列表（已封装） | `GET /api/materials/uploads` | — | `UploadDraft[]` |
| 上传文件 | `POST /api/materials/uploads`（multipart） | `file`、`uploadKey`（UUID）、可选 `attachmentToDocumentId` | `UploadDraft` |
| 保存草稿表单 | `POST /api/materials/uploads/{id}/form` | `{ expectedRevision, contentVersion, form: { knowledgeBaseId, title, products[], categories[], description, tags[], usageScope, editedFields[] } }` | `UploadDraft` |
| 确认入库 | `POST /api/materials/uploads/{id}/confirm` | `{ expectedRevision, contentVersion, idempotencyKey }` | `UploadDraft`（`state: CONFIRMED`，`result.documentId`） |
| 取消草稿（移除未入库的行） | `POST /api/materials/uploads/{id}/cancel` | `{ expectedRevision, contentVersion }` | `UploadDraft` |
| 处理进度 | `GET /api/materials/uploads/{id}/processing` | — | `{ state: WAIT_PARSE\|PARSING\|WAIT_INDEX\|INDEXING\|READY\|FAILED\|REPLACED, message, retryAllowed }` |
| 重试处理 | `POST /api/materials/uploads/{id}/processing/retry` | `{ contentVersion }` | 同上 |

`UploadDraft`：`id, fileName, fileSize, state: DRAFT|CONFIRMED|CANCELLED, formRevision, contentVersion, form, attachmentToDocumentId?, result?: { documentId }`。
前端校验：每次 ≤ 20 份、单份非空且 ≤ 128 MiB、PPT/PPTX ≤ 32 MiB。

## 阅读器（`#kb/<库id|all>/reader?doc=`）

复用 `detail/query`、`preview`、`access/snapshot`、`original`。Markdown/解析文本整页渲染，标题生成左侧目录；图片 / 未转换的格式显示封面占位并提示下载。

## 问材料（`#kb/ask`）

| 操作 | 接口 | 请求 | 响应 `data` |
| --- | --- | --- | --- |
| 可选知识库 | `POST /api/chat/knowledge-base/options` | `{}` | 同知识库列表 |
| 可选单份材料 | `POST /api/chat/document/options` | `{}` | `[{ documentId, documentName, knowledgeBaseId }]` |
| 会话列表 | `POST /api/chat/session/list` | `{ keyword, chatMode: 'ALL', turnStatus: 'ALL', pageNo, pageSize }`（字符串） | `{ pageNo, pageSize, totalSize, totalPages, sessions: Session[] }` |
| 打开会话 | `POST /api/chat/session/detail` | `{ conversationId }` | `Session & { exchanges: [{ exchangeId, question, answer, status, errorMessage, createTime, references[] }] }` |
| 提问（流式） | `POST /api/chat/stream`（SSE，`data: {...}`） | `{ question, conversationId, chatMode, knowledgeBaseSelectionMode, selectedKnowledgeBaseIds[], selectedDocumentId }` | 事件 `{ type: status\|thinking\|text\|reference\|modelNotice, content, timestamp }`；`text` 为正文增量，`reference` 的 content 为引用数组 |
| 停止生成 | `POST /api/chat/session/stop` | `{ conversationId }` | `{ success, message }` |
| 删除会话 | `POST /api/chat/session/reset` | `{ conversationId }` | `{ success }` |
| 读取我的反馈 | `GET /api/chat/exchanges/{exchangeId}/feedback/submission` | — | `Feedback \| null` |
| 赞 / 踩 | `PUT /api/chat/exchanges/{exchangeId}/feedback` | `{ rating: UP\|DOWN, uiVariant: 'c', entry: 'panel' }` | `Feedback` |
| 补充原因 | `POST /api/chat/exchanges/{exchangeId}/feedback/{feedbackId}/submission` | `{ reasons: IRRELEVANT\|BAD_CITATION\|OUTDATED\|INCOMPLETE\|OTHER[], comment }` | `Feedback` |
| 撤回反馈 | `DELETE /api/chat/exchanges/{exchangeId}/feedback/{feedbackId}` | — | `null` |

范围映射（同知识库 `resolveChatRequestScope`）：

| 页面范围 | chatMode | knowledgeBaseSelectionMode | selectedKnowledgeBaseIds | selectedDocumentId |
| --- | --- | --- | --- | --- |
| 全部材料 | `AUTO_DOCUMENT` | `ALL` | `[]` | `null` |
| 指定知识库 | `AUTO_DOCUMENT` | `SELECTED` | `[库id]` | `null` |
| 单份材料 | `DOCUMENT` | `SELECTED` | `[材料所在库]` | 材料 id |
| 开放提问 | `OPEN_CHAT` | `NONE` | `[]` | `null` |

`Reference`：`citationIdentity, citationEvidenceType, documentId, documentName, sectionPath, quoteText, chunkNo`。回答正文里的 `[n]` 对应第 n 条引用；点击打开 `#kb?doc=<documentId>`。
流结束后回读 `session/detail` 取本轮 `exchangeId`（反馈要用），与知识库前端做法一致。`conversationId` 由前端生成（时间戳 36 进制 + 随机串）。

## 未移植、跳转到完整知识库的功能

左栏「更多知识库功能」对话框，链接 = `VITE_KB_APP_URL + 路径`，新标签页打开；未配置时按钮置灰并提示「待配置完整知识库地址（VITE_KB_APP_URL）」。分享成功页的「我的分享」同理。

| 功能 | 路径 |
| --- | --- |
| 做材料（写方案初稿） | `/materials/write` |
| 我的分享（续期、撤销、重新生成） | `/materials/shares` |
| 分享分析 | `/materials/share-analytics` |
| 留资线索 | `/materials/leads` |
| 文档管理（解析产物、切块、索引、任务日志） | `/admin/documents` |
| 知识库管理 | `/admin/knowledge-bases` |
| 知识路由与追踪 | `/admin/knowledge-route` |
| 可观测（会话链路、检索通道） | `/admin/observability` |
| 质量概览 | `/admin/quality-overview` |
| 回答反馈复核 | `/admin/answer-feedback` |

## 与知识库前端的差异（已知简化）

- **预览**：只渲染 `kind: MARKDOWN` 的正文（自带轻量 Markdown 渲染）；PDF / Office / 表格 / 图片 / 音视频的在线浏览（`rendition/access`、`sheets`、`media/access`、pdf.js）没有移植，显示封面占位 + 下载。
- **封面缩略图** `GET /api/materials/{id}/thumbnail`（PNG Blob）未接，用格式色块占位。
- **上传**：不做 AI 识别（`recognize`）和逐字段编辑草稿（产品、分类、标签、描述）；只设目标库和对外使用范围，标题取文件名。批量改字段、附件上传（`attachmentToDocumentId`）、替换版本（`POST /api/materials/{id}/versions`）未做。
- **权限与版本**：抽屉里只读展示；文档级 `access/mode/update` 已在「我的」视图的范围弹层里接入。
- **分享**：直接在弹窗里生成单份材料的链接；多材料打包分享、留资表单设置在完整知识库。
- **问答**：未接模型选择（`/api/chat/model-options/*`）、思考步骤展开、检索结果 / 通道执行明细、长期摘要重建。
- 查询条件（关键词、筛选、分页）保存在页面状态里，不写进地址栏；只有 `?doc=` 进地址栏，便于分享和返回。
