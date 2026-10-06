import io
import json
import zipfile
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.ai.huggingface_client import HuggingFaceClient
from app.api.dependencies import get_hf_client, get_storage
from app.core.config import Settings, get_settings
from app.core.database import get_engine, get_session, verify_database
from app.core.errors import AppError
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.processing_job import ProcessingJob
from app.services.document_service import document_lock
from app.utils.files import LocalStorage

pytestmark = pytest.mark.integration


@pytest.fixture
def api(tmp_path: Path) -> Iterator[TestClient]:
    base = get_settings()
    if not base.test_database_url.get_secret_value():
        pytest.skip("Set TEST_DATABASE_URL to a migrated PostgreSQL database")
    settings = Settings(
        database_url=base.test_database_url,
        storage_path=tmp_path,
        hf_embedding_model=base.hf_embedding_model,
        hf_embedding_dimension=base.hf_embedding_dimension,
        hf_query_prefix=base.hf_query_prefix,
        hf_document_prefix=base.hf_document_prefix,
        hf_token="mock-token",
        hf_max_retries=0,
        hf_llm_model="",
    )
    engine = create_engine(settings.database_url.get_secret_value(), hide_parameters=True)
    storage = LocalStorage(tmp_path)

    def session_dependency() -> Iterator[Session]:
        with Session(engine, expire_on_commit=False) as session:
            yield session

    def handler(request: httpx.Request) -> httpx.Response:
        inputs = json.loads(request.content)["inputs"]
        vectors = []
        for value in inputs:
            vector = [0.0] * settings.hf_embedding_dimension
            vector[0 if "knowledge" in value.lower() else 1] = 1.0
            vectors.append(vector)
        return httpx.Response(200, json=vectors)

    mock_http = httpx.Client(transport=httpx.MockTransport(handler))
    hf = HuggingFaceClient(settings, mock_http)
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_engine] = lambda: engine
    app.dependency_overrides[get_session] = session_dependency
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_hf_client] = lambda: hf
    client = TestClient(app)
    # No truncation: cleanup only documents created in this test's unique storage folder.
    yield client
    ids = [UUID(path.name) for path in (tmp_path / "originals").glob("*")]
    with Session(engine) as session:
        for document_id in ids:
            document = session.get(Document, document_id)
            if document:
                session.delete(document)
        session.commit()
    client.close()
    mock_http.close()
    engine.dispose()


def upload(api: TestClient, name: str, content: bytes, mime: str) -> str:
    response = api.post(
        "/api/v1/documents",
        files={"file": (name, content, mime)},
        data={"title": "integration-" + str(uuid4())},
    )
    assert response.status_code == 201, response.text
    assert response.json()["data"]["status"] == "UPLOADED"
    return str(response.json()["data"]["id"])


def test_complete_pipeline(api: TestClient, pdf_bytes: bytes, docx_bytes: bytes) -> None:
    from app.utils.validation import MIME_TYPES

    for name, content in (
        ("source.md", b"# Knowledge\n\nPortable knowledge content."),
        ("source.txt", b"Knowledge portability."),
        ("source.pdf", pdf_bytes),
        ("source.docx", docx_bytes),
    ):
        document_id = upload(api, name, content, MIME_TYPES[Path(name).suffix])
        base = "/api/v1/documents/" + document_id
        processed = api.post(base + "/process")
        assert processed.status_code == 200, processed.text
        assert processed.json()["data"]["status"] == "READY"
        assert processed.json()["data"]["extracted_text"]
        representation = api.get(base + "/okf")
        assert representation.status_code == 200
        assert "type: Reference" in representation.json()["data"]["files"]["document.md"]
        download = api.get(base + "/download")
        assert download.headers["content-type"] == "application/zip"
        archive = zipfile.ZipFile(io.BytesIO(download.content))
        assert "index.md" in archive.namelist()
        search = api.post(
            "/api/v1/search", json={"query": "knowledge", "limit": 10, "document_id": document_id}
        )
        assert search.status_code == 200, search.text
        assert search.json()["data"][0]["document_id"] == document_id
        assert search.json()["data"][0]["similarity"] > 0.99
        # Retry atomically replaces chunks and records a second successful job.
        assert api.post(base + "/process").status_code == 200
        jobs = api.get(base + "/jobs").json()["data"]
        assert len(jobs) == 2 and all(j["status"] == "SUCCEEDED" for j in jobs)
        assert api.delete(base).status_code == 200
        assert api.get(base).status_code == 404
        assert (
            api.post(
                "/api/v1/search", json={"query": "knowledge", "document_id": document_id}
            ).json()["data"]
            == []
        )


def test_failure_preserves_okf_and_source(api: TestClient) -> None:
    document_id = upload(api, "retained.md", b"# Knowledge\n\nPreserved text", "text/markdown")
    from app.api.dependencies import get_hf_client
    from app.main import FastAPI

    assert isinstance(api.app, FastAPI)
    original = api.app.dependency_overrides[get_hf_client]
    settings = get_settings().model_copy(update={"hf_token": type(get_settings().hf_token)("")})
    api.app.dependency_overrides[get_hf_client] = lambda: HuggingFaceClient(settings)
    response = api.post(f"/api/v1/documents/{document_id}/process")
    assert response.status_code == 503
    document = api.get(f"/api/v1/documents/{document_id}").json()["data"]
    assert document["status"] == "FAILED"
    assert document["extracted_text"]
    assert api.get(f"/api/v1/documents/{document_id}/download").status_code == 200
    api.app.dependency_overrides[get_hf_client] = original
    assert api.post(f"/api/v1/documents/{document_id}/process").status_code == 200


