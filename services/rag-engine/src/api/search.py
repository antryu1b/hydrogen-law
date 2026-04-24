"""POST /search and POST /search/batch"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    filters: Optional[Dict[str, Any]] = None

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("검색어를 입력해주세요")
        if len(v) > 500:
            raise ValueError("검색어는 500자를 초과할 수 없습니다")
        return v

    @field_validator("top_k")
    @classmethod
    def validate_top_k(cls, v: int) -> int:
        return max(1, min(v, 100))


class Article(BaseModel):
    id: str
    law_name: str
    article_number: str
    title: str
    content: str
    highlighted_content: str
    related_articles: List[Dict[str, str]]
    relevance_score: float


class SearchResponse(BaseModel):
    query: str
    total_found: int
    keywords: List[str]
    relevant_laws: List[str]
    articles: List[Article]
    metadata: Dict[str, Any]


# ---------------------------------------------------------------------------
# Retriever dependency
# ---------------------------------------------------------------------------

def _get_retriever():
    """Resolve retriever from registry at request time."""
    from ..retrievers.registry import get, list_available
    try:
        return get('hybrid')
    except KeyError:
        return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/search", response_model=SearchResponse)
async def search_laws(request: SearchRequest):
    """Law search (no LLM). Hybrid: vector + BM25."""
    retriever = _get_retriever()
    if retriever is None:
        raise HTTPException(status_code=503, detail="검색 엔진이 아직 초기화되지 않았습니다")

    try:
        results = retriever.search(request.query, top_k=request.top_k)

        articles = [
            Article(
                id=a["id"],
                law_name=a["law_name"],
                article_number=a["article_number"],
                title=a["title"],
                content=a["content"],
                highlighted_content=a.get("highlighted_content", a["content"]),
                related_articles=a.get("related_articles", []),
                relevance_score=a["relevance_score"],
            )
            for a in results["articles"]
        ]

        return SearchResponse(
            query=results["query"],
            total_found=results["total_found"],
            keywords=results.get("keywords", []),
            relevant_laws=results.get("relevant_laws", []),
            articles=articles,
            metadata=results["metadata"],
        )

    except (KeyError, ValueError, AttributeError) as exc:
        logger.error("Search error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="검색 처리 중 오류가 발생했습니다")
    except Exception as exc:
        logger.critical("Unexpected search error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="시스템 오류가 발생했습니다")
