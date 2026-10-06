from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)
    database_url: SecretStr
    hf_token: SecretStr = SecretStr("")
    hf_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    hf_embedding_dimension: int = Field(default=384, ge=1, le=2000)
    hf_llm_model: str = ""
    hf_embedding_url: str = (
        "https://router.huggingface.co/hf-inference/models/{model}/pipeline/feature-extraction"
    )
    hf_chat_url: str = "https://router.huggingface.co/v1/chat/completions"
    hf_timeout_seconds: float = Field(default=60, gt=0, le=300)
    hf_max_retries: int = Field(default=3, ge=0, le=6)
    hf_batch_size: int = Field(default=16, ge=1, le=128)
    hf_query_prefix: str = ""
    hf_document_prefix: str = ""
    hf_llm_max_input_chars: int = Field(default=16000, ge=100, le=100000)
    storage_path: Path = Path("storage")
    max_upload_size_mb: int = Field(default=25, ge=1, le=100)
    max_extracted_chars: int = Field(default=2000000, ge=1, le=10000000)
    max_pdf_pages: int = Field(default=1000, ge=1, le=10000)
    max_docx_uncompressed_mb: int = Field(default=100, ge=1, le=500)
    chunk_size: int = Field(default=180, ge=10, le=2000)
    chunk_overlap: int = Field(default=30, ge=0)
    cors_origins: list[str] = Field(default_factory=list)
    max_concurrent_processing: int = Field(default=3, ge=1, le=4)
    db_pool_size: int = Field(default=5, ge=1, le=100)
    db_max_overflow: int = Field(default=5, ge=0, le=100)
    log_level: str = "INFO"
    test_database_url: SecretStr = SecretStr("")

    @field_validator("database_url")
    @classmethod
    def postgres_url(cls, value: SecretStr) -> SecretStr:
        raw = value.get_secret_value()
        if raw.startswith("postgres://"):
            raw = raw.replace("postgres://", "postgresql+psycopg://", 1)
        elif raw.startswith("postgresql://"):
            raw = raw.replace("postgresql://", "postgresql+psycopg://", 1)
        if not raw.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must be a PostgreSQL psycopg URL")
        return SecretStr(raw)

    @model_validator(mode="after")
    def validate_limits(self) -> Self:
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("CHUNK_OVERLAP must be smaller than CHUNK_SIZE")
        if not self.hf_embedding_model.strip():
            raise ValueError("HF_EMBEDDING_MODEL cannot be empty")
        if self.log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("Invalid LOG_LEVEL")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
