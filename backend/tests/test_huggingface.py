import json
from collections.abc import Callable

import httpx
import pytest

from app.ai.huggingface_client import HuggingFaceClient
from app.core.config import Settings
from app.core.errors import AppError
from app.services.embedding_service import EmbeddingService


def client_for(
    settings: Settings, handler: Callable[[httpx.Request], httpx.Response]
) -> HuggingFaceClient:
    return HuggingFaceClient(settings, httpx.Client(transport=httpx.MockTransport(handler)))


def test_embedding_batch_and_query_prefix(settings: Settings) -> None:
    settings.hf_embedding_dimension = 3
    settings.hf_batch_size = 2
    settings.hf_query_prefix = "query: "
    requests: list[list[str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        batch = json.loads(request.content)["inputs"]
        requests.append(batch)
        return httpx.Response(200, json=[[3, 4, 0] for _ in batch])

    service = EmbeddingService(settings, client_for(settings, handler))
    assert service.embed_batch(["one", "two", "three"]) == [[0.6, 0.8, 0.0]] * 3
    assert len(requests) == 2
    service.embed("question", query=True)
    assert requests[-1] == ["query: question"]


@pytest.mark.parametrize("payload", [[[1, 2]], [[0, 0, 0]], [[True, 2, 3]], [[[1], [2], [3]]], []])
def test_invalid_embeddings(settings: Settings, payload: object) -> None:
    settings.hf_embedding_dimension = 3
    service = EmbeddingService(
        settings, client_for(settings, lambda r: httpx.Response(200, json=payload))
    )
    with pytest.raises(AppError):
        service.embed("hello")


def test_retry_and_sanitized_failure(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    settings.hf_max_retries = 2
    monkeypatch.setattr("app.ai.huggingface_client.time.sleep", lambda _: None)
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(503, text="secret provider details")

    with pytest.raises(AppError) as raised:
        client_for(settings, handler).embeddings(["text"])
    assert attempts == 3
    assert "secret" not in raised.value.message


def test_structure_validation(settings: Settings) -> None:
    good = {
        "choices": [
            {"message": {"content": '{"title":"Title","description":"Summary","tags":["tag"]}'}}
        ]
    }
    assert (
        client_for(settings, lambda r: httpx.Response(200, json=good)).structure("source").title
        == "Title"
    )
    bad = {"choices": [{"message": {"content": '{"title":"","invented":true}'}}]}
    with pytest.raises(AppError, match="failed validation"):
        client_for(settings, lambda r: httpx.Response(200, json=bad)).structure("source")


def test_missing_token(settings: Settings) -> None:
    settings.hf_token = type(settings.hf_token)("")

    def forbidden(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Must not call HF without a token")

    with pytest.raises(AppError) as error:
        client_for(settings, forbidden).embeddings(["text"])
    assert error.value.code == "HF_NOT_CONFIGURED"
