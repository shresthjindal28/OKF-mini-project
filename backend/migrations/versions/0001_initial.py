"""Initial PostgreSQL/pgvector schema. Vector dimension is a deployment parameter.

Changing the embedding space after initialization requires an explicit migration
and reindex; startup checks embedding_config before serving traffic.
"""

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql as pg

from app.core.config import get_settings

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    settings = get_settings()
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "documents",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("author", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(150), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("source_path", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("document_type", sa.String(100), nullable=False),
        sa.Column("tags", pg.JSONB(), nullable=False),
        sa.Column("extracted_text", sa.Text()),
        sa.Column("extracted_metadata", pg.JSONB(), nullable=False),
        sa.Column("okf_content", pg.JSONB()),
        sa.Column("okf_metadata", pg.JSONB()),
        sa.Column("error_code", sa.String(100)),
        sa.Column("error_message", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('UPLOADED','PROCESSING','EXTRACTED','STRUCTURING','READY','FAILED')",
            name="ck_document_status",
        ),
        sa.CheckConstraint("file_size > 0", name="ck_file_size"),
    )
    for field in ("status", "document_type", "created_at"):
        op.create_index(f"ix_documents_{field}", "documents", [field])
    op.create_table(
        "document_chunks",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata", pg.JSONB(), nullable=False),
        sa.Column("embedding", Vector(settings.hf_embedding_dimension), nullable=False),
        sa.Column("embedding_model", sa.String(500), nullable=False),
        sa.UniqueConstraint("document_id", "chunk_index", name="uq_document_chunk"),
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    op.create_index(
        "ix_chunks_embedding_hnsw",
        "document_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"m": 16, "ef_construction": 64},
    )
    op.create_table(
        "processing_jobs",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("stage", sa.String(30), nullable=False),
        sa.Column("error_code", sa.String(100)),
        sa.Column("error_message", sa.Text()),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('RUNNING','SUCCEEDED','FAILED')", name="ck_job_status"),
    )
    op.create_index("ix_processing_jobs_document_id", "processing_jobs", ["document_id"])
    op.create_index(
        "uq_running_document_job",
        "processing_jobs",
        ["document_id"],
        unique=True,
        postgresql_where=sa.text("status = 'RUNNING'"),
    )
    config = op.create_table(
        "embedding_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("model", sa.String(500), nullable=False),
        sa.Column("dimension", sa.Integer(), nullable=False),
        sa.Column("query_prefix", sa.Text(), nullable=False),
        sa.Column("document_prefix", sa.Text(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_single_embedding_config"),
    )
    op.bulk_insert(
        config,
        [
            {
                "id": 1,
                "model": settings.hf_embedding_model,
                "dimension": settings.hf_embedding_dimension,
                "query_prefix": settings.hf_query_prefix,
                "document_prefix": settings.hf_document_prefix,
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("embedding_config")
    op.drop_table("processing_jobs")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    # The extension may be shared; never remove it as part of application downgrade.
