"""Agent orchestrator: POLICY → PLAN → RETRIEVE → ROUTE → EXECUTE → VERIFY → APPROVAL → DELIVER.

Knows nothing about concrete models — only router + registry + adapters.
Uploaded documents are UNTRUSTED DATA: quoted as context, never as instructions.
"""
import json
import os
import re
import uuid


def _clean_markdown(text: str) -> str:
    """Normalize whitespace and remove accidental raw prompt leakage."""
    if not text:
        return text
    # Clean up accidental prompt leakage
    text = re.sub(r'\[UNTRUSTED DOCUMENT [^\]]+\]:\s*', '', text)
    text = re.sub(r'### Reference Context:.*?\n\n', '', text, flags=re.DOTALL)
    text = re.sub(r'### User Request:.*?\n\n', '', text, flags=re.DOTALL)
    text = re.sub(r'### Answer:\s*', '', text)
    # Remove hallucinated bracket placeholder lines if any
    text = re.sub(r'\[(?:Project Name|briefly describe[^\]]*|specific [^\]]*|describe the specific[^\]]*)\]', 'Not specified', text, flags=re.IGNORECASE)
    # Deduplicate repeated header loops if small LLM cycles back to section 1
    m = re.search(r'(#{2,4}\s*(?:1\.|Document Overview|Project Overview)[^\n]*)', text, flags=re.IGNORECASE)
    if m:
        first_header = m.group(1).strip()
        idx1 = text.find(first_header)
        # Search for any second section 1 header or horizontal rule before repetition
        dup_match = re.search(r'(?:\n\s*---\s*\n)?\s*(#{2,4}\s*(?:1\.|Document Overview|Project Overview)[^\n]*)', text[idx1 + len(first_header):], flags=re.IGNORECASE)
        if dup_match:
            text = text[:idx1 + len(first_header) + dup_match.start()].rstrip("-\n ")
    # Clean up excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _build_doc_summary_prompt(user_input: str, context: str = "") -> str:
    ctx_lower = (context or "").lower()
    is_certificate_or_letter = any(w in ctx_lower for w in (
        "certif", "to whom so ever", "attended", "board of studies",
        "hereby", "memorandum", "circular", "letter", "associate professor"
    ))
    is_project_or_presentation = any(w in ctx_lower for w in (
        "problem statement", "sih", "hackathon", "presentation", "architecture", "methodology", "sovereign"
    ))

    if is_certificate_or_letter and not is_project_or_presentation:
        sections = (
            "### 1. Document Overview\n"
            "State the document type, issuing authority/organization, recipient/attendee, and date.\n\n"
            "### 2. Core Subject & Purpose\n"
            "Detail the specific event, meeting, or purpose, along with the attendee's designation and institution.\n\n"
            "### 3. Authority & Signatory\n"
            "Identify the signing official/chairperson, designation, and official contact details.\n\n"
            "### 4. Verification Summary\n"
            "Provide a concise summary confirming the authenticity and core factual takeaways."
        )
    elif is_project_or_presentation:
        sections = (
            "### 1. Project Overview\n"
            "State the project title, problem statement ID, team name/author, and theme.\n\n"
            "### 2. Context & Problem Statement\n"
            "Explain the operational challenge, necessity, and objective.\n\n"
            "### 3. Technical Solution & Architecture\n"
            "Detail the core modules, technologies, workflow, and implementation.\n\n"
            "### 4. Key Innovations & Security\n"
            "Highlight sovereign/on-premise controls, security features, and unique capabilities.\n\n"
            "### 5. Practical Impact & Deliverables\n"
            "Summarize the industry benefits, expected outcomes, and takeaways."
        )
    else:
        sections = (
            "### 1. Document Identification & Purpose\n"
            "State the document title/type, issuing entity, date, and primary objective.\n\n"
            "### 2. Core Provisions & Technical Details\n"
            "Detail the key provisions, specifications, data points, or requirements present in the text.\n\n"
            "### 3. Authority, Stakeholders & Compliance\n"
            "Identify the responsible authorities, signatories, or compliance guidelines noted.\n\n"
            "### 4. Summary & Practical Takeaways\n"
            "Provide a concise executive conclusion summarizing the critical points."
        )

    return (
        f"User Request: {user_input}\n\n"
        "Please provide a formal, clear, and comprehensive Executive Summary of the attached document based strictly on the provided context.\n"
        "Do NOT format the response as a markdown table with pipe characters. Present it with bold headings and structured bullet points.\n\n"
        "CRITICAL FACTUAL INTEGRITY RULES:\n"
        "- Base all observations strictly on facts directly stated in the reference context.\n"
        "- NEVER invent placeholder bracket tokens like [Project Name], [describe...], or blank template fields.\n"
        "- If a detail is not mentioned in the text, simply omit it or state that it is not specified in the document.\n\n"
        f"{sections}\n\n"
        "Maintain a formal, authoritative, and professional tone."
    )

