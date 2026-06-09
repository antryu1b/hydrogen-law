"""
선박(marine) 연료전지 기술기준 PDF → RAG 저장

load_pdfs_to_rag.py 와 동일 패턴. 차이점:
  1. PDF 경로를 law_config.yaml 의 marine_standards 에서 읽음 (하드코딩 X).
  2. vector_store.reset() 호출하지 않음 — 기존 컬렉션에 ADD (선박 sector 증분).
     (load_pdfs_to_rag.py 는 고압가스 초기 적재라 reset 함. 선박은 추가이므로 보존.)

해수부 「선박 수소연료전지 전력설비 잠정기준(안)」은 PDF 미제공이라
pdf_path 가 null/없는 항목은 자동 skip 됨 (환각 방지).
"""

import logging
import re
import sys
import os
from pathlib import Path
from typing import Any, Dict, List

import yaml

logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(__file__))

from src.embeddings import KoreanEmbedder, LawChunker, VectorStore

# NOTE: load_pdfs_to_rag.py 는 deprecated 한 PyPDF2 를 import 해서 (requirements.txt 는
# pypdf 로 표준화됨) 모듈 로드 시 sys.exit 함. 그래서 거기서 import 하지 않고
# requirements.txt 의 실제 의존성 pypdf 로 추출/파싱을 self-contained 로 둔다.
try:
    from pypdf import PdfReader
except ImportError:
    print("❌ pypdf 가 설치되지 않았습니다. 설치: pip install pypdf")
    sys.exit(1)

CONFIG_PATH = Path(__file__).parent / "law_config.yaml"
REPO_ROOT = Path(__file__).resolve().parents[2]  # services/rag-engine → repo root


def extract_text_from_pdf(pdf_path: str) -> str:
    """PDF 텍스트 추출 (pypdf). load_pdfs_to_rag.extract_text_from_pdf 와 동일 동작."""
    try:
        reader = PdfReader(pdf_path)
        print(f"   총 {len(reader.pages)}페이지")
        parts = []
        for i, page in enumerate(reader.pages, 1):
            parts.append(page.extract_text() or "")
            if i % 10 == 0:
                print(f"   진행: {i}/{len(reader.pages)} 페이지")
        return "\n".join(parts)
    except FileNotFoundError:
        logger.error(f"File not found: {pdf_path}")
        return ""
    except Exception as e:
        logger.error(f"Failed to read PDF {pdf_path}: {e}")
        return ""


def parse_law_text(text: str, law_name: str, law_id: str) -> List[Dict[str, Any]]:
    """법령/지침 텍스트를 조문 단위로 파싱 (load_pdfs_to_rag.parse_law_text 와 동일)."""
    article_pattern = re.compile(r"제(\d+)조(?:의\d+)?\s*(?:\(([^)]+)\))?")
    articles: List[Dict[str, Any]] = []
    seen = set()
    matches = list(article_pattern.finditer(text))
    print(f"\n   발견된 조문: {len(matches)}개")
    for i, m in enumerate(matches):
        num = f"제{m.group(1)}조"
        title = m.group(2) or ""
        key = (law_id, num)
        if key in seen:
            continue
        seen.add(key)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if len(content) > 10:
            articles.append({
                "law_id": law_id,
                "law_name": law_name,
                "article_number": num,
                "title": title,
                "content": content[:2000],
            })
    return articles


def load_marine_standards():
    """law_config.yaml 의 marine_standards 항목 로드."""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    return config.get("marine_standards", [])


def main():
    print("=" * 60)
    print("선박(marine) 기술기준 PDF → RAG 저장")
    print("=" * 60)

    standards = load_marine_standards()
    if not standards:
        print("❌ law_config.yaml 에 marine_standards 가 없습니다.")
        return

    all_chunks = []
    chunker = LawChunker()

    for std in standards:
        name = std.get("name", "(unnamed)")
        pdf_path = std.get("pdf_path")
        status = std.get("status")

        print(f"\n{'='*60}")
        print(f"📄 {name}  [{std.get('code') or '코드없음'}]")
        print(f"{'='*60}")

        # PDF 미제공 항목 (예: 해수부 잠정기준안) → skip
        if not pdf_path:
            print(f"⏭️  PDF 미제공 (status={status}) — TODO: 입수 후 pdf_path 기입. 건너뜀.")
            continue

        abs_path = REPO_ROOT / pdf_path
        if not abs_path.exists():
            print(f"❌ 파일 없음: {abs_path}")
            continue

        # 1. 텍스트 추출
        print(f"\n1️⃣ PDF 텍스트 추출 중...")
        text = extract_text_from_pdf(str(abs_path))
        print(f"   ✅ {len(text)} 문자 추출")

        # 2. 조문/항목 파싱 (지침도 제N조 구조를 따르는 경우가 많음)
        print(f"\n2️⃣ 조문 파싱 중...")
        law_id = std.get("id", name)
        articles = parse_law_text(text, name, law_id)
        print(f"   ✅ {len(articles)}개 조문 파싱")

        # 조문 파싱이 0이면(지침이 비-조문 구조) 전체 텍스트를 단일 문서로 청킹
        if not articles and text.strip():
            articles = [{
                "law_id": law_id,
                "law_name": name,
                "article_number": std.get("code") or "전문",
                "title": name,
                "content": text[:2000],
            }]
            print(f"   ℹ️  조문 구조 없음 → 전문 1개 문서로 처리")

        # 3. 청킹
        print(f"\n3️⃣ 청킹 중...")
        for article in articles:
            chunks = chunker.chunk_article(
                law_id=article["law_id"],
                law_name=article["law_name"],
                article_number=article["article_number"],
                title=article["title"],
                content=article["content"],
            )
            all_chunks.extend(chunks)
        print(f"   ✅ {len(all_chunks)}개 청크 (누적)")

    if not all_chunks:
        print("\n❌ 적재할 청크가 없습니다. (PDF 미제공/파싱 실패)")
        return

    # 4. 벡터 DB 저장 (ADD — reset 하지 않음)
    print(f"\n{'='*60}")
    print(f"4️⃣ 벡터 DB 저장 중 (기존 컬렉션에 ADD)...")
    print(f"{'='*60}")

    embedder = KoreanEmbedder()
    vector_store = VectorStore(collection_name="hydrogen_law", embedder=embedder)
    vector_store.add_chunks(all_chunks)

    stats = vector_store.get_stats()
    print(f"\n✅ 저장 완료!")
    print(f"   총 문서: {stats['total_documents']}개")

    # 5. 검색 테스트
    print(f"\n{'='*60}")
    print(f"5️⃣ 검색 테스트")
    print(f"{'='*60}")
    for q in ["선박용 연료전지", "선박 수소"]:
        print(f"\n🔍 쿼리: '{q}'")
        for i, r in enumerate(vector_store.search(q, top_k=3), 1):
            md = r["metadata"]
            print(f"  {i}. {md['law_name']} {md.get('article_number','')} (sim {r['similarity_score']:.3f})")


if __name__ == "__main__":
    main()
