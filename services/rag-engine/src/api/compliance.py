"""POST /compliance/check — H2 implementation"""

from __future__ import annotations

import logging
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..domain.compliance import BusinessPlan, ComplianceReport
from ..services.compliance_service import ComplianceService

logger = logging.getLogger(__name__)

router = APIRouter()

_service: ComplianceService | None = None


def _get_service() -> ComplianceService:
    global _service
    if _service is None:
        _service = ComplianceService()
    return _service


def _extract_text(file_path: str, filename: str) -> str:
    """Extract text from PDF or plain text file."""
    fname_lower = filename.lower()

    if fname_lower.endswith(".pdf"):
        try:
            import pypdf
            with open(file_path, "rb") as f:
                reader = pypdf.PdfReader(f)
                parts = []
                for page in reader.pages:
                    t = page.extract_text()
                    if t:
                        parts.append(t)
            return "\n".join(parts)
        except ImportError:
            pass
        # fallback: pypdf not available — read as bytes and decode
        try:
            with open(file_path, "rb") as f:
                raw = f.read()
            return raw.decode("utf-8", errors="replace")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"PDF 추출 실패: {exc}") from exc

    if fname_lower.endswith((".txt", ".text")):
        with open(file_path, encoding="utf-8", errors="replace") as f:
            return f.read()

    if fname_lower.endswith(".docx"):
        try:
            import docx  # type: ignore
            doc = docx.Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            raise HTTPException(status_code=422, detail="python-docx 미설치 — txt/pdf만 지원")

    # Unknown extension — try UTF-8 text
    try:
        with open(file_path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"지원하지 않는 파일 형식: {exc}") from exc


@router.post("/compliance/check")
async def check_compliance(
    file: UploadFile = File(...),
    filename_hint: str = Form(""),
):
    """Upload a business plan (PDF/txt) → run rule-based compliance check → return ComplianceReport JSON."""
    fname = file.filename or filename_hint or "upload.txt"

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="파일이 비어 있습니다")

    suffix = os.path.splitext(fname)[-1] or ".tmp"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        text = _extract_text(tmp_path, fname)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if not text.strip():
        raise HTTPException(status_code=400, detail="텍스트를 추출할 수 없습니다")

    plan = BusinessPlan(
        id=str(uuid.uuid4()),
        filename=fname,
        uploaded_at=datetime.now(timezone.utc),
        parsed_text=text,
    )

    service = _get_service()
    try:
        compliance_check = service.check(plan)
    except Exception as exc:
        logger.error("Compliance check failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"컴플라이언스 체크 실패: {exc}") from exc

    report = ComplianceReport(
        check=compliance_check,
        format="json",
        check_id=compliance_check.id,
        business_type=compliance_check.business_type,
        total_rules=len(compliance_check.rules),
        passed_rules=0,
        failed_rules=len(compliance_check.violations),
        risk_level=(
            "high" if any(v.severity == "mandatory" for v in compliance_check.violations)
            else "medium" if any(v.severity == "recommended" for v in compliance_check.violations)
            else "low"
        ),
        summary=compliance_check.summary,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

    return JSONResponse(content=report.model_dump(mode="json"))
