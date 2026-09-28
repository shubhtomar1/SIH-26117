import json
import os
import threading
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.logging import log
from app.core.security import get_current_user, require_roles
from app.models.database import SessionLocal, get_db
from app.models.evidence import Evidence
from app.models.task import Task, TaskStep
from app.models.user import User
from app.schemas.response import err, ok
from app.schemas.task import ApproveIn, TaskCreate
from app.services import audit as audit_svc
from app.services import orchestrator
from app.services.policy import PolicyDenied

router = APIRouter()

_RUNNING: set[str] = set()
_LOCK = threading.Lock()


def _shape(t: Task) -> dict:
    try:
        result = json.loads(t.result or "{}")
    except ValueError:
        result = {}
    return {"task_id": t.id, "status": t.status, "task_type": t.task_type,
            "current_step": t.current_step, "model": t.selected_model,
            "progress": t.progress, "result": result}


def _run_in_background(task_id: str, user_id: str) -> None:
    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        user = db.query(User).filter(User.id == user_id).first()
        if task is None or user is None:
            return
        orchestrator.run_task(db, task, user)
    except Exception as exc:
        log.exception(f"BACKGROUND_TASK_FAILED task={task_id} err={exc}")
    finally:
        db.close()
        with _LOCK:
            _RUNNING.discard(task_id)


@router.post("")
def create_task(body: TaskCreate, user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST")),
                db: Session = Depends(get_db)):
    try:
        from app.services.policy import check
        check(user, "create_task")
    except PolicyDenied as exc:
        return err("POLICY_DENIED", exc.reason, 403)
    task_type = body.task_type or "analysis"
    input_type = body.input_type or "text"
    ocr_words = (
        "extract text", "read text", "transcribe", "transcription",
        "ocr", "scanned text", "extract words", "read words", "read scan",
        "text nikalo", "text padho"
    )
    if task_type == "ocr" and not any(w in (body.task or "").lower() for w in ocr_words):
        task_type = "vision" if input_type == "image" else "question"

    t = Task(id=f"TASK-{uuid.uuid4().hex[:8].upper()}", user_id=user.id, input=body.task,
             task_type=task_type, input_type=input_type,
             file_ids=json.dumps(body.file_ids or []), status="CREATED", progress=0)
    db.add(t)
    db.commit()
    audit_svc.log_action(db, "TASK_CREATED", "tasks", "ok", user.id, t.id, task_type)
    return ok({"task_id": t.id, "status": "created"}, 201)


@router.get("/{task_id}")
def task_status(task_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if t is None:
        return err("TASK_FAILED", "Task not found.", 404)
    return ok(_shape(t))


@router.get("/{task_id}/steps")
def task_steps(task_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    steps = (db.query(TaskStep).filter(TaskStep.task_id == task_id)
             .order_by(TaskStep.step_number).all())
    return ok({"steps": [{"step": s.step_type, "status": s.status, "result": s.result} for s in steps]})


@router.get("/{task_id}/evidence")
def task_evidence(task_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    evs = db.query(Evidence).filter(Evidence.task_id == task_id).all()
    return ok({"evidence": [{"claim": e.claim, "source": {"document_id": e.document_id,
                                                          "filename": e.filename, "page": e.page},
                             "excerpt": e.excerpt} for e in evs]})


@router.post("/{task_id}/run")
def run(task_id: str, user=Depends(require_roles("ADMIN", "ENGINEER")),
        db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if t is None:
        return err("TASK_FAILED", "Task not found.", 404)
    if t.status in ("WAITING_APPROVAL", "COMPLETED"):
        return ok(_shape(t))
    if t.status == "FAILED":
        return err("TASK_FAILED", "Task already failed. Create a new task.", 409)
    with _LOCK:
        already = task_id in _RUNNING
        if not already:
            _RUNNING.add(task_id)
    if already:
        return ok(_shape(t))
    t.status = "POLICY_CHECK"
    t.progress = 1
    db.commit()
    threading.Thread(target=_run_in_background, args=(t.id, user.id), daemon=True).start()
    return ok(_shape(t))


@router.post("/{task_id}/approve")
def approve(task_id: str, body: ApproveIn, user=Depends(require_roles("ADMIN", "ENGINEER")),
            db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if t is None:
        return err("TASK_FAILED", "Task not found.", 404)
    if body.decision not in ("approve", "reject"):
        return err("INVALID_FILE", "Decision must be 'approve' or 'reject'.", 400)
    try:
        t = orchestrator.approve(db, t, user, body.decision)
    except PolicyDenied as exc:
        return err("POLICY_DENIED", exc.reason, 403)
    except ValueError as exc:
        return err("TASK_FAILED", str(exc), 409)
    return ok(_shape(t))


@router.get("/{task_id}/deliverable")
def deliverable(task_id: str, format: str = "pdf",
                user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST", "VIEWER")),
                db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if t is None:
        return err("TASK_FAILED", "Task not found.", 404)
    try:
        paths: list[str] = (json.loads(t.result or "{}").get("deliverables") or [])
    except ValueError:
        paths = []
    paths = [p for p in paths if p and os.path.exists(p)]
    if not paths:
        return err("OUTPUT_GENERATION_FAILED", "No deliverable available yet.", 404)

    req_ext = f".{format.lower().lstrip('.')}"
    chosen_path = None
    for p in paths:
        if p.lower().endswith(req_ext):
            chosen_path = p
            break
    if not chosen_path:
        chosen_path = paths[0]

    media_types = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain",
    }
    ext = os.path.splitext(chosen_path)[1].lower()
    media_type = media_types.get(ext, "application/octet-stream")

    audit_svc.log_action(db, "OUTPUT_DOWNLOADED", "tasks", "ok", user.id, task_id)
    return FileResponse(chosen_path, filename=os.path.basename(chosen_path), media_type=media_type)
