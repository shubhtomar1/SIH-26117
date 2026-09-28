"""Controlled file access — only data/uploads, data/knowledge, data/outputs."""
import os

from app.core.config import settings
from app.tools import register_tool
from app.tools.base import BaseTool

ALLOWED_DIRS = [
    os.path.abspath(settings.UPLOAD_DIR),
    os.path.abspath(settings.KNOWLEDGE_DIR),
    os.path.abspath(settings.OUTPUT_DIR),
]


def _resolve(path: str) -> str:
    full = os.path.abspath(path)
    if not any(full == d or full.startswith(d + os.sep) for d in ALLOWED_DIRS):
        raise PermissionError("Path outside restricted directories.")
    return full


class FileTool(BaseTool):
    name = "file_reader"
    description = "Read files and list directories inside restricted data folders."

    def execute(self, input_data: dict) -> dict:
        op = input_data.get("operation", "read")
        try:
            if op == "list":
                target = _resolve(input_data.get("path", settings.OUTPUT_DIR))
                if not os.path.isdir(target):
                    return {"status": "failed", "error": "Not a directory."}
                return {"status": "passed", "files": sorted(os.listdir(target))[:100]}
            target = _resolve(input_data.get("path", ""))
            with open(target, "r", encoding="utf-8", errors="ignore") as f:
                return {"status": "passed", "path": target, "content": f.read(8000)}
        except Exception as exc:
            return {"status": "failed", "error": str(exc)}


register_tool(FileTool())
