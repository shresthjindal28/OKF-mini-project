import logging
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import PurePosixPath
from threading import BoundedSemaphore
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy import Engine, delete, func, select, text, update
from sqlalchemy.orm import Session, load_only

from app.ai.huggingface_client import HuggingFaceClient
from app.core.config import Settings, get_settings
from app.core.database import verify_database
from app.core.errors import AppError
from app.models.document import Document, DocumentStatus
from app.models.document_chunk import DocumentChunk
from app.models.processing_job import ProcessingJob
from app.schemas.document import DocumentCreate, DocumentPage, DocumentSummary
from app.schemas.okf import OKFRepresentation
from app.services.chunking_service import ChunkingService
from app.services.embedding_service import EmbeddingService
from app.services.extraction_service import ExtractionService
from app.services.okf_service import OKFService
from app.utils.files import Storage
from app.utils.validation import safe_display_filename, validate_file

logger = logging.getLogger(__name__)


@lru_cache
def mutation_slots() -> BoundedSemaphore:
    # Reserve capacity for both lock and work connections; fail fast instead of
    # exhausting the connection pool with lock holders waiting on each other.
    return BoundedSemaphore(get_settings().max_concurrent_processing)


@contextmanager
def document_lock(engine: Engine, document_id: UUID) -> Iterator[Session]:
    slots = mutation_slots()
    if not slots.acquire(blocking=False):
        raise AppError("PROCESSING_CAPACITY", "Processing capacity is busy; retry later", 503)
    try:
        # Dedicated transaction: stages commit on a separate connection. This also
        # works through transaction-mode poolers, unlike session-level locks.
        key = int.from_bytes(document_id.bytes[:8], "big", signed=True)
        with engine.connect() as lock_connection, lock_connection.begin():
            acquired = lock_connection.scalar(
                text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": key}
            )
            if not acquired:
                raise AppError(
                    "DOCUMENT_BUSY", "Document is already being processed or deleted", 409
                )
            with Session(engine, expire_on_commit=False) as session:
                yield session
    finally:
        slots.release()


