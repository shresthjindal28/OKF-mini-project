from sqlalchemy import CheckConstraint, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EmbeddingConfig(Base):
    """Database-owned identity of the corpus embedding space, seeded by migration."""

    __tablename__ = "embedding_config"
    __table_args__ = (CheckConstraint("id = 1", name="ck_single_embedding_config"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model: Mapped[str] = mapped_column(String(500))
    dimension: Mapped[int] = mapped_column(Integer)
    query_prefix: Mapped[str] = mapped_column(Text)
    document_prefix: Mapped[str] = mapped_column(Text)
