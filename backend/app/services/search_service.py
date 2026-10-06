from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.config import Settings
from app.core.database import verify_database
from app.models.document import Document, DocumentStatus
from app.models.document_chunk import DocumentChunk
from app.schemas.search import SearchHit, SearchRequest
from app.services.embedding_service import EmbeddingService


class SearchService:
    def __init__(self, settings: Settings, embeddings: EmbeddingService) -> None:
        self.settings, self.embeddings = settings, embeddings

    def search(self, session: Session, request: SearchRequest) -> list[SearchHit]:
        verify_database(session, self.settings)
        vector = self.embeddings.embed(request.query, query=True)
        distance = cast(ColumnElement[float], DocumentChunk.embedding.cosine_distance(vector))
        statement = (
            select(DocumentChunk, Document.title, distance.label("distance"))
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(
                Document.status == DocumentStatus.READY,
                DocumentChunk.embedding_model == self.settings.hf_embedding_model,
            )
        )
        if request.document_id:
            statement = statement.where(Document.id == request.document_id)
        rows = session.execute(statement.order_by(distance).limit(request.limit)).all()
        return [
            SearchHit(
                document_id=chunk.document_id,
                title=title,
                chunk_id=chunk.id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                metadata=chunk.chunk_metadata,
                similarity=max(-1.0, min(1.0, 1.0 - float(score))),
            )
            for chunk, title, score in rows
        ]
