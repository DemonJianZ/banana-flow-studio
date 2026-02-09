import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from auth_routes import auth_router, init_auth_db
from storage.usage import init_usage_db
from services.genai_client import init_client
from core.logging import sys_logger

import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from auth_routes import auth_router, init_auth_db  # 确保这里正确导入
from services.genai_client import init_client
from core.logging import sys_logger

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

    # 注册 auth_router 路由
    app.include_router(auth_router)

    # init dbs / client on startup
    init_auth_db()
    init_usage_db()
    init_client()
    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)
