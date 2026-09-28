"""Task-aware router: deterministic rules for MVP (explainable, no AI needed).

Rule-based → benchmark-based → learned. Only this file evolves.
Prefers enabled non-mock adapters so MODE=LOCAL_MODEL actually uses Ollama.
"""
import json

from sqlalchemy.orm import Session

from app.core.logging import log
from app.model_adapters import registry as adapter_registry
from app.model_adapters.base import BaseModelAdapter
from app.models.model_registry import ModelRecord


def classify_capability(task_type: str, input_type: str, text: str) -> str:
    tt = (task_type or "").lower()
    it = (input_type or "").lower()
    tx = (text or "").lower()

    ocr_terms = (
        "extract text", "read text", "transcribe", "transcription",
        "ocr", "scanned text", "extract words", "read words", "read scan",
        "text nikalo", "text padho"
    )
    coding_terms = (
        "python", "html", "css", "javascript", "typescript", "react", "vue",
        "sql", "code", "script", "program", "function", "api", "endpoint",
        "webpage", "website", "frontend", "backend", "login page", "button",
        "component", "algorithm", "debug", "refactor", "write code", "generate code"
    )

    # 1. Visual Inputs (image, drawing, scan, or task_type == 'vision')
    if it in ("image", "drawing", "scan") or tt in ("vision", "ocr"):
        if any(w in tx for w in ocr_terms):
            return "ocr"
        return "vision"

    # 2. Text / Code Tasks
    if tt == "coding" or it == "code" or any(c in tx for c in coding_terms):
        return "coding"

    if tt == "ocr" or any(w in tx for w in ocr_terms):
        return "ocr"

    # 3. Text Reasoning / Document Analysis / Q&A
    return "reasoning"


def _is_mock(rec: ModelRecord) -> bool:
    return (rec.adapter or "").startswith("mock")


def _bind_adapter(rec: ModelRecord) -> BaseModelAdapter:
    adapter = adapter_registry.get_adapter(rec.adapter)
    if rec.adapter in ("ollama", "ollama-vision") and rec.version and rec.version != "1.0":
        adapter.model = rec.version
    return adapter


def route(db: Session, task_type: str, input_type: str, text: str) -> tuple[ModelRecord, object]:
    capability = classify_capability(task_type, input_type, text)
    records = db.query(ModelRecord).filter(ModelRecord.enabled == True).all()  # noqa: E712
    records.sort(key=lambda r: (1 if _is_mock(r) else 0, r.id))
    for rec in records:
        try:
            caps = json.loads(rec.capabilities or "[]")
        except ValueError:
            caps = []
        if capability in caps:
            adapter = _bind_adapter(rec)
            log.info(f"MODEL_SELECTED model={rec.id} adapter={rec.adapter} capability={capability}")
            return rec, adapter
    raise LookupError(f"MODEL_UNAVAILABLE: no enabled model with capability '{capability}'")
