from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.dependencies import get_document_service
from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.services.document_service import DocumentService
from app.utils.files import LocalStorage


def test_request_body_limits_before_database(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A deliberately unreachable DB proves oversized bodies never reach persistence.
    settings.max_upload_size_mb = 1
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_document_service] = lambda: DocumentService(
        settings, LocalStorage(settings.storage_path)
    )

    def session() -> Iterator[Session]:
        engine = create_engine("postgresql+psycopg://test:test@localhost:1/never_connect")
        with Session(engine) as value:
            yield value
        engine.dispose()

    app.dependency_overrides[get_session] = session
    client = TestClient(app)
    response = client.post(
        "/api/v1/documents", files={"file": ("large.txt", b"x" * (1024 * 1024 + 1), "text/plain")}
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"
    oversized = client.post(
        "/api/v1/documents", files={"file": ("huge.txt", b"x" * (2 * 1024 * 1024), "text/plain")}
    )
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "FILE_TOO_LARGE"
    client.close()


def test_configuration_validation(settings: Settings) -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings(database_url="sqlite:///local.db")
    with pytest.raises(ValidationError):
        Settings(database_url=settings.database_url, chunk_size=10, chunk_overlap=10)
    normalized = Settings(database_url="postgres://user:password@host/database")
    assert normalized.database_url.get_secret_value().startswith("postgresql+psycopg://")
    assert "password" not in repr(normalized.database_url)
    assert isinstance(normalized.database_url, SecretStr)