from sqlalchemy.orm import Session

from app.core.logging import log
from app.models.document import Document
from app.models.task import Task, TaskStep
from app.services import audit as audit_svc
from app.services import evidence_service, model_router, verification_service
from app.services.document_service import is_scanned_pdf, ocr_pdf_pages
from app.services.policy import PolicyDenied, check
from app.services.rag_service import RAGService
from app.tools import tool_registry

PLANS = {
    "analysis": ["Read uploaded document", "Retrieve relevant SOP", "Analyze findings",
                 "Generate recommendation", "Verify evidence", "Prepare approval note"],
    "coding": ["Classify task", "Select coding model", "Generate code",
               "Execute in sandbox", "Verify result"],
    "ocr": ["Detect document", "Extract text via OCR", "Verify extraction"],
    "vision": ["Inspect image/diagram", "Select vision model", "Analyze visual components",
               "Generate technical assessment", "Verify visual evidence"],
    "question": ["Retrieve relevant SOP", "Reason with private context", "Answer with evidence"],
}

NEEDS_APPROVAL = {"analysis"}


def _step(db: Session, task: Task, number: int, step_type: str, status: str, result: str = "") -> TaskStep:
    s = TaskStep(id=f"STEP-{uuid.uuid4().hex[:8].upper()}", task_id=task.id,
                 step_number=number, step_type=step_type, status=status, result=result[:4000])
    db.add(s)
    # NOTE: task.status is owned by _set() only — deriving it from a STEP's status
    # here marked the whole task COMPLETED after step 1, racing the real pipeline.
    task.current_step = step_type
    task.progress = min(95, number * 12)
    db.commit()
    return s


def _set(db: Session, task: Task, status: str, progress: int) -> None:
    task.status = status
    task.progress = progress
    db.commit()


def _uploaded_docs(db: Session, task: Task) -> list[Document]:
    try:
        ids = json.loads(task.file_ids or "[]")
    except ValueError:
        ids = []
    if not ids:
        return []
    return db.query(Document).filter(Document.id.in_(ids)).all()


def _extract_findings(output: dict) -> list[str]:
    existing = output.get("findings")
    if isinstance(existing, list) and existing:
        cleaned = [str(x).strip() for x in existing if str(x).strip()]
        return list(dict.fromkeys(cleaned))  # deduplicate preserving order
    text = (output.get("text") or "").strip()
    numbered: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        s = re.sub(r'^\[UNTRUSTED DOCUMENT [^\]]+\]:\s*', '', s)
        m = re.match(r"^(?:\d+[\).\]]|[-*•])\s+(.+)$", s)
        if m:
            item = m.group(1).strip()
            header_keys = ('document content', 'finding', 'findings', 'introduction', 'solution', 'detailed solution')
            if len(item) > 3 and item.lower().rstrip(':') not in header_keys:
                numbered.append(item)
    seen = set()
    unique = []
    for f in numbered:
        key = f.lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(f)
    if unique:
        output["findings"] = unique[:10]
        return output["findings"]
    meaningful = [l.strip() for l in text.splitlines() if len(l.strip()) > 20 and not l.startswith('#')]
    if meaningful:
        output["findings"] = meaningful[:5]
        return output["findings"]
    output["findings"] = [text[:300] if text else "Done."]
    return output["findings"]


IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "bmp"}


def _ocr_pdf_pages(pdf_path: str, max_pages: int = 5) -> str:
    """Extract and transcribe scanned PDF pages via pypdfium2 / pypdf + Ollama vision model."""
    return ocr_pdf_pages(pdf_path, max_pages=max_pages)


