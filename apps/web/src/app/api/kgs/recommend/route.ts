import { NextRequest, NextResponse } from 'next/server';
import { kgsCodesData } from '@/data/kgs-codes-data';
import { getKgsSectionsDoc, getKgsOcrIndex, type KgsOcrIndex, type KgsSectionsDoc } from '@/lib/kgs-source';
import { whitespaceInsensitivePattern } from '@/lib/highlight';
import { parseSearchQuery, matchesQuery, stemForMatch, type OrGroup } from '@/lib/search-query';

// 키워드 목록에 없는 본문 용어(예: "농도")도 검색되도록 수식 OCR 코퍼스를 코드별로 평탄화.
// Recomputed only when kgs-source hands back a different index object.
let _ocrSource: KgsOcrIndex | null = null;
let _ocrByCode: Record<string, string> = {};
async function loadOcrByCode(): Promise<Record<string, string>> {
  const index = await getKgsOcrIndex();
  if (index !== _ocrSource) {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(index)) flat[k.toLowerCase()] = JSON.stringify(v).toLowerCase();
    _ocrByCode = flat;
    _ocrSource = index;
  }
  return _ocrByCode;
}

interface MatchedSection { sec_no: string; title: string; snippet: string; keyword: string; }
interface CodeSections { full: string; sections: Array<{ sec_no: string; title: string; body: string }>; }

// 조항 본문(kgs_sections) 전체를 코드별로 로드·캐시 — 본문 전문(full-text) 검색용.
// Per-code entry is rebuilt only when kgs-source returns a different document object.
const EMPTY_SECTIONS: CodeSections = { full: '', sections: [] };
const _sectionsCache = new Map<string, { doc: KgsSectionsDoc; entry: CodeSections }>();
async function loadSections(codes: string[]): Promise<Record<string, CodeSections>> {
  const cache: Record<string, CodeSections> = {};
  await Promise.all(
    codes.map(async (code) => {
      let doc: KgsSectionsDoc;
      try {
        doc = await getKgsSectionsDoc(code);
      } catch {
        cache[code] = EMPTY_SECTIONS;
        return;
      }
      const hit = _sectionsCache.get(code);
      if (hit && hit.doc === doc) {
        cache[code] = hit.entry;
        return;
      }
      const raw = (doc.sections ?? []) as Array<{ sec_no: string; title: string; body?: string }>;
      const sections = raw.map((s) => ({ sec_no: s.sec_no, title: s.title, body: s.body ?? '' }));
      const entry = { full: sections.map((s) => `${s.title} ${s.body}`).join(' ').toLowerCase(), sections };
      _sectionsCache.set(code, { doc, entry });
      cache[code] = entry;
    })
  );
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

    // Parse the query into OR-groups of AND-terms (space=AND, OR/또는=OR,
    // "quotes"=exact phrase). A code matches if ANY OR-group's terms are ALL
    // present (whitespace-insensitive) in its haystack. This replaces the old
    // collapsed-compound hack — AND-of-whitespace-insensitive-terms subsumes it.
    const orGroups: OrGroup[] = parseSearchQuery(query);
    // Surface terms used for the chip and for the section/snippet whitespace-
    // insensitive search + highlight. Non-quoted Korean terms are reduced to their
    // STEM (조사/어미 stripped) so "배기가스가" both matches AND highlights the
    // corpus form "배기가스"; quoted phrases stay verbatim. Deduped in first-seen
    // order. The chip label is the stem (the root word that actually matched).
    const queryKeywords = (() => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const t of orGroups.flat()) {
        const stem = stemForMatch(t);
        if (!seen.has(stem)) { seen.add(stem); out.push(stem); }
      }
      return out;
    })();

    // 각 CODE와 매칭 점수 계산
    const codes = kgsCodesData.codes as KGSCode[];
    const sectionsCache = await loadSections(codes.map((c) => c.code));
    const ocrByCode = await loadOcrByCode();
    const scored = codes.map((code) => {
      // 검색 코퍼스: 키워드 + 이름 + 세부분류 + 기준 본문 + 수식 OCR
      // (키워드 목록에 없는 본문 용어 — 예: "농도" — 도 검색되게 확장)
      const haystack = [
        code.name,
        code.subcategory,
        ...code.keywords,
        ...(code.criteria ? Object.values(code.criteria) : []),
        ocrByCode[code.code.toLowerCase()] ?? '',
        sectionsCache[code.code]?.full ?? '',
      ].join(' ').toLowerCase();

      // A code matches if ANY OR-group is fully satisfied (all its AND-terms
      // present, whitespace-insensitive). The chip shows the user's actual terms
      // that matched in this code's haystack — not code-keyword fragments.
      const matched = matchesQuery(haystack, orGroups);
      // Surface terms that actually appear in this code's haystack. We list every
      // user term present (not just one group's) so the chip reflects what was
      // found here — and always the user's own terms, never code-keyword fragments.
      const matchedKeywords = matched
        ? Array.from(
            new Set(
              orGroups.flat().filter((t) => matchesQuery(haystack, [[t]])).map((t) => stemForMatch(t))
            )
          )
        : [];
      // Score by how many surface terms are present (more matched terms rank
      // higher), normalized against the total distinct terms in the query.
      const score = matched
        ? matchedKeywords.length / Math.max(queryKeywords.length, 1)
        : 0;

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
      matchedSections: matchedSectionsFor(sectionsCache[item.code], item.matchedKeywords.length > 0 ? item.matchedKeywords : queryKeywords),
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
