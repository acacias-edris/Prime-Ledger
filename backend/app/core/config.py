from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "LedgerPrime API"
    app_version: str = "0.2.0"
    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./ledgerprime.db"
    frontend_origin: str = "http://localhost:5173,http://127.0.0.1:5173"
    sql_echo: bool = False

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.frontend_origin.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
