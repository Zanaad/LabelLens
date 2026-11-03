from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import auth, invitations, scans
from app.config import get_settings
from app.db import get_db


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="LabelLens API",
        version="0.1.0",
        description="Checks a herbal product's LABEL against studied preparations. "
        "Research prediction, not medical advice.",
        docs_url=None if s.app_env == "production" else "/api/docs",
        openapi_url=None if s.app_env == "production" else "/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health", tags=["health"])
    def health(db: Session = Depends(get_db)) -> dict[str, str]:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(invitations.router)
    app.include_router(scans.router)
    return app


app = create_app()
