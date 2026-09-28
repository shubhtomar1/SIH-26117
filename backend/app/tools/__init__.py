"""Tool allowlist registry. Tools come from backend policy, never from model output."""
from app.tools.base import BaseTool

_TOOLS: dict[str, BaseTool] = {}


def register_tool(tool: BaseTool) -> None:
    _TOOLS[tool.name] = tool


class _Registry:
    def list_tools(self) -> list[str]:
        return sorted(_TOOLS.keys())

    def get(self, name: str) -> BaseTool:
        if name not in _TOOLS:
            raise KeyError(f"TOOL_NOT_ALLOWED: '{name}'")
        return _TOOLS[name]

    def describe(self) -> list[dict]:
        return [{"name": t.name, "description": t.description, "enabled": True} for t in _TOOLS.values()]


tool_registry = _Registry()

# Automatically register all built-in tools
from app.tools import calculator_tool, code_tool, document_tool, file_tool  # noqa: E402, F401

