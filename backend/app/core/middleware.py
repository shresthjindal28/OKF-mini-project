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
