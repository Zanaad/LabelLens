"""Application settings, read from environment variables (see .env.example)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Reads .env from backend/ or the repo root; secrets have no defaults.
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"

    database_url: str = Field(repr=False)

    # Auth
    jwt_secret: str = Field(min_length=32, repr=False)
    jwt_algorithm: str = "HS256"
    jwt_ttl_minutes: int = 480
    remember_me_days: int = 30  # session length when "Remember me" is ticked
    # Share of ordinary results (not asked about) that reach the expert queue, 0-100.
    review_sample_percent: int = Field(default=10, ge=0, le=100)
    cookie_name: str = "ll_session"
    cookie_secure: bool = False  # set true behind HTTPS
    password_min_length: int = 12
    invitation_ttl_hours: int = 168

    # Comma-separated list of allowed browser origins. Same-origin (via the nginx/Vite proxy)
    # needs no entry; list only origins that call the API directly.
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    # Rate limiting (in-memory, per client IP and route group)
    rate_limit_enabled: bool = True
    auth_rate_limit_per_minute: int = 10
    upload_rate_limit_per_minute: int = 20

    # Storage
    storage_dir: str = "./storage"
    max_upload_mb: int = 10

    # Extraction. Keys come only from env. "cached" replays saved outputs; "groq" calls the API.
    extraction_provider: Literal["cached", "groq"] = "cached"
    # Model name in the cache keys of the hand-written example readings (cached mode only).
    extraction_model: str = "claude-opus-5-5"
    groq_model: str = "qwen/qwen3.8-27b"
    groq_api_key: str = Field(default="", repr=False)
    extraction_cache_dir: str = "../data/extraction_cache"

    @property
    def validation_model(self) -> str:
        return self.groq_model if self.extraction_provider == "groq" else self.extraction_model

    # Email (password reset links). Empty SMTP_HOST turns sending off.
    app_base_url: str = "http://localhost:8080"  # start of links inside emails
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"
    smtp_username: str = ""
    smtp_password: str = Field(default="", repr=False)
    smtp_from: str = "LabelLens <no-reply@labellens.local>"
    password_reset_ttl_minutes: int = 60
    email_verification_ttl_hours: int = 24

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard(cls, v: str) -> str:
        if "*" in v:
            raise ValueError("CORS_ORIGINS must list explicit origins; '*' is not allowed")
        return v

    @model_validator(mode="after")
    def _production_guards(self) -> "Settings":
        if self.app_env == "production" and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true in production")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
