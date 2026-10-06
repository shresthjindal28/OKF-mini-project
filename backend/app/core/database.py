from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        hide_parameters=True,
        connect_args={"connect_timeout": 10},
    )


def get_session() -> Iterator[Session]:
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session


def verify_database(session: Session, settings: Settings) -> None:
    version = session.scalar(text("SELECT extversion FROM pg_extension WHERE extname='vector'"))
    if not version:
        raise AppError("DATABASE_NOT_READY", "pgvector is not installed; run migrations", 503)
    row = session.execute(
        text(
            "SELECT model, dimension, query_prefix, document_prefix FROM embedding_config WHERE id=1"
        )
    ).one()
    expected = (
        settings.hf_embedding_model,
        settings.hf_embedding_dimension,
        settings.hf_query_prefix,
        settings.hf_document_prefix,
    )
    if tuple(row) != expected:
        raise AppError(
            "EMBEDDING_CONFIG_MISMATCH",
            "Embedding settings differ from the database; migrate and reindex before changing models",
            503,
        )

    column_type = session.scalar(
        text(
            "SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
            "WHERE attrelid='document_chunks'::regclass AND attname='embedding' AND NOT attisdropped"
        )
    )
    if column_type != f"vector({settings.hf_embedding_dimension})":
        raise AppError(
            "EMBEDDING_CONFIG_MISMATCH",
            "Vector column dimension differs from configuration; run the correct migration",
            503,
        )
