from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints

from app.models.document import DocumentStatus

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class DocumentCreate(BaseModel):
    title: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=10000)
    author: str = Field(default="", max_length=500)
    document_type: ShortText = "Reference"
    tags: list[ShortText] = Field(default_factory=list, max_length=50)


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    description: str
    author: str
    original_filename: str
    mime_type: str
    file_size: int
    status: DocumentStatus
    document_type: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    error_code: str | None
    error_message: str | None


class DocumentDetail(DocumentSummary):
    extracted_text: str | None
    extracted_metadata: dict[str, JsonValue]
    okf_metadata: dict[str, JsonValue] | None


class DocumentPage(BaseModel):
    items: list[DocumentSummary]
    total: int
    page: int
    page_size: int


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    document_id: UUID
    status: str
    stage: str
    error_code: str | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None
