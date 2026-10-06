"""Trigram indexes for library search.

GET /documents matches title/author/description/tags with ILIKE '%needle%';
the GIN trigram indexes keep title and author lookups fast as the library grows.
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_search_indexes"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_index(
        "ix_documents_title_trgm",
        "documents",
        [sa.text("title gin_trgm_ops")],
        postgresql_using="gin",
    )
    op.create_index(
        "ix_documents_author_trgm",
        "documents",
        [sa.text("author gin_trgm_ops")],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_documents_author_trgm", "documents")
    op.drop_index("ix_documents_title_trgm", "documents")
    # The extension may be shared; never remove it as part of application downgrade.
