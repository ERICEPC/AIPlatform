"""Refresh only persisted tool-file outputs of an already authorized workflow run."""
from uuid import UUID
from sqlalchemy import select
from werkzeug.exceptions import Forbidden, NotFound
from core.tools.signature import sign_tool_file
from core.tools.tool_file_manager import resolve_extension
from core.workflow.file_reference import resolve_file_record_id
from extensions.ext_database import db
from models.tools import ToolFile


def refresh_tool_file_outputs(value, tenant_id):
    if isinstance(value, list):
        return [refresh_tool_file_outputs(item, tenant_id) for item in value]
    if not isinstance(value, dict):
        return value
    if value.get('dify_model_identity') != '__dify__file__' or value.get('transfer_method') != 'tool_file':
        return {key: refresh_tool_file_outputs(item, tenant_id) for key, item in value.items()}
    ids = []
    for candidate in (value.get('related_id'), value.get('id'), value.get('reference')):
        if not candidate:
            continue
        try:
            if not isinstance(candidate, str):
                raise ValueError()
            ids.append(str(UUID(resolve_file_record_id(candidate))))
        except (ValueError, TypeError, AttributeError):
            raise Forbidden('Invalid tool file reference.') from None
    if not ids or len(set(ids)) != 1:
        raise Forbidden('Invalid tool file reference.')
    record = db.session.scalar(select(ToolFile).where(ToolFile.id == ids[0], ToolFile.tenant_id == tenant_id))
    if record is None:
        raise NotFound('Output file is unavailable.')
    result = dict(value)
    result['url'] = sign_tool_file(str(record.id), resolve_extension(filename=record.name, mimetype=record.mimetype))
    return result
