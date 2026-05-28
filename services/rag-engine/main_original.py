"""
수소법률 RAG 엔진 - FastAPI 메인 엔트리포인트

LLM 최소화 접근법:
- 90% 순수 검색 (벡터 + BM25)
- 10% 선택적 LLM (사용자 요청 시만)
"""

import logging
import os
import re
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import List, Optional, Dict, Any
import uvicorn

logger = logging.getLogger(__name__)

import chromadb

from src.embeddings import KoreanEmbedder, LawChunker, LawChunk, VectorStore
from src.retrieval import HybridRetriever

# 전역 변수로 검색 엔진 초기화
embedder = None
vector_store = None
retriever = None

app = FastAPI(
    title="수소법률 RAG 엔진",
    description="국가법령정보센터 기반 수소 관련 법률 검색 시스템",
    version="1.0.0",
)

# CORS 설정 (환경변수에서 허용 origin 로드)
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# 요청/응답 모델
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


class ComplianceRequest(BaseModel):
    business_type: str
    details: Dict[str, Any]


class ComplianceResponse(BaseModel):
    business_type: str
    checklist: List[Dict[str, Any]]
    summary: Dict[str, Any]
    risk_assessment: str
    metadata: Dict[str, Any]


def _load_documents_from_chroma(collection, batch_size: int = 500):
    """ChromaDB 컬렉션에서 문서를 배치로 읽어옵니다."""
    total_docs = collection.count()
    documents = []
    offset = 0
    while offset < total_docs:
        result = collection.get(
            limit=batch_size,
            offset=offset,
            include=["documents", "metadatas"],
        )
        if not result["documents"]:
            break
        for doc, meta in zip(result["documents"], result["metadatas"]):
            documents.append(
                {
                    "id": meta.get("chunk_id", ""),
                    "content": doc,
                    "metadata": meta,
                }
            )
        offset += batch_size
    return documents, total_docs


@app.on_event("startup")
async def startup_event():
    """서버 시작 시 검색 엔진 초기화"""
    global embedder, vector_store, retriever

    print("=" * 60)
    print("수소법률 RAG 엔진 시작")
    print("=" * 60)

    # 1. 임베딩 모델 로드 시도
    print("\n1️⃣ 임베딩 모델 로드 중...")
    try:
        embedder = KoreanEmbedder()
        print("✅ 임베딩 모델 로드 완료")
    except Exception as e:
        embedder = None
        print(f"⚠️ 임베딩 모델 로드 실패 (BM25 전용 모드로 전환): {e}")

    # 2. 문서 로드 (ChromaDB 또는 JSON 파일)
    print("2️⃣ 문서 로드 중...")
    documents = []
    total_docs = 0
    base_dir = os.path.dirname(__file__)
    chroma_dir = os.path.join(base_dir, "chroma_db")

    if embedder is not None:
        vector_store = VectorStore(collection_name="hydrogen_law", embedder=embedder)
        documents, total_docs = _load_documents_from_chroma(vector_store.collection)
    else:
        # BM25 전용 모드: ChromaDB에서 로드 시도
        try:
            chroma_client = chromadb.PersistentClient(
                path=chroma_dir,
                settings=chromadb.Settings(anonymized_telemetry=False, allow_reset=True),
            )
            collection = chroma_client.get_or_create_collection(
                name="hydrogen_law",
                metadata={"description": "수소 관련 법령 벡터 데이터베이스"},
            )
            documents, total_docs = _load_documents_from_chroma(collection)
        except Exception as e:
            print(f"  ChromaDB 로드 실패: {e}")

    # ChromaDB가 비어있으면 JSON 파일에서 로드
    if not documents:
        import json as json_mod
        json_path = os.path.join(base_dir, "law_documents.json")
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                documents = json_mod.load(f)
            total_docs = len(documents)
            print(f"  ✅ JSON 파일에서 {total_docs}개 문서 로드")
        else:
            print("  ⚠️ 문서 데이터를 찾을 수 없습니다")

    # 3. 검색 엔진 초기화
    print("3️⃣ 검색 엔진 초기화 중...")
    if vector_store is not None:
        retriever = HybridRetriever(vector_store)
    else:
        # BM25 전용 모드에서는 dummy vector_store 없이 retriever 직접 초기화
        retriever = HybridRetriever.__new__(HybridRetriever)
        retriever.vector_store = None
        retriever.vector_weight = 0.0
        retriever.bm25_weight = 1.0
        retriever.bm25_index = None
        retriever.documents = []
        retriever.document_ids = []

    retriever.build_bm25_index(documents)

    print(f"\n✅ 초기화 완료!")
    print(f"   문서 수: {total_docs}개")
    mode = "하이브리드 (벡터 + BM25)" if embedder else "BM25 전용"
    print(f"   검색 모드: {mode}")
    print("=" * 60)


@app.get("/")
async def root():
    """헬스 체크"""
    return {
        "status": "healthy",
        "service": "수소법률 RAG 엔진",
        "version": "1.0.0",
        "llm_mode": "minimal (90% search, 10% optional)",
    }


@app.get("/health")
async def health_check():
    """서비스 상태 확인"""
    return {
        "status": "healthy",
        "dependencies": {
            "vector_db": "not_initialized",
            "embedding_model": "not_loaded",
            "law_database": "not_connected",
        },
    }


