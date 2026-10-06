from uuid import UUID

from pydantic import BaseModel, Field, JsonValue


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000, pattern=r"\S")
    limit: int = Field(default=10, ge=1, le=100)
    document_id: UUID | None = None


class SearchHit(BaseModel):
    document_id: UUID
    title: str
    chunk_id: UUID
    chunk_index: int
    content: str
    metadata: dict[str, JsonValue]
    similarity: float
