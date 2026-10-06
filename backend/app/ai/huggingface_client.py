import logging
import random
import time
from urllib.parse import quote

import httpx
from pydantic import BaseModel, JsonValue, ValidationError

from app.ai.prompts import STRUCTURE_SYSTEM
from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.okf import AIStructure

logger = logging.getLogger(__name__)


class Message(BaseModel):
    content: str


class Choice(BaseModel):
    message: Message


class Completion(BaseModel):
    choices: list[Choice]


class HuggingFaceClient:
    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        self.settings = settings
        self.client = client or httpx.Client(timeout=settings.hf_timeout_seconds)
        self.owns_client = client is None

    def close(self) -> None:
        if self.owns_client:
            self.client.close()

    def _post(self, url: str, payload: dict[str, object]) -> JsonValue:
        if not self.settings.hf_token.get_secret_value():
            raise AppError(
                "HF_NOT_CONFIGURED", "Set HF_TOKEN to enable Hugging Face inference", 503
            )
        for attempt in range(self.settings.hf_max_retries + 1):
            retry_after = 0.0
            try:
                response = self.client.post(
                    url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.settings.hf_token.get_secret_value()}"
                    },
                )
                if response.status_code == 429 or response.status_code in {408, 500, 502, 503, 504}:
                    try:
                        retry_after = min(float(response.headers.get("retry-after", "0")), 30)
                    except ValueError:
                        pass
                    if attempt == self.settings.hf_max_retries:
                        logger.warning(
                            "hf_gave_up status=%s body=%s",
                            response.status_code,
                            response.text[:300],
                        )
                        raise AppError(
                            "HF_UNAVAILABLE",
                            "Hugging Face is temporarily unavailable; retry processing later",
                            503,
                        )
                elif response.is_error:
                    # Permanent rejections carry provider reasons (unsupported model,
                    # bad request) that never echo credentials; surface them for diagnosis.
                    detail = self._error_detail(response)
                    logger.warning("hf_rejected detail=%s body=%s", detail, response.text[:300])
                    raise AppError(
                        "HF_REQUEST_FAILED",
                        f"Hugging Face rejected the request ({detail});"
                        " check token, model, provider access, and limits",
                        502,
                    )
                else:
                    try:
                        from pydantic import TypeAdapter

                        return TypeAdapter(JsonValue).validate_python(response.json())
                    except (ValueError, ValidationError) as exc:
                        raise AppError(
                            "HF_INVALID_RESPONSE", "Hugging Face returned invalid JSON", 502
                        ) from exc
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt == self.settings.hf_max_retries:
                    raise AppError(
                        "HF_UNAVAILABLE", "Hugging Face could not be reached; retry later", 503
                    ) from exc
            time.sleep(max(retry_after, min(2**attempt + random.random(), 15)))
        raise AppError("HF_UNAVAILABLE", "Hugging Face inference failed", 503)

    @staticmethod
    def _error_detail(response: httpx.Response) -> str:
        try:
            body = response.json()
        except ValueError:
            body = None
        message = ""
        if isinstance(body, dict):
            error = body.get("error")
            if isinstance(error, dict) and isinstance(error.get("message"), str):
                message = error["message"]
            elif isinstance(error, str):
                message = error
        if not message:
            message = httpx.codes.get_reason_phrase(response.status_code)
        return f"HTTP {response.status_code}: {message}"[:300]

    def embeddings(self, texts: list[str]) -> JsonValue:
        url = self.settings.hf_embedding_url.format(
            model=quote(self.settings.hf_embedding_model, safe="/")
        )
        return self._post(url, {"inputs": texts, "normalize": True, "truncate": False})

    def structure(self, text: str) -> AIStructure:
        result = self._post(
            self.settings.hf_chat_url,
            {
                "model": self.settings.hf_llm_model,
                "temperature": 0,
                "max_tokens": 1000,
                "messages": [
                    {"role": "system", "content": STRUCTURE_SYSTEM},
                    {"role": "user", "content": text[: self.settings.hf_llm_max_input_chars]},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "document_metadata",
                        "strict": True,
                        "schema": AIStructure.model_json_schema(),
                    },
                },
            },
        )
        try:
            completion = Completion.model_validate(result)
            if not completion.choices:
                raise ValueError("No completion")
            metadata = AIStructure.model_validate_json(completion.choices[0].message.content)
            if any(not tag.strip() or len(tag) > 100 for tag in metadata.tags):
                raise ValueError("Invalid tags")
            return metadata
        except (ValidationError, ValueError) as exc:
            raise AppError(
                "AI_STRUCTURE_INVALID",
                "AI metadata failed validation; original content is preserved",
                502,
            ) from exc
