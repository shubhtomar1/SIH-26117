"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight, Paperclip, FileText, Image as ImageIcon, ShieldCheck, ShieldAlert,
  X, Eye, Download, ChevronDown, ChevronRight, ChevronDown as ChevronDownIcon, AlertTriangle, Lock, CheckCircle2,
  FileDown, Table2, FileBarChart, Activity, Check, Copy, Wifi, WifiOff, HardDrive, RefreshCw, Plus, History, Trash2,
  Play, Code2, SquareTerminal, ZoomIn, ZoomOut, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, SectionLabel, ProgressBar, StatusDot } from "@/components/ui";
import { api, ApiError, BACKEND_BASE, type BackendModel, type EvidenceShape, type SecurityCheck, type SecurityStatus, type StepShape, type TaskShape } from "@/lib/api";
import {
  STAGES, SOURCES,
  DEMO_TASK, SUGGESTED,
  type WorkspacePhase,
} from "@/lib/demo";

interface AttachedFile { id: string; name: string; demo?: boolean; previewUrl?: string }
interface ChatMsg { role: "user" | "ai"; text: string; files?: AttachedFile[] }
interface SavedChat {
  id: string;
  title: string;
  savedAt: number;
  messages: ChatMsg[];
  findings: Finding[];
  taskId: string | null;
  phase: WorkspacePhase;
}
interface Finding {
  id: string; title: string; source: string; page: string;
  confidence: number; status: "verified" | "review";
  evidenceText: string;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.svg,.py,.js,.ts,.c,.cpp,.txt,.md,.csv,.json,.docx,.xlsx,.pptx";
const PHASE_LABEL: Record<WorkspacePhase, string> = {
  ready: "Ready", uploading: "Uploading", processing: "Processing",
  verifying: "Verifying", approval: "Awaiting approval", completed: "Completed",
};

/* backend step -> frontend stage index (0..6) */
const STEP_TO_STAGE: Record<string, number> = {
  policy_check: 0, planning: 3, document_retrieval: 2, model_selection: 3,
  execution: 4, verification: 5, approval: 6, delivery: 6,
};
const STATUS_TO_STAGE: Record<string, number> = {
  POLICY_CHECK: 0, PLANNING: 3, RETRIEVING: 2, ROUTING: 3,
  EXECUTING: 4, VERIFYING: 5, WAITING_APPROVAL: 6,
  COMPLETED: 6, FAILED: 6,
};

/* ---------- fenced code block rendering (ChatGPT-style) ---------- */

const LANGUAGE_LABELS: Record<string, string> = {
  js: "JavaScript", jsx: "JavaScript", javascript: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript", typescript: "TypeScript",
  py: "Python", python: "Python",
  html: "HTML", css: "CSS", json: "JSON", yaml: "YAML", yml: "YAML",
  sh: "Shell", bash: "Shell", zsh: "Shell", shell: "Shell",
  sql: "SQL", java: "Java", c: "C", cpp: "C++", "c++": "C++", cs: "C#",
  go: "Go", rust: "Rust", rb: "Ruby", ruby: "Ruby", php: "PHP",
  swift: "Swift", kotlin: "Kotlin", md: "Markdown", markdown: "Markdown",
  txt: "Text", text: "Text", "": "Code",
};

function languageLabel(lang: string): string {
  return (LANGUAGE_LABELS[lang.trim().toLowerCase()] ?? lang.trim().toUpperCase()) || "Code";
}

/** HTML syntax highlight — VSCode Dark+-like colors to match the reference box. */
function highlightHtml(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let key = 0;
  const push = (cls: string, s: string) => { if (s) out.push(<span key={key++} className={cls}>{s}</span>); };
  // Split into comment / doctype / tag / text chunks
  const CHUNK_RE = /(<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<[^>]*>)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  // fresh regex per call (global flag keeps lastIndex)
  CHUNK_RE.lastIndex = 0;
  const renderTag = (tag: string) => {
    // comment or doctype
    if (tag.startsWith("<!--")) { push("text-white/35 italic", tag); return; }
    if (/^<!doctype/i.test(tag)) { push("text-pink-300/80", tag); return; }
    // parse < /tagname attrs... /?>
    const TAG_RE = /(<\/?)([a-zA-Z][a-zA-Z0-9-]*)?([\s\S]*?)(\/?>)$/;
    const tm = TAG_RE.exec(tag);
    if (!tm) { push("text-sky-400", tag); return; }
    const [, open, name, attrs, close] = tm;
    push("text-sky-400/80", open);
    if (name) push("text-sky-400", name);
    if (attrs) {
      const ATTR_RE = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(\s*=\s*)("[^"]*"|'[^']*')|([a-zA-Z_:][a-zA-Z0-9_:.-]*)/g;
      let alast = 0;
      let am: RegExpExecArray | null;
      while ((am = ATTR_RE.exec(attrs)) !== null) {
        if (am.index > alast) push("text-white/80", attrs.slice(alast, am.index));
        if (am[1]) {
          push("text-amber-200/90", am[1]); // attr name (yellowish like screenshot)
          if (am[2]) push("text-white/50", am[2]); // =
          if (am[3]) push("text-emerald-300/90", am[3]); // "value" (green like screenshot)
        } else if (am[4]) {
          push("text-amber-200/90", am[4]);
        }
        alast = am.index + am[0].length;
        if (am[0].length === 0) ATTR_RE.lastIndex++;
      }
      if (alast < attrs.length) push("text-white/80", attrs.slice(alast));
    }
    push("text-sky-400/80", close);
  };
  while ((m = CHUNK_RE.exec(code)) !== null) {
    if (m.index > last) push("text-white/90", code.slice(last, m.index)); // text content (white)
    renderTag(m[0]);
    last = m.index + m[0].length;
    if (m[0].length === 0) CHUNK_RE.lastIndex++;
  }
  if (last < code.length) push("text-white/90", code.slice(last));
  return out;
}

/** Minimal regex tokenizer — good enough for chat code blocks, no deps. */
function highlightCode(code: string, lang = ""): ReactNode[] {
  const l = lang.trim().toLowerCase();
  if (l === "html" || l === "xml" || l === "vue" || l === "svelte") return highlightHtml(code);
  const TOKEN_RE = /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|'''[\s\S]*?'''|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\b(?:def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|global|nonlocal|assert|del|async|await|match|case|function|const|let|var|new|typeof|instanceof|in|of|do|switch|throw|catch|extends|public|private|protected|static|void|struct|enum|impl|fn|mut|pub|use|package|interface|type)\b|\b(?:True|False|None|null|undefined|true|false|nil)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9_]*\b|\b[a-zA-Z_]\w*(?=\())/g;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const push = (cls: string, s: string) => { if (s) out.push(<span key={key++} className={cls}>{s}</span>); };
  for (let m = TOKEN_RE.exec(code); m !== null; m = TOKEN_RE.exec(code)) {
    push("", code.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("#") || t.startsWith("//") || t.startsWith("/*") || t.startsWith("'''") || t.startsWith('\"\"\"')) push("text-white/35 italic", t);
    else if (t.startsWith('"') || t.startsWith("'") || t.startsWith("`")) push("text-emerald-300", t);
    else if (/^\d/.test(t)) push("text-orange-300", t);
    else if (/^[A-Z]/.test(t)) push("text-amber-200/90", t);
    else if (/^(def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|global|nonlocal|assert|del|async|await|match|case|function|const|let|var|new|typeof|instanceof|in|of|do|switch|throw|catch|extends|public|private|protected|static|void|struct|enum|impl|fn|mut|pub|use|package|interface|type)$/.test(t)) push("text-sky-300 font-medium", t);
    else push("text-purple-300", t); // function call
    last = m.index + t.length;
  }
  push("", code.slice(last));
  return out;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); } catch {
      // clipboard API unavailable (http, permissions) — fall back silently
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const preview = () => {
    // For HTML: render live preview in a new tab. For anything else: just copy-preview via blob download.
    const l = lang.trim().toLowerCase();
    try {
      const type = l === "html" || l === "xml" ? "text/html" : "text/plain";
      const blob = new Blob([code], { type });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { /* popup blocked — ignore */ }
  };
  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-white/10 bg-[#232326] shadow-2xl">
      {/* header like reference: [icon] LANG ......... </>  play  copy */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-white/90">
          <SquareTerminal size={17} className="text-white/80" />
          {languageLabel(lang)}
        </span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => setWrapped((v) => !v)}
            className={cn(
              "rounded-full p-2 transition",
              wrapped ? "bg-white/15 text-white" : "bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white",
            )}
            title={wrapped ? "No wrap" : "Wrap lines"}
          >
            <Code2 size={15} />
          </button>
          <button
            onClick={preview}
            className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            title={lang.trim().toLowerCase() === "html" ? "Preview HTML in new tab" : "Open code in new tab"}
          >
            <Play size={15} />
          </button>
          <button
            onClick={() => void copy()}
            className={cn(
              "rounded-full p-2 transition",
              copied ? "text-emerald-300" : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
            title="Copy code"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </span>
      </div>
      <pre
        className={cn(
          "max-h-[480px] overflow-auto px-5 pb-5 pt-1 font-mono text-[13px] leading-[1.7]",
          wrapped ? "whitespace-pre-wrap break-words" : "overflow-x-auto",
        )}
      >
        <code>{highlightCode(code, lang)}</code>
      </pre>
    </div>
  );
}

/** Splits an AI message into prose / fenced-code segments.
 *  Handles ```lang\ncode``` (with optional closing fence) and ```text```. */
function splitFencedBlocks(text: string): Array<{ type: "code"; lang: string; code: string } | { type: "text"; text: string }> {
  const segs: Array<{ type: "code"; lang: string; code: string } | { type: "text"; text: string }> = [];
  // Matches ```lang?\ncode```  OR  unclosed ```lang?\ncode (till end of string)
  const FENCE_RE = /```([a-zA-Z0-9_+#+-]*)\s*\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(text)) !== null) {
    const start = m.index;
    // Only treat it as a fence if there is code OR a closing ```.
    // This avoids eating plain text when regex hits end-of-string with no fence.
    const hasClosing = m[0].endsWith("```");
    const lang = (m[1] || "").trim();
    let code = m[2] || "";
    // Strip one leading newline and trailing fence whitespace
    code = code.replace(/^\n/, "").replace(/\n\s*$/, "");
    if (start > last) {
      segs.push({ type: "text", text: text.slice(last, start) });
    }
    if (code || hasClosing || lang) {
      segs.push({ type: "code", lang, code });
    } else {
      // Not really a code block — put it back as text
      segs.push({ type: "text", text: m[0] });
    }
    last = start + m[0].length;
    // Guard against zero-length matches looping forever
    if (m[0].length === 0) {
      FENCE_RE.lastIndex++;
    }
  }
  if (last < text.length) {
    segs.push({ type: "text", text: text.slice(last) });
  }
  if (!segs.length) {
    segs.push({ type: "text", text });
  }
  return segs;
}

function FormattedMessage({ text }: { text: string }) {
  if (!text) return null;

  const renderInline = (str: string) => {
    // Splits by **bold**, __bold__, `code`, or *italic*
    const parts = str.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*)/g);
    return parts.map((part, idx) => {
      if (
        (part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
        (part.startsWith("__") && part.endsWith("__") && part.length >= 4)
      ) {
        const inner = part.slice(2, -2);
        return (
          <strong key={idx} className="font-semibold text-white tracking-wide underline decoration-white/30 underline-offset-2">
            {inner}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        return (
          <code key={idx} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-emerald-300">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
        return (
          <em key={idx} className="italic text-white/90">
            {part.slice(1, -1)}
          </em>
        );
      }
      return part;
    });
  };

  const renderContent = (content: string) => {
    // If it starts with a key like "Problem: text" or "Solution: text" without asterisks, highlight the label
    const colonMatch = content.match(/^([A-Za-z0-9\s]{2,25}):\s*(.*)$/);
    if (colonMatch && !content.startsWith("**") && !content.startsWith("__")) {
      return (
        <>
          <strong className="font-semibold text-white/95 underline decoration-white/20 underline-offset-2">
            {colonMatch[1]}:
          </strong>{" "}
          {renderInline(colonMatch[2])}
        </>
      );
    }
    return renderInline(content);
  };

  const renderTable = (rows: string[], tableKey: string) => {
    if (rows.length < 2) return null;
    const parseRow = (rowStr: string) =>
      rowStr
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());

    const header = parseRow(rows[0]);
    const bodyRows = rows.slice(2).map(parseRow);

    return (
      <div key={tableKey} className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] shadow-lg">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.06]">
              {header.map((col, idx) => (
                <th key={idx} className="px-3.5 py-2.5 font-semibold text-white tracking-wide">
                  {renderInline(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {bodyRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-white/[0.02] transition">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3.5 py-2.5 text-white/85 align-top leading-relaxed">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTextBlock = (block: string, keyPrefix: string) => {
    const rawLines = block.trim().split("\n");
    const elements: ReactNode[] = [];
    let i = 0;

    while (i < rawLines.length) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // Check if this line starts a markdown pipe table
      if (trimmed.startsWith("|") && trimmed.endsWith("|") && i + 1 < rawLines.length && rawLines[i + 1].includes("---")) {
        const tableLines: string[] = [];
        while (i < rawLines.length && rawLines[i].trim().startsWith("|") && rawLines[i].trim().endsWith("|")) {
          tableLines.push(rawLines[i]);
          i++;
        }
        elements.push(renderTable(tableLines, `${keyPrefix}-tbl-${i}`));
        continue;
      }

      const key = `${keyPrefix}-${i}`;
      i++;

      if (!trimmed) {
        elements.push(<div key={key} className="h-1.5" />);
        continue;
      }

      // Clean out empty dangling lines like "- **Team ID**:" or "**Team ID**:" with nothing after it
      if (/^[-*•]?\s*(\*\*|__)[^*_]+(\*\*|__)\s*:\s*$/.test(trimmed)) {
        continue;
      }

      // Headers: ### Title
      if (trimmed.startsWith("###")) {
        elements.push(
          <h4 key={key} className="mt-3 text-[14px] font-bold text-white tracking-wide underline decoration-white/20 underline-offset-2">
            {renderInline(trimmed.replace(/^#{1,6}\s*/, ""))}
          </h4>
        );
        continue;
      }
      if (trimmed.startsWith("##")) {
        elements.push(
          <h3 key={key} className="mt-4 text-[15px] font-bold text-white tracking-wide underline decoration-white/30 underline-offset-2">
            {renderInline(trimmed.replace(/^#{1,6}\s*/, ""))}
          </h3>
        );
        continue;
      }

      // Bullet point: - or * or •
      const bulletMatch = line.match(/^(\s*)([-*•])\s+(.+)$/);
      if (bulletMatch) {
        const indent = bulletMatch[1].length;
        elements.push(
          <div key={key} className={cn("flex items-start gap-2", indent > 0 ? "ml-5 text-[13px] text-white/80" : "ml-0.5")}>
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
            <div className="flex-1">{renderContent(bulletMatch[3])}</div>
          </div>
        );
        continue;
      }

      // Numbered list: 1. 2. etc
      const numMatch = line.match(/^(\s*)(\d+[\.\)])\s+(.+)$/);
      if (numMatch) {
        const indent = numMatch[1].length;
        elements.push(
          <div key={key} className={cn("flex items-start gap-2", indent > 0 ? "ml-5" : "ml-0.5")}>
            <span className="font-semibold text-white/70 text-[12px] mt-0.5 shrink-0">{numMatch[2]}</span>
            <div className="flex-1">{renderContent(numMatch[3])}</div>
          </div>
        );
        continue;
      }

      elements.push(<p key={key}>{renderContent(line)}</p>);
    }

    return elements;
  };

  const segments = (() => {
    const segs = splitFencedBlocks(text);
    if (segs.some((s) => s.type === "code" && s.code.trim())) return segs;
    // Fallback: model forgot ``` fences — detect raw HTML / Python and box it anyway.
    const t = text.trim();
    const lines = t.split("\n");
    if (lines.length >= 3) {
      const htmlLines = lines.filter((l) => /<\/?[a-zA-Z][a-zA-Z0-9-]*(\s+[^>]*)?\/?>/.test(l)).length;
      if (htmlLines >= 3) return [{ type: "code" as const, lang: "html", code: t }];
      const pyLines = lines.filter((l) =>
        /^\s*(def |class |import |from |if |elif |else:|for |while |return |print\(|@|with |try:|except|async |await )/.test(l),
      ).length;
      if (pyLines >= 2) return [{ type: "code" as const, lang: "python", code: t }];
      // CSS-like: many lines ending with ; or containing { }
      const cssLines = lines.filter((l) => /[{;}]/.test(l) && /[:{;]/.test(l)).length;
      if (cssLines >= 3 && htmlLines === 0) return [{ type: "code" as const, lang: "css", code: t }];
    }
    return segs;
  })();

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-white/90">
      {segments.map((seg, idx) =>
        seg.type === "code" ? (
          <CodeBlock key={`code-${idx}`} code={seg.code} lang={seg.lang} />
        ) : (
          <Fragment key={`text-${idx}`}>{renderTextBlock(seg.text, `t${idx}`)}</Fragment>
        ),
      )}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export default function Workspace() {
  const [token, setToken] = useState<string | null>(null);
  const [backendOn, setBackendOn] = useState<boolean | null>(null);
  const [backendMode, setBackendMode] = useState("");
  const [ollamaStatus, setOllamaStatus] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [workspaceDocs, setWorkspaceDocs] = useState<AttachedFile[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<WorkspacePhase>("ready");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskShape | null>(null);
  const [steps, setSteps] = useState<StepShape[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [models, setModels] = useState<BackendModel[]>([]);
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [plan, setPlan] = useState<string[]>([]);
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(true);
  const [evidenceIdx, setEvidenceIdx] = useState<number | null>(null);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showSecurityPanel, setShowSecurityPanel] = useState(true);
  const [showDocsPanel, setShowDocsPanel] = useState(true);
  const [showModelsPanel, setShowModelsPanel] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showRouter, setShowRouter] = useState(true);
  const [approving, setApproving] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [previewModal, setPreviewModal] = useState<{ url: string; name: string; id?: string } | null>(null);
  const [pdfPreviewModal, setPdfPreviewModal] = useState<{ url: string; name: string; id?: string } | null>(null);
  const [modalZoom, setModalZoom] = useState(1);
  const activeChatRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sidebarFileRef = useRef<HTMLInputElement>(null);
  const taskTypeRef = useRef("analysis");

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => () => stopPoll(), []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, steps, phase]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewModal) {
          setPreviewModal(null);
          setModalZoom(1);
        }
        if (pdfPreviewModal) {
          setPdfPreviewModal(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewModal, pdfPreviewModal]);

  /* ---- chat history: saved locally, reopenable ---- */
  const CHATS_KEY = "adrestia_chats";
  const loadChats = useCallback((): SavedChat[] => {
    try { return JSON.parse(localStorage.getItem(CHATS_KEY) || "[]") as SavedChat[]; }
    catch { return []; }
  }, []);
  useEffect(() => { setSavedChats(loadChats()); }, [loadChats]);

  const saveCurrentChat = useCallback((overrides?: Partial<SavedChat>): string | null => {
    if (!messages.length) { return activeChatRef.current; }
    const chats = loadChats();
    const id = activeChatRef.current || `chat_${Date.now()}`;
    activeChatRef.current = id;
    const first = messages.find((m) => m.role === "user");
    const entry: SavedChat = {
      id,
      title: (first?.text || "Untitled task").slice(0, 60),
      savedAt: Date.now(),
      messages,
      findings,
      taskId,
      phase: phase === "processing" || phase === "verifying" ? "ready" : phase,
      ...overrides,
    };
    const idx = chats.findIndex((c) => c.id === id);
    if (idx >= 0) chats[idx] = entry; else chats.unshift(entry);
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 20)));
    setSavedChats(chats.slice(0, 20));
    return id;
  }, [messages, findings, taskId, phase, loadChats]);

  /* reset to a fresh screen; pass forceNew=true when the saved chat must
     NOT be merged into the next task (New Chat / New Task buttons) */
  const resetWorkspace = useCallback((forceNew = true) => {
    saveCurrentChat();
    if (forceNew) activeChatRef.current = null;
    stopPoll(); setMessages([]); setFiles([]); setWorkspaceDocs([]); setSteps([]); setFindings([]); setPlan([]);
    setTask(null); setTaskId(null); setPhase("ready"); setSelectedStage(null);
    setInput(""); setError(null); setEvidenceIdx(null);
  }, [saveCurrentChat]);

  const openChat = useCallback((c: SavedChat) => {
    stopPoll();
    activeChatRef.current = c.id;
    setMessages(c.messages || []);
    setFindings(c.findings || []);
    setTaskId(c.taskId || null);
    setPhase(c.phase || "ready");
    setSteps([]); setPlan([]); setTask(null);
    setFiles([]); setSelectedStage(null); setError(null); setEvidenceIdx(null);
    const restoredDocs: AttachedFile[] = [];
    for (const m of (c.messages || [])) {
      if (m.files) restoredDocs.push(...m.files);
    }
    const seen = new Set<string>();
    setWorkspaceDocs(restoredDocs.filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true; }));
    setShowHistory(false);
  }, []);

  const deleteChat = useCallback((id: string) => {
    const chats = loadChats().filter((c) => c.id !== id);
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    setSavedChats(chats);
    if (activeChatRef.current === id) activeChatRef.current = null;
  }, [loadChats]);

  /* auto-save on refresh/close so no chat is ever lost */
  const saveRef = useRef(saveCurrentChat);
  useEffect(() => { saveRef.current = saveCurrentChat; }, [saveCurrentChat]);
  useEffect(() => {
    const onLeave = () => { try { saveRef.current(); } catch { /* storage full etc. */ } };
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("beforeunload", onLeave); onLeave(); };
  }, []);

  /* ---- connect: health + silent admin login + model list (with retry) ---- */
  const connect = useCallback(async (): Promise<boolean> => {
    try {
      const h = await api.health();
      setBackendOn(true);
      setBackendMode(h.mode || "");
      setOllamaStatus(h.ollama || "");
      const loginFresh = async () => {
        const login = await api.login("admin", "admin");
        localStorage.setItem("adrestia_token", login.token);
        return login.token;
      };
      let t = localStorage.getItem("adrestia_token");
      if (!t) t = await loginFresh();
      try {
        const m = await api.models(t);
        setToken(t);
        setModels(m.models);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.code === "UNAUTHORIZED")) {
          t = await loginFresh();
          const m = await api.models(t);
          setToken(t);
          setModels(m.models);
        } else {
          throw e;
        }
      }
      api.securityStatus(t).then(setSecurity).catch(() => setSecurity(null));
      setError(null);
      return true;
    } catch (e) {
      setBackendOn(false);
      if (e instanceof ApiError) setError(e.message);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;
    const attempt = async () => {
      const ok = await connect();
      if (!ok && !cancelled) timer = setTimeout(attempt, 3000);
    };
    void attempt();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [connect]);

  const fail = (e: unknown) => {
    const msg = e instanceof ApiError ? `[${e.code}] ${e.message}` : "Request failed.";
    setError(msg);
    if (e instanceof ApiError && e.code === "BACKEND_OFFLINE") setBackendOn(false);
  };

  /* ---- upload from composer (paperclip / drag-drop into input box) ---- */
  const addFiles = useCallback(async (list: FileList | File[]) => {
    if (!token) { setError("Not connected to backend yet."); return; }
    setUploading(true);
    setPhase("uploading");
    try {
      const added: AttachedFile[] = [];
      for (const f of Array.from(list)) {
        const isImg = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name) || (f.type && f.type.startsWith("image/"));
        const previewUrl = isImg ? await fileToDataUrl(f) : undefined;
        const up = await api.upload(f, token);
        added.push({ id: up.id, name: up.filename, previewUrl });
      }
      setFiles((prev) => [...prev, ...added]);
      setWorkspaceDocs((prev) => {
        const existingIds = new Set(prev.map((x) => x.id));
        const newItems = added.filter((x) => !existingIds.has(x.id));
        return [...prev, ...newItems];
      });
      setError(null);
    } catch (e) { fail(e); }
    setUploading(false);
    setPhase((p) => (p === "uploading" ? "ready" : p));
  }, [token]);

  /* ---- upload directly to workspace DOCUMENTS (does NOT leave files in composer text box) ---- */
  const uploadSidebarDocs = useCallback(async (list: FileList | File[]) => {
    if (!token) { setError("Not connected to backend yet."); return; }
    setUploading(true);
    try {
      const added: AttachedFile[] = [];
      for (const f of Array.from(list)) {
        const isImg = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name) || (f.type && f.type.startsWith("image/"));
        const previewUrl = isImg ? await fileToDataUrl(f) : undefined;
        const up = await api.upload(f, token);
        added.push({ id: up.id, name: up.filename, previewUrl });
      }
      setWorkspaceDocs((prev) => {
        const existingIds = new Set(prev.map((x) => x.id));
        const newItems = added.filter((x) => !existingIds.has(x.id));
        return [...prev, ...newItems];
      });
      setError(null);
    } catch (e) { fail(e); }
    setUploading(false);
  }, [token]);

  const loadDemo = useCallback(async () => {
    if (!token) { setError("Not connected to backend yet."); return; }
    try {
      const docs = await api.knowledgeDocs(token);
      const demo = docs.documents.slice(0, 2).map((d) => ({ id: d.id, name: d.filename, demo: true }));
      setFiles(demo);
      setWorkspaceDocs((prev) => {
        const existingIds = new Set(prev.map((x) => x.id));
        const newItems = demo.filter((x) => !existingIds.has(x.id));
        return [...prev, ...newItems];
      });
      setInput(DEMO_TASK);
      taskTypeRef.current = "analysis";
      setError(null);
    } catch (e) { fail(e); }
  }, [token]);

  /* ---- run + poll ---- */
  const refreshTask = useCallback(async (t: string, id: string) => {
    const s = await api.taskStatus(t, id);
    setTask(s);
    try {
      const st = await api.taskSteps(t, id);
      setSteps(st.steps);
      const planning = st.steps.find((x) => x.step === "planning" && x.result);
      if (planning?.result) {
        try { const p = JSON.parse(planning.result); if (Array.isArray(p)) setPlan(p); } catch { /* keep */ }
      }
    } catch { /* steps optional */ }

    const hydrateFindings = async () => {
      const ev = await api.taskEvidence(t, id).catch((): { evidence: EvidenceShape[] } => ({ evidence: [] }));
      const out = s.result?.model_output || {};
      const raw = out.findings && out.findings.length ? out.findings : [out.text || "Done."];
      const conf = Math.round((out.confidence ?? 0.85) * 100);

      // Only display REAL evidence items that have meaningful, non-empty content (>15 characters)
      const validEvidence = (ev.evidence || []).filter(
        (e) => e && (e.excerpt || "").trim().length > 15 && !(e.excerpt || "").includes("(binary/unextracted")
      );

      // Deduplicate by filename/document_id so each real source document appears only once
      const seen = new Set<string>();
      const uniqueEvidence: EvidenceShape[] = [];
      for (const e of validEvidence) {
        const key = e.source?.document_id || e.source?.filename || e.claim;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueEvidence.push(e);
        }
      }

      if (uniqueEvidence.length > 0) {
        setFindings(uniqueEvidence.map((e, i) => ({
          id: String(i + 1).padStart(2, "0"),
          title: e.source.filename || e.claim || `Source ${i + 1}`,
          source: e.source.filename || "Attached Document",
          page: e.source.page != null ? `Page ${e.source.page}` : "Attached Document",
          confidence: Math.max(80, conf - i * 5),
          status: "verified" as const,
          evidenceText: (e.excerpt || e.claim || "").trim(),
        })));
      } else {
        setFindings([]);
      }
      let fullText = (out.text || "").trim();
      // Backend also stores extracted code separately (out.code) — show it in a
      // fenced block so it ALWAYS renders inside the copy-box, even if the
      // model forgot the ``` fences.
      const extraCode = ((out as unknown as { code?: string }).code || "").trim();
      if (extraCode && !fullText.includes(extraCode.slice(0, 40))) {
        const lang = /<\s*html|<\s*div|<\s*button|<!doctype/i.test(extraCode)
          ? "html"
          : "python";
        fullText = `${fullText}\n\n\`\`\`${lang}\n${extraCode}\n\`\`\``.trim();
      }
      return { raw, fullText, findingsCount: raw.length };
    };

    const updateOrAppendAiMessage = (newText: string) => {
      setMessages((m) => {
        const cleaned = m.filter(
          (x) => !(x.role === "ai" && (x.text.includes("Findings finalized") || x.text.includes("Analysis complete") || x.text.includes("Verified work complete")))
        );
        if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === "ai") {
          return [...cleaned.slice(0, -1), { role: "ai", text: newText }];
        }
        return [...cleaned, { role: "ai", text: newText }];
      });
    };

    if (s.status === "WAITING_APPROVAL") {
      stopPoll();
      const { fullText, findingsCount } = await hydrateFindings();
      setPhase("approval");
      setWorkflowOpen(false);
      const ans = fullText || (findingsCount > 0 ? `Analysis complete with ${findingsCount} finding(s). Review below, then approve to generate formal report.` : "Analysis complete.");
      updateOrAppendAiMessage(ans);
    } else if (s.status === "COMPLETED") {
      stopPoll();
      const { fullText, findingsCount } = await hydrateFindings();
      setPhase("completed");
      setWorkflowOpen(false);
      const ans = fullText || (findingsCount > 0 ? `Completed with ${findingsCount} finding(s). Download the report below.` : "Task completed successfully.");
      updateOrAppendAiMessage(ans);
    } else if (s.status === "FAILED") {
      stopPoll();
      const rawRes = s.result as any;
      const detail = rawRes?.error || rawRes?.model_output?.error || "Task failed on the backend. Check backend logs (logs/adrestia.log).";
      setError(detail);
      setPhase("ready");
    } else {
      setPhase(s.status === "VERIFYING" ? "verifying" : "processing");
    }
  }, []);

  const startPoll = useCallback((t: string, id: string) => {
    stopPoll();
    pollRef.current = setInterval(() => refreshTask(t, id).catch(fail), 1500);
  }, [refreshTask]);

  const detectTaskType = (prompt: string, hasImage = false): string => {
    const p = prompt.toLowerCase();
    const isCoding = (
      p.includes("write code") || p.includes("python code") || p.includes("generate python") ||
      p.includes("write script") || p.includes("coding") || p.includes("implement") ||
      p.includes("html") || p.includes("css") || p.includes("javascript") || p.includes("function")
    );
    if (isCoding) return "coding";

    const isOcr = (
      p.includes("extract text") || p.includes("read scan") || p.includes("perform ocr") ||
      p.includes("ocr") || p.includes("transcribe") || p.includes("read text") ||
      p.includes("extract words") || p.includes("copy text")
    );
    if (isOcr) return "ocr";

    if (hasImage) {
      return "vision";
    }

    const questionKeywords = [
      "tell me", "what is", "who", "why", "how", "explain", "summarize", "summary",
      "describe", "about this", "help me", "can you", "what does", "where is", "give me",
      "kya hai", "batao", "samjhao"
    ];
    if (questionKeywords.some((q) => p.includes(q))) {
      return "question";
    }
    return "analysis";
  };

  const runTask = useCallback(async (taskText: string) => {
    const text = taskText.trim();
    if (!text || !token || pollRef.current) return;
    if (!backendOn) { setError("Backend is offline. Start it first."); return; }
    stopPoll();
    setError(null);
    setFindings([]);
    setSteps([]);
    setPlan([]);
    try {
      const activeFiles = files.length > 0 ? files : workspaceDocs;
      const hasImage = activeFiles.some((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name));
      const inputType = hasImage ? "image" : "text";
      const detected = detectTaskType(text, hasImage);
      taskTypeRef.current = detected;
      const created = await api.createTask(token, text, detected, inputType, activeFiles.map((f) => f.id));
      setTaskId(created.task_id);
      setMessages((m) => [...m, { role: "user", text, files: activeFiles.length > 0 ? [...activeFiles] : undefined }]);
      setInput("");
      setFiles([]);
      setPhase("processing");
      setWorkflowOpen(true);
      setSelectedStage(0);
      await api.runTask(token, created.task_id);
      await refreshTask(token, created.task_id);
      startPoll(token, created.task_id);
    } catch (e) { fail(e); setPhase("ready"); }
  }, [token, backendOn, files, workspaceDocs, refreshTask, startPoll]);

  const approve = useCallback(async (decision: "approve" | "reject") => {
    if (!token || !taskId) return;
    setApproving(true);
    try {
      await api.approve(token, taskId, decision);
      if (decision === "reject") {
        stopPoll();
        setPhase("ready");
        setMessages((m) => [...m, { role: "ai", text: "Task rejected. No deliverable generated." }]);
      } else {
        await refreshTask(token, taskId);
        startPoll(token, taskId);
      }
    } catch (e) { fail(e); }
    setApproving(false);
  }, [token, taskId, refreshTask, startPoll]);

  const downloadReport = useCallback(async (format: "pdf" | "docx" | "txt" = "pdf") => {
    if (!token || !taskId) return;
    setDownloadingFormat(format);
    try {
      const { blob, filename } = await api.downloadDeliverable(token, taskId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      fail(e);
    } finally {
      setDownloadingFormat(null);
    }
  }, [token, taskId]);

  /* ---- derived view state ---- */
  const running = phase === "processing" || phase === "uploading";
  const showWorkflow = steps.length > 0;
  const showFindings = findings.length > 0 && (phase === "verifying" || phase === "approval" || phase === "completed");

  const completedStages = new Set<number>();
  steps.forEach((s) => {
    if (s.status === "completed" && STEP_TO_STAGE[s.step] !== undefined) completedStages.add(STEP_TO_STAGE[s.step]);
  });
  if (completedStages.has(2)) completedStages.add(1); // retrieved => understood
  let runningStage = -1;
  const cur = steps.find((s) => s.status === "running" || s.status === "pending");
  if (cur && STEP_TO_STAGE[cur.step] !== undefined) runningStage = STEP_TO_STAGE[cur.step];
  else if (task && STATUS_TO_STAGE[task.status] !== undefined) runningStage = STATUS_TO_STAGE[task.status];
  const stageState = (i: number): "completed" | "running" | "pending" =>
    completedStages.has(i) ? "completed" : i === runningStage ? "running" : "pending";
  const doneCount = phase === "completed" || phase === "approval" ? STAGES.length : completedStages.size;

  const planItems = plan.length ? plan : [];
  const planDone = (i: number) => {
    if (phase === "completed" || phase === "approval") return true;
    return i < Math.max(0, doneCount - 1);
  };

  const selectedModel = models.find((m) => m.id === task?.model);
  const live = models.filter((m) => m.enabled);
  const routerRows = [
    { task: "OCR / Vision", model: live.find((m) => m.capabilities.includes("ocr") || m.capabilities.includes("vision"))?.name || "—" },
    { task: "Reasoning", model: live.find((m) => m.capabilities.includes("reasoning"))?.name || "—" },
    { task: "Coding", model: live.find((m) => m.capabilities.includes("coding"))?.name || "—" },
    { task: "Generation", model: live.find((m) => m.capabilities.includes("text_generation"))?.name || "—" },
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black">
      {/* ── top bar ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-black/90 px-4 py-2.5 backdrop-blur sm:px-6">
        <Link href="/" className="font-display text-[20px] font-medium tracking-tight text-white">
          Adrestia
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => resetWorkspace(true)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/60 hover:bg-white/10 hover:text-white"
            title="Save current chat and start a new one"
          >
            <Plus size={12} /> New Chat
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/60 hover:bg-white/10 hover:text-white"
            title="Reopen a previous chat"
          >
            <History size={12} /> Chats{savedChats.length ? ` (${savedChats.length})` : ""}
          </button>
          <button
            onClick={() => setShowSecurity(true)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Lock size={11} className="text-white/70" /> {backendMode === "LOCAL_MODEL" ? "Local · Ollama" : "Local · Mock"}
          </button>
          <span className="rounded-full bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/60">
            {PHASE_LABEL[phase]}
          </span>
        </div>
      </header>

      {backendOn === false && (
        <div className="mx-auto mt-4 flex w-full max-w-[1400px] items-start gap-2.5 rounded-xl border border-white/20 bg-white/[0.04] p-3.5 px-4 text-sm sm:mx-6">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-white" />
          <div>Backend offline. Start it from <code className="font-plex text-[12px] text-white/90">backend/</code> with <code className="font-plex text-[12px] text-white/90">uvicorn app.main:app --reload</code>, then
            <button onClick={() => void connect()} className="ml-2 rounded-md border border-white/20 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/10">Retry</button>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1280px] min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row sm:p-4">
        {/* ── chat column (70%) ── */}
        <main className="flex min-h-0 flex-1 flex-col lg:w-[70%]">
          {!messages.length && !showWorkflow ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-6 text-center animate-fadeUp">
              <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">What would you like to work on?</h2>
              <p className="mt-2 max-w-md text-sm text-muted">Upload confidential documents and describe the task. The backend agent plans, retrieves, routes and verifies.</p>
              <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SUGGESTED.map((s, i) => (
                  <button
                    key={s.title}
                    onClick={() => {
                      taskTypeRef.current = ["analysis", "analysis", "analysis", "ocr"][i];
                      if (!files.length) void loadDemo();
                      setInput(s.task);
                    }}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-left transition hover:border-white/30"
                  >
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted">{s.desc}</div>
                  </button>
                ))}
              </div>
              {!files.length && (
                <button onClick={() => void loadDemo()} className="mt-6 text-xs font-medium text-white/70 hover:text-white hover:underline">
                  → Load demo files from backend knowledge base
                </button>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={cn("animate-fadeUp", m.role === "user" ? "flex justify-end" : "flex justify-start")}>
                  {m.role === "user" ? (
                    <div className="max-w-[90%] rounded-xl rounded-br-sm border border-white/10 bg-white/[0.08] px-4 py-3">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                      {!!m.files?.length && (
                        <div className="mt-2.5 flex flex-wrap gap-2.5">
                          {m.files.map((f) => {
                            const isImg = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name);
                            const imgSrc = f.previewUrl || `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                            if (isImg) {
                              return (
                                <div
                                  key={f.id}
                                  className="group relative flex flex-col overflow-hidden rounded-xl border border-white/20 bg-black/40 shadow-md transition hover:border-white/50"
                                >
                                  <div
                                    onClick={() => { setPreviewModal({ url: imgSrc, name: f.name, id: f.id }); setModalZoom(1); }}
                                    className="relative flex cursor-pointer items-center justify-center bg-black/60 p-2 transition hover:opacity-95"
                                    title={`Click to view full image: ${f.name}`}
                                  >
                                    <img
                                      src={imgSrc}
                                      alt={f.name}
                                      className="max-h-52 sm:max-h-60 max-w-[280px] sm:max-w-[340px] w-auto h-auto rounded-lg object-contain transition-transform duration-150 group-hover:scale-[1.02]"
                                      loading="lazy"
                                      onError={(e) => {
                                        const target = e.currentTarget;
                                        const fallback = `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                                        if (target.src !== fallback) target.src = fallback;
                                      }}
                                    />
                                    <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[11px] font-medium text-white/90 opacity-0 shadow backdrop-blur transition group-hover:opacity-100">
                                      <Eye size={12} /> View
                                    </div>
                                  </div>
                                  <div
                                    onClick={() => { setPreviewModal({ url: imgSrc, name: f.name, id: f.id }); setModalZoom(1); }}
                                    className="flex cursor-pointer items-center justify-between gap-1.5 bg-black/80 px-2.5 py-1.5 text-[11px] font-plex text-white/80 border-t border-white/10 hover:text-white"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      <ImageIcon size={12} className="shrink-0 text-white/60" />
                                      <span className="truncate max-w-[200px]" title={f.name}>{f.name}</span>
                                    </div>
                                    <span className="shrink-0 text-[10px] text-white/50 hover:underline">Click to open</span>
                                  </div>
                                </div>
                              );
                            }
                            const isPdf = /\.pdf$/i.test(f.name);
                            if (isPdf) {
                              const pdfSrc = f.previewUrl || `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                              return (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => setPdfPreviewModal({ url: pdfSrc, name: f.name, id: f.id })}
                                  className="group/pdf flex items-center gap-2 rounded-lg bg-black/40 px-3 py-2 font-plex text-[11.5px] text-white/80 border border-white/15 hover:border-white/40 hover:bg-white/[0.08] transition cursor-pointer shadow-sm"
                                  title={`Click to preview PDF: ${f.name}`}
                                >
                                  <FileText size={14} className="text-red-400 shrink-0" />
                                  <span className="truncate max-w-[220px] font-medium text-white/90" title={f.name}>{f.name}</span>
                                  <span className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60 group-hover/pdf:text-white group-hover/pdf:bg-white/20 transition">
                                    <Eye size={10} /> Preview
                                  </span>
                                </button>
                              );
                            }
                            return (
                              <span key={f.id} className="flex items-center gap-1.5 rounded-md bg-black/30 px-2.5 py-1.5 font-plex text-[11px] text-white/70 border border-white/10">
                                <FileText size={12} /> {f.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="max-w-[95%] rounded-xl rounded-bl-sm border border-white/15 bg-white/[0.04] px-4 py-3">
                      <FormattedMessage text={m.text} />
                    </div>
                  )}
                </div>
              ))}

              {/* agent workflow — auto-collapses when done, expandable via > */}
              {showWorkflow && (
                <div className="animate-fadeUp rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <button onClick={() => setWorkflowOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
                    <ChevronRight size={12} className={cn("shrink-0 text-white/40 transition-transform", workflowOpen && "rotate-90")} />
                    <span className="text-[11px] text-white/50">
                      {phase === "processing" || phase === "verifying"
                        ? `${task?.current_step || task?.status || ""}`
                        : `Done`}
                    </span>
                  </button>
                  {workflowOpen && !!planItems.length && (
                    <div className="mt-2 space-y-1 pl-5">
                      {planItems.map((p, i) => (
                        <div key={p} className="flex items-center gap-2 text-[11px]">
                          <StatusDot state={planDone(i) ? "completed" : i === planItems.findIndex((_, j) => !planDone(j)) ? "running" : "pending"} />
                          <span className={planDone(i) ? "text-white/80" : "text-muted"}>{p}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* evidence buttons only */}
              {showFindings && findings.length > 0 && (
                <div className="animate-fadeUp flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="font-medium text-white/70">{findings.length} source{findings.length > 1 ? "s" : ""} verified:</span>
                  {findings.map((f, idx) => (
                    <button
                      key={f.id}
                      onClick={() => setEvidenceIdx(idx)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-white/90 hover:border-white/30 hover:bg-white/[0.08] transition"
                      title={f.source}
                    >
                      <Eye size={12} className="text-white/70" /> Source {f.id}: {f.source.length > 25 ? f.source.slice(0, 22) + "…" : f.source}
                    </button>
                  ))}
                </div>
              )}

              {/* approval */}
              {phase === "approval" && (
                <div className="animate-fadeUp flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3">
                  <span className="flex-1 text-sm text-white/80">Approve to generate report?</span>
                  <button onClick={() => void approve("reject")} disabled={approving} className="rounded-lg border border-white/10 px-4 py-2 text-xs hover:bg-white/[0.05] disabled:opacity-50">Reject</button>
                  <button onClick={() => void approve("approve")} disabled={approving} className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/85 disabled:opacity-60">
                    {approving ? "Working…" : "Approve"}
                  </button>
                </div>
              )}

              {/* deliverable */}
              {phase === "completed" && (
                <div className="animate-fadeUp flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-400" />
                    <span className="text-sm font-medium text-white/90">Deliverable ready:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void downloadReport("pdf")}
                      disabled={!!downloadingFormat}
                      className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-black shadow hover:bg-white/85 disabled:opacity-50 transition"
                      title="Download generated answer as PDF"
                    >
                      <Download size={12} /> {downloadingFormat === "pdf" ? "Exporting…" : "PDF"}
                    </button>
                    <button
                      onClick={() => void downloadReport("docx")}
                      disabled={!!downloadingFormat}
                      className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.15] disabled:opacity-50 transition"
                      title="Download generated answer as Word document"
                    >
                      <Download size={12} /> {downloadingFormat === "docx" ? "Exporting…" : "Word (.docx)"}
                    </button>
                    <button
                      onClick={() => void downloadReport("txt")}
                      disabled={!!downloadingFormat}
                      className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/[0.15] disabled:opacity-50 transition"
                      title="Download generated answer as text file"
                    >
                      <Download size={12} /> {downloadingFormat === "txt" ? "Exporting…" : "TXT"}
                    </button>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* error */}
          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/25 bg-white/[0.05] p-3.5 text-sm animate-fadeUp">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-white" />
              <div>{error}<button onClick={() => setError(null)} className="ml-2 text-xs font-medium text-muted hover:text-white">Dismiss</button></div>
            </div>
          )}

          {/* composer (attached files live inside — never overlaps) */}
          <div className="sticky bottom-0 mt-3 bg-gradient-to-t from-black via-black to-transparent pb-2 pt-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
              className={cn("flex flex-col gap-1 rounded-xl border bg-white/[0.02] p-2 transition", dragOver ? "border-white/50" : "border-white/10")}
            >
              {!!files.length && (
                <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
                  {files.map((f) => {
                    const isImg = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name);
                    const imgSrc = f.previewUrl || `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                    if (isImg) {
                      return (
                        <div
                          key={f.id}
                          className="group relative flex items-center gap-2.5 rounded-xl border border-white/20 bg-black/60 p-1.5 shadow-md transition hover:border-white/40"
                        >
                          <button
                            type="button"
                            onClick={() => { setPreviewModal({ url: imgSrc, name: f.name, id: f.id }); setModalZoom(1); }}
                            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/80 transition hover:opacity-90 cursor-pointer"
                            title="Click to view full image"
                          >
                            <img
                              src={imgSrc}
                              alt={f.name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                const target = e.currentTarget;
                                const fallback = `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                                if (target.src !== fallback) target.src = fallback;
                              }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                              <Eye size={14} className="text-white" />
                            </div>
                          </button>

                          <div className="flex flex-col justify-center pr-2">
                            <span className="max-w-[130px] truncate text-xs font-medium text-white/90" title={f.name}>{f.name}</span>
                            <button
                              type="button"
                              onClick={() => { setPreviewModal({ url: imgSrc, name: f.name, id: f.id }); setModalZoom(1); }}
                              className="text-left text-[11px] text-white/50 hover:text-white underline cursor-pointer"
                            >
                              Click to preview
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setFiles((fl) => fl.filter((x) => x.id !== f.id))}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-white/70 shadow hover:bg-neutral-700 hover:text-white border border-white/20"
                            title="Remove image"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      );
                    }
                    const isPdf = /\.pdf$/i.test(f.name);
                    if (isPdf) {
                      const pdfSrc = f.previewUrl || `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                      return (
                        <div
                          key={f.id}
                          className="group relative flex items-center gap-2 rounded-xl border border-white/20 bg-black/60 pl-2.5 pr-2 py-1.5 shadow-sm transition hover:border-white/40"
                        >
                          <button
                            type="button"
                            onClick={() => setPdfPreviewModal({ url: pdfSrc, name: f.name, id: f.id })}
                            className="flex items-center gap-1.5 text-white/90 hover:text-white cursor-pointer"
                            title="Click to preview PDF"
                          >
                            <FileText size={14} className="text-red-400 shrink-0" />
                            <span className="max-w-[140px] truncate text-xs font-medium" title={f.name}>{f.name}</span>
                            <span className="flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60 hover:text-white">
                              <Eye size={10} /> Preview
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiles((fl) => fl.filter((x) => x.id !== f.id))}
                            className="shrink-0 text-muted hover:text-white ml-1 cursor-pointer"
                            title="Remove"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    }
                    return (
                      <span key={f.id} className="flex max-w-full items-center gap-1.5 rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs border border-white/10">
                        <FileText size={13} className="shrink-0 text-white/70" />
                        <span className="truncate font-medium max-w-[140px]" title={f.name}>{f.name}</span>
                        <button onClick={() => setFiles((fl) => fl.filter((x) => x.id !== f.id))} className="shrink-0 text-muted hover:text-white ml-1" title="Remove"><X size={12} /></button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-2 pl-1">
              <button onClick={() => fileRef.current?.click()} title="Attach files" className="rounded-lg p-2.5 text-muted hover:bg-white/[0.06] hover:text-white">
                <Paperclip size={17} />
              </button>
              <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void runTask(input); } }}
                placeholder={backendOn === false ? "Backend offline — start it first…" : "Describe the task you want to complete…"}
                disabled={backendOn === false}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70 disabled:opacity-50"
              />
              <button onClick={() => void runTask(input)} disabled={!input.trim() || running || uploading || backendOn === false} className="rounded-lg bg-white p-2.5 text-black transition hover:bg-white/85 disabled:opacity-40">
                <ArrowRight size={17} />
              </button>
              </div>
            </div>
            <div className="mt-1.5 text-center text-[10px] tracking-wide text-muted/70">
              {uploading ? "Uploading to backend…" : "PDF, image, drawing or code — stored locally via API"}
            </div>
          </div>
        </main>

        {/* ── context panel (30%) ── */}
        <aside className="min-h-0 lg:w-[30%] lg:overflow-y-auto">
          <div className="lg:hidden">
            <button onClick={() => setShowContext((v) => !v)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
              Workspace Context <ChevronDownIcon size={15} className={cn("transition", showContext && "rotate-180")} />
            </button>
          </div>
          <div className={cn("mt-3 flex-col gap-4 lg:mt-0", showContext ? "flex" : "hidden lg:flex")}>
            <Card className="p-4">
              <button onClick={() => setShowDocsPanel((v) => !v)} className="flex w-full items-center justify-between">
                <SectionLabel>DOCUMENTS</SectionLabel>
                <span className="flex items-center gap-2">
                  {!!workspaceDocs.length && <span className="text-[10px] text-muted">{workspaceDocs.length}</span>}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); sidebarFileRef.current?.click(); }}
                    className="rounded p-1 text-muted hover:bg-white/10 hover:text-white"
                    title="Upload document directly to workspace"
                  >
                    <Plus size={13} />
                  </button>
                  <ChevronDown size={14} className={cn("text-muted transition", showDocsPanel && "rotate-180")} />
                </span>
              </button>
              <input
                ref={sidebarFileRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => { if (e.target.files) void uploadSidebarDocs(e.target.files); e.target.value = ""; }}
              />
              <div className={cn(!showDocsPanel && "hidden")}>
              {!workspaceDocs.length ? (
                <div className="mt-2 text-xs leading-relaxed text-muted">No documents yet.<br />Upload a file or load demo files.<br />
                  <button onClick={() => sidebarFileRef.current?.click()} className="mt-2 rounded-md border border-white/10 px-3 py-1.5 text-white hover:border-white/30">Upload Document</button>
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {workspaceDocs.map((f) => {
                    const isImg = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name);
                    const isPdf = /\.pdf$/i.test(f.name);
                    const imgSrc = f.previewUrl || `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                    const pdfSrc = f.previewUrl || `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                    const isPreviewable = isImg || isPdf;

                    return (
                      <div
                        key={f.id}
                        onClick={() => {
                          if (isImg) { setPreviewModal({ url: imgSrc, name: f.name, id: f.id }); setModalZoom(1); }
                          else if (isPdf) { setPdfPreviewModal({ url: pdfSrc, name: f.name, id: f.id }); }
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px] border border-white/5 transition",
                          isPreviewable && "cursor-pointer hover:bg-white/[0.06] hover:border-white/20"
                        )}
                        title={isPreviewable ? `Click to preview ${f.name}` : f.name}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {isImg ? (
                            <img
                              src={imgSrc}
                              alt={f.name}
                              className="h-6 w-6 rounded object-cover border border-white/15 shrink-0"
                              onError={(e) => {
                                const target = e.currentTarget;
                                const fallback = `${BACKEND_BASE}/api/v1/files/${f.id}/raw`;
                                if (target.src !== fallback) target.src = fallback;
                              }}
                            />
                          ) : isPdf ? (
                            <FileText size={13} className="text-red-400 shrink-0" />
                          ) : (
                            <FileText size={12} className="text-white shrink-0" />
                          )}
                          <span className="truncate font-medium">{f.name}</span>
                        </div>
                        {isPreviewable && (
                          <span className="text-[10px] text-white/40 shrink-0 hover:text-white flex items-center gap-1">
                            <Eye size={11} />
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => sidebarFileRef.current?.click()}
                      className="w-full rounded-md border border-dashed border-white/10 py-1 text-center text-[10.5px] text-white/50 transition hover:border-white/25 hover:text-white"
                    >
                      + Upload another file
                    </button>
                  </div>
                </div>
              )}
              </div>
            </Card>
            <Card className="p-4">
              <button onClick={() => setShowModelsPanel((v) => !v)} className="flex w-full items-center justify-between">
                <SectionLabel>MODELS</SectionLabel>
                <span className="flex items-center gap-2">
                  {!!models.length && <span className="text-[10px] text-muted">{models.filter((m) => m.enabled).length}/{models.length} on</span>}
                  <ChevronDown size={14} className={cn("text-muted transition", showModelsPanel && "rotate-180")} />
                </span>
              </button>
              <div className={cn(!showModelsPanel && "hidden")}>
              {!models.length ? <div className="mt-2 text-xs text-muted">Loading models…</div> : (
                <div className="mt-2 space-y-1.5">
                  {models.map((m) => (
                    <div key={m.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                      <div className="text-[12px] font-medium text-white/90">{m.name}</div>
                      <div className="mt-0.5 text-[11px] text-white/50">{m.capabilities.join(" · ")} — {m.enabled ? m.status : "disabled"}</div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </Card>
            <Card className="p-4">
              <div onClick={() => setShowSecurityPanel((v) => !v)} className="flex w-full cursor-pointer items-center justify-between">
                <SectionLabel>SECURITY</SectionLabel>
                <span className="flex items-center gap-2">
                  {security && (
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                      security.posture === "SECURE" && "bg-emerald-500/20 text-emerald-300",
                      security.posture === "WARNINGS" && "bg-amber-500/20 text-amber-300",
                      security.posture === "AT RISK" && "bg-red-500/20 text-red-300"
                    )}>{security.posture}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); if (token) api.securityStatus(token).then(setSecurity).catch(() => setSecurity(null)); }}
                    title="Re-run security checks"
                    className="rounded p-1 text-muted hover:bg-white/10 hover:text-white"
                  >
                    <RefreshCw size={11} />
                  </button>
                  <ChevronDown size={14} className={cn("text-muted transition", showSecurityPanel && "rotate-180")} />
                </span>
              </div>
              <div className={cn("mt-2 space-y-1.5 text-[11px]", !showSecurityPanel && "hidden")}>
                {!security ? (
                  <div className="text-muted">Checking security posture…</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {security.external_transfer === "DISABLED"
                        ? <WifiOff size={12} className="text-emerald-300" />
                        : <Wifi size={12} className="text-red-300" />}
                      <span className="text-muted">Internet: <span className={security.external_transfer === "DISABLED" ? "text-emerald-300" : "text-red-300"}>{security.checks.find((c) => c.id === "internet")?.value || "—"}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <HardDrive size={12} className="text-white" />
                      <span className="text-muted">Storage: <span className="text-white">{security.checks.find((c) => c.id === "storage")?.value || "—"}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={12} className="text-white" />
                      <span className="text-muted">External Transfer: <span className="text-white">{security.external_transfer}</span></span>
                    </div>
                    {security.checks.filter((c) => !c.secure).map((c) => (
                      <div key={c.id} className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/[0.06] px-2 py-1.5">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-300" />
                        <span className="text-amber-200/90">{c.label}: {c.value}</span>
                      </div>
                    ))}
                    <button onClick={() => setShowSecurity(true)} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 py-1.5 text-[10px] font-medium tracking-wide text-white/80 hover:border-white/30">
                      <ShieldAlert size={11} /> View all checks
                    </button>
                  </>
                )}
              </div>
            </Card>
          </div>
        </aside>
      </div>

      {/* ── evidence drawer ── */}
      {evidenceIdx !== null && findings[evidenceIdx] && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setEvidenceIdx(null)}>
          <div className="w-full max-w-md animate-fadeUp border-l border-white/10 bg-black p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Source</span>
              <button onClick={() => setEvidenceIdx(null)} className="rounded-md p-1.5 hover:bg-white/10"><X size={16} /></button>
            </div>
            <div className="mt-4">
              <div className="text-sm font-medium">{findings[evidenceIdx].source}</div>
              <div className="text-xs text-white/70">{findings[evidenceIdx].page}</div>
              <div className="mt-4 rounded-lg border border-white/20 bg-white/[0.04] p-4 text-sm leading-relaxed">{findings[evidenceIdx].evidenceText}</div>
              <div className="mt-3 text-[11px] text-muted">Confidence — <span className="text-white">{findings[evidenceIdx].confidence}%</span></div>
              <button onClick={() => setEvidenceIdx(null)} className="mt-6 w-full rounded-lg border border-white/10 py-2.5 text-sm hover:bg-white/[0.05]">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── chat history drawer ── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowHistory(false)}>
          <div className="max-h-[85vh] w-full max-w-md animate-fadeUp overflow-y-auto rounded-xl border border-white/10 bg-black p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold"><History size={14} /> Saved Chats</div>
              <span className="text-xs text-muted">{savedChats.length} saved</span>
            </div>
            <div className="mt-4 space-y-2">
              {!savedChats.length && (
                <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-muted">
                  No saved chats yet. Run a task, then click <span className="text-white">New Chat</span> — it will be saved here automatically.
                </div>
              )}
              {savedChats.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  <button onClick={() => openChat(c)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[13px] font-medium text-white/90">{c.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {c.messages.length} message(s) · {new Date(c.savedAt).toLocaleString()}
                    </div>
                  </button>
                  <button onClick={() => deleteChat(c.id)} title="Delete" className="shrink-0 rounded p-1.5 text-muted hover:bg-white/10 hover:text-white">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowHistory(false)} className="mt-5 w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-white/85">Close</button>
          </div>
        </div>
      )}

      {/* ── security modal (live backend checks) ── */}
      {showSecurity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSecurity(false)}>
          <div className="max-h-[85vh] w-full max-w-md animate-fadeUp overflow-y-auto rounded-xl border border-white/10 bg-black p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold"><Lock size={14} className="text-white" /> Security Status</div>
              {security && (
                <span className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide",
                  security.posture === "SECURE" && "bg-emerald-500/20 text-emerald-300",
                  security.posture === "WARNINGS" && "bg-amber-500/20 text-amber-300",
                  security.posture === "AT RISK" && "bg-red-500/20 text-red-300"
                )}>{security.posture}</span>
              )}
            </div>
            {!security ? (
              <div className="mt-4 text-sm text-muted">Security checks unavailable. Is the backend running?</div>
            ) : (
              <>
                <div className="mt-4 space-y-2">
                  {security.checks.map((c: SecurityCheck) => (
                    <div key={c.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-white/90">{c.label}</span>
                        <span className="flex items-center gap-1.5 text-[11px] font-medium">
                          {c.secure
                            ? <><CheckCircle2 size={13} className="text-emerald-300" /><span className="text-emerald-300">{c.value}</span></>
                            : <><AlertTriangle size={13} className="text-amber-300" /><span className="text-amber-300">{c.value}</span></>}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{c.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[10px] text-muted/70">
                  All checks run live against this machine — nothing is hardcoded.
                </div>
              </>
            )}
            <button onClick={() => setShowSecurity(false)} className="mt-5 w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-white/85">Close</button>
          </div>
        </div>
      )}
      {/* ── image preview lightbox modal ── */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fadeUp"
          onClick={() => { setPreviewModal(null); setModalZoom(1); }}
        >
          <div
            className="relative flex max-h-[92vh] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-white/20 bg-neutral-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-white/10 bg-black/70 px-4 py-2.5">
              <div className="flex items-center gap-2 truncate pr-4">
                <ImageIcon size={15} className="text-white/70 shrink-0" />
                <span className="truncate text-xs font-medium text-white/90" title={previewModal.name}>{previewModal.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="min-w-[42px] text-center font-mono text-[11px] text-white/60">
                  {Math.round(modalZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setModalZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                  className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setModalZoom(1)}
                  className="rounded-lg px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white cursor-pointer"
                  title="Reset Zoom"
                >
                  Reset
                </button>
                <a
                  href={previewModal.id ? `${BACKEND_BASE}/api/v1/files/${previewModal.id}/raw` : previewModal.url}
                  download={previewModal.name}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
                  title="Download / Open raw file"
                >
                  <Download size={15} />
                </a>
                <button
                  type="button"
                  onClick={() => { setPreviewModal(null); setModalZoom(1); }}
                  className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white ml-1 cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Image display body */}
            <div className="flex flex-1 items-center justify-center overflow-auto p-4 bg-black/40 min-h-[300px]">
              <img
                src={previewModal.url}
                alt={previewModal.name}
                className="max-h-[75vh] max-w-[85vw] object-contain rounded transition-transform duration-150 shadow-lg"
                style={{ transform: `scale(${modalZoom})` }}
                onError={(e) => {
                  if (previewModal.id) {
                    const target = e.currentTarget;
                    const fallback = `${BACKEND_BASE}/api/v1/files/${previewModal.id}/raw`;
                    if (target.src !== fallback) target.src = fallback;
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
      {/* ── PDF preview modal ── */}
      {pdfPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md animate-fadeUp"
          onClick={() => setPdfPreviewModal(null)}
        >
          <div
            className="relative flex h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-neutral-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-white/10 bg-black/75 px-4 py-3">
              <div className="flex items-center gap-2.5 truncate pr-4">
                <FileText size={17} className="text-red-400 shrink-0" />
                <span className="truncate text-sm font-medium text-white/90" title={pdfPreviewModal.name}>
                  {pdfPreviewModal.name}
                </span>
                <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300 shrink-0">
                  PDF
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={pdfPreviewModal.id ? `${BACKEND_BASE}/api/v1/files/${pdfPreviewModal.id}/raw` : pdfPreviewModal.url}
                  download={pdfPreviewModal.name}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-white/80 hover:bg-white/15 hover:text-white transition cursor-pointer"
                  title="Open in new tab / Download PDF"
                >
                  <ExternalLink size={13} />
                  <span>Open in Tab</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPdfPreviewModal(null)}
                  className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white ml-1 cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* PDF Viewer Body */}
            <div className="relative flex-1 w-full bg-neutral-900 overflow-hidden">
              <iframe
                src={`${pdfPreviewModal.id ? `${BACKEND_BASE}/api/v1/files/${pdfPreviewModal.id}/raw` : pdfPreviewModal.url}#view=FitH`}
                className="h-full w-full border-0 bg-neutral-900"
                title={pdfPreviewModal.name}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
