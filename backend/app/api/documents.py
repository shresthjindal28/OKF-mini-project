from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Form, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.ai.huggingface_client import HuggingFaceClient
from app.api.dependencies import get_document_service, get_hf_client, get_storage
from app.core.config import Settings, get_settings
from app.core.database import get_engine, get_session
from app.core.errors import AppError
from app.models.document import DocumentStatus
from app.models.processing_job import ProcessingJob
from app.schemas.common import Envelope
from app.schemas.document import (
    DocumentCreate,
    DocumentDetail,
    DocumentPage,
    DocumentUpdate,
    JobRead,
)
from app.services.document_service import DocumentService, ProcessingService
from app.utils.files import LocalStorage

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", status_code=201, response_model=Envelope[DocumentDetail])
async def upload_document(
    file: UploadFile,
    title: Annotated[str, Form(max_length=500)] = "",
    description: Annotated[str, Form(max_length=10000)] = "",
    author: Annotated[str, Form(max_length=500)] = "",
    document_type: Annotated[str, Form(max_length=100)] = "Reference",
    tags: Annotated[list[str] | None, Form()] = None,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> Envelope[DocumentDetail]:
    try:
        data = await file.read(settings.max_upload_size_mb * 1024 * 1024 + 1)
        try:
            metadata = DocumentCreate(
                title=title,
                description=description,
                author=author,
                document_type=document_type,
                tags=tags or [],
            )
        except ValidationError as exc:
            raise AppError("INVALID_METADATA", "Invalid document metadata", 422) from exc
        document = await run_in_threadpool(
            service.create, session, file.filename, file.content_type, data, metadata
        )
        return Envelope(data=DocumentDetail.model_validate(document))
    finally:
        await file.close()


@router.get("", response_model=Envelope[DocumentPage])
def list_documents(
    page: int = Query(1, ge=1, le=1000000),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=500),
    status: DocumentStatus | None = None,
    status_group: Literal["ready", "draft", "failed"] | None = None,
    document_type: str | None = Query(None, max_length=100),
    sort_by: Literal["created_at", "updated_at", "title"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    session: Session = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> Envelope[DocumentPage]:
    return Envelope(
        data=service.list(
            session,
            page,
            page_size,
            search,
            status,
            status_group,
            document_type,
            sort_by,
            order,
        )
    )


@router.get("/{document_id}", response_model=Envelope[DocumentDetail])
def get_document(
    document_id: UUID,
    session: Session = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> Envelope[DocumentDetail]:
    return Envelope(data=DocumentDetail.model_validate(service.get(session, document_id)))


@router.patch("/{document_id}", response_model=Envelope[DocumentDetail])
def update_document(
    document_id: UUID,
    changes: DocumentUpdate,
    engine: Engine = Depends(get_engine),
    service: DocumentService = Depends(get_document_service),
) -> Envelope[DocumentDetail]:
    document = service.update(engine, document_id, changes)
    return Envelope(data=DocumentDetail.model_validate(document))


@router.delete("/{document_id}", response_model=Envelope[dict[str, bool]])
def delete_document(
    document_id: UUID,
    engine: Engine = Depends(get_engine),
    service: DocumentService = Depends(get_document_service),
) -> Envelope[dict[str, bool]]:
    service.delete(engine, document_id)
    return Envelope(data={"deleted": True})


@router.post("/{document_id}/process", response_model=Envelope[DocumentDetail])
def process_document(
    document_id: UUID,
    settings: Settings = Depends(get_settings),
    engine: Engine = Depends(get_engine),
    storage: LocalStorage = Depends(get_storage),
    client: HuggingFaceClient = Depends(get_hf_client),
) -> Envelope[DocumentDetail]:
    document = ProcessingService(settings, storage, client).process(engine, document_id)
    return Envelope(data=DocumentDetail.model_validate(document))


@router.get("/{document_id}/jobs", response_model=Envelope[list[JobRead]])
def list_jobs(
    document_id: UUID,
    session: Session = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> Envelope[list[JobRead]]:
    service.get(session, document_id)
    jobs = session.scalars(
        select(ProcessingJob)
        .where(ProcessingJob.document_id == document_id)
        .order_by(ProcessingJob.started_at.desc())
        .limit(100)
    ).all()
    return Envelope(data=[JobRead.model_validate(job) for job in jobs])
