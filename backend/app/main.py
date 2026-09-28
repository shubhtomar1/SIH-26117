"""ADRESTIA backend — FastAPI + SQLite + mock model architecture (MVP_MOCK mode)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import log
from app.models.database import init_db
from app.schemas.response import err

# import tool modules so they self-register on startup
import app.tools.calculator_tool  # noqa: F401
import app.tools.code_tool  # noqa: F401
import app.tools.document_tool  # noqa: F401
import app.tools.file_tool  # noqa: F401

from app.api import auth, files, health, knowledge, models, security, tasks, tools  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    from app.seed import seed
    seed()
    log.info(f"ADRESTIA backend online mode={settings.MODE} offline={settings.OFFLINE_MODE}")
    yield


app = FastAPI(title="ADRESTIA Backend", version=settings.APP_VERSION,
              description="Sovereign on-premise agentic AI workbench — MVP (mock models).",
              lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exc(request: Request, exc: HTTPException):
    code = {401: "UNAUTHORIZED", 403: "FORBIDDEN"}.get(exc.status_code, "REQUEST_FAILED")
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return err(code, detail, exc.status_code)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception(f"UNHANDLED {request.url.path} err={exc}")  # stack trace stays local
    return err("TASK_FAILED", "Internal error. See server logs.", 500)


app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(security.router, prefix="/api/v1/security", tags=["security"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(files.router, prefix="/api/v1/files", tags=["files"])
app.include_router(models.router, prefix="/api/v1/models", tags=["models"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["knowledge"])
app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["tasks"])
app.include_router(tools.router, prefix="/api/v1/tools", tags=["tools"])


@app.get("/")
def root():
    return {"success": True, "data": {"app": settings.APP_NAME, "mode": settings.MODE,
                                      "docs": "/docs"}, "error": None}
