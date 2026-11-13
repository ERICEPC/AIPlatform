# 安全与数据边界

发行包用于新实例。不得把安装后的 runtime/.env、tls/server.key、volumes、instance.json、首次登录.txt、个人 CLI session.json 重新打包或提交仓库。

安装时为数据库、Redis、插件、Agent 和沙箱生成随机凭据；CLI 与额外工作空间权限默认为空，由实例管理员授权。只发布 Nginx HTTPS 端口，数据库、Redis 和沙箱没有宿主机公网映射。

使用自己的模型 Key、邮件账户、域名和证书。定期备份数据库、文件存储、安装后的密钥配置与 Agent 命名卷；备份同样包含敏感数据，不能上传此仓库。

请通过仓库维护者私下报告可能涉及凭据或数据访问的问题，不要在公开 Issue 中粘贴密钥或业务数据。
