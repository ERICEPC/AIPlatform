"""Configure/test external knowledge using the authenticated employee only."""
from flask import request
from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from werkzeug.exceptions import BadRequest

from controllers.console import console_ns
from models.external_agent_knowledge import ExternalKnowledgeSet
from services.agent.external_knowledge import ExternalKnowledgeError, for_account
from .personal import auth


class TestQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    binding: ExternalKnowledgeSet
    question: str = Field(min_length=1, max_length=16000)


def failure(error):
    status = 403 if error.error_code == "external_knowledge_forbidden" else 503
    if error.error_code == "external_knowledge_auth_required":
        status = 409
    return {"code": error.error_code, "message": str(error)}, status


@console_ns.route("/agent-external-knowledge/options")
class ExternalKnowledgeOptions(Resource):
    @auth
    def get(self, session, tenant_id, current_user):
        try:
            with for_account(tenant_id, current_user.id) as client:
                libraries, documents = client.libraries(), client.documents()
                # The options endpoint does not always supply documentCount.
                # Count the actual caller-visible, queryable material options.
                for library in libraries:
                    library["document_count"] = str(sum(d["library_id"] == library["id"] for d in documents))
                return {"libraries": libraries, "documents": documents,
                        "identity_mode": "caller", "capability": "material_qa"}
        except ExternalKnowledgeError as error:
            return failure(error)


@console_ns.route("/agent-external-knowledge/test")
class ExternalKnowledgeTest(Resource):
    @auth
    def post(self, session, tenant_id, current_user):
        try:
            payload = TestQuery.model_validate(request.get_json())
        except ValidationError:
            raise BadRequest("请选择有效知识库并输入测试问题。") from None
        try:
            with for_account(tenant_id, current_user.id) as client:
                return client.ask(payload.binding, payload.question)
        except ExternalKnowledgeError as error:
            return failure(error)
