# Raccoon X 智能体中台

当前源码同步：**2026-11-03**；发行包版本：**2026.10.28（含 CLI JSON 修复）**。基于 Dify 1.17.0，面向 Linux amd64 全新实例联网安装。

包含工作台、Agents、Agent Teams、知识库、Skills、集成、消息渠道、小浣熊头像与原创角标；本次新增 CLI 2.1 审批及跨空间资源校验、非空授权列表 JSON 编码修复、签名文件下载支持，以及测试阶段的 OKR 异步运行模块。

不包含原实例的账号、空间、应用实例、模型凭据、业务数据或服务器密钥。部署后需创建自己的管理员并配置模型和工具。创建 HRBuddy 等实例数据不属于代码发行内容。

## 门户前端开发源码

React/Next.js源码现已恢复到 [`frontend/web/`](frontend/web/)，共享包和原workspace构建文件位于 [`frontend/`](frontend/)。详见[源码恢复说明](frontend/RECOVERY.md)。

该源码于2026-10-29从原服务器导出，本次补入仓库；依赖安装、构建及与现网Web行为一致性仍待验证。**源码目录与现有预编译安装载荷分开维护**，上传源码不会自动更换部署镜像。

## 获取与打包

本次更新同步源码；既有 v2026.10.17 Release 仍是旧版完整包。Git 克隆不含预编译 Web 载荷，不能直接当作完整安装包。当前 Web 构建未变，仍使用该 Release 中的载荷；可按以下步骤补齐并构建新包：

```bash
gh repo clone ERICEPC/RaccoonX
cd RaccoonX
mkdir -p dist
gh release download v2026.10.17 --repo ERICEPC/RaccoonX --pattern 'RaccoonX-2026.10.17.tar.gz*' --dir dist
(cd dist && sha256sum -c RaccoonX-2026.10.17.tar.gz.sha256)
tar -xOf dist/RaccoonX-2026.10.17.tar.gz RaccoonX-2026.10.17/runtime/build/web/web-code.tgz > installer/runtime/build/web/web-code.tgz
python3 scripts/verify.py
python3 scripts/package.py
```

输出 `dist/RaccoonX-2026.10.28.tar.gz` 及 SHA256 文件。私有仓库需使用获授权的 GitHub 账号。

## 安装与验证

按 [安装说明](installer/安装说明.md) 部署。建议 4 核、16GB 内存、25GB 可用磁盘；需要 Docker Hub、PyPI 和所用模型/插件服务的网络访问。默认生成自签证书，可传入正式证书。

这是全新实例安装器，不是已有 Dify 实例的自动升级工具，也不是离线镜像全集。

[验证范围](installer/验收记录.md) · [OKR 接入说明](installer/OKR说明.txt) · [安全说明](SECURITY.md)

CLI 回归使用独立临时数据库和模拟身份，不连接生产，不发放真实授权：

```bash
python3 -m venv .venv-test
.venv-test/bin/pip install -r tests/requirements.txt
.venv-test/bin/python -m pytest -q tests/cli_approval
```

维护分支另提供独立的 [未冻结 KR 来源限定推荐合同](docs/PB_RECOMMENDATION_V1.md)：
`pb.recommendation.v1` 返回 PB 现有 `items/notes` 草稿，使用专用 `rx_rec_*`，
与正式月周计划的 `pb.okr.v1` 分开；执行端强制关闭Shell和工具。
运行 `python -m pytest -q tests/recommendation tests/cli_approval` 验证合同与原CLI回归。

用量、工具和模型实际调用需由部署者完成配置后验证。OKR 仍为测试阶段功能，无完整逐次模型计量。

## 许可

保留 [Dify 上游许可证](LICENSE) 及版权；其中多租户使用、Logo/版权修改的附加条件仍适用。本仓库不授予上游商标或额外商业许可。
