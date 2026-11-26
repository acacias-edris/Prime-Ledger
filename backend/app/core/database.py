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

# Explicit naming convention required for Alembic 1.20+ SQLite render_as_batch=True
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(AsyncAttrs, DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def build_async_engine(database_url: str, *, echo: bool = False) -> AsyncEngine:
    is_sqlite = database_url.startswith("sqlite")
    kwargs: dict[str, Any] = {"echo": echo}

    if not is_sqlite:
        kwargs["pool_size"] = 5
        kwargs["max_overflow"] = 10
        kwargs["pool_pre_ping"] = True

    async_engine = create_async_engine(database_url, **kwargs)

    if is_sqlite:
        @event.listens_for(async_engine.sync_engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _connection_record) -> None:
            # Disable sqlite3/aiosqlite implicit BEGIN so WAL PRAGMA executes outside any transaction
            dbapi_conn.isolation_level = None
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA busy_timeout=5000;")
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

        @event.listens_for(async_engine.sync_engine, "begin")
        def _do_sqlite_begin(conn) -> None:
            # Emit explicit BEGIN on transaction start per SQLAlchemy 2.1 aiosqlite docs
            conn.exec_driver_sql("BEGIN")

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
