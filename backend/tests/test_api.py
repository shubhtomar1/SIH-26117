"""End-to-end MVP tests (mock models, temp SQLite). Run:  pytest -q"""
import os
import time

os.environ["MODE"] = "MVP_MOCK"
TEST_DB = "./data/test_adrestia.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
for f in (TEST_DB,):
    if os.path.exists(f):
        os.remove(f)

from fastapi.testclient import TestClient  # noqa: E402

from app.models.database import init_db  # noqa: E402
from app.seed import seed  # noqa: E402

init_db()  # ensure data/ dir + tables exist even without lifespan
seed()

from app.main import app  # noqa: E402

client = TestClient(app)

TOKEN = ""


def auth():
    return {"Authorization": f"Bearer {TOKEN}"}


def wait_task(tid: str, *want: str, timeout: float = 20.0) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = client.get(f"/api/v1/tasks/{tid}", headers=auth())
        last = r.json()["data"]
        if last and last.get("status") in want:
            return last
        time.sleep(0.05)
    raise AssertionError(f"timeout waiting {want}, last={last}")


def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["success"]
    assert r.json()["data"]["mode"] == "MVP_MOCK"


def test_login():
    global TOKEN
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200 and r.json()["success"]
    TOKEN = r.json()["data"]["token"]
    bad = client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong"})
    assert bad.status_code == 401 and not bad.json()["success"]


def test_models_registry():
    r = client.get("/api/v1/models", headers=auth())
    ids = {m["id"] for m in r.json()["data"]["models"]}
    assert {"mock-reasoning", "mock-ocr", "mock-coder"} <= ids
    enabled = {m["id"] for m in r.json()["data"]["models"] if m["enabled"]}
    assert "mock-coder" in enabled
    assert "ollama-local" not in enabled


def test_router_selects_coding_model():
    r = client.post("/api/v1/tasks", headers=auth(),
                    json={"task": "Write Python code to calculate pressure loss",
                          "task_type": "coding", "input_type": "code"})
    tid = r.json()["data"]["task_id"]
    r = client.post(f"/api/v1/tasks/{tid}/run", headers=auth())
    assert r.json()["success"]
    data = wait_task(tid, "COMPLETED", "FAILED")
    assert data["status"] == "COMPLETED"
    assert data["model"] == "mock-coder"


def test_file_upload_and_validation():
    r = client.post("/api/v1/files/upload", headers=auth(),
                    files={"file": ("note.txt", b"pressure test 7.5 bar", "text/plain")})
    assert r.json()["success"]
    bad = client.post("/api/v1/files/upload", headers=auth(),
                      files={"file": ("evil.exe", b"x", "application/octet-stream")})
    assert not bad.json()["success"]
    assert bad.json()["error"]["code"] in ("POLICY_DENIED", "UNSUPPORTED_FILE")


def test_knowledge_search():
    r = client.post("/api/v1/knowledge/index", headers=auth(),
                    json={"filename": "SOP_Test.txt", "content": "Pressure testing range is 7.5 bar maximum.",
                          "department": "safety"})
    assert r.json()["success"]
    r = client.get("/api/v1/knowledge/search", headers=auth(), params={"q": "pressure range"})
    assert len(r.json()["data"]["results"]) > 0


def test_analysis_task_approval_flow():
    r = client.post("/api/v1/tasks", headers=auth(),
                    json={"task": "Analyze this inspection report and prepare an approval note.",
                          "task_type": "analysis"})
    tid = r.json()["data"]["task_id"]
    r = client.post(f"/api/v1/tasks/{tid}/run", headers=auth())
    assert r.json()["success"]
    data = wait_task(tid, "WAITING_APPROVAL", "FAILED")
    assert data["status"] == "WAITING_APPROVAL"
    steps = client.get(f"/api/v1/tasks/{tid}/steps", headers=auth()).json()["data"]["steps"]
    assert len(steps) >= 6
    ev = client.get(f"/api/v1/tasks/{tid}/evidence", headers=auth()).json()["data"]["evidence"]
    assert len(ev) > 0
    r = client.post(f"/api/v1/tasks/{tid}/approve", headers=auth(), json={"decision": "approve"})
    assert r.json()["data"]["status"] == "COMPLETED"
    dl = client.get(f"/api/v1/tasks/{tid}/deliverable", headers=auth())
    assert dl.status_code == 200 and len(dl.content) > 100


def test_tools():
    r = client.get("/api/v1/tools", headers=auth())
    assert "calculator" in [t["name"] for t in r.json()["data"]["tools"]]
    r = client.post("/api/v1/tools/execute", headers=auth(),
                    json={"tool": "calculator", "input": {"expression": "(25 * 4) / 5"}})
    assert r.json()["data"]["result"]["result"] == 20
    bad = client.post("/api/v1/tools/execute", headers=auth(),
                      json={"tool": "nope", "input": {}})
    assert not bad.json()["success"]


def test_rbac_and_audit():
    r = client.post("/api/v1/tasks", json={"task": "x"})  # no token
    assert r.status_code in (401, 403)
    r = client.get("/api/v1/system/status", headers=auth())
    assert r.json()["data"]["audit_events"] > 0
