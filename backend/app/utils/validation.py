import io
import unicodedata
import zipfile
from pathlib import PurePosixPath

from app.core.config import Settings
from app.core.errors import AppError

MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/markdown",
    ".txt": "text/plain",
}


def safe_display_filename(filename: str | None) -> str:
    name = (filename or "").replace("\\", "/").split("/")[-1]
    name = "".join(c for c in name if not unicodedata.category(c).startswith("C"))
    if not name or len(name) > 255:
        raise AppError("INVALID_FILENAME", "A filename of 1–255 characters is required")
    return name


def decode_text(data: bytes) -> str:
    try:
        if data.startswith((b"\xff\xfe", b"\xfe\xff")):
            value = data.decode("utf-16")
        else:
            value = data.decode("utf-8-sig")
    except UnicodeError as exc:
        raise AppError("INVALID_ENCODING", "Text must be UTF-8 or BOM-marked UTF-16") from exc
    if any(ord(c) < 32 and c not in "\n\r\t" for c in value):
        raise AppError("INVALID_FILE_CONTENT", "Binary content is not accepted as text")
    return value


def validate_file(filename: str, declared_mime: str | None, data: bytes, settings: Settings) -> str:
    extension = PurePosixPath(filename).suffix.lower()
    if extension not in MIME_TYPES:
        raise AppError("UNSUPPORTED_FILE_TYPE", "Upload PDF, DOCX, Markdown, or TXT", 415)
    if not data:
        raise AppError("EMPTY_FILE", "The uploaded file is empty")
    if len(data) > settings.max_upload_size_mb * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", "Upload exceeds the configured size limit", 413)
    allowed = {MIME_TYPES[extension], "application/octet-stream"}
    if extension == ".md":
        allowed |= {"text/plain", "text/x-markdown"}
    if (declared_mime or "application/octet-stream").split(";")[0].lower() not in allowed:
        raise AppError("MIME_MISMATCH", "Declared MIME type does not match the file extension", 415)
    if extension == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise AppError("INVALID_FILE_CONTENT", "Invalid PDF signature", 415)
    elif extension == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                entries = archive.infolist()
                names = {entry.filename for entry in entries}
                if len(entries) > 10000 or len(names) != len(entries):
                    raise ValueError("Invalid archive entries")
                if not {"[Content_Types].xml", "word/document.xml"}.issubset(names):
                    raise ValueError("Not a DOCX package")
                if (
                    sum(e.file_size for e in entries)
                    > settings.max_docx_uncompressed_mb * 1024 * 1024
                ):
                    raise ValueError("Archive expands beyond the limit")
                for entry in entries:
                    path = PurePosixPath(entry.filename)
                    if path.is_absolute() or ".." in path.parts or entry.flag_bits & 1:
                        raise ValueError("Unsafe archive")
                    if entry.filename.lower().endswith("vbaproject.bin"):
                        raise ValueError("Macros are not accepted")
                # Check package identity, not just the client header or ZIP signature.
                types = archive.read("[Content_Types].xml")
                if (
                    b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
                    not in types
                ):
                    raise ValueError("Invalid document content type")
        except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as exc:
            raise AppError(
                "INVALID_FILE_CONTENT",
                "Invalid, encrypted, macro-enabled, or oversized DOCX package",
                415,
            ) from exc
    else:
        decode_text(data)
    return MIME_TYPES[extension]
