"""Model-agnostic interface. Real models plug in here later — nothing else changes."""
from typing import Any


class BaseModelAdapter:
    name: str = "base"
    version: str = "1.0"
    capabilities: list[str] = []

    def generate(self, prompt: str, context: str | None = None, **kwargs: Any) -> dict:
        raise NotImplementedError

    def health_check(self) -> dict:
        return {"name": self.name, "status": "available", "capabilities": self.capabilities}
