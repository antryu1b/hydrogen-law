"""Unit tests for ComplianceService — H2 implementation.

Tests 5 fixture business plans against expected violation sets.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.domain.compliance import BusinessPlan
from src.services.compliance_service import ComplianceService

FIXTURES_DIR = (
    Path(__file__).parent.parent.parent.parent
    / "tests"
    / "fixtures"
    / "business_plans"
)

CONFIG_PATH = Path(__file__).parent.parent / "law_config.yaml"


def _load_plan(filename: str) -> BusinessPlan:
    txt = (FIXTURES_DIR / filename).read_text(encoding="utf-8")
    return BusinessPlan(
        id=f"test-{filename}",
        filename=filename,
        uploaded_at=datetime.now(timezone.utc),
        parsed_text=txt,
    )


def _load_expected() -> dict:
    return json.loads((FIXTURES_DIR / "expected_violations.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def service() -> ComplianceService:
    return ComplianceService(config_path=str(CONFIG_PATH))


@pytest.fixture(scope="module")
def expected() -> dict:
    return _load_expected()


class TestComplianceServiceFixtures:
    def test_sample1_hydrogen_station(self, service, expected):
        plan = _load_plan("sample-1-hydrogen-station.txt")
        check = service.check(plan)
        exp = expected["sample-1-hydrogen-station"]

        rule_ids = {v.rule_id for v in check.violations}
        mandatory_count = sum(1 for v in check.violations if v.severity == "mandatory")

        # Must have at least mandatory_min mandatory violations
        assert mandatory_count >= exp["expected_mandatory_min"], (
            f"Expected >= {exp['expected_mandatory_min']} mandatory, got {mandatory_count}"
        )
        # At least half of expected rule IDs must appear
        expected_ids = set(exp["expected_rule_ids"])
        overlap = rule_ids & expected_ids
        recall = len(overlap) / len(expected_ids) if expected_ids else 1.0
        assert recall >= 0.5, (
            f"Rule recall too low: {recall:.2f} ({overlap} of {expected_ids})"
        )

    def test_sample2_hydrogen_transport(self, service, expected):
        plan = _load_plan("sample-2-hydrogen-transport.txt")
        check = service.check(plan)
        exp = expected["sample-2-hydrogen-transport"]

        rule_ids = {v.rule_id for v in check.violations}
        mandatory_count = sum(1 for v in check.violations if v.severity == "mandatory")

        assert mandatory_count >= exp["expected_mandatory_min"]
        expected_ids = set(exp["expected_rule_ids"])
        overlap = rule_ids & expected_ids
        recall = len(overlap) / len(expected_ids) if expected_ids else 1.0
        assert recall >= 0.5, f"Rule recall: {recall:.2f}"

    def test_sample3_edge_case_no_mandatory(self, service, expected):
        """Edge case: consulting-only plan — no mandatory violations expected."""
        plan = _load_plan("sample-3-edge-case.txt")
        check = service.check(plan)
        exp = expected["sample-3-edge-case"]

        mandatory_count = sum(1 for v in check.violations if v.severity == "mandatory")
        assert mandatory_count == exp["expected_mandatory_min"], (
            f"Expected 0 mandatory violations, got {mandatory_count}: {[v.rule_id for v in check.violations]}"
        )

    def test_sample4_hydrogen_storage(self, service, expected):
        plan = _load_plan("sample-4-hydrogen-storage.txt")
        check = service.check(plan)
        exp = expected["sample-4-hydrogen-storage"]

        rule_ids = {v.rule_id for v in check.violations}
        mandatory_count = sum(1 for v in check.violations if v.severity == "mandatory")

        assert mandatory_count >= exp["expected_mandatory_min"]
        expected_ids = set(exp["expected_rule_ids"])
        overlap = rule_ids & expected_ids
        recall = len(overlap) / len(expected_ids) if expected_ids else 1.0
        assert recall >= 0.5, f"Rule recall: {recall:.2f}"

    def test_sample5_fuel_cell(self, service, expected):
        plan = _load_plan("sample-5-fuel-cell.txt")
        check = service.check(plan)
        exp = expected["sample-5-fuel-cell"]

        rule_ids = {v.rule_id for v in check.violations}
        mandatory_count = sum(1 for v in check.violations if v.severity == "mandatory")

        assert mandatory_count >= exp["expected_mandatory_min"]
        expected_ids = set(exp["expected_rule_ids"])
        overlap = rule_ids & expected_ids
        recall = len(overlap) / len(expected_ids) if expected_ids else 1.0
        assert recall >= 0.5, f"Rule recall: {recall:.2f}"


class TestComplianceServiceUnit:
    def test_check_returns_compliance_check(self, service):
        plan = BusinessPlan(
            id="unit-test",
            filename="test.txt",
            uploaded_at=datetime.now(timezone.utc),
            parsed_text="수소충전소 설치 허가 운영 충전설비",
        )
        check = service.check(plan)
        assert check.id
        assert isinstance(check.violations, list)
        assert isinstance(check.summary, str)

    def test_check_empty_plan_returns_no_mandatory(self, service):
        plan = BusinessPlan(
            id="empty",
            filename="empty.txt",
            uploaded_at=datetime.now(timezone.utc),
            parsed_text="일반 사업 계획서입니다.",
        )
        check = service.check(plan)
        mandatory = [v for v in check.violations if v.severity == "mandatory"]
        assert len(mandatory) == 0

    def test_violation_has_article_ref(self, service):
        plan = BusinessPlan(
            id="ref-test",
            filename="ref.txt",
            uploaded_at=datetime.now(timezone.utc),
            parsed_text="수소충전소 설치 허가 운영을 위한 사업계획입니다. 충전설비 구축 예정.",
        )
        check = service.check(plan)
        for v in check.violations:
            assert v.article_ref is not None, f"Violation {v.rule_id} has no article_ref"
            assert v.article_ref.law_id
            assert v.article_ref.article_id

    def test_summary_not_empty(self, service):
        plan = BusinessPlan(
            id="summary-test",
            filename="s.txt",
            uploaded_at=datetime.now(timezone.utc),
            parsed_text="수소저장 저장탱크 설치 허가 수소저장시설",
        )
        check = service.check(plan)
        assert len(check.summary) > 0

    def test_integration_with_real_config(self, service):
        """Integration: real law_config.yaml loads without error."""
        btypes = service._get_business_types()
        assert "hydrogen_station" in btypes
        assert "hydrogen_transport" in btypes
        assert "hydrogen_storage" in btypes
        assert len(btypes) >= 3
