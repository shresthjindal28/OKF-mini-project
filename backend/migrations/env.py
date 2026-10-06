from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.core.database import Base
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.embedding_config import EmbeddingConfig
from app.models.processing_job import ProcessingJob

__all__ = ["Document", "DocumentChunk", "ProcessingJob", "EmbeddingConfig"]
config = context.config
url = get_settings().database_url.get_secret_value()
if context.is_offline_mode():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url, poolclass=pool.NullPool, hide_parameters=True)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
