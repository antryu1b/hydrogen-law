import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * GET /api/marine-compare?q=<keyword>
 *
 * 선박(marine) 기술기준 본문 대조 전용 API.
 * 잠정기준(MOFFC-2024)과 지침(GC12K-2024) 두 표준의 조문을 Supabase law_articles
 * 에서 결정론적으로 읽어 표준별로 묶어 반환한다. LLM 없음, 합성 없음 — 순수 조회.
 *
 * 두 표준은 조문 체계가 달라(잠정기준=조 / 지침=장·절) 1:1 정렬이 아니라
 * 주제별 대조이므로, 표준별 독립 목록으로 내려준다.
 */

const MAX_QUERY_LENGTH = 100;
const SNIPPET_LEN = 400;

// 표준 메타 — law_id 별 정식 명칭(프롬프트 명세 고정값)
const STANDARDS: { law_id: string; law_name: string }[] = [
  { law_id: 'MOFFC-2024', law_name: '선박수소연료전지설비 잠정기준' },
  { law_id: 'GC12K-2024', law_name: '선박용 연료전지 시스템 지침 (GC-12-K)' },
];

interface MarineRow {
  id: string;
  law_id: string | null;
  law_name: string | null;
  article_no: string | null;
  title: string | null;
  content: string | null;
}

interface MarineItem {
  article_no: string;
  title: string;
  content: string;
}

interface MarineStandard {
  law_id: string;
  law_name: string;
  count: number;
  items: MarineItem[];
}

// GC12K 의 article_no/title 은 목차 점선(··· 도트 리더)이 섞여 있다. 표시용으로
// 후행 점·공백을 제거한다. MOFFC 의 깔끔한 "제N조" 는 영향받지 않는다.
function cleanLabel(s: string): string {
  return (s || '').replace(/[·\s.]+$/g, '').trim();
}

// "제N조" / "제 N 조" 에서 N 추출 (정렬용). 없으면 큰 값으로 밀어 뒤로.
function parseJoNumber(articleNo: string): number {
  const m = (articleNo || '').match(/제\s*(\d+)\s*조/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

// 키워드 기준 400자 스니펫. q 가 있으면 키워드 위치를 중심으로 윈도우를 잡고,
// 없으면 앞에서 400자.
function makeSnippet(content: string, q: string | null): string {
  const text = (content || '').replace(/[·]{3,}/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= SNIPPET_LEN) return text;
  if (q) {
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx >= 0) {
      const half = Math.floor(SNIPPET_LEN / 2);
      const end = Math.min(text.length, idx - half + SNIPPET_LEN);
      const start = Math.max(0, end - SNIPPET_LEN);
      const prefix = start > 0 ? '… ' : '';
      const suffix = end < text.length ? ' …' : '';
      return prefix + text.slice(start, end) + suffix;
    }
  }
  return text.slice(0, SNIPPET_LEN) + ' …';
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: { code: 'NO_DATA_SOURCE', message: '데이터베이스 연결이 설정되지 않았습니다' } },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawQ = searchParams.get('q');
  const q = rawQ ? rawQ.trim().slice(0, MAX_QUERY_LENGTH) : '';

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from('law_articles')
      .select('id, law_id, law_name, article_no, title, content')
      .in('law_id', STANDARDS.map((s) => s.law_id));

    if (q) {
      query = query.or(
        `content.ilike.%${q}%,title.ilike.%${q}%,law_name.ilike.%${q}%`
      );
    }

    const { data, error } = await query.limit(500);
    if (error) {
      console.error('marine-compare supabase error:', error);
      return NextResponse.json(
        { error: { code: 'QUERY_FAILED', message: '조회 중 오류가 발생했습니다' } },
        { status: 500 }
      );
    }

    const rows = (data || []) as MarineRow[];

    const standards: MarineStandard[] = STANDARDS.map((std) => {
      const ownRows = rows.filter((r) => r.law_id === std.law_id);

      const items: MarineItem[] = ownRows.map((r) => ({
        article_no: cleanLabel(r.article_no || ''),
        title: cleanLabel(r.title || ''),
        content: makeSnippet(r.content || '', q || null),
      }));

      // MOFFC: 조 번호 오름차순. GC12K: DB 등장 순서(=장·절 순서) 유지.
      if (std.law_id === 'MOFFC-2024') {
        items.sort(
          (a, b) => parseJoNumber(a.article_no) - parseJoNumber(b.article_no)
        );
      }

      return {
        law_id: std.law_id,
        law_name: std.law_name,
        count: items.length,
        items,
      };
    });

    return NextResponse.json({ q, standards });
  } catch (e) {
    console.error('marine-compare error:', e);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '서버 내부 오류가 발생했습니다' } },
      { status: 500 }
    );
  }
}
