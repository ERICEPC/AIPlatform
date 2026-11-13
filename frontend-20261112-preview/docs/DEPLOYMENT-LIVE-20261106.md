# 新前端真实接入与部署

设计来源：SenseTime-FDE/RaccoonX 的 new-frontend 分支，提交 58b5f50。后端保持现有 c03b7c3 安装器部署，不清空数据。

## 模块边界
- 登录：真实 Cookie 会话、初始化口令、管理员创建、密码 Base64 编码（传输依赖 HTTPS）；不提供假的飞书登录。
- 账号、工作空间：读取当前账号和工作空间；切换调用后端并刷新；会话失效回到登录。
- 个人助手：列出当前用户创建的 Agent，选择偏好按账号存储；创建、配置、上传、对话和日志走后端。模型未配置时不能完成真实推理。
- Agents：复用原型配置/访问/日志/监控界面，对接 /agent 系列接口；配置自动保存为草稿，发布遵守后端权限。
- 智能体协同：唯一保留模拟数据的业务模块，页面持续显示演示标识。模拟请求仅限 /collab/，成员选择也使用演示数据；不会把模拟结果写入真实执行记录。
- 知识库：当前部署使用 /datasets，支持列表、创建私有库、文档查看；上传、索引及高级权限入口使用现有完整管理页面。未使用独立 KnowledgeBase 的不兼容接口。
- Skills：使用 /workspaces/current/skills，支持真实列表、ZIP 导入和导出；高级编辑/发布进入完整技能管理页面。不宣称已安装原型中的“原生技能”。
- MCP：真实服务列表和远程服务创建；未部署的本地扫描/批量导入禁用，stdio 不提供，身份转发依部署许可禁用。工具与模型插件市场连接真实市场接口。
- 待我确认：后端未提供统一审批收件箱，显示明确说明，不展示模拟审批。
- 企服目录、其他扩展：尚无后端的接口显示真实错误，不伪造成功；Agents 默认进入“我的”。

## 素材
使用用户提供的 raccoon-emoji-v1-104.zip，SHA256 829b422a288039969906c1391e5e0ae967e9ebac9dc64070e6f9c783a1873717。104 个 WebP 与上游素材一致，全部用于头像选择器；原始 PNG 不增加生产页面载荷。

## 部署
构建：VITE_BASE=/new-ui/ pnpm build，生产 .env.production 必须 VITE_API_MODE=live。
产物：instance/runtime/nginx/assets/new-ui；同源 /console/api 复用现有认证，不新增公开端口。
首页 / 与 /signin、/init、/install 提供新 SPA；/new-ui/ 为静态资源前缀。原有 /datasets、/skills 等深链接保持可访问，以保留完整能力。
回滚：恢复 nginx.before-new-frontend.conf 到 instance/runtime/nginx/default.conf，nginx -t 后 reload，仅切换界面，不回滚业务数据库。

## 验证与限制
TypeScript 和生产构建通过。已验证现有登录态、真实账号/空间、创建助手、配置保存和刷新持久化。模型服务需管理员配置；本次不导入旧模型密钥，不能以演示回复作为真实模型执行验收。
