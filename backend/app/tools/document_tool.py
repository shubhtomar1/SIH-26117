"""Document generator tool — builds deliverables through deliverable_service."""
from app.services import deliverable_service
from app.tools import register_tool
from app.tools.base import BaseTool


class DocumentTool(BaseTool):
    name = "document_generator"
    description = "Generate TXT/DOCX/XLSX/PPTX deliverables from findings."

    def execute(self, input_data: dict) -> dict:
        fmt = str(input_data.get("format", "docx")).lower()
        task_id = str(input_data.get("task_id", "TASK"))
        title = str(input_data.get("title", "Approval Note"))
        content = str(input_data.get("content", ""))
        findings = list(input_data.get("findings", []))[:50]
        evidence = list(input_data.get("evidence", []))[:50]
        recommendation = str(input_data.get("recommendation", ""))
        try:
            if fmt == "pdf":
                path = deliverable_service.generate_pdf(task_id, title, content, findings, evidence, recommendation)
            elif fmt == "txt":
                path = deliverable_service.generate_txt(task_id, title, content, findings, evidence, recommendation)
            elif fmt == "xlsx":
                path = deliverable_service.generate_xlsx(task_id, findings, evidence)
            elif fmt == "pptx":
                path = deliverable_service.generate_pptx(task_id, title, findings)
            else:
                path = deliverable_service.generate_docx(task_id, title, content, findings, evidence, recommendation)
            return {"status": "passed", "path": path, "format": fmt}
        except Exception as exc:
            return {"status": "failed", "error": str(exc)}


register_tool(DocumentTool())
