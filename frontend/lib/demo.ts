export type StageStatus = "pending" | "running" | "completed";
export type PlanStatus = "pending" | "running" | "completed" | "warning";
export type WorkspacePhase =
  | "ready"
  | "uploading"
  | "processing"
  | "verifying"
  | "approval"
  | "completed";

export interface WorkflowStage {
  id: string;
  label: string;
  detail: string;
}

export interface PlanItem {
  label: string;
}

export interface Finding {
  id: string;
  title: string;
  description: string;
  source: string;
  page: string;
  confidence: number;
  status: "verified" | "review";
  evidenceText: string;
}

export const STAGES: WorkflowStage[] = [
  { id: "input", label: "Input", detail: "Confidential documents ingested locally. No external transfer." },
  { id: "understand", label: "Understand", detail: "inspection_report.pdf — technical report, 14 pages, 8 inspection findings detected." },
  { id: "retrieve", label: "Retrieve", detail: "Searching configured internal knowledge (private RAG, on-premise)." },
  { id: "plan", label: "Plan", detail: "Agent plan generated: 6 steps covering read → extract → compare → verify → deliver." },
  { id: "execute", label: "Execute", detail: "Comparing findings against SOP sections in sandboxed execution." },
  { id: "verify", label: "Verify", detail: "Evidence coverage check + confidence scoring per finding." },
  { id: "deliver", label: "Deliver", detail: "Verified deliverable assembled after human approval." },
];

export const PLAN_STEPS: string[] = [
  "Read inspection report",
  "Extract safety findings",
  "Retrieve relevant SOP sections",
  "Compare findings against SOP",
  "Verify conclusions",
  "Generate approval report",
];

export const SOURCES = [
  { name: "Safety_Manual_2026.pdf", ref: "Page 42 · Inspection Requirements", active: true },
  { name: "Turbine_SOP_v3.pdf", ref: "Section 7.2 · Pressure Systems", active: true },
  { name: "Maintenance_Guidelines.pdf", ref: "Section 4 · Torque & Fastening", active: true },
];

export const ROUTER_ROWS = [
  { task: "OCR", model: "OCR Engine", note: "scan → text" },
  { task: "Vision", model: "Vision Model", note: "drawing → regions" },
  { task: "Reasoning", model: "Reasoning Model", note: "compare → conclude" },
  { task: "Generation", model: "Language Model", note: "report → deliverable" },
];

export const FINDINGS: Finding[] = [
  {
    id: "01",
    title: "Pressure reading exceeds permitted threshold",
    description: "Unit T-04 recorded 8.6 bar against a permitted maximum of 7.5 bar during routine inspection cycle.",
    source: "Safety Manual",
    page: "Page 42",
    confidence: 94,
    status: "verified",
    evidenceText: "§4.2 — Pressure vessels shall not exceed 7.5 bar under routine operation. Any reading above this threshold must be flagged as a safety violation and escalated for approval.",
  },
  {
    id: "02",
    title: "Missing lockout-tagout record for maintenance window",
    description: "Maintenance log for 14 Feb shows turbine servicing without an attached LOTO certificate.",
    source: "Turbine SOP",
    page: "Section 7.2",
    confidence: 91,
    status: "verified",
    evidenceText: "§7.2 — No maintenance activity shall commence without a signed lockout-tagout certificate attached to the work order.",
  },
  {
    id: "03",
    title: "Torque values on flange bolts below specification",
    description: "3 of 12 flange bolts on assembly A-2 torqued to 180 Nm vs required 220 Nm.",
    source: "Maintenance Guidelines",
    page: "Section 4",
    confidence: 89,
    status: "verified",
    evidenceText: "§4.1 — Flange assembly A-2 fasteners shall be torqued to 220 Nm ± 5 Nm and re-verified after thermal cycle.",
  },
  {
    id: "04",
    title: "Unresolved vibration anomaly — bearing B-7",
    description: "Vibration at 4.3 mm/s exceeds 2.8 mm/s advisory limit; root cause not documented.",
    source: "Safety Manual",
    page: "Page 47",
    confidence: 76,
    status: "review",
    evidenceText: "§4.9 — Vibration exceeding 2.8 mm/s requires documented root-cause analysis before clearance. Current report references the reading without a concluded cause.",
  },
];

export const DEMO_FILES = [
  { name: "inspection_report.pdf", meta: "PDF · 4.2 MB", icon: "pdf" },
  { name: "safety_manual.pdf", meta: "PDF · 11.8 MB", icon: "pdf" },
];

export const AUDIT_BASE = [
  { t: "19:32", label: "Document uploaded" },
  { t: "19:33", label: "Document understood" },
  { t: "19:34", label: "Private sources retrieved" },
  { t: "19:35", label: "Agent plan created" },
  { t: "19:37", label: "Analysis completed" },
  { t: "19:38", label: "Human approval granted" },
  { t: "19:39", label: "Deliverable generated" },
];

export const DEMO_TASK =
  "Analyze the inspection report and identify safety violations according to the internal safety manual. Generate a verified approval report.";

export const SUGGESTED = [
  { title: "Analyze Document", desc: "Extract findings from a technical document.", task: "Analyze the inspection report and extract all technical findings with evidence." },
  { title: "Compare with SOP", desc: "Check a document against internal procedures.", task: "Compare the inspection report against the internal safety manual and flag violations." },
  { title: "Generate Report", desc: "Create a verified technical deliverable.", task: DEMO_TASK },
  { title: "Review Drawing", desc: "Analyze an engineering drawing or image.", task: "Review the turbine blueprint and list dimensional deviations from SOP." },
];
