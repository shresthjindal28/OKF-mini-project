from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class UploadTooLarge(Exception):
    pass


class BodyLimitMiddleware:
    """Bound incoming bytes before multipart parsing/spooling, including chunked requests."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        count = 0
        too_large = False

        async def limited_receive() -> Message:
            nonlocal count, too_large
            message = await receive()
            if message["type"] == "http.request":
                count += len(message.get("body", b""))
                if count > self.max_bytes:
                    too_large = True
                    raise UploadTooLarge()
            return message

        async def limited_send(message: Message) -> None:
            if not too_large:
                await send(message)

        try:
            await self.app(scope, limited_receive, limited_send)
        except UploadTooLarge:
            too_large = True
        if too_large:
            response = JSONResponse(
                {
                    "data": None,
                    "error": {
                        "code": "FILE_TOO_LARGE",
                        "message": "Request exceeds upload size limit",
                    },
                },
                status_code=413,
            )
            await response(scope, receive, send)


class NoStoreCacheMiddleware:
    """Keep browsers and proxies from caching dynamic API responses."""

    def __init__(self, app: ASGIApp, path_prefix: str = "/api/") -> None:
        self.app, self.path_prefix = app, path_prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith(self.path_prefix):
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(raw=message["headers"])["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_with_headers)
