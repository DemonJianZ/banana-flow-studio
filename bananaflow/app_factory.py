import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from auth_routes import auth_router, init_auth_db
from core.http_logging import install_http_logging
from memory.service import expire_preferences, init_memories_store
from services.genai_client import init_client
from sessions.service import init_sessions_store
from storage.asset_library import init_asset_library_store
from storage.storyboard_tasks import init_storyboard_tasks_store
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
    default_origins = [
        "http://meta.dayukeji-inc.cn",
        "https://meta.dayukeji-inc.cn",
        "http://test.dayukeji-inc.cn",
        "https://test.dayukeji-inc.cn",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]
    from_env = _split_csv(os.getenv("BANANAFLOW_CORS_ALLOW_ORIGINS"))
    if not from_env:
        return default_origins
    merged: list[str] = []
    for origin in [*from_env, *default_origins]:
        if origin not in merged:
            merged.append(origin)
    return merged


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

    from api.health_routes import health_router
    app.include_router(health_router)

    init_auth_db()
    init_usage_db()
    init_asset_library_store()
    init_storyboard_tasks_store()
    init_sessions_store()
    init_memories_store()
    if _as_bool(os.getenv("BANANAFLOW_MEMORY_TTL_CLEANUP_ON_STARTUP"), default=False):
        expired_count = expire_preferences()
        sys_logger.info(f"memory ttl cleanup on startup: expired_count={expired_count}")
    init_client()

    async def _init_agent_graph() -> None:
        import os as _os
        import aiosqlite
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        from agent_v2.graph import build_agent_graph

        db_dir = _os.path.join(_os.path.dirname(__file__), "..", "data")
        _os.makedirs(db_dir, exist_ok=True)
        db_path = _os.path.join(db_dir, "agent_checkpoints.db")
        conn = await aiosqlite.connect(db_path)
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()
        app.state.agent_graph = build_agent_graph(checkpointer=checkpointer)
        sys_logger.info("agent_graph initialized with AsyncSqliteSaver at %s", db_path)

    app.add_event_handler("startup", _init_agent_graph)

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)
