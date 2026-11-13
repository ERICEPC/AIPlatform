"""Workspace-owned image references; response URLs are regenerated on every read."""
from werkzeug.exceptions import BadRequest
from . import store


def validate_avatar_file(tid, avatar):
    if not avatar or avatar.get('type') != 'image':
        return
    files = store.rows('''SELECT id FROM upload_files WHERE id=:id AND tenant_id=:tid
        AND extension IN ('png','jpg','jpeg','webp','gif') AND size<=3145728''',
        id=avatar['icon'], tid=tid)
    if not files:
        raise BadRequest('请选择当前工作空间内不超过 3MB 的图片')


def team_view(tid, team):
    result = dict(team)
    avatar = result['config'].get('avatar')
    result['avatar_url'] = None
    if avatar and avatar.get('type') == 'image':
        try:
            validate_avatar_file(tid, avatar)
        except BadRequest:
            return result
        from services.file_service import FileService
        from extensions.ext_database import db
        result['avatar_url'] = FileService(db.engine).get_icon_url(file_id=avatar['icon'], tenant_id=tid)
    return result
