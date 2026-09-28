"""Central configuration — everything comes from env, nothing hardcoded."""
import os


def _load_env_file() -> None:
    """Load backend/.env without overriding real environment variables."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = (
        os.path.normpath(os.path.join(here, "..", "..", ".env")),
        os.path.join(os.getcwd(), ".env"),
    )
    seen: set[str] = set()
    for path in candidates:
        path = os.path.abspath(path)
        if path in seen or not os.path.isfile(path):
            continue
        seen.add(path)
        with open(path, encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val


_load_env_file()


def _get(key: str, default: str) -> str:
    return os.getenv(key, default)


def _get_int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default


def _get_bool(key: str, default: bool) -> bool:
    return os.getenv(key, str(default)).lower() in ("1", "true", "yes", "on")


class Settings:
    APP_NAME: str = _get("APP_NAME", "Adrestia")
    APP_VERSION: str = _get("APP_VERSION", "0.1.0")
    DEBUG: bool = _get_bool("DEBUG", True)
    # MVP_MOCK = seeded fake models. LOCAL_MODEL = Ollama on this machine (no download).
    MODE: str = _get("MODE", "MVP_MOCK").upper()

    DATABASE_URL: str = _get("DATABASE_URL", "sqlite:///./data/adrestia.db")

    JWT_SECRET: str = _get("JWT_SECRET", "change-me-in-production")
    JWT_EXPIRE_MINUTES: int = _get_int("JWT_EXPIRE_MINUTES", 720)

    OFFLINE_MODE: bool = _get_bool("OFFLINE_MODE", True)

    UPLOAD_DIR: str = _get("UPLOAD_DIR", "./data/uploads")
    KNOWLEDGE_DIR: str = _get("KNOWLEDGE_DIR", "./data/knowledge")
    OUTPUT_DIR: str = _get("OUTPUT_DIR", "./data/outputs")
    SANDBOX_DIR: str = _get("SANDBOX_DIR", "./data/sandbox")

    MAX_FILE_SIZE_MB: int = _get_int("MAX_FILE_SIZE_MB", 25)
    TASK_TIMEOUT_SECONDS: int = _get_int("TASK_TIMEOUT_SECONDS", 60)
    CODE_TIMEOUT_SECONDS: int = _get_int("CODE_TIMEOUT_SECONDS", 10)

    OLLAMA_URL: str = _get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
    OLLAMA_MODEL: str = _get("OLLAMA_MODEL", "qwen2.5:0.5b")
    OLLAMA_CODER_MODEL: str = _get("OLLAMA_CODER_MODEL", "qwen2.5-coder:1.5b")
    OLLAMA_VISION_MODEL: str = _get("OLLAMA_VISION_MODEL", "qwen2.5vl:3b")


settings = Settings()
if settings.MODE not in ("MVP_MOCK", "LOCAL_MODEL"):
    settings.MODE = "MVP_MOCK"

ALLOWED_EXTENSIONS = {
    ".txt", ".md", ".csv", ".json", ".pdf", ".docx", ".xlsx", ".pptx",
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".py", ".js", ".ts", ".c", ".cpp",
}

TASK_STATUSES = {
    "CREATED", "POLICY_CHECK", "PLANNING", "RETRIEVING", "ROUTING",
    "EXECUTING", "VERIFYING", "WAITING_APPROVAL", "COMPLETED", "FAILED",
}

ROLES = ("ADMIN", "ENGINEER", "ANALYST", "VIEWER")
