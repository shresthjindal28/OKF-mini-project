from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.huggingface_client import HuggingFaceClient
from app.api.dependencies import get_hf_client
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.schemas.common import Envelope
from app.schemas.search import SearchHit, SearchRequest
from app.services.embedding_service import EmbeddingService
from app.services.search_service import SearchService

router = APIRouter(tags=["search"])


@router.post("/search", response_model=Envelope[list[SearchHit]])
def search(
    request: SearchRequest,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
    client: HuggingFaceClient = Depends(get_hf_client),
) -> Envelope[list[SearchHit]]:
    service = SearchService(settings, EmbeddingService(settings, client))
    return Envelope(data=service.search(session, request))
