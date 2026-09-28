/* Typed client for the ADRESTIA backend envelope {success, data, error}. */

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

export const BACKEND_BASE = BASE;

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function req<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("BACKEND_OFFLINE", "Backend is not reachable. Start it: uvicorn app.main:app --reload (backend/).", 0);
  }
  const json = await res.json().catch(() => null);
  if (!json || json.success !== true) {
    const e = json?.error || { code: "REQUEST_FAILED", message: `HTTP ${res.status}` };
    throw new ApiError(e.code, e.message, res.status);
  }
  return json.data as T;
}

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export interface BackendFile { id: string; filename: string; type: string; needs_ocr: boolean }
export interface BackendModel {
  id: string; name: string; provider: string; type: string;
  capabilities: string[]; enabled: boolean; status: string;
}
export interface TaskShape {
  task_id: string; status: string; task_type: string;
  current_step: string | null; model: string | null; progress: number;
  result: { model_output?: { text?: string; confidence?: number; findings?: string[]; execution?: { status?: string; stdout?: string } }; verification?: { verified: boolean }; deliverables?: string[] };
}
export interface StepShape { step: string; status: string; result: string | null }
export interface EvidenceShape {
  claim: string; excerpt: string | null;
  source: { document_id: string | null; filename: string | null; page: number | null };
}
export interface KnowledgeDoc { id: string; filename: string; type: string; department: string }

export interface SecurityCheck {
  id: string; label: string; value: string; secure: boolean; detail: string;
}
export interface SecurityStatus {
  posture: "SECURE" | "WARNINGS" | "AT RISK";
  external_transfer: string;
  checks: SecurityCheck[];
  critical_issues: string[];
  warnings: string[];
}

export const api = {
  health: () => req<{ status: string; mode: string; ollama?: string; ollama_model?: string }>("/api/v1/health"),
  securityStatus: (token: string) =>
    req<SecurityStatus>("/api/v1/security/status", {}, token),
  login: (username: string, password: string) =>
    req<{ token: string; user: { username: string; role: string } }>("/api/v1/auth/login", { method: "POST", ...json({ username, password }) }),

  upload: (file: File, token: string) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<BackendFile>("/api/v1/files/upload", { method: "POST", body: fd }, token);
  },
  knowledgeDocs: (token: string) =>
    req<{ documents: KnowledgeDoc[] }>("/api/v1/knowledge/documents", {}, token),

  models: (token: string) =>
    req<{ models: BackendModel[] }>("/api/v1/models", {}, token),

  createTask: (token: string, task: string, task_type = "analysis", input_type = "text", file_ids: string[] = []) =>
    req<{ task_id: string; status: string }>("/api/v1/tasks", { method: "POST", ...json({ task, task_type, input_type, file_ids }) }, token),
  runTask: (token: string, id: string) =>
    req<TaskShape>(`/api/v1/tasks/${id}/run`, { method: "POST" }, token),
  taskStatus: (token: string, id: string) =>
    req<TaskShape>(`/api/v1/tasks/${id}`, {}, token),
  taskSteps: (token: string, id: string) =>
    req<{ steps: StepShape[] }>(`/api/v1/tasks/${id}/steps`, {}, token),
  taskEvidence: (token: string, id: string) =>
    req<{ evidence: EvidenceShape[] }>(`/api/v1/tasks/${id}/evidence`, {}, token),
  approve: (token: string, id: string, decision: "approve" | "reject") =>
    req<TaskShape>(`/api/v1/tasks/${id}/approve`, { method: "POST", ...json({ decision }) }, token),

  downloadDeliverable: async (token: string, id: string, format = "pdf"): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`${BASE}/api/v1/tasks/${id}/deliverable?format=${encodeURIComponent(format)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError("OUTPUT_GENERATION_FAILED", "Deliverable not ready.", res.status);
    const blob = await res.blob();
    const disp = res.headers.get("content-disposition") || "";
    const m = disp.match(/filename="?([^"]+)"?/);
    return { blob, filename: m ? m[1] : `Adrestia_Report_${id}.${format}` };
  },
};
