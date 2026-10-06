import io
import re
import unicodedata
from dataclasses import dataclass, field

from docx import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph
from pydantic import JsonValue
from pypdf import PdfReader

from app.core.config import Settings
from app.core.errors import AppError
from app.utils.validation import decode_text


@dataclass(frozen=True)
class ExtractedDocument:
    text: str
    metadata: dict[str, JsonValue] = field(default_factory=dict)


class ExtractionService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def extract_document(self, data: bytes, mime_type: str) -> ExtractedDocument:
        metadata: dict[str, JsonValue] = {}
        try:
            if mime_type == "application/pdf":
                reader = PdfReader(io.BytesIO(data))
                if reader.is_encrypted:
                    raise AppError(
                        "ENCRYPTED_PDF", "Password-protected PDFs are not supported", 422
                    )
                if len(reader.pages) > self.settings.max_pdf_pages:
                    raise AppError("EXTRACTION_LIMIT", "PDF exceeds the page limit", 422)
                parts: list[str] = []
                length = 0
                for page in reader.pages:
                    value = page.extract_text() or ""
                    length += len(value)
                    self._check_length(length)
                    parts.append(value)
                text = "\n\n".join(parts)
                info = reader.metadata
                metadata = {
                    "page_count": len(reader.pages),
                    "title": str(info.title or "") if info else "",
                    "author": str(info.author or "") if info else "",
                }
            elif (
                mime_type
                == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ):
                doc = DocxDocument(io.BytesIO(data))
                parts = []
                length = 0
                for block in doc.iter_inner_content():
                    if isinstance(block, Paragraph):
                        value = block.text
                        style = block.style.name if block.style else ""
                        match = re.fullmatch(r"Heading ([1-6])", style or "")
                        if match and value:
                            value = "#" * int(match[1]) + " " + value
                    elif isinstance(block, Table):
                        rows = [
                            [cell.text.replace("|", "\\|").replace("\n", " ") for cell in row.cells]
                            for row in block.rows
                        ]
                        lines = ["| " + " | ".join(row) + " |" for row in rows]
                        if rows:
                            lines.insert(1, "| " + " | ".join("---" for _ in rows[0]) + " |")
                        value = "\n".join(lines)
                    else:
                        continue
                    length += len(value)
                    self._check_length(length)
                    parts.append(value)
                text = "\n\n".join(parts)
                metadata = {
                    "title": doc.core_properties.title or "",
                    "author": doc.core_properties.author or "",
                }
            else:
                text = decode_text(data)
            text = unicodedata.normalize(
                "NFC", text.replace("\r\n", "\n").replace("\r", "\n")
            ).strip()
            self._check_length(len(text))
            if not text:
                raise AppError(
                    "NO_EXTRACTABLE_TEXT",
                    "No text found; scanned PDFs require OCR before upload",
                    422,
                )
            return ExtractedDocument(text=text, metadata=metadata)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(
                "EXTRACTION_FAILED",
                "Document could not be parsed; verify that it is a valid supported file",
                422,
            ) from exc

    def _check_length(self, length: int) -> None:
        if length > self.settings.max_extracted_chars:
            raise AppError("EXTRACTION_LIMIT", "Extracted text exceeds the configured limit", 422)
