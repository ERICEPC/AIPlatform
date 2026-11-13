# Skills 模块接口清单

- 代码：`src/api/skills.ts`（类型 + 请求函数），`src/api/mock/skills.ts`（有状态内存 mock）
- 前缀：控制台接口均相对 `/console/api`（`http.ts` 的 `request` 自动加），Cookie 会话 + `X-CSRF-Token`
- 时间戳：Unix 秒
- **整个模块是 RaccoonX 扩展**：原控制台没有技能管理契约，以下路径和字段由新前端约定，后端接入时需确认
- 技能形态遵循 [Agent Skills](https://agentskills.io/) 规范：一个目录 + `SKILL.md`，front matter 声明 `name`、`description`（可选 `version`）

## 页面与路由

| 路由 | 页面 |
| --- | --- |
| `#skills`、`#skills/native` | 原生：内置基础办公技能，始终启用 |
| `#skills/native/<id>` | 原生技能详情抽屉 |
| `#skills/local` | 本地：上传 / GitHub 导入 / 市场安装的技能 |
| `#skills/local/<id>` | 本地技能详情抽屉 |
| `#skills/market` | 市场：SenseNova-Skills 技能库 |
| `#skills/market/<name>` | 市场技能详情抽屉 |

## 原生 `#skills/native`

| 操作 | 接口 | 请求 | 响应 / 说明 |
| --- | --- | --- | --- |
| 列表（按 文档处理 / 数据与可视化 / 效率 分组） | `GET /skills/native` | — | `{ data: NativeSkill[] }`：`id, name, description, group: document\|data\|productivity, icon, enabled, capabilities[], examples[], file_types[]` |
| 搜索 | （前端） | — | 按 name / description 过滤 |
| 使用 | （前端） | — | 跳转 `#assistant` 并提示；原生技能始终启用，没有启停接口 |

`icon` 是图标 key（`word / pdf / excel / slides / convert / swap / ocr / translate / dashboard / palette / research / browser / memory / timer / roadmap`），前端映射到图标，未知 key 显示通用图标。

## 本地 `#skills/local`

`LocalSkill`：`id, name, description, source: upload|github|market, version, enabled, installed_at, updated_at, file_name, source_url, ref, has_update, files[{path, size}], installed_by`

| 操作 | 接口 | 请求 | 响应 / 说明 |
| --- | --- | --- | --- |
| 列表 | `GET /skills/local` | — | `{ data: LocalSkill[] }`，按安装时间倒序 |
| 详情 | `GET /skills/local/{id}` | — | `LocalSkill`（页面目前直接用列表数据，预留） |
| 上传文件（拖拽 / 选择） | `POST /skills/local/upload` | multipart，字段 `file`：`SKILL.md` / `.json` / `.zip`（含 SKILL.md 的目录），≤ 20 MB | `LocalSkill`。后端解析 front matter（`.json` 读 `name/description/version`）；缺字段返回 400 并说明缺什么；与非上传来源同名返回 409 |
| GitHub 解析 | `POST /skills/local/github/resolve` | `{ url }`，支持 `https://github.com/owner/repo`、`…/tree/<ref>/<path>`、`…/blob/<ref>/<path>/SKILL.md` | `{ url, owner, repo, ref, path, name, description, version, files[], installed_id }`；目录下没有 SKILL.md 返回 404 |
| GitHub 安装 | `POST /skills/local/github/install` | `{ url, ref, path }` | `LocalSkill`。同名 GitHub 来源覆盖为新版本（保留启用状态） |
| 拉取更新（GitHub / 市场来源） | `POST /skills/local/{id}/update` | — | `LocalSkill`（新 `version`，`has_update=false`）；上传来源返回 400 |
| 启用 / 停用 | `PATCH /skills/local/{id}` | `{ enabled }` | `LocalSkill`，前端乐观更新，失败回滚 |
| 删除 | `DELETE /skills/local/{id}` | — | `{ result: 'success' }`；市场来源删除后可在市场重新安装 |
| 来源筛选 / 搜索 | （前端） | — | 全部 / 上传 / GitHub / 市场；按 name / description 过滤 |

客户端校验：上传只接受 `.md/.json/.zip`、非空、≤ 20 MB；GitHub 地址必须 `https://github.com/` 开头且符合上面的格式，否则不发请求。

## 市场 `#skills/market`

内容来自 [OpenSenseNova/SenseNova-Skills](https://github.com/OpenSenseNova/SenseNova-Skills)（MIT）。后端定时同步仓库 `skills/` 目录与 README 技能表；mock 内置提交 `004a242` 的 37 个技能快照。不预装，用户自己挑选安装。

| 操作 | 接口 | 请求 | 响应 / 说明 |
| --- | --- | --- | --- |
| 列表 / 分类 / 搜索 | `GET /skills/market` | `category?: image\|ppt\|data\|research\|search\|video\|html\|collab\|other`，`keyword?` | `{ source{repo, url, synced_at, commit}, categories[{id, count}], data: MarketSkill[] }`；`categories` 是全量计数，不受过滤影响 |
| 安装 | `POST /skills/market/{name}/install` | — | `{ skill: LocalSkill, installed_dependencies: string[] }`；递归安装 `depends_on` 中尚未安装的技能。本地已有非市场来源的同名技能返回 409 |
| 详情抽屉 | （复用列表） | — | 当前筛选结果里没有该技能时，用 `GET /skills/market?keyword=<name>` 单独查 |

`MarketSkill`：`name, tag, category, description, requires[]（使用前准备：API Key、环境变量、本地依赖，展示用文字）, depends_on[], installed, local_id`

分类对应 README：图像与可视化（image）、演示文稿 PPT（ppt）、数据分析（data）、深度研究（research）、搜索（search）、代码视频创作（video）、HTML 网页（html）、团队协作 / 项目跟踪（collab）、其他（other，`sn-update`）。README 表格未列出的 `sn-da-non-spreadsheet-analysis`、`sn-search-finance / image / market-cn / social-media / year-report` 描述取自各自 SKILL.md。

## 待后端确认

1. 技能的作用域：按工作区还是按用户；`installed_by` 是否需要。
2. 市场同步频率与 `has_update` 的计算方式（比较仓库提交 / SKILL.md 中的 version）。
3. 技能运行需要的 API Key / 环境变量在哪里配置（目前只展示 `requires` 文字说明）。
4. 原生技能是否需要按租户关闭（`enabled` 字段已预留，前端目前不提供开关）。
