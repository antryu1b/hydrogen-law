"""
하이브리드 검색 엔진 (LLM 없이 작동)

검색 방식:
1. 벡터 검색 (의미 기반) - 70%
2. BM25 검색 (키워드 기반) - 30%
3. Reciprocal Rank Fusion으로 결과 융합
4. 규칙 기반 재랭킹
"""

from typing import List, Dict, Optional
import numpy as np
from rank_bm25 import BM25Okapi
from datetime import datetime
import re

from ..embeddings import VectorStore, KoreanEmbedder


class HybridRetriever:
    """하이브리드 검색 엔진 (벡터 + BM25)"""

    def __init__(
        self,
        vector_store: VectorStore,
        vector_weight: float = 0.7,
        bm25_weight: float = 0.3
    ):
        """
        Args:
            vector_store: 벡터 스토어
            vector_weight: 벡터 검색 가중치
            bm25_weight: BM25 가중치
        """
        self.vector_store = vector_store
        self.vector_weight = vector_weight
        self.bm25_weight = bm25_weight

        # BM25 인덱스 (초기화 시 빌드)
        self.bm25_index = None
        self.documents = []
        self.document_ids = []

        print("하이브리드 검색 엔진 초기화")

    def build_bm25_index(self, documents: List[Dict]) -> None:
        """
        BM25 인덱스 구축

        Args:
            documents: 문서 리스트 [{"id": ..., "content": ...}]
        """
        print(f"BM25 인덱스 구축 중 ({len(documents)}개 문서)...")

        self.documents = documents
        self.document_ids = [doc['id'] for doc in documents]

        if not documents:
            print("⚠️ 문서가 없어 BM25 인덱스를 생성하지 않습니다")
            self.bm25_index = None
            return

        # 토큰화
        tokenized_corpus = [
            self._tokenize(doc['content'])
            for doc in documents
        ]

        # BM25 인덱스 생성
        self.bm25_index = BM25Okapi(tokenized_corpus)

        print("BM25 인덱스 구축 완료")

    def search(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict] = None
    ) -> Dict:
        """
        하이브리드 검색 (LLM 없음)

        Args:
            query: 검색 쿼리
            top_k: 결과 수
            filters: 메타데이터 필터

        Returns:
            검색 결과
        """
        start_time = datetime.now()

        # 1. 쿼리 전처리
        processed_query = self._preprocess_query(query)

        # 2. 벡터 검색 (vector_store가 있을 때만)
        vector_results = []
        if self.vector_store is not None:
            vector_results = self.vector_store.search(
                query=processed_query['original'],
                top_k=top_k * 2,  # 더 많이 가져와서 융합
                filters=filters
            )

        # 3. BM25 검색
        bm25_results = self._bm25_search(
            query=processed_query['original'],
            top_k=top_k * 2
        )

        # 4. 결과 융합 (Reciprocal Rank Fusion)
        merged_results = self._reciprocal_rank_fusion(
            vector_results,
            bm25_results
        )

        # 5. 규칙 기반 재랭킹
        ranked_results = self._rule_based_ranking(
            query=query,
            results=merged_results
        )

        # 6. 상위 k개 선택
        final_results = ranked_results[:top_k]

        # 7. 참조 조항 찾기
        for result in final_results:
            result['related_articles'] = self._find_related_articles(result)

        # 8. 응답 포맷팅
        search_time = (datetime.now() - start_time).total_seconds() * 1000  # ms

        response = self._format_response(
            query=query,
            results=final_results,
            search_time_ms=search_time,
            keywords=processed_query['tokens']
        )

        return response

    def _preprocess_query(self, query: str) -> Dict:
        """쿼리 전처리 (LLM 없음)"""
        # 불용어 제거
        stopwords = ['은', '는', '이', '가', '을', '를', '의', '에', '와', '과']
        tokens = [t for t in query.split() if t not in stopwords]

        # 법률 용어 인식
        legal_terms = self._extract_legal_terms(query)

        # 조항 번호 추출
        article_refs = self._extract_article_numbers(query)

        return {
            'original': query,
            'tokens': tokens,
            'legal_terms': legal_terms,
            'article_refs': article_refs
        }

    # 한국어 조사/어미 패턴 (토큰 끝에서 제거)
    _KO_SUFFIXES = re.compile(
        r'(은|는|이|가|을|를|에|의|로|와|과|도|만|부터|까지|에서|으로|하여|하고|하는|하면|한다|된다|이다|한|된|할|함|등|및)$'
    )

    def _tokenize(self, text: str) -> List[str]:
        """한국어 토큰화 (공백 기반 + 조사 제거 + 공백 무시 변형)"""
        tokens = text.split()
        result = []
        for token in tokens:
            # 원본 토큰 추가
            result.append(token)
            # 조사/어미 제거한 어간 추가
            stem = self._KO_SUFFIXES.sub('', token)
            if stem and stem != token:
                result.append(stem)
        # 공백 무시 매칭: 전체 텍스트에서 공백을 제거한 단일 토큰도 추가하여
        # "연료 전지" 가 "연료전지" 질의와, 그 반대로도 매칭되도록 한다.
        nospace = ''.join(tokens)
        if nospace and nospace not in result:
            result.append(nospace)
        return result

    @staticmethod
    def _split_korean_compound(word: str) -> List[str]:
        """한국어 복합어를 2글자 서브스트링으로 분리"""
        parts = [word]
        if len(word) >= 4:
            # 2글자씩 슬라이딩 윈도우
            for i in range(len(word) - 1):
                sub = word[i:i+2]
                if sub != word:
                    parts.append(sub)
        return parts

    def _substring_search(self, query: str, top_k: int) -> List[Dict]:
        """단순 부분문자열 검색 (BM25 보완용, 공백 무시)"""
        results = []
        # 원본 키워드 + 복합어 분리 키워드
        raw_keywords = query.split()
        keywords = []
        for kw in raw_keywords:
            keywords.extend(self._split_korean_compound(kw))
        # 공백 무시 매칭을 위해 질의 전체에서 공백을 제거한 키워드도 추가
        # ("연료 전지" -> "연료전지"). 이후 비교는 공백 제거된 content 에 대해 수행.
        nospace_query = ''.join(raw_keywords)
        if nospace_query:
            keywords.append(nospace_query)
        # 중복 제거, 길이 1 이하 제외
        keywords = list(dict.fromkeys(kw for kw in keywords if len(kw) >= 2))
        # 원본 키워드도 공백 제거 형태로 비교 (가중치 판단용)
        raw_nospace = {kw.replace(' ', '') for kw in raw_keywords}
        raw_nospace.add(nospace_query)

        for doc in self.documents:
            # 공백을 제거한 content 에 대해 부분문자열 비교 → "연료 전지" 문서가
            # "연료전지" 질의와, 그 반대로도 매칭된다.
            content = doc['content'].replace(' ', '')
            match_count = sum(1 for kw in keywords if kw in content)
            if match_count > 0:
                # 원본 키워드 매칭에 가중치 부여
                score = 0
                for kw in keywords:
                    cnt = content.count(kw)
                    if cnt > 0:
                        weight = 3.0 if kw in raw_nospace else 1.0
                        score += cnt * weight
                results.append({
                    'id': doc['id'],
                    'content': doc['content'],
                    'metadata': doc.get('metadata', {}),
                    'bm25_score': float(score),
                })
        results.sort(key=lambda x: x['bm25_score'], reverse=True)
        return results[:top_k]

    def _bm25_search(self, query: str, top_k: int) -> List[Dict]:
        """BM25 검색 (결과 없으면 부분문자열 검색으로 폴백)"""
        if not self.bm25_index:
            return self._substring_search(query, top_k)

        # 쿼리 토큰화
        tokenized_query = self._tokenize(query)

        # BM25 스코어 계산
        scores = self.bm25_index.get_scores(tokenized_query)

        # 상위 k개 인덱스
        top_indices = np.argsort(scores)[::-1][:top_k]

        # 결과 포맷팅
        results = []
        for idx in top_indices:
            if scores[idx] > 0:  # 0보다 큰 스코어만
                results.append({
                    'id': self.document_ids[idx],
                    'content': self.documents[idx]['content'],
                    'metadata': self.documents[idx].get('metadata', {}),
                    'bm25_score': float(scores[idx])
                })

        # BM25 결과가 부족하면 부분문자열 검색으로 보완
        if len(results) < top_k:
            substr_results = self._substring_search(query, top_k)
            existing_ids = {r['id'] for r in results}
            for sr in substr_results:
                if sr['id'] not in existing_ids:
                    results.append(sr)
                    existing_ids.add(sr['id'])
                if len(results) >= top_k:
                    break

        return results

    def _reciprocal_rank_fusion(
        self,
        vector_results: List[Dict],
        bm25_results: List[Dict],
        k: int = 60
    ) -> List[Dict]:
        """
        Reciprocal Rank Fusion으로 결과 융합

        Args:
            vector_results: 벡터 검색 결과
            bm25_results: BM25 검색 결과
            k: RRF 파라미터

        Returns:
            융합된 결과
        """
        # 결과 병합
        doc_scores = {}

        # 벡터 검색 결과
        for rank, result in enumerate(vector_results, 1):
            doc_id = result['id']

            if doc_id not in doc_scores:
                doc_scores[doc_id] = {
                    'content': result['content'],
                    'metadata': result['metadata'],
                    'vector_score': 0,
                    'bm25_score': 0,
                    'fusion_score': 0
                }

            # RRF 스코어
            doc_scores[doc_id]['vector_score'] = self.vector_weight / (k + rank)
            doc_scores[doc_id]['fusion_score'] += self.vector_weight / (k + rank)

        # BM25 검색 결과
        for rank, result in enumerate(bm25_results, 1):
            doc_id = result['id']

            if doc_id not in doc_scores:
                # BM25에만 있는 결과
                for doc in self.documents:
                    if doc['id'] == doc_id:
                        doc_scores[doc_id] = {
                            'content': doc['content'],
                            'metadata': doc.get('metadata', {}),
                            'vector_score': 0,
                            'bm25_score': 0,
                            'fusion_score': 0
                        }
                        break

            # RRF 스코어
            doc_scores[doc_id]['bm25_score'] = self.bm25_weight / (k + rank)
            doc_scores[doc_id]['fusion_score'] += self.bm25_weight / (k + rank)

        # 스코어 순으로 정렬
        merged = [
            {
                'id': doc_id,
                'content': info['content'],
                'metadata': info['metadata'],
                'similarity_score': info['fusion_score']
            }
            for doc_id, info in doc_scores.items()
        ]

        merged.sort(key=lambda x: x['similarity_score'], reverse=True)

        return merged

    def _rule_based_ranking(self, query: str, results: List[Dict]) -> List[Dict]:
        """규칙 기반 재랭킹"""
        for result in results:
            score = result['similarity_score']
            metadata = result['metadata']

            # 규칙 1: 제목에 쿼리 단어 포함
            title = metadata.get('title', '')
            if any(word in title for word in query.split()):
                score += 10

            # 규칙 2: 법령 타입 우선순위
            type_boost = {
                '법률': 5,
                '시행령': 3,
                '시행규칙': 2,
                '별표': 1
            }
            law_type = metadata.get('chunk_type', '')
            score += type_boost.get(law_type, 0)

            # 규칙 3: 정의 조항 우선
            if metadata.get('is_definition'):
                score += 3

            result['final_score'] = score

        # 재정렬
        results.sort(key=lambda x: x['final_score'], reverse=True)

        return results

    def _extract_legal_terms(self, text: str) -> List[str]:
        """법률 용어 사전 기반 추출"""
        legal_dict = {
            '설치': '설치기준',
            '운영': '운영기준',
            '검사': '안전검사',
            '인증': '인증기준',
            '충전소': '수소충전소',
            '저장소': '수소저장소'
        }

        terms = []
        for key, value in legal_dict.items():
            if key in text:
                terms.append(value)

        return terms

    def _extract_article_numbers(self, text: str) -> List[str]:
        """조항 번호 추출"""
        pattern = re.compile(r'제\d+조(?:제\d+항)?(?:제\d+호)?')
        return pattern.findall(text)

    def _find_related_articles(self, result: Dict) -> List[Dict]:
        """참조 조항 찾기 (간단 버전)"""
        # TODO: 조항 간 참조 그래프 구축 후 개선
        return []

    def _format_response(
        self,
        query: str,
        results: List[Dict],
        search_time_ms: float,
        keywords: List[str]
    ) -> Dict:
        """응답 포맷팅"""
        # 관련 법령 추출
        laws = list(set([
            r['metadata'].get('law_name', '')
            for r in results
            if r['metadata'].get('law_name')
        ]))

        return {
            'query': query,
            'total_found': len(results),
            'keywords': keywords,
            'relevant_laws': laws,
            'articles': [
                {
                    'id': r['id'],
                    'law_name': r['metadata'].get('law_name', ''),
                    'article_number': r['metadata'].get('article_number', ''),
                    'title': r['metadata'].get('title', ''),
                    'content': r['content'],
                    'highlighted_content': self._highlight(r['content'], keywords),
                    'related_articles': r.get('related_articles', []),
                    'relevance_score': r['final_score']
                }
                for r in results
            ],
            'metadata': {
                'search_time_ms': search_time_ms,
                'llm_used': False,  # LLM 미사용
                'search_method': 'hybrid',
                'vector_weight': self.vector_weight,
                'bm25_weight': self.bm25_weight
            }
        }

    def _highlight(self, content: str, keywords: List[str]) -> str:
        """키워드 하이라이팅"""
        highlighted = content

        for keyword in keywords:
            # HTML 하이라이팅
            highlighted = highlighted.replace(
                keyword,
                f'<mark>{keyword}</mark>'
            )

        return highlighted


# 사용 예시
if __name__ == "__main__":
    from ..embeddings import VectorStore

    # 벡터 스토어
    vector_store = VectorStore(collection_name="test_search")

    # 하이브리드 검색기
    retriever = HybridRetriever(vector_store)

    # 테스트 문서 준비 및 BM25 인덱스 구축
    test_docs = [
        {
            "id": "doc1",
            "content": "수소충전소 설치 기준에 관한 규정",
            "metadata": {"law_name": "수소법", "article_number": "제1조"}
        },
        {
            "id": "doc2",
            "content": "수소 저장소 안전 관리 기준",
            "metadata": {"law_name": "고압가스법", "article_number": "제5조"}
        }
    ]

    retriever.build_bm25_index(test_docs)

    # 검색
    results = retriever.search("수소충전소 안전", top_k=5)

    print(f"검색 결과: {results['total_found']}건")
    print(f"검색 시간: {results['metadata']['search_time_ms']:.2f}ms")
    print(f"LLM 사용: {results['metadata']['llm_used']}")
