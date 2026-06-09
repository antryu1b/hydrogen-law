"""
법령 문서 청킹 전략

규칙:
1. 짧은 조 (<500자): 전체를 하나의 청크로
2. 긴 조 (>500자): 항 단위로 분할
3. 별표: 독립된 청크로 처리
4. 정의 조항: 별도 청크
5. 중첩: 50 토큰
"""

from typing import List, Dict
from dataclasses import dataclass


@dataclass
class LawChunk:
    """법령 청크"""
    chunk_id: str
    law_id: str
    law_name: str
    article_number: str
    paragraph_number: str = ""
    title: str = ""
    content: str = ""
    chunk_type: str = "article"  # article, paragraph, definition, table
    metadata: Dict = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class LawChunker:
    """법령 문서 청킹"""

    def __init__(self, max_chunk_size: int = 512, overlap: int = 50):
        """
        Args:
            max_chunk_size: 최대 청크 크기 (문자 수)
            overlap: 중첩 크기 (문자 수)
        """
        self.max_chunk_size = max_chunk_size
        self.overlap = overlap

    def chunk_article(
        self,
        law_id: str,
        law_name: str,
        article_number: str,
        title: str,
        content: str,
        paragraphs: List[Dict] = None
    ) -> List[LawChunk]:
        """
        조문 청킹

        Args:
            law_id: 법령ID
            law_name: 법령명
            article_number: 조문 번호
            title: 조문 제목
            content: 조문 내용
            paragraphs: 항 목록

        Returns:
            청크 목록
        """
        chunks = []

        # 정의 조항인지 확인
        is_definition = self._is_definition_article(title)
        chunk_type = "definition" if is_definition else "article"

        # 짧은 조문: 전체를 하나의 청크로
        if len(content) < self.max_chunk_size:
            chunk_id = f"{law_id}_{article_number}"

            chunk = LawChunk(
                chunk_id=chunk_id,
                law_id=law_id,
                law_name=law_name,
                article_number=article_number,
                title=title,
                content=content,
                chunk_type=chunk_type,
                metadata={
                    "full_article": True,
                    "is_definition": is_definition
                }
            )
            chunks.append(chunk)

        # 긴 조문: 항 단위로 분할
        elif paragraphs:
            for idx, paragraph in enumerate(paragraphs):
                chunk_id = f"{law_id}_{article_number}_{paragraph.get('number', idx)}"

                chunk = LawChunk(
                    chunk_id=chunk_id,
                    law_id=law_id,
                    law_name=law_name,
                    article_number=article_number,
                    paragraph_number=paragraph.get('number', ''),
                    title=title,
                    content=paragraph.get('content', ''),
                    chunk_type="paragraph",
                    metadata={
                        "full_article": False,
                        "paragraph_index": idx
                    }
                )
                chunks.append(chunk)

        # 항 정보 없이 긴 조문: 텍스트 분할
        else:
            sub_chunks = self._split_long_text(content)

            for idx, sub_content in enumerate(sub_chunks):
                chunk_id = f"{law_id}_{article_number}_part{idx}"

                chunk = LawChunk(
                    chunk_id=chunk_id,
                    law_id=law_id,
                    law_name=law_name,
                    article_number=article_number,
                    title=title,
                    content=sub_content,
                    chunk_type="text_split",
                    metadata={
                        "full_article": False,
                        "part_index": idx
                    }
                )
                chunks.append(chunk)

        return chunks

    def chunk_table(
        self,
        law_id: str,
        law_name: str,
        table_number: str,
        title: str,
        content: str
    ) -> LawChunk:
        """
        별표 청킹

        Args:
            law_id: 법령ID
            law_name: 법령명
            table_number: 별표 번호
            title: 제목
            content: 내용

        Returns:
            청크
        """
        chunk_id = f"{law_id}_table_{table_number}"

        return LawChunk(
            chunk_id=chunk_id,
            law_id=law_id,
            law_name=law_name,
            article_number=f"별표{table_number}",
            title=title,
            content=content,
            chunk_type="table",
            metadata={
                "is_table": True
            }
        )

    def _split_long_text(self, text: str) -> List[str]:
        """
        긴 텍스트를 청크로 분할 (중첩 적용)

        Args:
            text: 원본 텍스트

        Returns:
            분할된 청크 리스트
        """
        chunks = []
        start = 0

        while start < len(text):
            end = start + self.max_chunk_size

            # 마지막 청크가 아니면 문장 경계에서 자르기
            if end < len(text):
                # 마침표나 개행 찾기
                last_period = text.rfind('.', start, end)
                last_newline = text.rfind('\n', start, end)

                split_point = max(last_period, last_newline)

                if split_point > start:
                    end = split_point + 1

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            # 다음 시작점 (중첩 적용)
            next_start = end - self.overlap if end < len(text) else end
            # 문장 경계 보정으로 end 가 작아지면 next_start <= start 가 되어
            # 무한 루프에 빠질 수 있음(예: 마침표가 start 근처에 몰린 지침 텍스트).
            # 항상 최소 1글자는 전진하도록 보장.
            start = next_start if next_start > start else end if end > start else start + 1

        return chunks

    def _is_definition_article(self, title: str) -> bool:
        """정의 조항 여부 확인"""
        if not title:
            return False

        definition_keywords = ['정의', '용어', '뜻']
        return any(keyword in title for keyword in definition_keywords)


# 사용 예시
if __name__ == "__main__":
    chunker = LawChunker(max_chunk_size=512, overlap=50)

    # 짧은 조문
    short_article = chunker.chunk_article(
        law_id="001234",
        law_name="수소경제 육성 및 수소 안전관리에 관한 법률",
        article_number="제1조",
        title="목적",
        content="이 법은 수소경제 육성과 수소 안전관리에 필요한 사항을 규정함으로써..."
    )

    print(f"짧은 조문 청크 수: {len(short_article)}")
    print(f"청크 ID: {short_article[0].chunk_id}")

    # 긴 조문 (항 포함)
    long_article = chunker.chunk_article(
        law_id="001234",
        law_name="수소경제 육성 및 수소 안전관리에 관한 법률",
        article_number="제2조",
        title="정의",
        content="이 법에서 사용하는 용어의 뜻은 다음과 같다...",
        paragraphs=[
            {"number": "①", "content": "수소란 물의 전기분해 등을 통해 생산된..."},
            {"number": "②", "content": "청정수소란 생산 과정에서 온실가스를..."},
        ]
    )

    print(f"\n긴 조문 청크 수: {len(long_article)}")
    for chunk in long_article:
        print(f"- {chunk.chunk_id} ({chunk.chunk_type})")
