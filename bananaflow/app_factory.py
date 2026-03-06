import uuid
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from auth_routes import auth_router, init_auth_db
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

def create_app() -> FastAPI:
    app = FastAPI(title="BananaFlow - 电商智能图像工作台", version="3.3")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        request.state.req_id = str(uuid.uuid4())[:8]
        return await call_next(request)

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
