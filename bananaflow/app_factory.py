import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from auth_routes import auth_router, init_auth_db
from core.http_logging import install_http_logging
from memory.service import expire_preferences, init_memories_store
from services.genai_client import init_client
from sessions.service import init_sessions_store
from storage.usage import init_usage_db
from core.logging import sys_logger


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _split_csv(value: str | None) -> list[str]:
    if value is None:
        return []
    return [item.strip().rstrip("/") for item in str(value).split(",") if item and item.strip()]


def _resolve_cors_origins() -> list[str]:
    from_env = _split_csv(os.getenv("BANANAFLOW_CORS_ALLOW_ORIGINS"))
    if from_env:
        return from_env
    return [
        "http://test.dayukeji-inc.cn",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://192.168.20.30:5173",
        "http://192.168.20.30:5174",
    ]


def create_app() -> FastAPI:
    app = FastAPI(title="BananaFlow - 电商智能图像工作台", version="3.3")
    cors_origins = _resolve_cors_origins()
    cors_allow_credentials = _as_bool(os.getenv("BANANAFLOW_CORS_ALLOW_CREDENTIALS"), default=True)
    if "*" in cors_origins and cors_allow_credentials:
        # Browser disallows wildcard origin when credentials=true.
        cors_allow_credentials = False
        sys_logger.warning("CORS allow_credentials forced to false because allow_origins contains '*'")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins or ["http://localhost:5174"],
        allow_credentials=cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    sys_logger.info(
        f"CORS configured: allow_credentials={cors_allow_credentials}, allow_origins={cors_origins or ['http://localhost:5174']}"
    )

    install_http_logging(app)

    app.include_router(router)

    app.include_router(auth_router)

    init_auth_db()
    init_usage_db()
    init_sessions_store()
    init_memories_store()
    if _as_bool(os.getenv("BANANAFLOW_MEMORY_TTL_CLEANUP_ON_STARTUP"), default=False):
        expired_count = expire_preferences()
        sys_logger.info(f"memory ttl cleanup on startup: expired_count={expired_count}")
    init_client()
    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)
