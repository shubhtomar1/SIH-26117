from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.orm import Session

from app.core.security import require_roles
from app.models.database import get_db
from app.models.document import Document
from app.schemas.response import err, ok
from app.schemas.task import KnowledgeIndex
from app.services import audit as audit_svc
from app.services import document_service
from app.services.policy import PolicyDenied, check
from app.services.rag_service import RAGService

router = APIRouter()


@router.post("/index")
def index_text(body: KnowledgeIndex, user=Depends(require_roles("ADMIN", "ENGINEER")),
               db: Session = Depends(get_db)):
    try:
        check(user, "manage_knowledge")
        doc = document_service.ingest_text(db, body.filename, body.content, body.department, body.category)
    except PolicyDenied as exc:
        return err("POLICY_DENIED", exc.reason, 403)
    audit_svc.log_action(db, "KNOWLEDGE_INDEXED", "knowledge", "ok", user.id, details=doc.id)
    return ok({"id": doc.id, "filename": doc.filename})


@router.post("/upload")
def index_upload(file: UploadFile, department: str = "general", category: str = "general",
                 user=Depends(require_roles("ADMIN", "ENGINEER")), db: Session = Depends(get_db)):
    import os

    try:
        check(user, "manage_knowledge", file_type=os.path.splitext(file.filename or "")[1])
        doc = document_service.store_upload(db, file, department or user.department, category)
    except PolicyDenied as exc:
        return err("POLICY_DENIED", exc.reason, 403)
    except ValueError as exc:
        return err(str(exc).split(":")[0], str(exc), 400)
    audit_svc.log_action(db, "KNOWLEDGE_INDEXED", "knowledge", "ok", user.id, details=doc.id)
    return ok({"id": doc.id, "filename": doc.filename, "needs_ocr": bool(doc.needs_ocr)})


@router.get("/documents")
def list_documents(user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST", "VIEWER")),
                   db: Session = Depends(get_db)):
    docs = db.query(Document).order_by(Document.created_at.desc()).limit(200).all()
    return ok({"documents": [{"id": d.id, "filename": d.filename, "type": d.type,
                              "department": d.department, "category": d.category,
                              "version": d.version} for d in docs]})


@router.get("/search")
def search(q: str, department: str | None = None,
           user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST", "VIEWER")),
           db: Session = Depends(get_db)):
    hits = RAGService(db).search(q, department=department)
    return ok({"query": q, "results": [
        {"document_id": h["document"].id, "filename": h["document"].filename,
         "score": h["score"], "excerpt": h["excerpt"]} for h in hits]})
