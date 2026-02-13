import os

from app_factory import create_app

app = create_app()

if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8082"))
    workers = int(os.getenv("WORKERS", "1"))

    uvicorn.run("main:app", host=host, port=port, workers=workers)
