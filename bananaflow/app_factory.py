import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from auth_routes import auth_router, init_auth_db
from core.http_logging import install_http_logging
from core.logging import sys_logger
from services.genai_client import init_client
from storage.asset_library import init_asset_library_store
from storage.usage import init_usage_db


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


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """
    FastAPI lifespan: initialise long-lived resources on startup,
    clean them up on shutdown.
    """
    # ── Agent graph with SQLite checkpointing ────────────────────────────────
    try:
        import aiosqlite
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        from agent.graph import build_agent_graph

        db_path = os.getenv("AGENT_CHECKPOINTS_DB_PATH", "data/agent_checkpoints.db")
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)

        conn = await aiosqlite.connect(db_path)
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()
        app.state.agent_graph = build_agent_graph(checkpointer=checkpointer)
        app.state.agent_checkpointer_conn = conn
        sys_logger.info(f"[agent] LangGraph graph initialised (checkpoints → {db_path})")
    except Exception as e:
        sys_logger.warning(f"[agent] Failed to initialise LangGraph graph: {e} — agent will run stateless")
        app.state.agent_graph = None
        app.state.agent_checkpointer_conn = None

    yield  # ── application runs ────────────────────────────────────────────────

    # ── Cleanup ──────────────────────────────────────────────────────────────
    conn = getattr(app.state, "agent_checkpointer_conn", None)
    if conn is not None:
        try:
            await conn.close()
        except Exception:
            pass


def create_app() -> FastAPI:
    app = FastAPI(
        title="BananaFlow - 电商智能图像工作台",
        version="3.4",
        lifespan=_lifespan,
    )
    cors_origins = _resolve_cors_origins()
    cors_allow_credentials = _as_bool(os.getenv("BANANAFLOW_CORS_ALLOW_CREDENTIALS"), default=True)
    if "*" in cors_origins and cors_allow_credentials:
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
        f"CORS configured: allow_credentials={cors_allow_credentials}, "
        f"allow_origins={cors_origins or ['http://localhost:5174']}"
    )

    install_http_logging(app)

    # ── Routers ──────────────────────────────────────────────────────────────
    app.include_router(router)
    app.include_router(auth_router)

    from api.health_routes import health_router
    app.include_router(health_router)

    from api.gemini_chat_routes import gemini_chat_router
    app.include_router(gemini_chat_router)

    from api.screenplay_routes import screenplay_router
    app.include_router(screenplay_router)

    from api.agent_routes import agent_router
    app.include_router(agent_router)

    # ── Sync stores (non-async init) ─────────────────────────────────────────
    init_auth_db()
    init_usage_db()
    init_asset_library_store()
    init_client()

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)
