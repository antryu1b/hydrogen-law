"""POST /upload — PDF ingest pipeline"""

import logging
import os
import re
import tempfile
from typing import Any, Dict, List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..embeddings import LawChunker, LawChunk

logger = logging.getLogger(__name__)

router = APIRouter()


def _extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF file."""
    try:
        import PyPDF2
    except ImportError:
        raise HTTPException(status_code=500, detail="PyPDF2가 설치되지 않았습니다")

    with open(pdf_path, "rb") as file:
        pdf_reader = PyPDF2.PdfReader(file)
        text_parts = []
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        return "\n".join(text_parts)


def _parse_law_articles(text: str, law_name: str, law_id: str) -> List[Dict[str, Any]]:
    """Parse law text into article units."""
    article_pattern = re.compile(r"제(\d+)조(?:의\d+)?\s*(?:\(([^)]+)\))?")
    articles = []
    seen_articles: set = set()
    matches = list(article_pattern.finditer(text))

    for i, match in enumerate(matches):
        article_number = f"제{match.group(1)}조"
        title = match.group(2) or ""

        article_key = (law_id, article_number)
        if article_key in seen_articles:
            continue
        seen_articles.add(article_key)

        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()

        if len(content) > 10:
            articles.append({
                "law_id": law_id,
                "law_name": law_name,
                "article_number": article_number,
                "title": title,
                "content": content[:2000],
            })

    return articles


def _store_to_supabase(chunks: List[LawChunk], embeddings) -> Dict[str, int]:
    """Store chunks to Supabase."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        return {"migrated": 0, "failed": 0, "error": "Supabase 환경변수 미설정"}

    try:
        from supabase import create_client
        supabase = create_client(supabase_url, supabase_key)
    except ImportError:
        return {"migrated": 0, "failed": 0, "error": "supabase 패키지 미설치"}

    migrated = 0
    failed = 0

    for i, chunk in enumerate(chunks):
        try:
            embedding_list = (
                embeddings[i].tolist()
                if hasattr(embeddings[i], "tolist")
                else list(embeddings[i])
            )
            data = {
                "id": chunk.chunk_id,
                "content": chunk.content,
                "embedding": embedding_list,
                "metadata": {
                    "law_id": chunk.law_id,
                    "law_name": chunk.law_name,
                    "article_number": chunk.article_number,
                    "paragraph_number": chunk.paragraph_number,
                    "title": chunk.title,
                    "chunk_type": chunk.chunk_type,
                    **chunk.metadata,
                },
            }
            supabase.table("law_documents").upsert(data).execute()
            migrated += 1
        except Exception as exc:
            logger.error("Supabase upsert failed for %s: %s", chunk.chunk_id, exc)
            failed += 1

    return {"migrated": migrated, "failed": failed}


@router.post("/upload")
async def upload_law_pdf(
    file: UploadFile = File(...),
    law_name: str = Form(...),
    law_id: str = Form(""),
):
    """PDF upload → parse → chunk → embed → store pipeline."""
    from ..retrievers.registry import get as get_retriever

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다")

    # Resolve search service via app state
    import sys
    main_mod = sys.modules.get('main') or sys.modules.get('__main__')
    _search_service = getattr(main_mod, '_search_service', None)
    if _search_service is None:
        raise HTTPException(status_code=503, detail="RAG 엔진이 초기화되지 않았습니다")
    embedder = _search_service.embedder
    vector_store = _search_service.vector_store

    if embedder is None or vector_store is None:
        raise HTTPException(status_code=503, detail="RAG 엔진이 초기화되지 않았습니다")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if not law_id:
            law_id = re.sub(r"[^a-zA-Z0-9가-힣]", "_", law_name)[:50]

        text = _extract_text_from_pdf(tmp_path)
        if not text.strip():
            raise HTTPException(status_code=400, detail="PDF에서 텍스트를 추출할 수 없습니다")

        articles = _parse_law_articles(text, law_name, law_id)

        chunker = LawChunker()
        all_chunks: List[LawChunk] = []
        for article in articles:
            all_chunks.extend(
                chunker.chunk_article(
                    law_id=article["law_id"],
                    law_name=article["law_name"],
                    article_number=article["article_number"],
                    title=article["title"],
                    content=article["content"],
                )
            )

        if not all_chunks:
            raise HTTPException(status_code=400, detail="파싱된 조문이 없습니다. PDF 형식을 확인해주세요.")

        vector_store.add_chunks(all_chunks)

        texts = [chunk.content for chunk in all_chunks]
        embeddings = embedder.embed_documents(texts)
        supabase_result = _store_to_supabase(all_chunks, embeddings)

        if _search_service:
            _search_service.rebuild_bm25()

        return {
            "status": "success",
            "law_name": law_name,
            "law_id": law_id,
            "stats": {
                "total_text_length": len(text),
                "articles_found": len(articles),
                "chunks_created": len(all_chunks),
                "articles": [
                    {"article_number": a["article_number"], "title": a["title"]}
                    for a in articles[:20]
                ],
            },
            "supabase": supabase_result,
        }
    finally:
        os.unlink(tmp_path)
