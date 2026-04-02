import { NextRequest, NextResponse } from 'next/server';
import { kgsCodesData } from '@/data/kgs-codes-data';

interface KGSCode {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  updated: string;
  pages: number;
  views: number;
  keywords: string[];
  pdfUrl: string;
  criteria: {
    최대압력: string;
    안전거리: string;
    검사주기: string;
    긴급차단: string;
    압력방출: string;
    누출감지: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { codes } = await request.json();

    if (!codes || !Array.isArray(codes) || codes.length === 0) {
      return NextResponse.json(
        { error: 'Codes array is required' },
        { status: 400 }
      );
    }

    // 요청된 CODE만 필터링
    const allCodes = kgsCodesData.codes as KGSCode[];
    const selectedCodes = allCodes.filter((code) =>
      codes.includes(code.code)
    );

    if (selectedCodes.length === 0) {
      return NextResponse.json(
        { error: 'No matching codes found' },
        { status: 404 }
      );
    }

    // 비교 항목 추출
    const comparisonCriteria = kgsCodesData.comparison_criteria;

    // 비교표 데이터 생성
    const comparison = comparisonCriteria.map((criterion) => {
      const row: Record<string, string> = { criterion };
      selectedCodes.forEach((code) => {
        row[code.code] = code.criteria[criterion as keyof typeof code.criteria] || '해당없음';
      });
      return row;
    });

    return NextResponse.json({
      codes: selectedCodes.map((code) => ({
        code: code.code,
        name: code.name,
        category: code.category,
        subcategory: code.subcategory,
        updated: code.updated,
        pages: code.pages,
        pdfUrl: `https://cyber.kgs.or.kr/cmm/fms/kgsFileDown.ex.do?file_nm=${code.pdfUrl}&file_folder=codeLink`,
      })),
      comparison,
      criteria: comparisonCriteria,
    });
  } catch (error) {
    console.error('KGS compare error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
