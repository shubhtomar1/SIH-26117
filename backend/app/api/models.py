import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import require_roles
from app.model_adapters import registry as adapter_registry
from app.models.database import get_db
from app.models.model_registry import ModelRecord
from app.schemas.response import err, ok
from app.schemas.task import ModelRegister
from app.services import audit as audit_svc

router = APIRouter()


def _shape(rec: ModelRecord) -> dict:
    try:
        caps = json.loads(rec.capabilities or "[]")
    except ValueError:
        caps = []
    try:
        health = adapter_registry.get_adapter(rec.adapter).health_check()
        status = health.get("status", "available")
    except KeyError:
        status = "adapter_missing"
    return {"id": rec.id, "name": rec.name, "provider": rec.provider, "type": rec.type,
            "version": rec.version, "capabilities": caps, "enabled": rec.enabled, "status": status}


@router.get("")
def list_models(user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST", "VIEWER")),
                db: Session = Depends(get_db)):
    return ok({"models": [_shape(r) for r in db.query(ModelRecord).all()],
               "adapters": adapter_registry.list_adapters()})


@router.post("")
def register_model(body: ModelRegister, user=Depends(require_roles("ADMIN")),
                   db: Session = Depends(get_db)):
    if body.adapter not in adapter_registry.list_adapters():
        return err("MODEL_NOT_FOUND", f"Adapter '{body.adapter}' is not installed. Metadata-only registration refused.", 400)
    rec = ModelRecord(id=body.id, name=body.name, adapter=body.adapter, provider=body.provider,
                      type=body.type, version=body.version,
                      capabilities=json.dumps(body.capabilities), enabled=True)
    db.merge(rec)
    db.commit()
    audit_svc.log_action(db, "MODEL_REGISTERED", "models", "ok", user.id, details=body.id)
    return ok({"id": body.id, "note": "Metadata registered. No model was downloaded."})