def run_task(db: Session, task: Task, user) -> Task:
    """Execute until WAITING_APPROVAL or COMPLETED."""
    try:
        # Auto-detect task type: vision, ocr, coding, question, or analysis
        tx = (task.input or "").lower().strip()
        ocr_words = (
            "extract text", "read text", "transcribe", "transcription",
            "ocr", "scanned text", "extract words", "read words", "read scan",
            "text nikalo", "text padho"
        )
        coding_words = (
            "python", "html", "css", "javascript", "typescript", "react", "vue",
            "sql", "code", "script", "program", "function", "api", "endpoint",
            "webpage", "website", "frontend", "backend", "login page", "button",
            "component", "algorithm", "debug", "refactor", "write code", "generate code",
        )
        greeting_words = {
            "hi", "hello", "hey", "hii", "hiii", "helloo", "namaste", "namaskar",
            "kaise ho", "kya haal hai", "good morning", "good evening", "good afternoon"
        }
        is_greeting = (
            tx in greeting_words
            or any(tx.startswith(g) for g in ("hi ", "hello ", "hey ", "namaste "))
        )
        is_kb_query = any(w in tx for w in (
            "sop", "standard operating procedure", "safety protocol", "manual",
            "plant policy", "factory rule", "safety guideline", "internal procedure",
            "evacuation", "lockout", "tagout", "ppe standard"
        ))
        analysis_words = (
            "analyze", "audit", "compliance", "inspection", "safety review", "violation", "investigate"
        )

        try:
            _doc_ids = json.loads(task.file_ids or "[]")
        except ValueError:
            _doc_ids = []
        _docs = db.query(Document).filter(Document.id.in_(_doc_ids)).all() if _doc_ids else []
        has_image = any(((d.type or "").lower() in IMAGE_EXTENSIONS) for d in _docs) or (task.input_type == "image" and not _docs)

        if has_image:
            task.input_type = "image"
            if any(w in tx for w in ocr_words):
                task.task_type = "ocr"
            elif any(c in tx for c in coding_words):
                task.task_type = "coding"
            else:
                task.task_type = "vision"
            db.commit()
        else:
            task.input_type = "text"
            if any(c in tx for c in coding_words) or task.task_type == "coding":
                task.task_type = "coding"
                db.commit()
            elif any(w in tx for w in ocr_words) or task.task_type == "ocr":
                task.task_type = "ocr"
                db.commit()
            elif _docs and any(a in tx for a in analysis_words):
                task.task_type = "analysis"
                db.commit()
            else:
                task.task_type = "question"
                db.commit()

        # 1 — POLICY CHECK
        _set(db, task, "POLICY_CHECK", 5)
        _step(db, task, 1, "policy_check", "running")
        check(user, "run_task")
        _step(db, task, 1, "policy_check", "completed", f"role={user.role}")
        audit_svc.log_action(db, "POLICY_CHECK", "policy", "ok", user.id, task.id)

        # 2 — PLAN
        _set(db, task, "PLANNING", 15)
        plan = PLANS.get(task.task_type, PLANS["analysis"])
        _step(db, task, 2, "planning", "completed", json.dumps(plan))
        audit_svc.log_action(db, "TASK_PLANNED", "orchestrator", "ok", user.id, task.id)

        # 3 — RETRIEVE (private RAG + attached uploads; uploads treated as untrusted data)
        _set(db, task, "RETRIEVING", 30)
        uploaded = _uploaded_docs(db, task)
        sources = []

        if not uploaded:
            if is_kb_query:
                rag = RAGService(db)
                sources = rag.search(task.input, department=None)
                for hit in sources:
                    d = hit["document"]
                    evidence_service.attach(db, task.id, claim=f"Retrieved context: {hit['excerpt'][:140]}",
                                            document_id=d.id, filename=d.filename, excerpt=hit["excerpt"])
                _step(db, task, 3, "document_retrieval", "completed",
                      f"knowledge base hits: {len(sources)}")
                audit_svc.log_action(db, "DOCUMENT_RETRIEVED", "rag", "ok", user.id, task.id,
                                     f"source=knowledge_base count={len(sources)}")
            else:
                # General inquiry, greeting, or code request without uploads: skip knowledge base entirely
                _step(db, task, 3, "document_retrieval", "completed",
                      "general inquiry: internal knowledge base skipped")
        else:
            # Automatic OCR extraction for scanned PDFs (PDFs with little or no extractable text, or scanned templates)
            for d in uploaded:
                if (d.type or "").lower() == "pdf" and is_scanned_pdf(d.path, d.content, d.needs_ocr):
                    log.info(f"SCANNED_PDF_DETECTED doc={d.id} filename={d.filename}; running OCR extraction...")
                    scanned_text = ocr_pdf_pages(d.path, max_pages=5)
                    if scanned_text:
                        d.content = scanned_text
                        d.needs_ocr = 0
                        db.commit()
                        log.info(f"SCANNED_PDF_OCR_SUCCESS doc={d.id} chars={len(scanned_text)}")

            # If user uploaded a folder or multiple files (e.g. 10-100+ files)
            if len(uploaded) > 3:
                rag = RAGService(db)
                hits = rag.search_documents(task.input, [d.id for d in uploaded], top_k=5)
                selected_docs = [h["document"] for h in hits] if hits else uploaded[:5]
                for d in selected_docs:
                    excerpt = (d.content or "").strip()[:4000] or f"(binary/unextracted file: {d.filename})"
                    evidence_service.attach(db, task.id, claim=f"Uploaded document: {d.filename}",
                                            document_id=d.id, filename=d.filename, excerpt=excerpt)
                _step(db, task, 3, "document_retrieval", "completed",
                      f"folder search: retrieved top {len(selected_docs)} relevant file(s) from {len(uploaded)} uploaded files")
                audit_svc.log_action(db, "DOCUMENT_RETRIEVED", "rag", "ok", user.id, task.id,
                                     f"source=folder_uploads total={len(uploaded)} selected={len(selected_docs)}")
            else:
                for d in uploaded:
                    excerpt = (d.content or "").strip()[:6000] or f"(binary/unextracted file: {d.filename})"
                    evidence_service.attach(db, task.id, claim=f"Uploaded document: {d.filename}",
                                            document_id=d.id, filename=d.filename, excerpt=excerpt)
                _step(db, task, 3, "document_retrieval", "completed",
                      f"primary source: {len(uploaded)} uploaded document(s); knowledge base skipped")
                audit_svc.log_action(db, "DOCUMENT_RETRIEVED", "rag", "ok", user.id, task.id,
                                     f"source=uploads count={len(uploaded)}")

        # 4 — ROUTE
        _set(db, task, "ROUTING", 45)
        record, adapter = model_router.route(db, task.task_type, task.input_type, task.input)
        task.selected_model = record.id
        db.commit()
        _step(db, task, 4, "model_selection", "completed", f"{record.id} ({record.adapter})")
        audit_svc.log_action(db, "MODEL_SELECTED", "router", "ok", user.id, task.id, f"model={record.id}")

        # 5 — EXECUTE (documents quoted as data, never instructions)
        _set(db, task, "EXECUTING", 65)
        context_parts = []
        for e in evidence_service.for_task(db, task.id):
            context_parts.append(f"[DOCUMENT {e.filename}]:\n{e.excerpt}")
        context = "\n\n".join(context_parts)

        wants_findings = any(
            k in task.input.lower()
            for k in ("finding", "issue", "problem", "list", "check", "analyze", "review", "violation", "compare")
        )
        wants_short = any(
            k in task.input.lower()
            for k in ("short", "brief", "summarize", "summary", "in short", "explain briefly", "quick")
        )

        # Determine if an actual image is part of this task
        image_doc = next((d for d in uploaded if (d.type or "").lower() in IMAGE_EXTENSIONS), None)
        has_image_input = (image_doc is not None) or (task.input_type == "image" and not uploaded)
        is_explicit_ocr = any(w in (task.input or "").lower() for w in ocr_words)

        if has_image_input and not is_explicit_ocr and task.task_type != "coding":
            task.task_type = "vision"

        if task.task_type == "coding":
            prompt = (
                f"{task.input}\n\n"
                "Please provide complete, production-ready, clean, and well-structured code to fulfill this request. "
                "Format code inside markdown code blocks with the appropriate language identifier (e.g. ```html, ```css, ```python, etc.). "
                "Briefly explain how the code works and include usage instructions."
            )
        elif task.task_type == "vision":
            is_generic = any(g in (task.input or "").lower() for g in (
                "tell me about", "what is this", "what is in", "what is", "explain this",
                "describe this", "analyze this", "tell about", "about this", "kya hai",
                "batao", "samjhao", "in this image"
            ))
            if is_generic or len((task.input or "").strip()) < 20:
                prompt = (
                    f"User Request: {task.input}\n\n"
                    "Please analyze the attached image/technical drawing with strict visual accuracy and provide a formal, comprehensive engineering explanation:\n\n"
                    "### 1. Drawing Type & Representation\n"
                    "Identify the exact type of technical drawing or image (e.g., orthographic multiview projection, isometric projection, assembly drawing, schematic, component photo) and what object or part is depicted.\n\n"
                    "### 2. Analysis of Visible Views & Geometry\n"
                    "Detail each visible view (e.g., Top View, Front View, Side View, Isometric/3D View) and explain the geometry, shape, surfaces, and features actually present in the image.\n\n"
                    "### 3. Annotations, Dimensions & Markings\n"
                    "Identify all visible text labels, directional arrows, callouts, or section labels directly shown in the drawing. Only describe markings that actually appear; do not invent unseen labels.\n\n"
                    "### 4. Material & Manufacturing Observations\n"
                    "Note any visible material indicators, surface treatments, or manufacturing characteristics if indicated. If not specified in the drawing, clearly state that they are unspecified.\n\n"
                    "### 5. Engineering Context & Application\n"
                    "Explain the practical engineering purpose, use in engineering graphics/manufacturing, and relevant industrial context.\n\n"
                    "Maintain a formal, authoritative engineering tone. Base all observations strictly on visible elements."
                )
            else:
                prompt = (
                    f"User Request: {task.input}\n\n"
                    "Please examine the attached image/technical drawing carefully and provide a formal, comprehensive, and technically accurate response. "
                    "Directly reference visible visual components, annotations, cross-sections, and geometric details to support your answer."
                )
        elif task.task_type == "question":
            is_presentation_or_doc = any((d.type or "").lower() in ("pptx", "ppt", "pdf", "docx") for d in uploaded)
            is_general_inquiry = any(g in (task.input or "").lower() for g in (
                "tell me about", "what is this", "explain this", "summarize", "summary",
                "describe", "iske bare", "batao", "samjhao", "overview", "what is in", "kya hai", "ppt", "presentation"
            ))

            if uploaded and is_presentation_or_doc and is_general_inquiry:
                prompt = _build_doc_summary_prompt(task.input, context=context)
            elif uploaded or context.strip():
                prompt = (
                    f"User Request: {task.input}\n\n"
                    "Please answer the user request accurately and clearly based on the provided reference context. "
                    "Use clear headings or bullet points where helpful. Do not output raw markdown pipe tables."
                )
            elif is_greeting:
                prompt = (
                    f"User: {task.input}\n\n"
                    "Respond as Adrestia, an AI workbench assistant. Greet the user warmly and briefly in 1-2 sentences."
                )
            else:
                prompt = (
                    f"Question: {task.input}\n\n"
                    "Answer directly and concisely:"
                )
        elif task.task_type == "ocr":
            prompt = (
                f"{task.input}\n\n"
                "Extract ALL readable text from the attached document or image accurately, completely, and verbatim. "
                "Preserve all headings, dates, names, designations, organizations, addresses, reference numbers, and structure. "
                "Do not add placeholders, commentary, or information not present in the source."
            )
        elif task.task_type == "analysis":
            is_presentation_or_doc = any((d.type or "").lower() in ("pptx", "ppt", "pdf", "docx") for d in uploaded)
            is_general_inquiry = any(g in (task.input or "").lower() for g in (
                "tell me about", "what is this", "explain this", "summarize", "summary",
                "describe", "iske bare", "batao", "samjhao", "overview", "what is in", "kya hai", "ppt", "presentation"
            ))
            if uploaded and is_presentation_or_doc and is_general_inquiry:
                prompt = _build_doc_summary_prompt(task.input, context=context)
            elif wants_findings:
                prompt = (
                    f"{task.input}\n\n"
                    "Analyze the document and list key findings, observations, or potential safety/compliance issues as distinct numbered points."
                )
            elif wants_short:
                prompt = (
                    f"{task.input}\n\n"
                    "Provide a brief, concise summary of the key findings in 3-5 numbered points."
                )
            elif uploaded or context.strip():
                prompt = (
                    f"{task.input}\n\n"
                    "Analyze the document and list the key findings and recommendations as numbered points."
                )
            else:
                prompt = (
                    f"Question: {task.input}\n\n"
                    "Answer directly and concisely:"
                )
        else:
            prompt = task.input

        gen_kwargs = {}
        image_doc = next((d for d in uploaded if (d.type or "").lower() in IMAGE_EXTENSIONS), None)
        if image_doc is not None:
            gen_kwargs["image_path"] = image_doc.path
            gen_kwargs["filename"] = image_doc.filename
        output = adapter.generate(prompt, context=context or None, **gen_kwargs)
        if output.get("text"):
            output["text"] = _clean_markdown(output["text"])
        _extract_findings(output)
        if task.task_type == "coding" and output.get("code"):
            tool = tool_registry.get("code_runner")
            output["execution"] = tool.execute({"code": output["code"]})
        _step(db, task, 5, "execution", "completed", json.dumps(output)[:2000])
        audit_svc.log_action(db, "TOOL_EXECUTED" if task.task_type == "coding" else "MODEL_EXECUTED",
                             "orchestrator", "ok", user.id, task.id)

        # 6 — VERIFY
        _set(db, task, "VERIFYING", 80)
        verdict = verification_service.verify_task(db, task, output, sources)
        _step(db, task, 6, "verification", "completed", json.dumps(verdict))
        audit_svc.log_action(db, "VERIFICATION_COMPLETED", "verification",
                             "passed" if verdict["verified"] else "failed", user.id, task.id)
        if not verdict["verified"]:
            raise RuntimeError("VERIFICATION_FAILED")

        task.result = json.dumps({"model_output": output, "verification": verdict})
        db.commit()

        # 7 — APPROVAL GATE (analysis tasks pause for a human)
        if task.task_type in NEEDS_APPROVAL and uploaded:
            _set(db, task, "WAITING_APPROVAL", 90)
            _step(db, task, 7, "approval", "pending", "Awaiting human approval.")
            audit_svc.log_action(db, "APPROVAL_REQUESTED", "orchestrator", "ok", user.id, task.id)
            return task

        return deliver(db, task, user)
    except PolicyDenied as exc:
        _set(db, task, "FAILED", 100)
        _step(db, task, 0, "policy_check", "failed", str(exc.reason))
        audit_svc.log_action(db, "POLICY_CHECK", "policy", "denied", user.id, task.id, exc.reason)
        raise
    except Exception as exc:  # logged locally; client gets code only
        log.exception(f"TASK_FAILED task={task.id} err={exc}")
        _set(db, task, "FAILED", 100)
        # Persist the real reason so the frontend can show it
        # (e.g. "Ollama rejected model 'moondream'... ollama pull moondream").
        # Without this the UI only sees an empty result and shows a generic message.
        try:
            task.result = json.dumps({"error": str(exc)[:800],
                                      "model_output": {"error": str(exc)[:800], "text": ""}})
            db.commit()
        except Exception:
            pass
        _step(db, task, 0, "execution", "failed", str(exc)[:500])
        audit_svc.log_action(db, "TASK_FAILED", "orchestrator", "failed", user.id, task.id, type(exc).__name__)
        raise


