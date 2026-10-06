import pytest
from pydantic import ValidationError

from app.schemas.document import DocumentUpdate, LibraryStats
from app.services.document_service import DocumentService


def test_document_update_validation() -> None:
    with pytest.raises(ValidationError):
        DocumentUpdate(title="   ")  # stripped to empty; title must not be blank
    with pytest.raises(ValidationError):
        DocumentUpdate(document_type=" ")
    with pytest.raises(ValidationError):
        DocumentUpdate(tags=["x" * 101])
    with pytest.raises(ValidationError):
        DocumentUpdate(title="x" * 501)
    # All fields optional; partial updates are the point of PATCH.
    assert DocumentUpdate().model_dump(exclude_unset=True) == {}
    changes = DocumentUpdate(title="New title", tags=["a", "b"])
    assert changes.model_dump(exclude_unset=True) == {"title": "New title", "tags": ["a", "b"]}


def test_library_stats_shape() -> None:
    stats = LibraryStats(
        total=3, ready=1, in_progress=1, failed=1, total_bytes=2048, indexed_chunks=42
    )
    assert stats.model_dump() == {
        "total": 3,
        "ready": 1,
        "in_progress": 1,
        "failed": 1,
        "total_bytes": 2048,
        "indexed_chunks": 42,
    }


@pytest.mark.parametrize(
    ("raw", "escaped"),
    [
        ("plain", "plain"),
        ("50%_off\\path", "50\\%\\_off\\\\path"),
        ("", ""),
    ],
)
def test_escape_like(raw: str, escaped: str) -> None:
    assert DocumentService._escape_like(raw) == escaped
