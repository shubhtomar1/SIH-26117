from fastapi import APIRouter, Depends

from app.core.security import require_roles
from app.models.database import get_db
from app.schemas.response import err, ok
from app.schemas.task import ToolExec
from app.services import audit as audit_svc
from app.services.policy import PolicyDenied, check
from app.tools import tool_registry

# import tool modules so they self-register
import app.tools.calculator_tool  # noqa: F401
import app.tools.code_tool  # noqa: F401
import app.tools.document_tool  # noqa: F401
import app.tools.file_tool  # noqa: F401

router = APIRouter()


@router.get("")
def list_tools(user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST", "VIEWER"))):
    return ok({"tools": tool_registry.describe()})


@router.post("/execute")
def execute(body: ToolExec, user=Depends(require_roles("ADMIN", "ENGINEER", "ANALYST")),
            db=Depends(get_db)):
    try:
        check(user, "use_tools", tool=body.tool)
        result = tool_registry.get(body.tool).execute(body.input or {})
    except PolicyDenied as exc:
        return err("POLICY_DENIED", exc.reason, 403)
    except KeyError as exc:
        return err("TOOL_NOT_ALLOWED", str(exc), 403)
    audit_svc.log_action(db, "TOOL_EXECUTED", "tools", result.get("status", "ok"), user.id, details=body.tool)
    return ok({"tool": body.tool, "result": result})
