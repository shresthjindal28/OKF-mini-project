import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import JsonValue
from sqlalchemy import BigInteger, CheckConstraint, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DocumentStatus(StrEnum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    EXTRACTED = "EXTRACTED"
    STRUCTURING = "STRUCTURING"
    READY = "READY"
    FAILED = "FAILED"


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "status IN ('UPLOADED','PROCESSING','EXTRACTED','STRUCTURING','READY','FAILED')",
            name="ck_document_status",
        ),
        CheckConstraint("file_size > 0", name="ck_file_size"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(500), default="")
    original_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(150))
    file_size: Mapped[int] = mapped_column(BigInteger)
    source_path: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=DocumentStatus.UPLOADED, index=True)
    document_type: Mapped[str] = mapped_column(String(100), default="Reference", index=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    extracted_text: Mapped[str | None] = mapped_column(Text)
    extracted_metadata: Mapped[dict[str, JsonValue]] = mapped_column(JSONB, default=dict)
    okf_content: Mapped[dict[str, str] | None] = mapped_column(JSONB)
    okf_metadata: Mapped[dict[str, JsonValue] | None] = mapped_column(JSONB)
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
