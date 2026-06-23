import { NextRequest, NextResponse } from 'next/server';
import { kgsCodesData } from '@/data/kgs-codes-data';
import kgsOcrRaw from '@/data/kgs_ocr.json';

// 키워드 목록에 없는 본문 용어(예: "농도")도 검색되도록 수식 OCR 코퍼스를 코드별로 평탄화.
const _ocrByCode: Record<string, string> = {};
for (const [k, v] of Object.entries(kgsOcrRaw as Record<string, unknown>)) {
  _ocrByCode[k.toLowerCase()] = JSON.stringify(v).toLowerCase();
}
function ocrTextByCode(code: string): string {
  return _ocrByCode[code.toLowerCase()] ?? '';
}

interface KGSCode {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  keywords: string[];
  updated: string;
  pages: number;
  pdfUrl?: string;
  criteria?: Record<string, string>;
}

interface RecommendationResult {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  score: number;
  matchedKeywords: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // 키워드 추출 (간단한 토큰화)
    const queryKeywords = query
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter((k) => k.length > 1);

    // 각 CODE와 매칭 점수 계산
    const codes = kgsCodesData.codes as KGSCode[];
    const scored = codes.map((code) => {
      // 검색 코퍼스: 키워드 + 이름 + 세부분류 + 기준 본문 + 수식 OCR
      // (키워드 목록에 없는 본문 용어 — 예: "농도" — 도 검색되게 확장)
      const haystack = [
        code.name,
        code.subcategory,
        ...code.keywords,
        ...(code.criteria ? Object.values(code.criteria) : []),
        ocrTextByCode(code.code),
      ].join(' ').toLowerCase();

      const matchedKeywords = Array.from(new Set([
        ...code.keywords.filter((keyword) =>
          queryKeywords.some((qk) =>
            keyword.toLowerCase().includes(qk) || qk.includes(keyword.toLowerCase())
          )
        ),
        ...queryKeywords.filter((qk) => haystack.includes(qk)),
      ]));

      // 점수: 매칭된 토큰 수 / 쿼리 토큰 수
      const score = matchedKeywords.length / Math.max(queryKeywords.length, 1);

      return {
        code: code.code,
        name: code.name,
        category: code.category,
        subcategory: code.subcategory,
        score,
        matchedKeywords,
        pdfUrl: code.pdfUrl || null,
      };
    });

    // 점수 내림차순 정렬, 모든 매칭 코드 반환 (의장 결재 2026-05-28: 5개 cap 제거)
    const recommended = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      query,
      queryKeywords,
      recommended,
      total: recommended.length,
    });
  } catch (error) {
    console.error('KGS recommend error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
