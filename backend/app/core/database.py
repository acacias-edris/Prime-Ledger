from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import MetaData, event
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

# Explicit naming convention required for Alembic SQLite render_as_batch=True
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

_SQLITE_BEGIN_MODES = frozenset({"DEFERRED", "IMMEDIATE", "EXCLUSIVE"})
SQLITE_BUSY_TIMEOUT_MS = 5000


class Base(AsyncAttrs, DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def build_async_engine(database_url: str, *, echo: bool = False) -> AsyncEngine:
    is_sqlite = database_url.startswith("sqlite")
    kwargs: dict[str, Any] = {"echo": echo}

    if not is_sqlite:
        kwargs["pool_size"] = 5
        kwargs["max_overflow"] = 10
        kwargs["pool_pre_ping"] = True
    else:
        kwargs["connect_args"] = {"timeout": SQLITE_BUSY_TIMEOUT_MS / 1000}

    async_engine = create_async_engine(database_url, **kwargs)

    if is_sqlite:

        @event.listens_for(async_engine.sync_engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _connection_record) -> None:
            dbapi_conn.isolation_level = None
            cursor = dbapi_conn.cursor()
            # busy_timeout MUST run first so journal_mode=WAL never fails with SQLITE_BUSY.
            cursor.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS};")
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=FULL;")
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

        @event.listens_for(async_engine.sync_engine, "begin")
        def _do_sqlite_begin(conn) -> None:
            # Default DEFERRED preserves WAL concurrent readers; write paths opt into
            # BEGIN IMMEDIATE via begin_write_transaction(db) before their first SELECT.
            mode = str(conn.get_execution_options().get("sqlite_begin", "DEFERRED")).upper()
            if mode not in _SQLITE_BEGIN_MODES:
                raise ValueError(f"Invalid sqlite_begin mode: {mode!r}")
            conn.exec_driver_sql(f"BEGIN {mode}")

    return async_engine


async def begin_write_transaction(db: AsyncSession) -> None:
    """
    Acquire SQLite's RESERVED write lock up-front (BEGIN IMMEDIATE) so busy_timeout
    applies cleanly and read->write lock upgrades never raise SQLITE_BUSY_SNAPSHOT.
    Must be called before the first SQL statement in a write workflow.
    """
    if db.get_bind().dialect.name == "sqlite" and not db.in_transaction():
        await db.connection(execution_options={"sqlite_begin": "IMMEDIATE"})


settings = get_settings()
engine = build_async_engine(settings.database_url, echo=settings.sql_echo)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
