"""Ollama adapters — real local open-weight models via Ollama's HTTP API.

Stdlib only (urllib): no torch, no GPU, no heavy deps. RAM-friendly defaults
for a 4 GB machine — override with env:

    OLLAMA_URL=http://localhost:11434
    OLLAMA_MODEL=qwen2.5:1.5b        (reasoning / coding)
    OLLAMA_VISION_MODEL=qwen2.5vl:3b (ocr / vision — 3B vision-language, fits low RAM)

Setup once:
    ollama pull qwen2.5:1.5b
    ollama pull qwen2.5vl:3b

Then register metadata (no download happens here):
    POST /api/v1/models
    {"id": "qwen-local", "name": "Qwen Local", "adapter": "ollama",
     "capabilities": ["reasoning", "text_generation", "coding"]}

The router picks it automatically; mocks can stay as fallback or be disabled.
"""
import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any

from app.core.config import settings
from app.core.logging import log
from app.model_adapters.base import BaseModelAdapter

OLLAMA_URL = settings.OLLAMA_URL
OLLAMA_MODEL = settings.OLLAMA_MODEL
OLLAMA_VISION_MODEL = settings.OLLAMA_VISION_MODEL


def _generate(model: str, prompt: str, images: list[str] | None = None,
              timeout: int = 120, system: str | None = None, max_tokens: int = 500) -> dict:
    body: dict[str, Any] = {
        "model": model,
        "stream": False,
        "prompt": prompt,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.2,
            "top_k": 30,
            "top_p": 0.9,
            "repeat_penalty": 1.15,
        },
    }
    if system:
        body["system"] = system
    if images:
        body["images"] = images
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            out = json.loads(res.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:400]
        raise ConnectionError(
            f"Ollama rejected model '{model}' ({exc.code}). "
            f"Install it on this machine with: ollama pull {model}. {detail}"
        ) from exc
    except TimeoutError as exc:
        raise TimeoutError(
            f"Ollama generation timed out after {timeout}s for model '{model}'."
        ) from exc
    except OSError as exc:
        raise ConnectionError(
            f"Ollama not reachable at {OLLAMA_URL}. Start it with 'ollama serve'. "
            f"This project does not download models."
        ) from exc
    return {"text": out.get("response", ""), "confidence": 0.9, "model": model}


SYSTEM_PROMPT = (
    "You are Adrestia, an expert industrial and technical AI assistant. "
    "Respond in a formal, authoritative, clear, and comprehensive manner. "
    "Structure your response with logical headings, numbered points, or bullet points. "
    "Maintain strict factual accuracy and technical precision. "
    "Base your response on the provided context when available. "
    "Do not repeat prompt instructions or raw internal markers."
)

GENERAL_SYSTEM_PROMPT = (
    "You are Adrestia, an intelligent, helpful, and concise AI workbench assistant. "
    "For greetings or conversational inputs, respond warmly, politely, and briefly in 1-2 sentences. "
    "For general knowledge, factual, or conceptual questions, provide direct, concise, and accurate answers based on standard world knowledge. "
    "Do not provide refusal disclaimers or claim you cannot answer general knowledge questions."
)

VISION_SYSTEM_PROMPT = (
    "You are Adrestia, an expert engineering and industrial visual AI assistant. "
    "Always provide formal, rigorous, comprehensive, and technically accurate responses. "
    "Analyze the provided image with high technical precision based strictly on what is visually present in the image. "
    "Do not invent or assume labels, section cuts, notches, or components that are not visible."
)


class OllamaAdapter(BaseModelAdapter):
    """Real local reasoning/coding model (e.g. qwen2.5, llama3.2)."""

    name = "ollama"
    version = "1.0"
    capabilities = ["reasoning", "text_generation", "coding", "code_generation"]

    def __init__(self, model: str | None = None):
        self.model = model or OLLAMA_MODEL

    def generate(self, prompt: str, context: str | None = None, **kwargs: Any) -> dict:
        if context and context.strip():
            full = (
                f"### Reference Context:\n{context.strip()[:8000]}\n\n"
                f"### User Request:\n{prompt.strip()}\n\n"
                f"### Answer:\n"
            )
            sys_prompt = SYSTEM_PROMPT
        else:
            full = prompt.strip()
            sys_prompt = GENERAL_SYSTEM_PROMPT
        out = _generate(self.model, full, system=sys_prompt, max_tokens=kwargs.get("max_tokens", 500))
        text = out["text"]
        code = None
        if "```" in text:  # pull fenced code block out for the sandbox runner
            parts = text.split("```")
            for i in range(1, len(parts), 2):
                block = parts[i]
                if block.lstrip().startswith("python"):
                    block = block.split("\n", 1)[1] if "\n" in block else ""
                if block.strip():
                    code = block.strip()
                    break
        out["code"] = code
        return out

    def health_check(self) -> dict:
        base = super().health_check()
        try:
            urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=5).read()
            base["status"] = "available"
        except OSError:
            base["status"] = "ollama_offline"
        base["model"] = self.model
        return base


class OllamaVisionAdapter(BaseModelAdapter):
    """Real local vision model (e.g. qwen2.5vl:3b) for OCR / image tasks."""

    name = "ollama-vision"
    version = "1.0"
    capabilities = ["ocr", "vision"]

    def __init__(self, model: str | None = None):
        self.model = model or OLLAMA_VISION_MODEL

    def generate(self, prompt: str, context: str | None = None, **kwargs: Any) -> dict:
        images: list[str] = []
        if kwargs.get("image_b64"):
            images.append(str(kwargs["image_b64"]))
        elif kwargs.get("image_path"):
            path_str = str(kwargs["image_path"])
            ext = os.path.splitext(path_str)[1].lower()
            if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"):
                with open(path_str, "rb") as f:
                    images.append(base64.b64encode(f.read()).decode())
            else:
                log.warning(f"OLLAMA_VISION_NON_IMAGE path={path_str} ext={ext} ignored")

        clean_prompt = prompt.strip() if prompt else "Analyze the attached image in detail."
        if context and context.strip():
            full_prompt = (
                f"### Reference Context:\n{context.strip()[:6000]}\n\n"
                f"### User Request:\n{clean_prompt}\n\n"
                f"### Answer:\n"
            )
        else:
            full_prompt = clean_prompt

        # VL models (e.g. qwen2.5vl:3b) can take time on detailed drawings — allow 300s.
        out = _generate(
            self.model,
            full_prompt,
            images or None,
            timeout=300,
            system=VISION_SYSTEM_PROMPT,
            max_tokens=kwargs.get("max_tokens", 1500),
        )
        out["pages"] = 1
        return out
