import io
import zipfile

import pytest

from app.core.errors import AppError
from app.services.chunking_service import ChunkingService
from app.services.okf_service import OKFService


def test_okf_generation_and_package() -> None:
    service = OKFService()
    result = service.generate(
        title="Source",
        description="Knowledge",
        document_type="Reference",
        tags=["test"],
        text="# Heading\n\nPreserve all source content.",
        source_name="source.md",
        source_extension=".md",
        author="Author",
    )
    metadata, body = service.load(result.files["document.md"])
    assert metadata["type"] == "Reference"
    assert metadata["status"] == "draft"
    assert "verified" not in metadata
    assert body == "# Heading\n\nPreserve all source content.\n"
    archive = zipfile.ZipFile(io.BytesIO(service.package(result.files, b"raw markdown", ".md")))
    assert set(archive.namelist()) == {"index.md", "document.md", "assets/source.md.txt"}
    assert archive.read("assets/source.md.txt") == b"raw markdown"
    service.validate(
        {name: archive.read(name).decode() for name in archive.namelist() if name.endswith(".md")}
    )


def test_permissive_official_conformance() -> None:
    service = OKFService()
    metadata, _ = service.load(
        '---\ntype: Unknown type\nx_custom: value\nverified: {by: "human:reader", at: "2026-01-01T00:00:00Z"}\n---\n[Broken](missing.md)'
    )
    assert metadata["x_custom"] == "value"
    assert isinstance(metadata["verified"], list)
    service.validate({"concept.md": "---\ntype: New type\n---\n"})
    assert service.load(service.serialize(metadata, "body"))[0] == metadata


@pytest.mark.parametrize(
    "content",
    [
        "plain",
        "---\ntitle: Missing type\n---\n",
        "---\ntype: ''\n---\n",
        "---\ntype: [x]\n---\n",
        "---\n- value\n---\n",
    ],
)
def test_invalid_okf(content: str) -> None:
    with pytest.raises(AppError):
        OKFService().load(content)


def test_reserved_and_unsafe_paths() -> None:
    service = OKFService()
    for files in (
        {"../escape.md": ""},
        {"nested/index.md": "---\nokf_version: '0.2'\n---\n"},
        {"index.md": "plain text"},
        {"log.md": "## yesterday\n* item"},
    ):
        with pytest.raises(AppError):
            service.validate(files)


def test_chunk_boundaries_and_determinism() -> None:
    service = ChunkingService(20, 4)
    text = "# First\n\n" + "Alpha beta gamma delta. " * 20 + "\n\n# Second\n\nA final section."
    chunks = service.chunk(text)
    assert chunks == service.chunk(text)
    assert all(chunk.word_count <= 20 for chunk in chunks)
    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    assert chunks[-1].heading == "Second"
    assert "Alpha" not in chunks[-1].content
    assert all(word in " ".join(c.content for c in chunks) for word in text.split())
    assert service.chunk("") == []


def test_chunk_preserves_small_code_block() -> None:
    content = "# Section\n\n```python\n# code comment\nx = 1\n```"
    chunks = ChunkingService(30, 0).chunk(content)
    assert len(chunks) == 1
    assert "```python\n# code comment" in chunks[0].content
