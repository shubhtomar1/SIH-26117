"""Policy gate: every task passes through here first. 403 POLICY_DENIED on failure."""
from app.core.security import can


class PolicyDenied(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def check(user, action: str, file_type: str | None = None, tool: str | None = None) -> None:
    from app.core.config import ALLOWED_EXTENSIONS

    if not can(user.role, action):
        raise PolicyDenied(f"Role '{user.role}' may not perform '{action}'.")
    if file_type and file_type.lower() not in ALLOWED_EXTENSIONS:
        raise PolicyDenied(f"File type '{file_type}' is not allowed.")
    if tool and action == "use_tools":
        from app.tools import tool_registry

        if tool not in tool_registry.list_tools():
            raise PolicyDenied(f"Tool '{tool}' is not allowlisted.")
