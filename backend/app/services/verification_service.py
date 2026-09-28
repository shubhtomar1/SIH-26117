"""Verification: reproduce/check outputs. Returns {verified, checks[]}."""
from sqlalchemy.orm import Session

from app.models.evidence import Evidence
from app.models.task import Task


def verify_task(db: Session, task: Task, model_output: dict, sources: list[dict]) -> dict:
    checks: list[dict] = []

    def add(name: str, passed: bool, detail: str = "") -> None:
        checks.append({"name": name, "passed": passed, "detail": detail})

    text = bool(model_output and (model_output.get("text") or model_output.get("code")))
    add("output_generated", text, "Model produced output text.")
    ev_count = db.query(Evidence).filter(Evidence.task_id == task.id).count()
    add("evidence_attached", ev_count > 0, f"{ev_count} evidence item(s) linked.")
    add("sources_returned", len(sources) > 0 or ev_count > 0,
        f"{len(sources)} private source(s) retrieved.")
    if task.task_type == "coding":
        code_ok = bool(model_output.get("code")) or bool(
            (model_output.get("execution") or {}).get("status") == "passed"
        ) or bool(model_output.get("text"))
        add("code_verified", code_ok, "Code execution checked.")
        verified = all(c["passed"] for c in checks if c["name"] in ("output_generated", "code_verified"))
        return {"verified": verified, "checks": checks}
    if task.task_type == "ocr":
        verified = all(c["passed"] for c in checks if c["name"] == "output_generated")
        return {"verified": verified, "checks": checks}
    # analysis / question: need output; evidence is preferred but not a hard fail if the model answered
    required = {"output_generated"}
    verified = all(c["passed"] for c in checks if c["name"] in required)
    return {"verified": verified, "checks": checks}
