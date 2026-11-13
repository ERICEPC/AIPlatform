# 个人设置接口清单

- 代码：`src/api/settings.ts`（类型 + 请求函数）、`src/api/mock/settings.ts`（有状态内存 mock，刷新后恢复示例数据）
- 页面：侧栏左下角用户卡 → 菜单「设置」打开的对话框（`src/components/settings/`）。其他页面可调用 `openSettings('models')` 直接打开某个分区（分区：`general` / `models` / `default-model` / `account`）。
- 控制台接口前缀：`/console/api`。修改类接口成功返回 `{"result": "success"}`，失败统一 `{"message": "..."}`。
- 后端来源：原 RaccoonX `account-page`（名称、头像、密码）、`preference-page`（语言、时区）、`useLogout`。
- 「模型供应商」「默认模型」两个分区复用集成模块的接口，见 [integrations.md](./integrations.md) 的模型供应商部分（`/workspaces/current/model-providers/**`、`/workspaces/current/default-model`）。

## 数据结构

| 类型 | 字段 |
|---|---|
| AccountProfile | `id` `name` `email` `avatar`（文件 ID）`avatar_url` `is_password_set` `interface_language`（`zh-Hans` / `en-US`）`timezone`（IANA 名称）`role`（新前端展示用，可选）`created_at` |

## 接口

| 页面 → 操作 | 方法 | 路径 | 请求 | 响应 | 函数 |
|---|---|---|---|---|---|
| 打开设置（通用、账号分区） | GET | `/account/profile` | — | `AccountProfile` | `getAccountProfile` |
| 账号 → 保存显示名称 | POST | `/account/name` | `{ name }`（1–30 字） | `{ result }` | `updateAccountName` |
| 账号 → 更换头像（界面暂未开放） | POST | `/account/avatar` | `{ avatar }`（上传后的文件 ID，空字符串表示移除） | `{ result }` | `updateAccountAvatar` |
| 账号 → 修改密码（界面暂未开放，只提示） | POST | `/account/password` | `{ password?, new_password, repeat_new_password }` | `{ result }` | `changePassword` |
| 通用 → 界面语言 | POST | `/account/interface-language` | `{ interface_language }` | `{ result }` | `updateInterfaceLanguage` |
| 通用 → 时区 | POST | `/account/timezone` | `{ timezone }` | `{ result }` | `updateTimezone` |
| 用户菜单 / 账号 → 登出 | POST | `/logout` | — | `{ result }` | `logout` |

## 只在前端保存的偏好

| 偏好 | 存储 | 说明 |
|---|---|---|
| 外观主题 | `localStorage['rx-v3-theme']` = `dark` / `light` / `system` | 跟随系统时监听 `prefers-color-scheme` 实时切换（`src/lib/theme.ts`） |
| 界面语言 | `localStorage['rx-v3-lang']` = `zh-Hans` / `en-US` | 同时调用 `/account/interface-language`；English 界面后续版本生效 |

登出：无论 `/logout` 成功与否都回到登录页（会话可能已过期）。
