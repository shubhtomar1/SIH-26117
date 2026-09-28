"""Seed: admin user + models + sample private knowledge (idempotent)."""
import json

from app.core.config import settings
from app.core.security import hash_password
from app.models.database import SessionLocal
from app.models.document import Document
from app.models.model_registry import ModelRecord
from app.models.user import User
from app.services import document_service

SAMPLE_DOCS = [
    ("Safety_Manual.txt",
     "SAFETY MANUAL 2026 — Inspection Requirements.\n"
     "Section 4.2: Pressure vessels shall not exceed 7.5 bar under routine operation. "
     "Any reading above this threshold must be flagged as a safety violation and escalated for approval.\n"
     "Section 4.9: Vibration exceeding 2.8 mm/s requires documented root-cause analysis before clearance.\n"
     "Section 7: Lockout-tagout certificate is mandatory before any maintenance activity.",
     "safety"),
    ("Turbine_SOP.txt",
     "TURBINE SOP v3 — Pressure Systems.\n"
     "Section 7.2: No maintenance activity shall commence without a signed lockout-tagout certificate "
     "attached to the work order. Maximum operating pressure 7.5 bar.",
     "operations"),
    ("Maintenance_Guidelines.txt",
     "MAINTENANCE GUIDELINES — Torque and Fastening.\n"
     "Section 4.1: Flange assembly A-2 fasteners shall be torqued to 220 Nm +/- 5 Nm "
     "and re-verified after thermal cycle.",
     "maintenance"),
]


def _upsert_model(db, mid: str, name: str, adapter: str, mtype: str, caps: list[str],
                  version: str, enabled: bool) -> None:
    rec = db.query(ModelRecord).filter(ModelRecord.id == mid).first()
    if rec is None:
        db.add(ModelRecord(id=mid, name=name, adapter=adapter, provider="local",
                           type=mtype, version=version, capabilities=json.dumps(caps),
                           enabled=enabled))
        return
    rec.name = name
    rec.adapter = adapter
    rec.type = mtype
    rec.version = version
    rec.capabilities = json.dumps(caps)
    rec.enabled = enabled


def seed() -> None:
    db = SessionLocal()
    local = settings.MODE == "LOCAL_MODEL"
    try:
        if db.query(User).filter(User.username == "admin").first() is None:
            db.add(User(id="USER-ADMIN", username="admin", password_hash=hash_password("admin"),
                        role="ADMIN", department="safety"))
        mocks = [
            ("mock-reasoning", "Mock Reasoning Model", "mock-reasoning", "llm", ["reasoning", "text_generation"]),
            ("mock-ocr", "Mock OCR Model", "mock-ocr", "vlm", ["ocr", "vision"]),
            ("mock-coder", "Mock Coding Model", "mock-coder", "llm", ["coding", "code_generation"]),
        ]
        for mid, name, adapter, mtype, caps in mocks:
            _upsert_model(db, mid, name, adapter, mtype, caps, "1.0", enabled=not local)

        _upsert_model(
            db, "ollama-local", f"Ollama Fast ({settings.OLLAMA_MODEL})", "ollama", "llm",
            ["reasoning", "text_generation"],
            settings.OLLAMA_MODEL, enabled=local,
        )
        _upsert_model(
            db, "ollama-coder", f"Ollama Coder ({settings.OLLAMA_CODER_MODEL})", "ollama", "llm",
            ["coding", "code_generation"],
            settings.OLLAMA_CODER_MODEL, enabled=local,
        )
        _upsert_model(
            db, "ollama-vision", f"Ollama Vision ({settings.OLLAMA_VISION_MODEL})",
            "ollama-vision", "vlm", ["ocr", "vision"],
            settings.OLLAMA_VISION_MODEL, enabled=local,
        )
        db.commit()
        if db.query(Document).count() == 0:
            for filename, content, dept in SAMPLE_DOCS:
                document_service.ingest_text(db, filename, content, dept, "sop")
        db.commit()
        print(f"Seed complete: admin/admin, mode={settings.MODE}, local_ollama={local}.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
