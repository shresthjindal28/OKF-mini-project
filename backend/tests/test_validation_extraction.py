import io
import zipfile
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.document import DocumentCreate
from app.schemas.search import SearchRequest
from app.services.extraction_service import ExtractionService
from app.utils.files import LocalStorage
from app.utils.validation import MIME_TYPES, decode_text, safe_display_filename, validate_file


def test_metadata_validation() -> None:
    with pytest.raises(ValidationError):
        DocumentCreate(document_type=" ")
    with pytest.raises(ValidationError):
        DocumentCreate(tags=["x" * 101])
    with pytest.raises(ValidationError):
        SearchRequest(query="   ")
    with pytest.raises(ValidationError):
        SearchRequest(query="word", limit=101)


@pytest.mark.parametrize(
    ("name", "mime", "data", "code"),
    [
        ("bad.exe", "application/octet-stream", b"MZ", "UNSUPPORTED_FILE_TYPE"),
        ("bad.pdf", "application/pdf", b"not pdf", "INVALID_FILE_CONTENT"),
        ("bad.txt", "application/pdf", b"text", "MIME_MISMATCH"),
        ("bad.txt", "text/plain", b"a\x00b", "INVALID_FILE_CONTENT"),
        ("bad.txt", "text/plain", b"\xff\xab", "INVALID_ENCODING"),
        ("bad.txt", "text/plain", b"", "EMPTY_FILE"),
        ("bad.docx", MIME_TYPES[".docx"], b"PKbad", "INVALID_FILE_CONTENT"),
    ],
)
def test_invalid_file(settings: Settings, name: str, mime: str, data: bytes, code: str) -> None:
    with pytest.raises(AppError) as raised:
        validate_file(name, mime, data, settings)
    assert raised.value.code == code


def test_file_limit(settings: Settings) -> None:
    settings.max_upload_size_mb = 1
    with pytest.raises(AppError, match="size limit"):
        validate_file("a.txt", "text/plain", b"a" * (1024 * 1024 + 1), settings)


def test_safe_filenames(settings: Settings) -> None:
    assert safe_display_filename("../../hello.txt") == "hello.txt"
    assert safe_display_filename("C:\\fakepath\\hello.txt") == "hello.txt"
    storage = LocalStorage(settings.storage_path)
    with pytest.raises(AppError):
        storage.read("../secret")
    document_id = uuid4()
    key = storage.save_original(document_id, ".txt", b"hello")
    assert storage.read(key) == b"hello"
    storage.write_artifact(document_id, b"zip")
    storage.delete_document(document_id)
    assert not storage.resolve(key).exists()


def test_archive_bomb(settings: Settings) -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "x")
        archive.writestr("word/document.xml", "x" * (1024 * 1024 + 1))
    settings.max_docx_uncompressed_mb = 1
    with pytest.raises(AppError):
        validate_file("a.docx", MIME_TYPES[".docx"], buffer.getvalue(), settings)


def test_pdf_extraction(settings: Settings, pdf_bytes: bytes) -> None:
    validate_file("a.pdf", "application/pdf", pdf_bytes, settings)
    result = ExtractionService(settings).extract_document(pdf_bytes, "application/pdf")
    assert "Knowledge portability" in result.text
    assert result.metadata["page_count"] == 1
    assert result.metadata["author"] == "Test Author"


def test_docx_extraction(settings: Settings, docx_bytes: bytes) -> None:
    validate_file("a.docx", MIME_TYPES[".docx"], docx_bytes, settings)
    result = ExtractionService(settings).extract_document(docx_bytes, MIME_TYPES[".docx"])
    assert "# Knowledge portability" in result.text
    assert "| Format | OKF |" in result.text
    assert result.metadata["author"] == "Test Author"


@pytest.mark.parametrize("mime", ["text/markdown", "text/plain"])
def test_text_extraction(settings: Settings, mime: str) -> None:
    text = "# Café\r\n\r\nText with an accent."
    assert ExtractionService(settings).extract_document(text.encode(), mime).text == text.replace(
        "\r\n", "\n"
    )
    assert decode_text("Café".encode("utf-16")) == "Café"
    with pytest.raises(AppError):
        ExtractionService(settings).extract_document(b"   ", mime)
