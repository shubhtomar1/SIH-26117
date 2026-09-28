# ADRESTIA — Backend MVP (Sovereign AI Workbench)

Lightweight FastAPI + SQLite backend. **Mock models only** — no LLM download, no GPU,
runs on 4 GB RAM CPU-only Windows 10. Mode: `MVP_MOCK` (see `/api/v1/health`).

## Setup (Windows, cmd)

```bat
cd adrestia-backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Swagger: http://127.0.0.1:8000/docs

Default login: `admin` / `admin` (change after first login — MVP has no change-password UI yet).

Frontend: set `BACKEND_URL=http://127.0.0.1:8000` (frontend still uses mock UI until wired).

## Demo flow

1. `POST /api/v1/auth/login` → token
2. `POST /api/v1/files/upload` (inspection_report.pdf)
3. `POST /api/v1/tasks` → task_id
4. `POST /api/v1/tasks/{id}/run` → `WAITING_APPROVAL`
5. `GET /api/v1/tasks/{id}/evidence`
6. `POST /api/v1/tasks/{id}/approve` `{"decision":"approve"}`
7. `GET /api/v1/tasks/{id}/deliverable` → DOCX

## Add a future real model (no redesign)

1. Create `app/model_adapters/my_model.py` implementing `BaseModelAdapter`
2. `register_adapter("my-key", MyModel)` (e.g. in `registry.py`)
3. `POST /api/v1/models` with `{"id": "...", "adapter": "my-key", "capabilities": [...]}`

Orchestrator, router, RAG, APIs and frontend contract stay untouched.

## Tests

```bat
pytest -q
```

## Layout

`app/api` REST · `app/core` config/security/logging · `app/models` SQLite tables ·
`app/services` orchestrator/router/RAG/docs/verify/evidence/deliverable/policy ·
`app/model_adapters` plugin interface + mocks · `app/tools` allowlisted tools ·
`data/` sqlite, uploads, knowledge, outputs, sandbox · `logs/` local log file.
