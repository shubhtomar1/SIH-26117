"""Evidence-first: every important claim links a source document."""
import uuid

from sqlalchemy.orm import Session

from app.models.evidence import Evidence


def attach(db: Session, task_id: str, claim: str, document_id: str | None = None,
           filename: str | None = None, page: int | None = None, excerpt: str | None = None) -> Evidence:
    ev = Evidence(id=f"EV-{uuid.uuid4().hex[:8].upper()}", task_id=task_id, claim=claim,
                  document_id=document_id, filename=filename, page=page, excerpt=excerpt)
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def for_task(db: Session, task_id: str) -> list[Evidence]:
    return db.query(Evidence).filter(Evidence.task_id == task_id).all()
