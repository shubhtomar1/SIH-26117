"""Tool interface. All tools run under backend policy, never on model authority."""
from typing import Any


class BaseTool:
    name: str = "base"
    description: str = ""

    def execute(self, input_data: dict) -> dict[str, Any]:
        raise NotImplementedError
