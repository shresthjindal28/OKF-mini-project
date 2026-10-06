from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_document_service
from app.core.database import get_session
from app.schemas.common import Envelope
from app.schemas.okf import OKFRepresentation
from app.services.document_service import DocumentService

router = APIRouter(prefix="/documents", tags=["okf"])


@router.get("/{document_id}/okf", response_model=Envelope[OKFRepresentation])
def get_okf(
    document_id: UUID,
    session: Session = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> Envelope[OKFRepresentation]:
    return Envelope(data=service.representation(session, document_id))


@router.get(
    "/{document_id}/download",
    response_class=Response,
    responses={200: {"content": {"application/zip": {}}}},
)
def download_okf(
    document_id: UUID,
    session: Session = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> Response:
    return Response(
        service.download(session, document_id),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{document_id}.okf.zip"',
            "X-Content-Type-Options": "nosniff",
        },
    )
