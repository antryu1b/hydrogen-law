"""Version diff domain models — target for H5"""

from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel


class ChangedArticle(BaseModel):
    article_id: str
    article_number: str
    change_type: Literal['added', 'modified', 'deleted']
    before: Optional[str] = None  # previous text
    after: Optional[str] = None   # new text


class VersionDiff(BaseModel):
    law_id: str
    from_version: str    # ISO date (enforcement_date)
    to_version: str      # ISO date
    changed_articles: list[ChangedArticle]
    summary: str
