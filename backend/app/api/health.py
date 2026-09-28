import urllib.request

from fastapi import APIRouter
from sqlalchemy import func

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.document import Document
from app.models.model_registry import ModelRecord
from app.models.database import SessionLocal
from app.models.task import Task
from app.schemas.response import ok

router = APIRouter()


def _ollama_status() -> str:
    try:
        urllib.request.urlopen(f"{settings.OLLAMA_URL}/api/tags", timeout=2).read()
        return "online"
    except OSError:
        return "offline"


@router.get("/health")
def health():
    return ok({
        "status": "ok",
        "version": settings.APP_VERSION,
        "mode": settings.MODE,
        "ollama": _ollama_status(),
        "ollama_url": settings.OLLAMA_URL,
        "ollama_model": settings.OLLAMA_MODEL,
    })


@router.get("/system/status")
def system_status():
    db = SessionLocal()
    try:
        return ok({
            "backend": "online",
            "database": "online",
            "offline_mode": settings.OFFLINE_MODE,
            "mode": settings.MODE,
            "ollama": _ollama_status(),
            "models": db.query(func.count(ModelRecord.id)).scalar(),
            "knowledge_documents": db.query(func.count(Document.id)).scalar(),
            "active_tasks": db.query(func.count(Task.id)).filter(
                Task.status.notin_(["COMPLETED", "FAILED"])).scalar(),
            "audit_events": db.query(func.count(AuditLog.id)).scalar(),
        })
    finally:
        db.close()
