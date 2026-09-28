"""MVP mock models. Same interface as future real models — frontend can't tell."""
from typing import Any

from app.model_adapters.base import BaseModelAdapter


class MockReasoningModel(BaseModelAdapter):
    name = "mock-reasoning"
    version = "1.0"
    capabilities = ["reasoning", "text_generation"]

    def generate(self, prompt: str, context: str | None = None, **kwargs: Any) -> dict:
        snippet = (context or "")[:400]
        findings = [
            "Pressure reading 8.6 bar exceeds the permitted 7.5 bar threshold.",
            "Lockout-tagout record missing for the 14 Feb maintenance window.",
            "Flange assembly A-2 torque below specification on 3 of 12 bolts.",
        ]
        return {
            "text": "Mock AI analysis generated successfully.",
            "confidence": 0.85,
            "findings": findings,
            "context_used": bool(snippet),
        }


class MockOCRModel(BaseModelAdapter):
    name = "mock-ocr"
    version = "1.0"
    capabilities = ["ocr", "vision"]

    def generate(self, prompt: str, context: str | None = None, **kwargs: Any) -> dict:
        filename = kwargs.get("filename", "document.pdf")
        return {
            "text": f"Mock OCR extraction completed for {filename}. 14 pages, 8 text regions detected.",
            "confidence": 0.9,
            "pages": 14,
        }


class MockCodingModel(BaseModelAdapter):
    name = "mock-coder"
    version = "1.0"
    capabilities = ["coding", "code_generation"]

    def generate(self, prompt: str, context: str | None = None, **kwargs: Any) -> dict:
        code = (
            "def pressure_loss(delta_p: float, length_m: float) -> float:\n"
            "    \"\"\"Mock generated: linear pressure loss estimate.\"\"\"\n"
            "    return round(delta_p * length_m / 100.0, 3)\n\n"
            "if __name__ == \"__main__\":\n"
            "    print(pressure_loss(250.0, 80.0))\n"
        )
        return {"text": "Mock code generated successfully.", "confidence": 0.88, "code": code}
