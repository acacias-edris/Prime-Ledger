from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.core.database import engine
from app.modules.inventory.router import router as inventory_router
from app.modules.invoicing.router import router as invoicing_router
from app.modules.ledger.exceptions import AccountingError
from app.modules.ledger.router import router as ledger_router
from app.modules.tax_india.router import router as tax_india_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AccountingError)
async def _handle_accounting_error(
    _request: Request, exc: AccountingError
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        headers=exc.headers or None,
        content={
            "error_code": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )


@app.exception_handler(OperationalError)
async def _handle_operational_error(
    _request: Request, exc: OperationalError
) -> JSONResponse:
    msg = str(getattr(exc, "orig", exc)).lower()
    if "database is locked" in msg or "database is busy" in msg:
        return JSONResponse(
            status_code=409,
            headers={"Retry-After": "1"},
            content={
                "error_code": "CONCURRENCY_CONFLICT",
                "message": "Database is temporarily locked by another write; please retry.",
                "details": {},
            },
        )
    raise exc


@app.get("/api/v1/health", tags=["system"])
async def health_check() -> dict[str, str]:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "version": settings.app_version,
        "dialect": engine.dialect.name,
    }


app.include_router(ledger_router)
app.include_router(tax_india_router)
app.include_router(inventory_router)
app.include_router(invoicing_router)
