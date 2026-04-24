"""POST /compliance/check — H2 shell"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict

router = APIRouter()


class ComplianceRequest(BaseModel):
    business_type: str
    details: Dict[str, Any]


@router.post("/compliance/check")
async def check_compliance(request: ComplianceRequest):
    """Compliance check — rule-based, no LLM (H2 implementation target)."""
    raise HTTPException(status_code=501, detail="컴플라이언스 엔진 구현 예정 (Phase H2)")
