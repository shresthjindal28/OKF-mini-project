import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from app.api import documents, okf, search
from app.core.config import get_settings
from app.core.database import get_engine, get_session, verify_database
from app.core.errors import AppError
from app.core.logging import configure_logging
from app.core.middleware import BodyLimitMiddleware
from app.schemas.common import Envelope

logger = logging.getLogger(__name__)


def error_response(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        {"data": None, "error": {"code": code, "message": message}}, status_code=status
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)

    def check() -> None:
        with Session(get_engine()) as session:
            verify_database(session, settings)

    try:
        await run_in_threadpool(check)
    except Exception:
        logger.error(
            "startup_database_check_failed: check connection, migrations, and embedding configuration"
        )
        raise RuntimeError("Database readiness check failed") from None
    yield
    get_engine().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="OKF Builder", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        BodyLimitMiddleware, max_bytes=settings.max_upload_size_mb * 1024 * 1024 + 65536
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition"],
        allow_credentials=False,
    )

    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.code, exc.message, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response("VALIDATION_ERROR", "Request fields or parameters are invalid", 422)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        return error_response("HTTP_ERROR", "Request could not be handled", exc.status_code)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.error("database_request_failed exception_type=%s", type(exc).__name__)
        return error_response("DATABASE_UNAVAILABLE", "Database operation failed; retry later", 503)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("request_failed exception_type=%s", type(exc).__name__)
        return error_response("INTERNAL_ERROR", "An internal error occurred", 500)

    for router in (documents.router, okf.router, search.router):
        app.include_router(router, prefix="/api/v1")

    @app.get("/health/live", response_model=Envelope[dict[str, str]])
    def live() -> Envelope[dict[str, str]]:
        return Envelope(data={"status": "ok"})

    @app.get("/health/ready", response_model=Envelope[dict[str, str]])
    def ready(session: Session = Depends(get_session)) -> Envelope[dict[str, str]]:
        verify_database(session, settings)
        return Envelope(data={"status": "ready"})

    return app


app = create_app()
