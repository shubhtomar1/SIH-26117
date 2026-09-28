import os

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_roles
from app.models.database import get_db
from app.models.document import Document
from app.schemas.response import err, ok
from app.services import audit as audit_svc
from app.services import document_service
from app.services.policy import PolicyDenied, check

router = APIRouter()


@router.post("/upload")
def upload(file: UploadFile, department: str | None = None,
           user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST")),
           db: Session = Depends(get_db)):
    try:
        check(user, "upload", file_type=os.path.splitext(file.filename or "")[1])
        doc = document_service.store_upload(db, file, department or user.department or "general")
    except PolicyDenied as exc:
        return err("POLICY_DENIED", exc.reason, 403)
    except ValueError as exc:
        code = str(exc).split(":")[0]
        return err(code, str(exc), 400)
    audit_svc.log_action(db, "FILE_UPLOADED", "files", "ok", user.id, details=doc.id)
    return ok({"id": doc.id, "filename": doc.filename, "type": doc.type, "needs_ocr": bool(doc.needs_ocr)})


@router.get("/{file_id}")
def get_file(file_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == file_id).first()
    if doc is None:
        return err("FILE_NOT_FOUND", "File not found.", 404)
    return ok({"id": doc.id, "filename": doc.filename, "type": doc.type,
               "department": doc.department, "needs_ocr": bool(doc.needs_ocr),
               "preview": (doc.content or "")[:2000]})


@router.get("/{file_id}/raw")
def get_file_raw(file_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == file_id).first()
    if doc is None or not doc.path or not os.path.exists(doc.path):
        return err("FILE_NOT_FOUND", "File not found.", 404)
    return FileResponse(doc.path, filename=doc.filename, content_disposition_type="inline")


@router.delete("/{file_id}")
def delete_file(file_id: str, user=Depends(require_roles("ADMIN", "ENGINEER")),
                db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == file_id).first()
    if doc is None:
        return err("FILE_NOT_FOUND", "File not found.", 404)
    try:
        if os.path.exists(doc.path):
            os.remove(doc.path)
    except OSError:
        pass
    db.delete(doc)
    db.commit()
    audit_svc.log_action(db, "FILE_DELETED", "files", "ok", user.id, details=file_id)
    return ok({"deleted": file_id})
