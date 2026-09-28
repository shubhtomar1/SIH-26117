"""Single JSON contract: every response uses {success, data, error}."""
from typing import Any

from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str


def ok(data: Any = None, status_code: int = 200) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"success": True, "data": data, "error": None})


def err(code: str, message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status_code,
                        content={"success": False, "data": None,
                                 "error": {"code": code, "message": message}})
