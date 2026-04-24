"""Domain models — source of truth for H2~H6 features"""

from .law import Law, Article, Paragraph, Citation
from .compliance import Rule, Violation, ComplianceCheck, ComplianceReport
from .subscription import Subscription, Alert, DeliveryChannel
from .diff import ChangedArticle, VersionDiff

__all__ = [
    'Law', 'Article', 'Paragraph', 'Citation',
    'Rule', 'Violation', 'ComplianceCheck', 'ComplianceReport',
    'Subscription', 'Alert', 'DeliveryChannel',
    'ChangedArticle', 'VersionDiff',
]
