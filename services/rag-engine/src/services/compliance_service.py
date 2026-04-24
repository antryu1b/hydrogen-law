"""Compliance service — H2 implementation.

Rule-based compliance checking: keyword extraction → business type matching
→ applicable article lookup → Violation list generation.
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import yaml

from ..domain.compliance import (
    BusinessPlan,
    ComplianceCheck,
    ComplianceReport,
    Rule,
    Violation,
)
from ..domain.law import Citation

logger = logging.getLogger(__name__)

# Korean hydrogen/gas keyword dictionary for extraction
_KW_PATTERNS = [
    r"수소충전소?",
    r"충전소",
    r"수소생산",
    r"생산시설",
    r"수전해",
    r"개질",
    r"수소저장",
    r"저장시설",
    r"저장탱크",
    r"수소운반",
    r"운반",
    r"이송",
    r"튜브트레일러",
    r"수소배관",
    r"연료전지",
    r"수소연료전지",
    r"고압가스",
    r"압축수소",
    r"액화수소",
    r"허가",
    r"안전관리",
    r"검사",
    r"정기검사",
    r"완성검사",
    r"수소법",
    r"고압가스법",
    r"배관",
    r"탱크",
    r"발전",
    r"충전",
    # English variants
    r"hydrogen station",
    r"hydrogen storage",
    r"hydrogen transport",
    r"fuel cell",
    r"hydrogen production",
]

_KW_REGEX = re.compile(
    "|".join(f"({p})" for p in _KW_PATTERNS), re.IGNORECASE
)


def _extract_keywords(text: str) -> list[str]:
    """Extract hydrogen/compliance-relevant keywords from plan text."""
    found: set[str] = set()
    for m in _KW_REGEX.finditer(text):
        kw = m.group(0).strip().lower()
        if kw:
            found.add(kw)
    return sorted(found)


def _score_business_type(
    extracted_keywords: list[str], match_keywords: list[str]
) -> int:
    """Count how many match_keywords appear in extracted_keywords."""
    score = 0
    ekw_set = set(extracted_keywords)
    for mk in match_keywords:
        mk_lower = mk.lower()
        if any(mk_lower in ek for ek in ekw_set):
            score += 1
    return score


def _find_excerpt(text: str, keywords: list[str], window: int = 200) -> str:
    """Return the first excerpt from text containing any keyword."""
    for kw in keywords:
        idx = text.lower().find(kw.lower())
        if idx != -1:
            start = max(0, idx - 50)
            end = min(len(text), idx + window)
            return text[start:end].strip()
    return text[:window].strip()


class ComplianceService:
    """Rule-based compliance engine."""

    def __init__(self, config_path: Optional[str] = None) -> None:
        if config_path is None:
            # Resolve relative to this file's package root
            here = os.path.dirname(__file__)
            config_path = os.path.join(here, "..", "..", "law_config.yaml")
        self._config_path = os.path.abspath(config_path)
        self._config: dict[str, Any] = {}
        self._loaded = False

    def _load_config(self) -> None:
        if self._loaded:
            return
        with open(self._config_path, encoding="utf-8") as f:
            self._config = yaml.safe_load(f)
        self._loaded = True

    def _get_business_types(self) -> dict[str, Any]:
        self._load_config()
        return self._config.get("compliance_rules", {}).get("business_types", {})

    def check(self, plan: BusinessPlan) -> ComplianceCheck:
        """Run rule-based compliance check on a business plan.

        Steps:
          1. Extract keywords from plan text
          2. Score each business_type by keyword overlap
          3. For each matched type, look up key_articles
          4. Build Violation objects for each applicable rule
          5. Return ComplianceCheck
        """
        business_types = self._get_business_types()

        # 1. Keyword extraction
        keywords = _extract_keywords(plan.parsed_text)
        if plan.extracted_keywords:
            # Merge caller-supplied keywords
            merged = set(keywords) | {k.lower() for k in plan.extracted_keywords}
            keywords = sorted(merged)

        # 2. Business type scoring
        matched_types: list[tuple[str, dict, int]] = []
        for btype_id, btype_cfg in business_types.items():
            match_keywords = btype_cfg.get("match_keywords", [])
            score = _score_business_type(keywords, match_keywords)
            if score > 0:
                matched_types.append((btype_id, btype_cfg, score))

        # Sort by score descending; require >= 2 keyword hits to avoid false positives
        matched_types = [(t, c, s) for t, c, s in matched_types if s >= 2]
        matched_types.sort(key=lambda x: x[2], reverse=True)

        # 3 & 4. Build violations for all matched types
        violations: list[Violation] = []
        rules: list[Rule] = []
        seen_rule_ids: set[str] = set()

        for btype_id, btype_cfg, _score in matched_types:
            for article_cfg in btype_cfg.get("key_articles", []):
                rule_id = article_cfg.get("rule_id", "")
                if rule_id in seen_rule_ids:
                    continue
                seen_rule_ids.add(rule_id)

                condition_keywords = article_cfg.get("condition_keywords", [])
                matched = [
                    ck for ck in condition_keywords
                    if any(ck.lower() in ek for ek in keywords)
                ]

                # Only flag violations for rules whose condition keywords hit
                if not matched:
                    continue

                severity = article_cfg.get("severity", "informational")
                law_id_key = article_cfg.get("law_id", "")
                article = article_cfg.get("article", "")
                requirement = article_cfg.get("requirement", "")

                rule = Rule(
                    id=rule_id,
                    law_id=law_id_key,
                    article_id=article,
                    description=requirement,
                    mandatory=severity == "mandatory",
                    business_types=[btype_id],
                    condition_keywords=condition_keywords,
                    requirement=requirement,
                    severity=severity,  # type: ignore[arg-type]
                )
                rules.append(rule)

                excerpt = _find_excerpt(plan.parsed_text, matched)
                citation = Citation(
                    law_id=law_id_key,
                    article_id=article,
                    version="2025-10-01",
                    excerpt=excerpt[:200],
                    confidence=round(len(matched) / max(len(condition_keywords), 1), 2),
                )

                violation = Violation(
                    rule_id=rule_id,
                    article_ref=citation,
                    matched_keywords=matched,
                    severity=severity,  # type: ignore[arg-type]
                    user_context=excerpt[:300],
                    description=requirement,
                )
                violations.append(violation)

        mandatory_count = sum(1 for v in violations if v.severity == "mandatory")
        recommended_count = sum(1 for v in violations if v.severity == "recommended")

        summary_parts = []
        if mandatory_count:
            summary_parts.append(f"필수 준수 사항 {mandatory_count}건")
        if recommended_count:
            summary_parts.append(f"권고 사항 {recommended_count}건")
        if not violations:
            summary_parts.append("해당 법규 없음 — 사업 내용을 확인해주세요")

        summary = ", ".join(summary_parts) + " 확인됨" if violations else summary_parts[0]

        return ComplianceCheck(
            id=str(uuid.uuid4()),
            business_plan=plan,
            business_type=matched_types[0][0] if matched_types else "unknown",
            check_date=datetime.now(timezone.utc).date().isoformat(),
            ran_at=datetime.now(timezone.utc),
            rules=rules,
            violations=violations,
            citations=[v.article_ref for v in violations if v.article_ref],
            summary=summary,
        )

    # H1 compat shim
    def check_legacy(self, business_type: str, details: dict[str, Any]) -> dict[str, Any]:
        """Legacy interface — returns stub dict."""
        raise NotImplementedError("Use check(BusinessPlan) instead (H2+)")
