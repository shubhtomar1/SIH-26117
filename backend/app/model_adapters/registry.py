"""Adapter registry. New model = new file + one register_adapter() call.

Nothing in orchestrator / router / APIs needs to change.
"""
from app.model_adapters.base import BaseModelAdapter
from app.model_adapters.mock_model import MockCodingModel, MockOCRModel, MockReasoningModel
from app.model_adapters.ollama_model import OllamaAdapter, OllamaVisionAdapter

_ADAPTERS: dict[str, type[BaseModelAdapter]] = {}


def register_adapter(key: str, cls: type[BaseModelAdapter]) -> None:
    _ADAPTERS[key] = cls


def get_adapter(key: str) -> BaseModelAdapter:
    if key not in _ADAPTERS:
        raise KeyError(f"Unknown adapter: {key}")
    return _ADAPTERS[key]()


def list_adapters() -> dict[str, dict]:
    return {
        key: {"name": cls.name, "version": cls.version, "capabilities": cls.capabilities}
        for key, cls in _ADAPTERS.items()
    }


# built-in MVP adapters
register_adapter("mock-reasoning", MockReasoningModel)
register_adapter("mock-ocr", MockOCRModel)
register_adapter("mock-coder", MockCodingModel)

# real local models via Ollama (needs `ollama serve` + pulled model; see ollama_model.py)
register_adapter("ollama", OllamaAdapter)
register_adapter("ollama-vision", OllamaVisionAdapter)
