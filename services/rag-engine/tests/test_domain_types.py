"""Domain model round-trip serialization / deserialization tests"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.domain.law import Law, Article, Paragraph, Citation
from src.domain.compliance import Rule, Violation, ComplianceCheck, ComplianceReport
from src.domain.subscription import Subscription, Alert, ChannelConfig, DiscordConfig
from src.domain.diff import ChangedArticle, VersionDiff


class TestLawRoundTrip:
    def test_paragraph_round_trip(self):
        p = Paragraph(number="①", text="첫번째 항")
        data = p.model_dump()
        restored = Paragraph.model_validate(data)
        assert restored.number == p.number
        assert restored.text == p.text

    def test_article_round_trip(self):
        a = Article(
            id="§2(1)",
            number="2",
            title="정의",
            text="이 법에서 사용하는 용어의 뜻은 다음과 같다.",
            paragraphs=[Paragraph(number="①", text="수소란...")],
            references=["§1"],
        )
        data = a.model_dump()
        restored = Article.model_validate(data)
        assert restored.id == a.id
        assert restored.number == a.number
        assert len(restored.paragraphs) == 1
        assert restored.paragraphs[0].number == "①"

    def test_law_round_trip(self):
        law = Law(
            id="013670",
            name_ko="수소경제 육성 및 수소 안전관리에 관한 법률",
            type="statute",
            enforcement_date="2025-10-01",
            articles=[
                Article(id="§1", number="1", text="목적", title="목적")
            ],
            metadata={"articleCount": 100},
        )
        data = law.model_dump()
        restored = Law.model_validate(data)
        assert restored.id == law.id
        assert restored.name_ko == law.name_ko
        assert len(restored.articles) == 1
        assert restored.metadata["articleCount"] == 100

    def test_citation_round_trip(self):
        c = Citation(
            law_id="013670",
            article_id="§2(1)",
            version="2025-10-01",
            excerpt="수소란...",
            confidence=0.95,
        )
        data = c.model_dump()
        restored = Citation.model_validate(data)
        assert restored.confidence == 0.95

    def test_law_optional_fields_none(self):
        law = Law(
            id="013670",
            name_ko="수소법",
            type="statute",
            enforcement_date="2025-10-01",
            articles=[],
        )
        assert law.name_en is None
        assert law.last_amended is None
        assert law.metadata is None


class TestComplianceRoundTrip:
    def test_rule_round_trip(self):
        rule = Rule(
            id="r001",
            law_id="013670",
            article_id="§18",
            description="수소충전소 설치 허가",
            mandatory=True,
            business_types=["수소충전소_설치_운영"],
        )
        data = rule.model_dump()
        restored = Rule.model_validate(data)
        assert restored.mandatory is True
        assert "수소충전소_설치_운영" in restored.business_types

    def test_violation_severity(self):
        v = Violation(
            rule_id="r001",
            description="허가 없이 운영",
            severity="high",
        )
        assert v.severity == "high"
        assert v.remediation is None

    def test_compliance_report_round_trip(self):
        report = ComplianceReport(
            check_id="chk-001",
            business_type="수소충전소_설치_운영",
            total_rules=10,
            passed_rules=8,
            failed_rules=2,
            risk_level="medium",
            summary="2건 위반 발견",
            generated_at="2026-04-24T00:00:00",
        )
        data = report.model_dump()
        restored = ComplianceReport.model_validate(data)
        assert restored.risk_level == "medium"
        assert restored.failed_rules == 2


class TestSubscriptionRoundTrip:
    def test_subscription_round_trip(self):
        sub = Subscription(
            id="sub-001",
            user_id="user-001",
            law_ids=["013670"],
            channel="discord",
            channel_config=ChannelConfig(
                discord=DiscordConfig(webhook_url="https://discord.com/api/webhooks/xxx")
            ),
            created_at="2026-04-24T00:00:00",
        )
        data = sub.model_dump()
        restored = Subscription.model_validate(data)
        assert restored.channel == "discord"
        assert restored.channel_config.discord.webhook_url.startswith("https://")

    def test_alert_round_trip(self):
        alert = Alert(
            id="alert-001",
            subscription_id="sub-001",
            law_id="013670",
            triggered_at="2026-04-24T00:00:00",
            change_type="amendment",
            description="제2조 개정",
        )
        data = alert.model_dump()
        restored = Alert.model_validate(data)
        assert restored.delivered is False
        assert restored.change_type == "amendment"


class TestDiffRoundTrip:
    def test_changed_article_round_trip(self):
        ca = ChangedArticle(
            article_id="§2(1)",
            article_number="제2조",
            change_type="modified",
            before="이전 내용",
            after="새 내용",
        )
        data = ca.model_dump()
        restored = ChangedArticle.model_validate(data)
        assert restored.change_type == "modified"
        assert restored.before == "이전 내용"

    def test_version_diff_round_trip(self):
        diff = VersionDiff(
            law_id="013670",
            from_version="2025-01-01",
            to_version="2025-10-01",
            changed_articles=[
                ChangedArticle(
                    article_id="§2",
                    article_number="제2조",
                    change_type="modified",
                )
            ],
            summary="제2조 개정",
        )
        data = diff.model_dump()
        restored = VersionDiff.model_validate(data)
        assert len(restored.changed_articles) == 1
        assert restored.from_version == "2025-01-01"
