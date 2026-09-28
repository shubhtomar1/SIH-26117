"""DB audit helper — every important action lands in audit_logs."""
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.logging import log
from app.models.audit import AuditLog


def log_action(db: Session, action: str, component: str = "api", status: str = "ok",
               user_id: str | None = None, task_id: str | None = None, details: str = "") -> None:
    db.add(AuditLog(id=f"LOG-{uuid.uuid4().hex[:8].upper()}", user_id=user_id, task_id=task_id,
                    action=action, component=component, status=status, details=details[:2000]))
    db.commit()
    log.info(f"{action} task={task_id} user={user_id} status={status} {details[:120]}")
