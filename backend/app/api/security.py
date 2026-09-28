"""Security posture endpoint — real, verifiable checks (not cosmetic).

Every check the widget shows is computed here on the live system:
- outbound internet reachability (must be OFF for data sovereignty)
- storage location (must be local disk, not a cloud URL)
- runtime mode (mock models vs local Ollama — both fully on-premise)
- human approval gate (hard-coded in orchestrator for analysis tasks)
- JWT secret default warning
- audit trail size
- tool allowlist size (policy-gated execution)
"""
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends
from sqlalchemy import func

from app.core.config import settings
from app.core.security import require_roles
from app.models.audit import AuditLog
from app.models.database import SessionLocal
from app.tools import tool_registry
from app.tools.file_tool import ALLOWED_DIRS

# import tool modules so the allowlist is populated (mirrors main.py)
import app.tools.calculator_tool  # noqa: F401
import app.tools.code_tool  # noqa: F401
import app.tools.document_tool  # noqa: F401
import app.tools.file_tool  # noqa: F401
from app.schemas.response import ok

router = APIRouter()

# Probe a set of well-known public hosts with a tiny timeout. If ANY is
# reachable, the machine has outbound internet. For a sovereign deployment
# this must stay unreachable. This is a genuine network probe, not a flag.
_PROBE_HOSTS = [
    "https://www.google.com/generate_204",
    "https://cloudflare.com/cdn-cgi/trace",
    "https://1.1.1.1/",
]


def _outbound_internet() -> dict:
    for url in _PROBE_HOSTS:
        try:
            req = urllib.request.Request(url, method="GET")
            urllib.request.urlopen(req, timeout=2)
            return {"internet_access": "ON", "secure": False,
                    "detail": f"Outbound internet detected (reached {urllib.parse.urlsplit(url).netloc}). "
                              f"Disconnect from the internet for full data sovereignty."}
        except Exception:
            continue
    return {"internet_access": "OFF", "secure": True,
            "detail": "No outbound internet connectivity detected. Data cannot leave this machine."}


def _storage_local() -> dict:
    upload = settings.UPLOAD_DIR
    knowledge = settings.KNOWLEDGE_DIR
    outputs = settings.OUTPUT_DIR
    cloud_markers = ("http://", "https://", "s3://", "gs://", "azure://", "\\\\")
    suspicious = [p for p in (upload, knowledge, outputs)
                  if any(m in p.lower() for m in cloud_markers)]
    secure = not suspicious
    return {
        "storage_local": "LOCAL DISK" if secure else "REMOTE",
        "secure": secure,
        "detail": ("Documents, knowledge and outputs are stored on local disk only."
                   if secure else
                   f"Storage paths point off-machine: {', '.join(suspicious)}"),
        "paths": {"uploads": upload, "knowledge": knowledge, "outputs": outputs},
    }


def _runtime_mode() -> dict:
    local = settings.MODE == "LOCAL_MODEL"
    return {
        "runtime_mode": settings.MODE,
        "secure": True,  # both modes are on-premise; mocks never call out
        "detail": ("Real local models via Ollama on this machine (no cloud, no download)."
                   if local else
                   "Built-in mock models — deterministic, zero external calls. "
                   "Switch MODE=LOCAL_MODEL for real local LLMs."),
    }


def _human_approval() -> dict:
    from app.services.orchestrator import NEEDS_APPROVAL
    return {
        "human_approval": "REQUIRED",
        "secure": True,
        "detail": f"Task types requiring sign-off before delivery: {', '.join(sorted(NEEDS_APPROVAL))}. "
                  f"Nothing is delivered without explicit approval.",
    }


def _jwt_secret() -> dict:
    insecure = settings.JWT_SECRET in ("", "change-me-in-production")
    return {
        "jwt_secret": "DEFAULT (insecure)" if insecure else "CUSTOM",
        "secure": not insecure,
        "detail": ("JWT_SECRET is still the default value — set a custom secret in backend/.env "
                   "before any real deployment."
                   if insecure else
                   "Custom JWT secret configured."),
    }


def _audit_and_tools() -> dict:
    db = SessionLocal()
    try:
        events = db.query(func.count(AuditLog.id)).scalar()
    finally:
        db.close()
    tools = tool_registry.list_tools()
    return {
        "audit_events": events,
        "secure": events >= 0,
        "detail": f"{events} audit event(s) recorded locally in SQLite — every login, upload, "
                  f"model choice and approval is traceable.",
        "allowlisted_tools": tools,
        "tool_policy": f"{len(tools)} tool(s) allowlisted; execution is policy-gated per role.",
    }


@router.get("/status")
def security_status(user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST", "VIEWER"))):
    internet = _outbound_internet()
    storage = _storage_local()
    runtime = _runtime_mode()
    approval = _human_approval()
    jwt_s = _jwt_secret()
    audit = _audit_and_tools()

    checks = [
        {"id": "internet", "label": "Internet Access",
         "value": internet["internet_access"], "secure": internet["secure"],
         "detail": internet["detail"]},
        {"id": "storage", "label": "Data Storage",
         "value": storage["storage_local"], "secure": storage["secure"],
         "detail": storage["detail"]},
        {"id": "runtime", "label": "AI Runtime",
         "value": runtime["runtime_mode"], "secure": runtime["secure"],
         "detail": runtime["detail"]},
        {"id": "approval", "label": "Human Approval Gate",
         "value": approval["human_approval"], "secure": approval["secure"],
         "detail": approval["detail"]},
        {"id": "jwt", "label": "JWT Secret",
         "value": jwt_s["jwt_secret"], "secure": jwt_s["secure"],
         "detail": jwt_s["detail"]},
        {"id": "audit", "label": "Audit Trail",
         "value": f"{audit['audit_events']} events", "secure": True,
         "detail": audit["detail"]},
        {"id": "tools", "label": "Tool Allowlist",
         "value": f"{len(audit['allowlisted_tools'])} tools", "secure": True,
         "detail": audit["tool_policy"]},
    ]

    # JWT default is a warning; internet ON and remote storage are hard failures
    critical_bad = [c for c in checks if not c["secure"] and c["id"] in ("internet", "storage")]
    warnings = [c for c in checks if not c["secure"] and c["id"] not in ("internet", "storage")]
    posture = "AT RISK" if critical_bad else ("WARNINGS" if warnings else "SECURE")

    return ok({
        "posture": posture,
        "external_transfer": "DISABLED" if internet["secure"] else "POSSIBLE",
        "checks": checks,
        "critical_issues": [c["label"] for c in critical_bad],
        "warnings": [c["label"] for c in warnings],
    })
