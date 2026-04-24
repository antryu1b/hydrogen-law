"""Compliance domain models — H2 implementation"""

from __future__ import annotations
from datetime import datetime
from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel

from .law import Citation


# ---------------------------------------------------------------------------
# H1 models (kept for backward compat with existing tests)
# ---------------------------------------------------------------------------

class Rule(BaseModel):
    id: str
    law_id: str
    article_id: str
    # H1 fields
    description: str = ""
    mandatory: bool = False
    business_types: list[str] = []
    # H2 extensions
    condition_keywords: list[str] = []
    requirement: str = ""
    severity: Literal["mandatory", "recommended", "informational"] = "mandatory"


class Violation(BaseModel):
    rule_id: str
    # H2 fields
    article_ref: Optional[Citation] = None
    matched_keywords: list[str] = []
    # severity accepts both H1 values (low/medium/high/critical) and H2 values (mandatory/recommended/informational)
    severity: Union[
        Literal["mandatory", "recommended", "informational"],
        Literal["low", "medium", "high", "critical"],
    ] = "mandatory"
    user_context: str = ""
    # H1 fields (kept for compat)
    description: str = ""
    remediation: Optional[str] = None


# ---------------------------------------------------------------------------
# H2 new models
# ---------------------------------------------------------------------------

class BusinessPlan(BaseModel):
    id: str
    filename: str
    uploaded_at: datetime
    parsed_text: str
    extracted_keywords: list[str] = []


class ComplianceCheck(BaseModel):
    id: str
    business_plan: Optional[BusinessPlan] = None
    # H1 compat fields
    business_type: str = ""
    check_date: str = ""
    rules: list[Rule] = []
    # H2 fields
    ran_at: Optional[datetime] = None
    violations: list[Violation] = []
    citations: list[Citation] = []
    summary: str = ""


class ComplianceReport(BaseModel):
    check: Optional[ComplianceCheck] = None
    format: Literal["json"] = "json"
    # H1 compat fields
    check_id: str = ""
    business_type: str = ""
    total_rules: int = 0
    passed_rules: int = 0
    failed_rules: int = 0
    risk_level: Literal["low", "medium", "high"] = "low"
    summary: str = ""
    generated_at: str = ""
