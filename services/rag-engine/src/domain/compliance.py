"""Compliance domain models — target for H2"""

from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel

from .law import Citation


class Rule(BaseModel):
    id: str
    law_id: str
    article_id: str
    description: str
    mandatory: bool
    business_types: list[str]


class Violation(BaseModel):
    rule_id: str
    description: str
    severity: Literal['low', 'medium', 'high', 'critical']
    remediation: Optional[str] = None


class ComplianceCheck(BaseModel):
    id: str
    business_type: str
    check_date: str      # ISO date
    rules: list[Rule]
    violations: list[Violation]
    citations: list[Citation]


class ComplianceReport(BaseModel):
    check_id: str
    business_type: str
    total_rules: int
    passed_rules: int
    failed_rules: int
    risk_level: Literal['low', 'medium', 'high']
    summary: str
    generated_at: str    # ISO datetime