@app.post("/search", response_model=SearchResponse)
async def search_laws(request: SearchRequest):
    """
    법률 검색 (LLM 없이 작동)

    하이브리드 검색:
    - 벡터 검색 (의미 기반)
    - BM25 (키워드 기반)
    """
    global retriever

    if retriever is None:
        raise HTTPException(
            status_code=503, detail="검색 엔진이 아직 초기화되지 않았습니다"
        )

    try:
        # 하이브리드 검색
        results = retriever.search(request.query, top_k=request.top_k)

        # 응답 변환
        articles = []
        for article in results["articles"]:
            articles.append(
                Article(
                    id=article["id"],
                    law_name=article["law_name"],
                    article_number=article["article_number"],
                    title=article["title"],
                    content=article["content"],
                    highlighted_content=article.get(
                        "highlighted_content", article["content"]
                    ),
                    related_articles=article.get("related_articles", []),
                    relevance_score=article["relevance_score"],
                )
            )

        return SearchResponse(
            query=results["query"],
            total_found=results["total_found"],
            keywords=results.get("keywords", []),
            relevant_laws=results.get("relevant_laws", []),
            articles=articles,
            metadata=results["metadata"],
        )

    except (KeyError, ValueError, AttributeError) as e:
        logger.error(f"Search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="검색 처리 중 오류가 발생했습니다")
    except Exception as e:
        logger.critical(f"Unexpected search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="시스템 오류가 발생했습니다")


@app.post("/compliance/check", response_model=ComplianceResponse)
async def check_compliance(request: ComplianceRequest):
    """
    컴플라이언스 체크 (규칙 기반, LLM 없음)

    사업 유형별 필수 법령 매칭
    """
    # TODO: 규칙 기반 컴플라이언스 엔진 구현
    raise HTTPException(status_code=501, detail="컴플라이언스 엔진 구현 예정")


@app.post("/ai-summary")
async def ai_summary(request: Dict[str, Any]):
    """
    AI 요약 (선택적 LLM 사용)

    사용자가 명시적으로 요청할 때만 호출
    """
    # TODO: Claude API 통합
    raise HTTPException(status_code=501, detail="AI 요약 구현 예정")


@app.get("/laws")
async def list_laws():
    """수집된 법령 목록 조회"""
    # TODO: DB에서 법령 목록 조회
    return {"total_laws": 0, "laws": []}


@app.get("/laws/{law_id}")
async def get_law_detail(law_id: str):
    """특정 법령 상세 정보"""
    # TODO: DB에서 법령 상세 조회
    raise HTTPException(status_code=404, detail="법령을 찾을 수 없습니다")


def _extract_text_from_pdf(pdf_path: str) -> str:
    """PDF에서 텍스트 추출"""
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
    """법령 텍스트를 조문 단위로 파싱"""
    article_pattern = re.compile(r"제(\d+)조(?:의\d+)?\s*(?:\(([^)]+)\))?")
    articles = []
    seen_articles = set()
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
    """청크를 Supabase에 저장"""
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
        except Exception as e:
            logger.error(f"Supabase upsert failed for {chunk.chunk_id}: {e}")
            failed += 1

    return {"migrated": migrated, "failed": failed}


@app.post("/upload")
async def upload_law_pdf(
    file: UploadFile = File(...),
    law_name: str = Form(...),
    law_id: str = Form(""),
):
    """
    법령 PDF 업로드 → 파싱 → 청킹 → 임베딩 → 저장

    전체 파이프라인을 자동으로 수행합니다.
    """
    global embedder, vector_store, retriever

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다")

    if embedder is None or vector_store is None:
        raise HTTPException(status_code=503, detail="RAG 엔진이 초기화되지 않았습니다")

    # 임시 파일로 저장
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # auto-generate law_id if not provided
        if not law_id:
            law_id = re.sub(r"[^a-zA-Z0-9가-힣]", "_", law_name)[:50]

        # 1. PDF 텍스트 추출
        text = _extract_text_from_pdf(tmp_path)
        if not text.strip():
            raise HTTPException(status_code=400, detail="PDF에서 텍스트를 추출할 수 없습니다")

        # 2. 조문 파싱
        articles = _parse_law_articles(text, law_name, law_id)

        # 3. 청킹
        chunker = LawChunker()
        all_chunks: List[LawChunk] = []
        for article in articles:
            chunks = chunker.chunk_article(
                law_id=article["law_id"],
                law_name=article["law_name"],
                article_number=article["article_number"],
                title=article["title"],
                content=article["content"],
            )
            all_chunks.extend(chunks)

        if not all_chunks:
            raise HTTPException(
                status_code=400,
                detail="파싱된 조문이 없습니다. PDF 형식을 확인해주세요."
            )

        # 4. 임베딩 생성 + ChromaDB 저장
        vector_store.add_chunks(all_chunks)

        # 5. Supabase 저장
        texts = [chunk.content for chunk in all_chunks]
        embeddings = embedder.embed_documents(texts)
        supabase_result = _store_to_supabase(all_chunks, embeddings)

        # 6. BM25 인덱스 재구축
        if retriever is not None:
            stats = vector_store.get_stats()
            total_docs = stats["total_documents"]
            documents = []
            batch_size = 500
            offset = 0
            while offset < total_docs:
                result = vector_store.collection.get(
                    limit=batch_size,
                    offset=offset,
                    include=["documents", "metadatas"],
                )
                if not result["documents"]:
                    break
                for doc, metadata in zip(result["documents"], result["metadatas"]):
                    documents.append({
                        "id": metadata.get("chunk_id", ""),
                        "content": doc,
                        "metadata": metadata,
                    })
                offset += batch_size
            retriever.build_bm25_index(documents)

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


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
