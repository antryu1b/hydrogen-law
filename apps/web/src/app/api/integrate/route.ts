import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { deriveLawType } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────
// 교차참조 통합 요건 (Phase-1, NO LLM)
//
// 사용자가 주제 키워드 + 관점(lens)을 고르면, 모든 법령 분야에 걸쳐 관련
// 조문을 Supabase law_articles 에서 결정론적으로 수집(ilike)해 분야별로 묶어
// 돌려준다. LLM·합성 텍스트 없음 — Supabase 가 돌려준 것만 그대로 제공.
// ─────────────────────────────────────────────────────────────────────────

const MAX_TOPIC_LENGTH = 200;
const ITEMS_PER_CATEGORY = 30; // 분야별 조문 상한 (정직하게 카운트 보고)
const SNIPPET_RADIUS = 150; // 매칭 키워드 좌우 글자 수 (≈300자 윈도)
const FETCH_LIMIT = 600; // Supabase 1회 fetch 상한

interface SupabaseRow {
  id: string;
  law_name: string;
  law_id?: string | null;
  law_type?: string | null;
  article_no?: string | null;
  title?: string | null;
  content: string;
}

type Lens = 'design' | 'production';

// 관점(lens)별 OR-확장 키워드. 결정론적 — 주제 키워드에 아래 용어들을 OR 로
// 더해 같은 주제라도 설계/생산 관점에서 걸리는 조문 폭을 넓힌다.
const LENS_TERMS: Record<Lens, string[]> = {
  // 설계 관점: 구조·배치·설비·안전·재료·용기·압력·검사기준
  design: ['구조', '배치', '설비', '안전', '재료', '용기', '압력', '검사기준'],
  // 생산 관점: 검사·시험·제조·품질·인증·표시·합격·기준적합
  production: ['검사', '시험', '제조', '품질', '인증', '표시', '합격', '기준적합'],
};

// 분야(category) 도출 — law_name + law_type 기반, 결정론.
//   1) law_type === '기술기준'                          → "선박 기술기준"
//   2) law_name 에 수소 / 고압가스 포함                  → "수소·가스"
//   3) 선박 관련 상위 법령(선박안전법/어선법/항만법/      → "선박 법령"
//      국제항해선박/위험물 선박운송 등)
//   4) 그 외                                             → "기타"
function deriveCategory(row: SupabaseRow): string {
  const lawType = (row.law_type || '').trim();
  if (lawType === '기술기준') return '선박 기술기준';

  const n = row.law_name || '';
  if (n.includes('수소') || n.includes('고압가스')) return '수소·가스';

  if (
    n.includes('선박안전법') ||
    n.includes('어선법') ||
    n.includes('항만법') ||
    n.includes('국제항해선박') ||
    n.includes('위험물 선박운송') ||
    n.includes('위험물선박운송') ||
    n.includes('보안에 관한 법률')
  ) {
    return '선박 법령';
  }

  return '기타';
}

// 분야 표시 순서 (고정)
const CATEGORY_ORDER = ['수소·가스', '선박 법령', '선박 기술기준', '기타'];

// content 에서 매칭 키워드 주변 ~300자 윈도를 잘라낸다. 매칭이 없으면 앞부분.
function makeSnippet(content: string, keywords: string[]): string {
  const text = (content || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const lower = text.toLowerCase();
  let hitIdx = -1;
  for (const k of keywords) {
    const idx = lower.indexOf(k.toLowerCase());
    if (idx >= 0 && (hitIdx === -1 || idx < hitIdx)) hitIdx = idx;
  }

  if (hitIdx === -1) {
    return text.length > SNIPPET_RADIUS * 2
      ? text.slice(0, SNIPPET_RADIUS * 2) + '…'
      : text;
  }

  const start = Math.max(0, hitIdx - SNIPPET_RADIUS);
  const end = Math.min(text.length, hitIdx + SNIPPET_RADIUS);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('INVALID_JSON', '올바른 JSON 형식이 아닙니다', 400);
  }

  const rawTopic = body?.topic;
  const rawLens = body?.lens;

  if (!rawTopic || typeof rawTopic !== 'string' || !rawTopic.trim()) {
    return errorResponse('EMPTY_TOPIC', '주제 키워드를 입력해주세요', 400);
  }

  const lens: Lens = rawLens === 'production' ? 'production' : 'design';
  const topic = rawTopic.trim().slice(0, MAX_TOPIC_LENGTH);

  // 주제 키워드 토큰 (공백/쉼표 분리) — 각각은 AND 조건(주제는 반드시 포함).
  const topicTokens = topic
    .split(/[\s,]+/)
    .filter((k) => k.length > 0)
    .slice(0, 10);

  // 관점 키워드 — OR 조건으로만 폭을 넓힘. 하이라이트용으로 주제+관점 합산.
  const lensTerms = LENS_TERMS[lens];
  const highlightKeywords = [...topicTokens, ...lensTerms];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return errorResponse('NO_DATA_SOURCE', '검색 서버에 일시적 문제가 있습니다', 503);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query: 주제 토큰은 AND (각 토큰이 content/law_name/title 중 한 곳에 존재),
    //        관점 토큰은 OR 한 묶음으로 추가(폭 확장). search route 의 ilike .or
    //        패턴을 그대로 재사용한다.
    let q = supabase.from('law_articles').select('*');

    for (const k of topicTokens) {
      q = q.or(`content.ilike.%${k}%,law_name.ilike.%${k}%,title.ilike.%${k}%`);
    }

    // 관점 OR-블록: 하나의 .or 안에 lens 용어들을 모두 넣어 "주제 AND (관점 중 하나)"
    const lensOr = lensTerms
      .map((t) => `content.ilike.%${t}%,title.ilike.%${t}%`)
      .join(',');
    q = q.or(lensOr);

    const { data, error } = await q.limit(FETCH_LIMIT);

    if (error) {
      console.error('integrate supabase error:', error);
      return errorResponse('NO_DATA_SOURCE', '검색 서버에 일시적 문제가 있습니다', 503);
    }

    const rows = (data || []) as SupabaseRow[];

    // 분야별 그룹화
    const buckets = new Map<string, SupabaseRow[]>();
    for (const row of rows) {
      const cat = deriveCategory(row);
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(row);
    }

    const groups = CATEGORY_ORDER.filter((c) => buckets.has(c)).map((category) => {
      const rowsInCat = buckets.get(category)!;
      const capped = rowsInCat.slice(0, ITEMS_PER_CATEGORY);
      const items = capped.map((row) => ({
        law_name: row.law_name,
        law_type: deriveLawType(row.law_name, row.law_type),
        article_no: row.article_no || '',
        title: row.title || '',
        snippet: makeSnippet(row.content || '', highlightKeywords),
      }));
      return {
        category,
        count: rowsInCat.length, // 정직한 전체 건수 (상한 적용 전)
        shown: items.length, // 실제 표시 건수
        items,
      };
    });

    const total = rows.length;

    return NextResponse.json({
      topic,
      lens,
      keywords: highlightKeywords,
      total,
      groups,
    });
  } catch (e) {
    console.error('integrate error:', e);
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', 500);
  }
}