class DocumentService:
    def __init__(self, settings: Settings, storage: Storage) -> None:
        self.settings = settings
        self.storage = storage

    def create(
        self,
        session: Session,
        filename: str | None,
        mime: str | None,
        data: bytes,
        metadata: DocumentCreate,
    ) -> Document:
        filename = safe_display_filename(filename)
        mime_type = validate_file(filename, mime, data, self.settings)
        document_id = uuid4()
        key = self.storage.save_original(document_id, PurePosixPath(filename).suffix.lower(), data)
        document = Document(
            id=document_id,
            title=metadata.title.strip() or PurePosixPath(filename).stem,
            description=metadata.description,
            author=metadata.author,
            document_type=metadata.document_type,
            tags=metadata.tags,
            original_filename=filename,
            mime_type=mime_type,
            file_size=len(data),
            source_path=key,
            status=DocumentStatus.UPLOADED,
        )
        try:
            session.add(document)
            session.commit()
        except Exception:
            session.rollback()
            # A network failure at COMMIT has an ambiguous outcome. Keep the source
            # even if the row may not exist; reconciliation can remove true orphans.
            logger.warning("upload_commit_failed source_retained document_id=%s", document_id)
            raise
        return document

    @staticmethod
    def get(session: Session, document_id: UUID) -> Document:
        document = session.get(Document, document_id)
        if document is None:
            raise AppError("DOCUMENT_NOT_FOUND", "Document not found", 404)
        return document

    def list(
        self,
        session: Session,
        page: int,
        page_size: int,
        search: str | None,
        status: DocumentStatus | None,
        document_type: str | None,
        sort_by: Literal["created_at", "updated_at", "title"],
        order: Literal["asc", "desc"],
    ) -> DocumentPage:
        statement = select(Document)
        if search:
            statement = statement.where(Document.title.icontains(search, autoescape=True))
        if status:
            statement = statement.where(Document.status == status)
        if document_type:
            statement = statement.where(Document.document_type == document_type)
        total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
        column = {
            "created_at": Document.created_at,
            "updated_at": Document.updated_at,
            "title": Document.title,
        }[sort_by]
        statement = statement.options(
            load_only(
                Document.id,
                Document.title,
                Document.description,
                Document.author,
                Document.original_filename,
                Document.mime_type,
                Document.file_size,
                Document.status,
                Document.document_type,
                Document.tags,
                Document.created_at,
                Document.updated_at,
                Document.error_code,
                Document.error_message,
            )
        )
        statement = statement.order_by(
            column.desc() if order == "desc" else column.asc(), Document.id
        )
        rows = session.scalars(statement.offset((page - 1) * page_size).limit(page_size)).all()
        return DocumentPage(
            items=[DocumentSummary.model_validate(row) for row in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    def delete(self, engine: Engine, document_id: UUID) -> None:
        with document_lock(engine, document_id) as session:
            document = self.get(session, document_id)
            # Database removal first; filesystem cleanup failure is logged and retryable by operations.
            session.delete(document)
            session.commit()
            try:
                self.storage.delete_document(document_id)
            except OSError:
                logger.error("storage_cleanup_failed document_id=%s", document_id)

    def representation(self, session: Session, document_id: UUID) -> OKFRepresentation:
        document = self.get(session, document_id)
        if document.okf_content is None:
            raise AppError("OKF_NOT_AVAILABLE", "Process the document to generate OKF", 409)
        return OKFRepresentation(files=document.okf_content, metadata=document.okf_metadata or {})

    def download(self, session: Session, document_id: UUID) -> bytes:
        document = self.get(session, document_id)
        representation = self.representation(session, document_id)
        return OKFService().package(
            representation.files,
            self.storage.read(document.source_path),
            PurePosixPath(document.source_path).suffix,
        )


class ProcessingService:
    def __init__(self, settings: Settings, storage: Storage, client: HuggingFaceClient) -> None:
        self.settings = settings
        self.storage = storage
        self.client = client
        self.documents = DocumentService(settings, storage)

    def process(self, engine: Engine, document_id: UUID) -> Document:
        with document_lock(engine, document_id) as session:
            document = self.documents.get(session, document_id)
            verify_database(session, self.settings)
            # An abandoned RUNNING job is recoverable once its process no longer holds the lock.
            session.execute(
                update(ProcessingJob)
                .where(ProcessingJob.document_id == document_id, ProcessingJob.status == "RUNNING")
                .values(
                    status="FAILED",
                    error_code="PROCESSING_INTERRUPTED",
                    error_message="Previous process stopped; a new attempt was started",
                    finished_at=datetime.now(UTC),
                )
            )
            job = ProcessingJob(document_id=document_id)
            session.add(job)
            document.error_code = document.error_message = None
            self._stage(session, document, job, DocumentStatus.PROCESSING, "EXTRACT")
            try:
                original = self.storage.read(document.source_path)
                extracted = ExtractionService(self.settings).extract_document(
                    original, document.mime_type
                )
                document.extracted_text = extracted.text
                document.extracted_metadata = extracted.metadata
                if not document.author and isinstance(extracted.metadata.get("author"), str):
                    document.author = str(extracted.metadata["author"])[:500]
                self._stage(session, document, job, DocumentStatus.EXTRACTED, "STRUCTURE")
                # Persist a deterministic artifact before optional remote enrichment.
                self._generate(session, document, original)
                self._stage(session, document, job, DocumentStatus.STRUCTURING, "STRUCTURE")
                if self.settings.hf_llm_model:
                    metadata = self.client.structure(extracted.text)
                    if document.title == PurePosixPath(document.original_filename).stem:
                        document.title = metadata.title
                    if not document.description:
                        document.description = metadata.description
                    if not document.tags:
                        document.tags = metadata.tags
                    document.extracted_metadata = {
                        **document.extracted_metadata,
                        "ai_model": self.settings.hf_llm_model,
                        "ai_input_chars": min(
                            len(extracted.text), self.settings.hf_llm_max_input_chars
                        ),
                    }
                self._stage(session, document, job, DocumentStatus.STRUCTURING, "GENERATE_OKF")
                self._generate(session, document, original)
                self._stage(session, document, job, DocumentStatus.STRUCTURING, "CHUNK")
                assert document.okf_content is not None
                _, body = OKFService().load(document.okf_content["document.md"])
                chunks = ChunkingService(
                    self.settings.chunk_size, self.settings.chunk_overlap
                ).chunk(body)
                self._stage(session, document, job, DocumentStatus.STRUCTURING, "EMBED")
                embeddings = EmbeddingService(self.settings, self.client).embed_batch(
                    [chunk.content for chunk in chunks]
                )
                self._stage(session, document, job, DocumentStatus.STRUCTURING, "INDEX")
                # Replacement and READY are one transaction; failed attempts never expose partial vectors.
                session.execute(
                    delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
                )
                for chunk, embedding in zip(chunks, embeddings, strict=True):
                    session.add(
                        DocumentChunk(
                            document_id=document_id,
                            chunk_index=chunk.index,
                            content=chunk.content,
                            chunk_metadata={
                                "heading": chunk.heading,
                                "word_count": chunk.word_count,
                                "concept_path": "document.md",
                            },
                            embedding=embedding,
                            embedding_model=self.settings.hf_embedding_model,
                        )
                    )
                document.status = DocumentStatus.READY
                job.status = "SUCCEEDED"
                job.stage = "READY"
                job.finished_at = datetime.now(UTC)
                session.commit()
                session.refresh(document)
                return document
            except Exception as exc:
                session.rollback()
                error = (
                    exc
                    if isinstance(exc, AppError)
                    else AppError(
                        "PROCESSING_FAILED",
                        "Processing failed; source and completed stages are preserved. Retry processing.",
                        500,
                    )
                )
                document.status = DocumentStatus.FAILED
                document.error_code, document.error_message = error.code, error.message
                job.status, job.error_code, job.error_message = "FAILED", error.code, error.message
                job.finished_at = datetime.now(UTC)
                session.commit()
                logger.warning("processing_failed document_id=%s code=%s", document_id, error.code)
                raise error from None

    @staticmethod
    def _stage(
        session: Session, document: Document, job: ProcessingJob, status: DocumentStatus, stage: str
    ) -> None:
        document.status = status
        job.stage = stage
        session.commit()

    def _generate(self, session: Session, document: Document, original: bytes) -> None:
        service = OKFService()
        extension = PurePosixPath(document.source_path).suffix
        representation = service.generate(
            title=document.title,
            description=document.description,
            document_type=document.document_type,
            tags=document.tags,
            text=document.extracted_text or "",
            source_name=document.original_filename,
            source_extension=extension,
            author=document.author,
        )
        self.storage.write_artifact(
            document.id, service.package(representation.files, original, extension)
        )
        document.okf_content, document.okf_metadata = representation.files, representation.metadata
        session.commit()