def test_listing_errors_and_database(api: TestClient) -> None:
    document_id = upload(api, "list.txt", b"text", "text/plain")
    result = api.get(
        "/api/v1/documents",
        params={
            "status": "UPLOADED",
            "document_type": "Reference",
            "page_size": 1,
            "sort_by": "title",
            "order": "asc",
        },
    )
    assert result.status_code == 200
    assert result.json()["data"]["total"] >= 1
    assert api.get("/api/v1/documents", params={"status": "bogus"}).status_code == 422
    assert api.get(f"/api/v1/documents/{document_id}/okf").status_code == 409
    assert api.get("/api/v1/documents/invalid").json()["error"]["code"] == "VALIDATION_ERROR"
    assert (
        api.post(
            "/api/v1/documents", files={"file": ("bad.pdf", b"not a pdf", "application/pdf")}
        ).status_code
        == 415
    )
    settings = get_settings()
    engine = create_engine(
        Settings(database_url=settings.test_database_url).database_url.get_secret_value()
    )
    with Session(engine) as session:
        verify_database(session, settings)
        assert session.scalar(text("SELECT extversion FROM pg_extension WHERE extname='vector'"))
    with document_lock(engine, UUID(document_id)):
        assert api.post(f"/api/v1/documents/{document_id}/process").status_code == 409
        assert api.delete(f"/api/v1/documents/{document_id}").status_code == 409
    assert api.delete(f"/api/v1/documents/{document_id}").status_code == 200
    with Session(engine) as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(DocumentChunk)
                .where(DocumentChunk.document_id == UUID(document_id))
            )
            == 0
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(ProcessingJob)
                .where(ProcessingJob.document_id == UUID(document_id))
            )
            == 0
        )
    engine.dispose()


def test_semantic_ranking_and_configuration_guard(api: TestClient) -> None:
    ids = [
        upload(api, "relevant.txt", b"Knowledge portability and open formats", "text/plain"),
        upload(api, "different.txt", b"A recipe for soup and bread", "text/plain"),
    ]
    for document_id in ids:
        response = api.post(f"/api/v1/documents/{document_id}/process")
        assert response.status_code == 200, response.text
    result = api.post("/api/v1/search", json={"query": "knowledge", "limit": 100})
    own_hits = [hit for hit in result.json()["data"] if hit["document_id"] in ids]
    assert [hit["document_id"] for hit in own_hits] == ids
    assert own_hits[0]["similarity"] > own_hits[1]["similarity"]
    base = get_settings()
    engine = create_engine(
        Settings(database_url=base.test_database_url).database_url.get_secret_value()
    )
    changed = base.model_copy(update={"hf_embedding_model": "different/model"})
    with Session(engine) as session, pytest.raises(AppError) as raised:
        verify_database(session, changed)
    assert raised.value.code == "EMBEDDING_CONFIG_MISMATCH"
    engine.dispose()


def test_metadata_update_and_stats(api: TestClient) -> None:
    document_id = upload(api, "update-me.md", b"# Knowledge\n\nUpdateable content", "text/markdown")
    api.post(f"/api/v1/documents/{document_id}/process")
    before = api.get(f"/api/v1/documents/{document_id}").json()["data"]

    # Partial metadata update regenerates the OKF artifact with new metadata.
    patched = api.patch(
        f"/api/v1/documents/{document_id}",
        json={"title": "Renamed document", "tags": ["renamed", "metadata"]},
    )
    assert patched.status_code == 200, patched.text
    updated = patched.json()["data"]
    assert updated["title"] == "Renamed document"
    assert updated["tags"] == ["renamed", "metadata"]
    assert updated["description"] == before["description"]
    okf = api.get(f"/api/v1/documents/{document_id}/okf").json()["data"]
    assert "title: Renamed document" in okf["files"]["document.md"]
    download = api.get(f"/api/v1/documents/{document_id}/download")
    assert download.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(download.content))
    assert "title: Renamed document" in archive.read("document.md").decode("utf-8")

    # Search finds documents by author and tag, not only title.
    api.patch(f"/api/v1/documents/{document_id}", json={"author": "Test Author"})
    by_tag = api.get("/api/v1/documents", params={"search": "renamed", "page_size": 100})
    assert document_id in [item["id"] for item in by_tag.json()["data"]["items"]]
    by_author = api.get("/api/v1/documents", params={"search": "Test Author", "page_size": 100})
    assert document_id in [item["id"] for item in by_author.json()["data"]["items"]]
    by_status = api.get("/api/v1/documents", params={"status_group": "ready", "page_size": 100})
    assert document_id in [item["id"] for item in by_status.json()["data"]["items"]]

    # Empty PATCH bodies and blank titles are rejected.
    assert api.patch(f"/api/v1/documents/{document_id}", json={}).status_code == 422
    assert api.patch(f"/api/v1/documents/{document_id}", json={"title": "  "}).status_code == 422
    assert api.patch("/api/v1/documents/00000000-0000-0000-0000-000000000000", json={"title": "x"}).status_code == 404

    # Stats aggregate reflects this document.
    stats = api.get("/api/v1/stats").json()["data"]
    assert stats["total"] >= 1
    assert stats["ready"] >= 1
    assert stats["indexed_chunks"] >= 1
    assert stats["total_bytes"] > 0

    # Updates are serialized against the advisory lock like other mutations.
    base = get_settings()
    engine = create_engine(
        Settings(database_url=base.test_database_url).database_url.get_secret_value()
    )
    with document_lock(engine, UUID(document_id)):
        assert (
            api.patch(f"/api/v1/documents/{document_id}", json={"title": "x"}).status_code == 409
        )
    assert api.delete(f"/api/v1/documents/{document_id}").status_code == 200
    engine.dispose()
