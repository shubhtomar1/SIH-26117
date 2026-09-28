"""Demo-grade code runner: temp dir, subprocess, timeout, capped output.

NOT industrial-grade isolation — replace with OS/container/VM sandbox in production.
"""
import os
import subprocess
import sys
import tempfile
import time

from app.core.config import settings
from app.tools import register_tool
from app.tools.base import BaseTool


class CodeTool(BaseTool):
    name = "code_runner"
    description = "Execute short Python snippets in a temp dir with timeout."

    def execute(self, input_data: dict) -> dict:
        code = str(input_data.get("code", ""))[:8000]
        timeout = int(input_data.get("timeout", settings.CODE_TIMEOUT_SECONDS))
        os.makedirs(settings.SANDBOX_DIR, exist_ok=True)
        tmp = tempfile.mkdtemp(dir=os.path.abspath(settings.SANDBOX_DIR))
        script = os.path.join(tmp, "main.py")
        with open(script, "w", encoding="utf-8") as f:
            f.write(code)
        start = time.time()
        try:
            proc = subprocess.run(
                [sys.executable, script], capture_output=True, text=True,
                timeout=min(timeout, 30), cwd=tmp,
            )
            ms = int((time.time() - start) * 1000)
            return {
                "status": "passed" if proc.returncode == 0 else "failed",
                "stdout": proc.stdout[-4000:],
                "stderr": proc.stderr[-4000:],
                "execution_time_ms": ms,
            }
        except subprocess.TimeoutExpired:
            return {"status": "failed", "stdout": "", "stderr": "Timeout.", "execution_time_ms": timeout * 1000}


register_tool(CodeTool())
