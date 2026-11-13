# Raccoon X 个人助手后端链路

生产环境的个人助手不是浏览器内的演示逻辑，而是四层链路：

1. **Console API**：保存账号级配置、会话、消息和交付物元数据；校验当前账号对模型、Skill、知识库、Agent 和 MCP 的授权。
2. **Harness Broker**：API 通过内部鉴权调用 broker。broker 为每个会话启动隔离 worker，限制单账号最多 5 条并发任务，并为同一会话串行化消息。
3. **DeepSeek Harness**：worker 以 `@deepseek-ai/dsh-sdk-client@0.2.2-rc.1` 运行，负责模型调用、会话恢复、Skill 加载、MCP 连接和工作区文件操作。
4. **Super-Agent 编排提示**：规划、执行、验证、交付四个阶段只作为内部执行协议。worker 过滤计划、DSML 和工具协议，只将自然语言答复与可下载交付物返回给用户。

平台能力的来源是 Raccoon X 的平台目录。已授权的 Skill 物化到本次 worker 的只读镜像加工作区，MCP 通过稳定命名空间接入，知识库和已发布 Agent 通过平台桥接服务访问。个人 memory 只有在配置开启时才注入；协同任务不继承个人 memory。

## dsh-dify 兼容层

开源仓库 `staff-os/dsh-dify` 提供 `dify_chat` 和 `dify_retrieve` 两个能力，但其 peer dependency 面向 DSH 0.1.x。本项目运行 DSH 0.2.x，因此没有直接把旧插件塞进运行时，而是保留其 provider/consumer 约定，在 `dsh-dify-compat.mjs` 中实现兼容适配。适配层使用服务端保存的 Dify 配置，密钥不会进入前端或用户可见消息。

## 前端契约

前端只消费 API 返回的 `answer`、`steps`、`artifacts` 和会话状态，不自行生成答案、不把浏览器 localStorage 当作生产数据源。用户可见消息只展示自然语言和文件卡片；内部规划、工具调用和诊断信息留在执行记录与服务端日志中。

## 关键验证

- `npm run build`：前端 TypeScript 与 Vite 构建通过。
- Harness compiler/presentation/super-agent/collaboration 测试通过。
- 服务器 broker 健康检查返回 `deepseek-harness / 0.2.2-rc.1`，运行镜像包含 dsh-dify 兼容层。
- Console API 未认证请求返回 401，平台桥接由服务端令牌保护。
