"""Credential-free external KB bindings persisted in Agent drafts/snapshots."""
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ExternalKnowledgeSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    provider: Literal["knowledge_bridge"] = "knowledge_bridge"
    identity_mode: Literal["caller"] = "caller"
    description: str = Field(default="", max_length=2000)
    library_ids: list[str] = Field(min_length=1, max_length=10)
    document_id: str | None = Field(default=None, max_length=255)
    # The upstream contract currently offers grounded Q&A, not raw vector hits.
    capability: Literal["material_qa"] = "material_qa"
    execution: Literal["before_answer"] = "before_answer"

    @field_validator("id", "name")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("名称和 ID 不能为空")
        return value.strip()

    @field_validator("library_ids")
    @classmethod
    def valid_libraries(cls, values: list[str]) -> list[str]:
        if any(not v.strip() or len(v) > 255 or v != v.strip() for v in values):
            raise ValueError("知识库 ID 不合法")
        if len(values) != len(set(values)):
            raise ValueError("知识库不能重复")
        return values

    @model_validator(mode="after")
    def valid_document_scope(self) -> Self:
        if self.document_id is not None:
            if not self.document_id.strip() or self.document_id != self.document_id.strip():
                raise ValueError("材料 ID 不合法")
            if len(self.library_ids) != 1:
                raise ValueError("指定材料时必须选择它所属的一个知识库")
        return self
