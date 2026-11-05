from fastapi import Depends, FastAPI, Request, Response
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import (
    admin,
    annotations,
    auth,
    invitations,
    reference,
    reviews,
    scans,
    shares,
    validation,
)
from app.api.schemas import VALUE_ERROR_CODES
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

    @app.exception_handler(RequestValidationError)
    async def stable_value_errors(request: Request, exc: RequestValidationError) -> Response:
        # Our validators raise ValueError(<code>); answer {"detail": code} like other API errors.
        for err in exc.errors():
            code = str(err.get("ctx", {}).get("error", ""))
            if err.get("type") == "value_error" and code in VALUE_ERROR_CODES:
                return JSONResponse({"detail": code}, status_code=422)
        return await request_validation_exception_handler(request, exc)

    @app.get("/api/health", tags=["health"])
    def health(db: Session = Depends(get_db)) -> dict[str, str]:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}

    for module in (
        auth,
        invitations,
        admin,
        scans,
        shares,
        reviews,
        reference,
        annotations,
        validation,
    ):
        app.include_router(module.router)
    return app


app = create_app()
