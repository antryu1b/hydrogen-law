"""Compliance service — H2 shell.

Will implement rule-based compliance checking in Phase H2.
"""

from typing import Any


class ComplianceService:
    """Rule-based compliance engine (H2 implementation target)."""

    def check(self, business_type: str, details: dict[str, Any]) -> dict[str, Any]:
        """H2 shell — raises NotImplementedError until H2 is implemented."""
        raise NotImplementedError("Compliance engine not yet implemented (Phase H2)")
