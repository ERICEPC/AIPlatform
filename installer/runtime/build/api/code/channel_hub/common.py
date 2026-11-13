"""Pure validation, isolation and credential helpers (no framework imports)."""
import base64
import hashlib
import json
import os
from urllib.parse import urlsplit

KINDS = {"feishu": "飞书机器人", "dingtalk": "钉钉机器人", "wecom": "企业微信机器人", "wechat": "微信 ClawBot"}
FIELDS = {"feishu": ("app_id", "app_secret"), "dingtalk": ("client_id", "client_secret"),
          "wecom": ("bot_id", "secret"), "wechat": ("bot_id", "bot_token", "base_url", "owner_id")}
ERRORS = {"connecting": "正在连接", "connected": "已连接", "stopped": "未启用", "offline": "连接已断开，正在重连",
          "credentials": "凭据无效或已过期，请重新配置或扫码", "runtime": "智能体调用失败，请查看智能体日志",
          "incomplete": "智能体未完整返回，请查看智能体日志", "delivery": "回复送达状态未确认，请检查机器人会话",
          "interrupted": "服务重启时任务中断，未自动重复调用", "expired": "消息已超时，未执行",
          "configuration": "智能体未发布或 API 未开启", "busy": "等待中的消息较多，请稍后再试",
          "unsupported": "暂时仅支持文字消息", "too_long": "消息过长，请分段发送", "denied": "发送者或群聊未获授权"}


def fingerprint(*values):
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def box():
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    secret = os.environ.get("SECRET_KEY", "")
    if len(secret) < 20:
        raise RuntimeError("channel encryption key unavailable")
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"raccoon/message-channels/v1").derive(secret.encode())
    return Fernet(base64.urlsafe_b64encode(key))


def seal(tenant, channel, value):
    return box().encrypt(json.dumps([tenant, channel, value], ensure_ascii=False).encode()).decode()


def unseal(tenant, channel, value):
    scope, binding, payload = json.loads(box().decrypt(value.encode()))
    if scope != tenant or binding != channel:
        raise ValueError("credential scope mismatch")
    return payload


def official_url(url, suffixes, scheme="https", paths=None):
    p = urlsplit(url)
    if p.scheme != scheme or p.username or p.password or p.port not in (None, 443) or not p.hostname:
        raise ValueError("不受信任的服务地址")
    if not any(p.hostname == host or p.hostname.endswith("." + host) for host in suffixes):
        raise ValueError("不受信任的服务地址")
    if paths and p.path not in paths:
        raise ValueError("不受信任的接口路径")
    return url


def settings(value):
    if not isinstance(value, dict):
        raise ValueError("请填写访问范围")
    result = {"access": value.get("access", "restricted"), "groups": bool(value.get("groups", False))}
    if result["access"] not in ("restricted", "app_members"):
        raise ValueError("无效的访问范围")
    for key in ("allowed_users", "allowed_groups"):
        ids = value.get(key, [])
        if not isinstance(ids, list) or len(ids) > 100 or any(not isinstance(s, str) or not s.strip() or len(s) > 200 for s in ids):
            raise ValueError("用户/群 ID 格式无效，最多填写 100 个")
        result[key] = list(dict.fromkeys(s.strip() for s in ids))
    return result


def credentials(kind, incoming, previous=None):
    if kind not in KINDS or not isinstance(incoming, dict):
        raise ValueError("无效的渠道配置")
    result = dict(previous or {})
    for key, value in incoming.items():
        if key not in FIELDS[kind] or not isinstance(value, str) or len(value) > 8192:
            raise ValueError("无效的渠道凭据")
        if value.strip():
            result[key] = value.strip()
    return result


def ready(kind, creds, policy):
    if not all(creds.get(k) for k in FIELDS[kind]):
        raise ValueError("请先填写完整凭据或完成扫码")
    if policy["access"] == "restricted" and not policy["allowed_users"]:
        raise ValueError("请填写允许使用机器人的用户 ID")
    if kind == "wechat" and policy["access"] != "restricted":
        raise ValueError("微信仅向明确授权的用户开放")
    if policy["groups"] and not policy["allowed_groups"]:
        raise ValueError("启用群聊前请填写允许的群 ID")


def allowed(policy, user, chat, group):
    if not user:
        return False
    if policy["access"] == "restricted" and user not in policy["allowed_users"]:
        return False
    return not group or (policy["groups"] and chat in policy["allowed_groups"])


class ChannelError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(ERRORS.get(code, "渠道操作失败"))
