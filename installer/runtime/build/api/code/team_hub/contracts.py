"""Strict control-plane validation. Does not change Agent business output rules."""
import hashlib
import json
import re
from uuid import UUID

TERMINAL = {'succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def uuid(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError('请选择有效的 Agent') from None


def string(value, label, limit, required=True):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ValueError(f'{label}不能为空，且不能超过 {limit} 字' if required else f'{label}不能超过 {limit} 字')
    return value.strip()


def avatar(value):
    if value is None:
        return None
    if not isinstance(value, dict) or value.get('type') not in ('emoji', 'image'):
        raise ValueError('头像格式无效')
    if value['type'] == 'image':
        return dict(type='image', icon=uuid(value.get('icon')))
    icon = string(value.get('icon'), '头像图标', 64)
    background = value.get('background', '#E9EDDF')
    if not isinstance(background, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', background):
        raise ValueError('头像背景色无效')
    return dict(type='emoji', icon=icon, background=background)


def config(value):
    if not isinstance(value, dict):
        raise ValueError('团队配置无效')
    leader = uuid(value.get('leader_id'))
    raw = value.get('members')
    if not isinstance(raw, list) or not 1 <= len(raw) <= 8:
        raise ValueError('请选择 1 至 8 位专家')
    members = []
    seen = set()
    for member in raw:
        if not isinstance(member, dict):
            raise ValueError('专家配置无效')
        aid = uuid(member.get('agent_id'))
        if aid in seen:
            raise ValueError('同一个专家只能选择一次')
        seen.add(aid)
        members.append(dict(agent_id=aid, responsibility=string(member.get('responsibility'), '专家职责', 1000),
                            input_hint=string(member.get('input_hint', ''), '输入说明', 2000, False)))
    limits = {}
    for key, default, lower, upper in [('parallelism', 2, 1, 3), ('max_calls', 4, 1, 12), ('max_rounds', 2, 1, 4), ('timeout', 120, 30, 300)]:
        val = value.get(key, default)
        if type(val) is not int or not lower <= val <= upper:
            raise ValueError(f'{key} 必须在 {lower} 至 {upper} 之间')
        limits[key] = val
    return dict(avatar=avatar(value.get('avatar')), name=string(value.get('name'), '团队名称', 80), description=string(value.get('description', ''), '团队简介', 400, False), goal=string(value.get('goal'), '团队目标', 6000),
                leader_id=leader, members=members, output=string(value.get('output', ''), '输出要求', 3000, False), **limits)


def json_object(answer):
    answer = answer.strip()
    match = re.fullmatch(r'```(?:json)?\s*\n([\s\S]*?)\n```', answer, re.I)
    if match:
        answer = match.group(1)
    try:
        value = json.loads(answer)
    except (ValueError, TypeError):
        raise ValueError('invalid_plan') from None
    if not isinstance(value, dict):
        raise ValueError('invalid_plan')
    return value


def plan(answer, allowed, remaining, final_only=False):
    value = json_object(answer)
    if value.get('action') == 'final':
        answer = string(value.get('answer'), '最终答复', 80000)
        return dict(action='final', answer=answer)
    tasks = value.get('tasks')
    if final_only or value.get('action') != 'delegate' or not isinstance(tasks, list) or not 1 <= len(tasks) <= remaining:
        raise ValueError('invalid_plan')
    result = []
    for task in tasks:
        if not isinstance(task, dict) or task.get('agent_id') not in allowed:
            raise ValueError('unknown_expert')
        query = task.get('query')
        if isinstance(query, (dict, list)):
            query = json.dumps(query, ensure_ascii=False)
        query = string(query, '专家任务', 24000)
        result.append(dict(agent_id=task['agent_id'], query=query))
    return dict(action='delegate', tasks=result)
