import { NextRequest, NextResponse } from 'next/server';
import { kgsCodesData } from '@/data/kgs-codes-data';

interface KGSCode {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  keywords: string[];
  updated: string;
  pages: number;
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
      const matchedKeywords = code.keywords.filter((keyword) =>
        queryKeywords.some((qk) =>
          keyword.toLowerCase().includes(qk) || qk.includes(keyword.toLowerCase())
        )
      );

      // 점수: 매칭된 키워드 개수 / 쿼리 키워드 개수
      const score = matchedKeywords.length / Math.max(queryKeywords.length, 1);

      return {
        code: code.code,
        name: code.name,
        category: code.category,
        subcategory: code.subcategory,
        score,
        matchedKeywords,
      };
    });

    // 점수 내림차순 정렬, Top 5
    const recommended = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

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
