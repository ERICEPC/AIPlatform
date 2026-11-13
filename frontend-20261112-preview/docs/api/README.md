# 新前端接口层说明（给中后端同学）

新前端只做界面和接口层：每个后端接口都有对应的 TypeScript 类型和请求函数，路径与字段名沿用原 RaccoonX 源码（`frontend/web`）和 Raccoon KnowledgeBase（`knowledgebase/vue/src/api/api.js`）。默认用 mock 数据跑，后端就绪后切到真实接口即可，页面代码不用改。

## 一个开关切换

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` 全部走示例数据；`live` 全部走真实后端 |
| `VITE_API_BASE` | `/console/api` | RaccoonX 控制台接口前缀（Agents、Agent Teams、集成） |
| `VITE_KB_API_BASE` | 空（同源相对路径） | Raccoon KnowledgeBase 接口前缀（知识库） |
| `VITE_KB_APP_URL` | 空 | 完整知识库应用地址，未移植的知识库功能从这里跳转 |
| `VITE_MARKETPLACE_API` | 空 | 插件市场服务地址（集成 → 插件市场、安装模型供应商），独立于控制台接口 |

本地联调示例：

```bash
VITE_API_MODE=live VITE_API_BASE=http://127.0.0.1:5001/console/api pnpm dev
```

> 跨域联调时后端需要放行前端源并允许携带 Cookie；同域部署（nginx 反代 `/console/api`）则不需要。

## 鉴权

- **控制台接口**：沿用原门户的 Cookie 会话；写操作自动带 `X-CSRF-Token`（从 `csrf_token` Cookie 读取）。
- **知识库接口**：`Authorization: Bearer <admin_token>`（从 `localStorage.admin_token` 读取，与 KB 前端一致）。
- 失败时统一抛 `ApiError(message, status, code)`，页面显示错误条和重试；`409` 等业务冲突会提示刷新。

## 代码位置

```
src/api/http.ts            request / stream（SSE）/ requestBlob / 开关与前缀
src/api/hooks.ts           useQuery / useMutation
src/api/agents.ts          Agents（接口清单见 agents.md）
src/api/teams.ts           Agent Teams（teams.md）
src/api/integrations*      集成：模型供应商、工具、MCP、数据来源、触发器、Agent 策略、扩展、自定义端点（integrations.md）
src/api/knowledge.ts       知识库（knowledge.md，KB 后端）
src/api/mock/*             各模块 mock（只在 mock 模式调用）
```

每个请求函数上方都有一行注释写明 `METHOD /path` 和用途，可以直接全局搜索路径找到调用它的页面。

## 流式接口

对话类接口（Agent 构建 / 预览、知识库问材料）走 SSE：按行解析 `data: {...}`，事件名在 `event` 字段（如 `message`、`agent_message`、`message_end`、`error`）。mock 模式会模拟逐字输出。

## 各模块接口清单

- [Agents](agents.md)
- [Agent Teams](teams.md)
- [集成](integrations.md)
- [知识库](knowledge.md)
