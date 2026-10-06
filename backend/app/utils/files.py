import os
import shutil
from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid4

from app.core.errors import AppError


class Storage(Protocol):
    def save_original(self, document_id: UUID, extension: str, data: bytes) -> str: ...
    def read(self, key: str) -> bytes: ...
    def write_artifact(self, document_id: UUID, data: bytes) -> None: ...
    def delete_document(self, document_id: UUID) -> None: ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)

    def resolve(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root) or path == self.root:
            raise AppError("INVALID_STORAGE_PATH", "Invalid storage path")
        return path

    def _write(self, key: str, data: bytes) -> None:
        path = self.resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = path.with_name(f".{uuid4()}.tmp")
        try:
            with temporary.open("xb") as handle:
                os.chmod(temporary, 0o600)
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    def save_original(self, document_id: UUID, extension: str, data: bytes) -> str:
        if extension not in {".pdf", ".docx", ".md", ".txt"}:
            raise AppError("INVALID_STORAGE_PATH", "Unsupported storage extension")
        key = f"originals/{document_id}/source{extension}"
        self._write(key, data)
        return key

    def read(self, key: str) -> bytes:
        try:
            return self.resolve(key).read_bytes()
        except FileNotFoundError as exc:
            raise AppError("SOURCE_MISSING", "Stored source is unavailable", 409) from exc

    def write_artifact(self, document_id: UUID, data: bytes) -> None:
        self._write(f"generated/{document_id}/knowledge.zip", data)

    def delete_document(self, document_id: UUID) -> None:
        for kind in ("originals", "generated"):
            path = self.resolve(f"{kind}/{document_id}")
            if path.exists():
                shutil.rmtree(path)
