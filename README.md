# Raccoon X / AIPlatform

Raccoon X 智能体中台源码快照，整理日期：2026-11-13。

## 代码目录

- `frontend-20261112-preview/`：当前新版开发者工作台，React + Vite，线上路径 `/v4/nov12/`。
- `frontend/`：基础前端及共享组件、CLI。
- `installer/runtime/build/api/code/`：后端源码，包含知识库桥接、智能体配置和发布、发布页员工身份关联。
- `deployment/personal-harness/`：个人助手与协同运行服务。
- `deployment/codex-connector/`、`deployment/colleague-connector/`：本地执行连接器。
- `deployment/my-agent-cli/`：智能体操作命令行。
- `installer/`、`scripts/`：安装与打包工具。
- `tests/`：回归测试。

## 新版前端构建

```bash
cd frontend-20261112-preview
corepack pnpm install --frozen-lockfile
VITE_BASE=/v4/nov12/ VITE_API_MODE=live pnpm build
```

构建结果为 `dist/`，需要与平台后端及反向代理一起使用。开发入口可运行 `pnpm dev`。

## 本次包含的修复

- 知识库 DOCX/PDF 预览传递文件版本号，修复 Bad Request。
- 发布后的 Web 智能体关联经过验证的平台员工身份，知识检索遵循调用者权限。
- 知识库授权异常返回可理解的提示，避免统一显示服务器内部错误。

## 部署边界

这是源码快照，不是生产数据备份或开箱即用的离线镜像包。运行依赖、镜像、模型配置、账号和数据库需在目标环境单独准备。安装说明见 `installer/安装说明.md`；历史发行说明见 `docs/LEGACY-README.md`，其中旧版本和下载路径仅供历史参考。

不包含生产密码、登录会话、证书私钥、数据库、用户上传材料、本地运行目录及运维备份。环境默认文件中的服务密钥已清空，部署时由安装配置步骤生成，不能直接使用空配置启动。

当前线上运行环境还包含实例配置与部署挂载；本快照上传不会修改线上服务。移植时需核对对应服务与配置，不能把源码目录等同于完整部署镜像。

第三方组件许可证保留于原目录，使用与分发应遵守对应许可证。
