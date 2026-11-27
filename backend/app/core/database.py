from __future__ import annotations

# LedgerPrime -- database.py (Milestone 2 -- PATCHED, independent review)
#
# PATCH(Q3) summary
#   1. BEGIN IMMEDIATE (default) instead of deferred BEGIN.
#      Every service write path is read-then-write (company/FY/ledger SELECTs, then INSERT).
#      Under WAL + deferred BEGIN, the read->write upgrade fails IMMEDIATELY with
#      "database is locked" (SQLITE_BUSY / BUSY_SNAPSHOT) -- busy_timeout is NOT consulted.
#   2. synchronous=FULL. With WAL+NORMAL a power cut can roll back the last committed
#      transactions -> a voucher number already printed/emailed (GST invoice) is re-issued.
#   3. Opt-out for long read-only reports:  await session.connection(
#          execution_options={"sqlite_begin": "DEFERRED"})  before the first statement.

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
        # sqlite3's own busy handler (seconds); kept equal to the PRAGMA for clarity.
        kwargs["connect_args"] = {"timeout": SQLITE_BUSY_TIMEOUT_MS / 1000}

    async_engine = create_async_engine(database_url, **kwargs)

    if is_sqlite:

        @event.listens_for(async_engine.sync_engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _connection_record) -> None:
            # Disable pysqlite/aiosqlite implicit BEGIN (SQLAlchemy aiosqlite docs pattern)
            dbapi_conn.isolation_level = None
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=FULL;")
            cursor.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS};")
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

        @event.listens_for(async_engine.sync_engine, "begin")
        def _do_sqlite_begin(conn) -> None:
            # Take the RESERVED/WAL write lock at BEGIN so busy_timeout applies and
            # every SELECT inside the transaction sees the latest committed state.
            mode = str(conn.get_execution_options().get("sqlite_begin", "IMMEDIATE")).upper()
            if mode not in _SQLITE_BEGIN_MODES:
                raise ValueError(f"Invalid sqlite_begin mode: {mode!r}")
            conn.exec_driver_sql(f"BEGIN {mode}")

    return async_engine


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