def approve(db: Session, task: Task, user, decision: str) -> Task:
    check(user, "approve")
    if task.status != "WAITING_APPROVAL":
        raise ValueError("Task is not awaiting approval.")
    if decision == "approve":
        audit_svc.log_action(db, "APPROVAL_GRANTED", "orchestrator", "ok", user.id, task.id)
        return deliver(db, task, user)
    _set(db, task, "FAILED", 100)
    _step(db, task, 7, "approval", "failed", f"Rejected by {user.username}.")
    audit_svc.log_action(db, "APPROVAL_REJECTED", "orchestrator", "ok", user.id, task.id)
    return task


def deliver(db: Session, task: Task, user) -> Task:
    data = json.loads(task.result or "{}")
    output = data.get("model_output", {})
    findings = output.get("findings") or []
    if not findings:
        findings = [output.get("text", "Done.")]
    evs = evidence_service.for_task(db, task.id)
    evidence = [{"filename": e.filename, "page": e.page, "excerpt": e.excerpt or ""} for e in evs]
    title = f"Approval Note {task.id}" if task.task_type == "analysis" else f"Document Summary {task.id}"
    recommendation = findings[0] if findings else ""
    tool = tool_registry.get("document_generator")
    content = output.get("text", "")
    pdf = tool.execute({"format": "pdf", "task_id": task.id, "title": title,
                        "content": content, "findings": findings, "evidence": evidence, "recommendation": recommendation})
    docx = tool.execute({"format": "docx", "task_id": task.id, "title": title,
                         "content": content, "findings": findings, "evidence": evidence, "recommendation": recommendation})
    txt = tool.execute({"format": "txt", "task_id": task.id, "title": title,
                        "content": content, "findings": findings, "evidence": evidence, "recommendation": recommendation})
    data["deliverables"] = [pdf.get("path"), docx.get("path"), txt.get("path")]
    task.result = json.dumps(data)
    _set(db, task, "COMPLETED", 100)
    _step(db, task, 8, "delivery", "completed", json.dumps(data["deliverables"]))
    audit_svc.log_action(db, "OUTPUT_CREATED", "deliverable", "ok", user.id, task.id)
    return task
