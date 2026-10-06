from collections.abc import Iterator

from fastapi import Depends

from app.ai.huggingface_client import HuggingFaceClient
from app.core.config import Settings, get_settings
from app.services.document_service import DocumentService
from app.utils.files import LocalStorage


def get_storage(settings: Settings = Depends(get_settings)) -> LocalStorage:
    return LocalStorage(settings.storage_path)


def get_document_service(
    settings: Settings = Depends(get_settings), storage: LocalStorage = Depends(get_storage)
) -> DocumentService:
    return DocumentService(settings, storage)


def get_hf_client(settings: Settings = Depends(get_settings)) -> Iterator[HuggingFaceClient]:
    client = HuggingFaceClient(settings)
    try:
        yield client
    finally:
        client.close()
