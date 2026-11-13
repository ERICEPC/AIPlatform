# 门户前端源码恢复说明

2026-11-03将2026-10-29从原服务器 `/opt/dify` 只读导出的源码及补充构建文件纳入仓库。本目录是真实React/Next.js开发源码，不是从编译JavaScript反编译的结果。

## 目录与来源

- `web/`：门户页面、组件、样式、测试及Next.js配置。
- `packages/`：UI、图标、契约、开发代理等共享workspace包。
- `e2e/`、`sdks/nodejs-client/`、`cli/`：原pnpm workspace依赖及测试/工具源码。这里的上游 `cli/` **不是** 本项目个人管理CLI `../installer/cli/raccoon.py`，两者不能替换。
- 根目录package.json、pnpm锁文件、workspace、lint/ESLint/Vite配置及scripts来自同一源码恢复批次及补充文件；相同重叠文件已逐字节核对。
- `api/dev/`仅包含前端契约生成相关脚本，不是完整后端。现有后端源码仍位于 `../installer/runtime/build/api/code/`。
- `RECOVERY_MANIFEST.json`记录每个恢复文件的来源集合、大小和SHA256。`dify-agent/`是独立Agent后端，不属于前端workspace，本次不重复导入；不带生产数据、账号、密钥或依赖安装目录。

## 开发入口

依赖声明要求Node `^22.22.1`（`.nvmrc`仅写22）、pnpm `11.23.0`。以下是待在合适开发环境执行的原workspace命令，不代表本次执行成功：

```sh
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm --dir web dev
# 需要验证生产构建时：
corepack pnpm --dir web build
```

先按本目录各级AGENTS.md和web文档核对工作流；环境变量由使用者按实例配置，禁止复制生产.env进入Git。恢复后的依赖安装可能执行package lifecycle，执行前需审查当前环境和所需配置。

## 已验证与未验证

本次验证：恢复文件与本地导出原件SHA256一致、普通文件/目录白名单、JSON清单可解析、workspace包引用检查、敏感文件与强凭据格式扫描。源码中的测试假数据或环境变量名不等于实例凭据，扫描不等于完整安全审计。

**尚未验证**：依赖安装、TypeScript/lint、测试及生产构建；源码与当前线上Web镜像的行为一致性。不能因文件已上传就宣称前端已可构建或已完全接管。

已知仍需复核：

1. `web/Dockerfile.dockerignore`原规则仅放行部分共享包manifest，不保证完整共享包源码进入Docker上下文；源代码容器构建需专门验证。
2. `packages/contracts`生成脚本依赖原monorepo后端布局；目前只恢复部分api/dev脚本，需要对接现有后端和生成的OpenAPI，不能把该目录当完整后端。
3. `web/`的版本字段1.17.0不证明与线上 `local/dify-web:raccoon-badges-20261017` 一致；需重新构建后对照Agents/Teams/Skills、头像角标、API和主题覆盖层。
4. 原root脚本可能引用未包含的上游文档、工具或其他文件；本次结构检查不等于所有脚本可运行。

## 与现有部署的关系

本次未改 `installer/runtime/build/web/Dockerfile`：安装包仍使用原预编译 `web-code.tgz`，本目录不会自动被安装器部署。未发布镜像、重启服务或修改生产配置。

RaccoonX现有主题、品牌和头像覆盖层仍在 `../installer/runtime/nginx/assets/`。源码首次构建后，需要决定哪些定制移入组件、哪些保留覆盖层，并做回归；不能把上游默认门户直接当作现网等价替代。

保留根LICENSE和源码中已有版权信息。本次恢复不新增上游商标或商业授权。
