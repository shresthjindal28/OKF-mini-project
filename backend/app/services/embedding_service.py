import math

from app.ai.huggingface_client import HuggingFaceClient
from app.core.config import Settings
from app.core.errors import AppError


class EmbeddingService:
    def __init__(self, settings: Settings, client: HuggingFaceClient) -> None:
        self.settings = settings
        self.client = client

    def embed(self, text: str, *, query: bool = False) -> list[float]:
        return self.embed_batch([text], query=query)[0]

    def embed_batch(self, texts: list[str], *, query: bool = False) -> list[list[float]]:
        result: list[list[float]] = []
        prefix = self.settings.hf_query_prefix if query else self.settings.hf_document_prefix
        for start in range(0, len(texts), self.settings.hf_batch_size):
            batch = texts[start : start + self.settings.hf_batch_size]
            if any(not text.strip() for text in batch):
                raise AppError("EMPTY_EMBEDDING_INPUT", "Cannot embed empty text", 422)
            raw = self.client.embeddings([prefix + text for text in batch])
            if not isinstance(raw, list) or len(raw) != len(batch):
                raise AppError(
                    "INVALID_EMBEDDING", "Embedding response has an unexpected batch shape", 502
                )
            for vector in raw:
                if (
                    not isinstance(vector, list)
                    or len(vector) != self.settings.hf_embedding_dimension
                ):
                    raise AppError(
                        "EMBEDDING_DIMENSION_MISMATCH",
                        "Embedding dimensions do not match configured model dimensions",
                        502,
                    )
                values: list[float] = []
                for number in vector:
                    if (
                        isinstance(number, bool)
                        or not isinstance(number, (int, float))
                        or not math.isfinite(number)
                    ):
                        raise AppError(
                            "INVALID_EMBEDDING", "Embedding contains invalid values", 502
                        )
                    values.append(float(number))
                norm = math.sqrt(sum(v * v for v in values))
                if not math.isfinite(norm) or norm <= 0:
                    raise AppError("INVALID_EMBEDDING", "Embedding has invalid magnitude", 502)
                result.append([v / norm for v in values])
        return result
