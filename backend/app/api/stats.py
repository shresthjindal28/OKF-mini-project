from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_document_service
from app.core.database import get_session
from app.schemas.common import Envelope
from app.schemas.document import LibraryStats
from app.services.document_service import DocumentService

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=Envelope[LibraryStats])
def library_stats(
    session: Session = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> Envelope[LibraryStats]:
    return Envelope(data=service.stats(session))
