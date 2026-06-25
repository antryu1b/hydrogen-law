import { NextRequest, NextResponse } from 'next/server';
import { kgsCodesData } from '@/data/kgs-codes-data';
import kgsOcrRaw from '@/data/kgs_ocr.json';
import { promises as fs } from 'fs';
import path from 'path';
import { whitespaceInsensitivePattern } from '@/lib/highlight';

// 키워드 목록에 없는 본문 용어(예: "농도")도 검색되도록 수식 OCR 코퍼스를 코드별로 평탄화.
const _ocrByCode: Record<string, string> = {};
for (const [k, v] of Object.entries(kgsOcrRaw as Record<string, unknown>)) {
  _ocrByCode[k.toLowerCase()] = JSON.stringify(v).toLowerCase();
}
function ocrTextByCode(code: string): string {
  return _ocrByCode[code.toLowerCase()] ?? '';
}

interface MatchedSection { sec_no: string; title: string; snippet: string; keyword: string; }
interface CodeSections { full: string; sections: Array<{ sec_no: string; title: string; body: string }>; }

// 조항 본문(kgs_sections) 전체를 코드별로 1회 로드·캐시 — 본문 전문(full-text) 검색용.
let _sectionsCache: Record<string, CodeSections> | null = null;
async function loadSections(codes: string[]): Promise<Record<string, CodeSections>> {
  if (_sectionsCache) return _sectionsCache;
  const cache: Record<string, CodeSections> = {};
  await Promise.all(
    codes.map(async (code) => {
      try {
        const raw = await fs.readFile(path.join(process.cwd(), 'data', 'kgs_sections', `${code}.json`), 'utf-8');
        const doc = JSON.parse(raw) as { sections?: Array<{ sec_no: string; title: string; body?: string }> };
        const sections = (doc.sections ?? []).map((s) => ({ sec_no: s.sec_no, title: s.title, body: s.body ?? '' }));
        cache[code] = { full: sections.map((s) => `${s.title} ${s.body}`).join(' ').toLowerCase(), sections };
      } catch {
        cache[code] = { full: '', sections: [] };
      }
    })
  );
  _sectionsCache = cache;
  return cache;
}

function matchedSectionsFor(entry: CodeSections | undefined, sectionKeywords: string[]): MatchedSection[] {
  if (!entry) return [];
  const out: MatchedSection[] = [];
  // Whitespace-insensitive match: "연료 가스" matches stored "연료가스" and vice
  // versa, and indices come from the actual matched span so snippets stay correct.
  const patterns = sectionKeywords
    .filter((qk) => qk.length > 0)
    .map((qk) => ({ qk, re: new RegExp(whitespaceInsensitivePattern(qk), 'i') }));
  for (const s of entry.sections) {
    let hit: { qk: string; idx: number; len: number } | null = null;
    for (const { qk, re } of patterns) {
      const m = re.exec(s.body);
      if (m) { hit = { qk, idx: m.index, len: m[0].length }; break; }
    }
    if (!hit) continue;
    const start = Math.max(0, hit.idx - 40);
    const snippet = (start > 0 ? '…' : '') + s.body.slice(start, hit.idx + hit.len + 60).replace(/\s+/g, ' ').trim() + '…';
    out.push({ sec_no: s.sec_no, title: s.title, snippet, keyword: hit.qk });
  }
  return out;
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

    // Section-level matching keywords. For an all-Korean spaced compound like
    // "연료 가스" we match the collapsed compound as ONE whitespace-insensitive
    // unit so sections that merely contain "연료" alone are not false positives.
    // Code-level scoring still uses the split queryKeywords (recall preserved).
    const collapsedQuery = query.toLowerCase().replace(/[^\w가-힣]/g, '');
    // All-Korean compound term, spaced OR not ("연료 가스" AND "연료가스"): treat the
    // whole query as ONE whitespace-insensitive compound across EVERY layer — code
    // list, chip, sections, highlight — so the displayed keyword, 목차, and 본문 stay
    // consistent. This also avoids the chip showing a sub-keyword: searching
    // "연료가스" must not surface/label codes by their own "연료" keyword fragment.
    const isCompound =
      /^[가-힣]+$/.test(collapsedQuery) && collapsedQuery.length >= 3;
    const sectionKeywords = isCompound ? [collapsedQuery] : queryKeywords;
    const displayTerm = query.trim();

    // 각 CODE와 매칭 점수 계산
    const codes = kgsCodesData.codes as KGSCode[];
    const sectionsCache = await loadSections(codes.map((c) => c.code));
    const scored = codes.map((code) => {
      // 검색 코퍼스: 키워드 + 이름 + 세부분류 + 기준 본문 + 수식 OCR
      // (키워드 목록에 없는 본문 용어 — 예: "농도" — 도 검색되게 확장)
      const haystack = [
        code.name,
        code.subcategory,
        ...code.keywords,
        ...(code.criteria ? Object.values(code.criteria) : []),
        ocrTextByCode(code.code),
        sectionsCache[code.code]?.full ?? '',
      ].join(' ').toLowerCase();

      let matchedKeywords: string[];
      let score: number;
      if (isCompound) {
        // Whitespace-insensitive compound match: "연료가스" matches "연료 가스".
        // Chip shows exactly what the user typed (displayTerm) for consistency.
        const found = haystack.replace(/\s+/g, '').includes(collapsedQuery);
        matchedKeywords = found ? [displayTerm] : [];
        score = found ? 1 : 0;
      } else {
        matchedKeywords = Array.from(new Set([
          ...code.keywords.filter((keyword) =>
            queryKeywords.some((qk) =>
              keyword.toLowerCase().includes(qk) || qk.includes(keyword.toLowerCase())
            )
          ),
          ...queryKeywords.filter((qk) => haystack.includes(qk)),
        ]));
        // 점수: 매칭된 토큰 수 / 쿼리 토큰 수
        score = matchedKeywords.length / Math.max(queryKeywords.length, 1);
      }

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

    // 각 코드에서 키워드가 실제로 등장하는 조항 + 스니펫 추가 (어디에 있는지 표시용)
    const enriched = recommended.map((item) => ({
      ...item,
      matchedSections: matchedSectionsFor(sectionsCache[item.code], sectionKeywords),
    }));

    return NextResponse.json({
      query,
      queryKeywords,
      recommended: enriched,
      total: enriched.length,
    });
  } catch (error) {
    console.error('KGS recommend error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
