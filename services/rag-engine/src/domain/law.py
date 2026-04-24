"""Core law domain models — mirrors TS domain/law.ts"""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class Paragraph(BaseModel):
    """항 (paragraph)"""
    number: str        # "①", "②"
    text: str


class Article(BaseModel):
    """조문 (article)"""
    id: str            # "§2(7)"
    number: str        # "2"
    title: Optional[str] = None
    text: str
    paragraphs: Optional[list[Paragraph]] = None
    references: Optional[list[str]] = None  # article ids this article cites


class Law(BaseModel):
    """법령"""
    id: str            # e.g., "013670"
    name_ko: str       # "수소경제 육성 및 수소 안전관리에 관한 법률"
    name_en: Optional[str] = None
    type: str          # statute | decree | rule | ordinance
    enforcement_date: str  # ISO date
    last_amended: Optional[str] = None
    articles: list[Article] = []
    metadata: Optional[dict] = None


class Citation(BaseModel):
    """인용 (citation)"""
    law_id: str
    article_id: str
    version: str       # enforcement_date
    excerpt: str       # 200 chars
    confidence: Optional[float] = None  # 0.0-1.0
