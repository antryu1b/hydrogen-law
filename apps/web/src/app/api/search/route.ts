import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { deriveLawType } from '@/lib/utils';
import { highlightText, centeredSnippet } from '@/lib/highlight';
import { parseSearchQuery, allTerms, stemForMatch, type OrGroup, type QueryTerm } from '@/lib/search-query';

const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 100;
const BEOPMANG_API_URL = 'https://api.beopmang.org/api/v4';

interface BeopmangArticle {
  label: string;
  snippet: string;
}

interface BeopmangResult {
  law_id: string;
  law_name: string;
  law_name_short?: string;
  law_type: string;
  matched_articles?: BeopmangArticle[];
  score: number;
}

interface BeopmangResponse {
  data: {
    total: number;
    results: BeopmangResult[];
    mode: string;
  };
  meta: {
    elapsed_ms: number;
    api_version: string;
  };
}

// Error helper
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status }
  );
}

async function searchViaBeopmang(query: string, topK: number): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Extract keywords for highlighting — use parsed query terms so the OR/또는
    // operator is excluded (raw split would highlight the literal "or") and quoted
    // phrases stay intact.
    const keywords = allTerms(parseSearchQuery(query));
    
    // Call Beopmang API
    const url = new URL(`${BEOPMANG_API_URL}/law`);
    url.searchParams.set('action', 'search');
    url.searchParams.set('q', query);
    url.searchParams.set('mode', 'keyword');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error('Beopmang API error:', response.status);
      throw new Error(`Beopmang API ${response.status}`);
    }

    const beopmangData: BeopmangResponse = await response.json();
    if (!beopmangData.data?.results) throw new Error('Invalid Beopmang response');
    
    // Transform Beopmang response to frontend format
    const articles = [];
    const lawNames = new Set<string>();
    const lawGroups: { law_id: string; law_name: string; law_type: string; article_count: number; score: number }[] = [];

    for (const result of beopmangData.data.results) {
      const lawName = result.law_name_short || result.law_name;
      lawNames.add(lawName);

      lawGroups.push({
        law_id: result.law_id,
        law_name: result.law_name,
        law_type: deriveLawType(result.law_name, result.law_type),
        article_count: result.matched_articles?.length || 0,
        score: result.score,
      });

      if (!result.matched_articles || result.matched_articles.length === 0) {
        articles.push({
          article_id: result.law_id,
          law_name: lawName,
          law_id: result.law_id,
          law_type: deriveLawType(result.law_name, result.law_type),
          article_number: '',
          title: result.law_name,
          content: `[${deriveLawType(result.law_name, result.law_type)}]`,
          highlighted_content: `[${deriveLawType(result.law_name, result.law_type)}]`,
          highlighted_title: highlightText(result.law_name, keywords),
          highlighted_law_name: highlightText(lawName, keywords),
          relevance_score: result.score * 100,
          article_type: 'article' as const,
          related_articles: [],
        });
        continue;
      }

      const articleMap = new Map<string, string[]>();
      for (const article of result.matched_articles) {
        const key = article.label;
        if (!articleMap.has(key)) articleMap.set(key, []);
        if (article.snippet) articleMap.get(key)!.push(article.snippet);
      }

      for (const [label, snippets] of articleMap) {
        const uniqueSnippets = Array.from(new Set(snippets));
        const content = uniqueSnippets.join(' ... ');

        articles.push({
          article_id: `${result.law_id}_${label}`,
          law_name: lawName,
          law_id: result.law_id,
          law_type: deriveLawType(result.law_name, result.law_type),
          article_number: label,
          title: `${lawName} ${label}`,
          content,
          highlighted_content: highlightText(content, keywords),
          highlighted_title: highlightText(`${lawName} ${label}`, keywords),
          highlighted_law_name: highlightText(lawName, keywords),
          relevance_score: result.score * 100,
          article_type: 'article' as const,
          related_articles: [],
        });
      }
    }

    // Relevance filter: Beopmang matches at the LAW level, so it can return
    // articles whose displayed fields contain none of the search keywords (no
    // highlight, e.g. "등록신고" surfacing 가축분뇨 규칙 제7조). Keep an article only
    // if at least one keyword is VISIBLE in some displayed field (content / title /
    // law_name / article_number) — same keywords that drive highlighting, so
    // "nothing highlighted anywhere" == "filtered out". Compared whitespace-
    // insensitively so a spaced keyword still matches a no-space stored field.
    // Fall back to raw results if the filter would empty an otherwise non-empty
    // response (never show nothing).
    const kwLower = keywords.map((k) => k.replace(/\s+/g, '').toLowerCase()).filter((k) => k.length > 0);
    const relevantArticles =
      kwLower.length === 0
        ? articles
        : (() => {
            const matched = articles.filter((a) => {
              const hay = `${a.content || ''} ${a.title || ''} ${a.law_name || ''} ${a.article_number || ''}`
                .replace(/\s+/g, '')
                .toLowerCase();
              return kwLower.some((k) => hay.includes(k));
            });
            return matched.length > 0 ? matched : articles;
          })();

    // Limit results
    const limitedArticles = relevantArticles.slice(0, topK);
    
    const elapsed = Date.now() - startTime;
    
    return NextResponse.json({
      query,
      total_found: limitedArticles.length,
      keywords,
      relevant_laws: Array.from(lawNames),
      law_groups: lawGroups,
      articles: limitedArticles,
      metadata: {
        search_time_ms: elapsed,
        llm_used: false,
        search_method: beopmangData.data.mode || 'keyword',
      },
    });

  } catch (error) {
    console.error('Beopmang search error:', error);
    throw error;
  }
}

interface SupabaseRow {
  id: string;
  law_name: string;
  law_id?: string | null;
  law_type?: string | null;
  article_no?: string | null;
  title?: string | null;
  content: string;
}

// Split a Korean compound query into 2-char sliding windows for fuzzy matching.
// Used ONLY as a fallback when exact full-keyword search returns 0 results.
function splitKoreanCompound(word: string): string[] {
  if (word.length <= 2) return [word];
  const tokens = new Set<string>([word]);
  for (let i = 0; i <= word.length - 2; i++) tokens.add(word.slice(i, i + 2));
  return [...tokens];
}

// 약칭 → 정식명칭 substring map (used by the multi-keyword AND path's law_name ilike).
// Substring chosen so a single `%${aliased}%` ilike matches the law + 시행령 + 시행규칙
// together — e.g. "수소법" → "수소경제" matches "수소경제 육성 및 수소 안전관리에 관한 법률"
// AND its 시행령/시행규칙. Domain-focused (수소·안전법규); extend as needed.
const KR_LAW_ALIASES: Record<string, string> = {
  '수소법': '수소경제',
  '가스법': '고압가스 안전관리',
  '고압가스법': '고압가스 안전관리',
  '액화석유가스법': '액화석유가스',
  '도시가스법': '도시가스사업',
  '위험물법': '위험물안전관리',
  '산업안전법': '산업안전보건',
  '산안법': '산업안전보건',
  '화관법': '화학물질관리',
  '화평법': '화학물질의 등록',
  '항공법': '항공안전법',
  '철도법': '철도안전법',
  '건설기계법': '건설기계관리법',
  // 선박(marine) sector — 선박용 수소연료전지 관련 상위 법령
  '선박안전법': '선박안전법',
  '어선법': '어선법',
  '항만법': '항만법',
  '항만시설보안법': '항만시설보안법',
  '위험물해상운송법': '위험물의 해상운송 및 저장에 관한 법률',
};
function resolveLawAlias(k: string): string {
  return KR_LAW_ALIASES[k] || k;
}

// Law-name token detection (hoisted module-level so both single-keyword and
// multi-keyword paths share). Matches tokens ending in 법/령/규칙 etc. Excluded
// from this match are the SPECIAL_LAW_WORDS which are law-form modifiers, not names.
const SPECIAL_LAW_WORDS = ['시행령', '시행규칙', '법률', '별표', '부칙'];
const LAW_NAME_SUFFIX = /^[가-힣A-Z0-9·]+(?:특례법|기본법|법|령|규칙|지침|고시|규정|준칙|훈령|예규)$/;
function isLawNameToken(k: string): boolean {
  return SPECIAL_LAW_WORDS.includes(k) || (k.length >= 2 && LAW_NAME_SUFFIX.test(k));
}

// Check whether a row actually contains the exact keyword (or each of its meaningful sub-parts together).
// Used to demote / exclude pure-fragment-only matches when exact results exist.
function rowContainsKeyword(row: SupabaseRow, keyword: string): boolean {
  const haystack = `${row.content || ''} ${row.law_name || ''} ${row.title || ''}`.toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

// Decompose a no-space Korean compound into meaningful parts for AND-matching + highlight.
// "등록신고" -> ["등록","신고"], "안전관리" -> ["안전","관리"]. Used only when the literal
// compound has zero exact matches, so we require ALL parts (AND) instead of OR-flooding
// 2-char fragments (which let "신고"-only rows like 가축분뇨 규칙 leak in with no highlight).
function decomposeCompound(k: string): string[] {
  if (!/[가-힣]/.test(k)) return [k];
  if (k.length === 4) return [k.slice(0, 2), k.slice(2, 4)];
  if (k.length === 6) return [k.slice(0, 2), k.slice(2, 4), k.slice(4, 6)];
  if (k.length === 5) return [k.slice(0, 2), k.slice(2)];
  return [k];
}

// Supabase client type for helper signatures. Inferred from createClient(url, key)
// so the generics match the runtime client exactly (createClient with no type args
// produces a different `never`-schema generic that doesn't accept .rpc/.from calls).
function makeSupabaseClient(url: string, key: string) {
  return createClient(url, key);
}
type SupabaseClient = ReturnType<typeof makeSupabaseClient>;

// Result of resolving one OR-group: the matched rows plus the surface terms that
// should drive highlighting for those rows (e.g. a decomposed compound highlights
// its parts; a law alias also highlights the resolved official-name fragment).
interface GroupResult { rows: SupabaseRow[]; highlightTerms: string[]; topKOverride?: number; }

// Resolve a SINGLE-term OR-group. Mirrors the original single-keyword cascade:
//   law-name token  → law_name ilike (alias-resolved), return whole family
//   else            → RPC (whitespace-insensitive) → exact ilike → compound AND
//                     → 2-char fuzzy fallback
// Both quoted and non-quoted terms are whitespace-collapsed so the RPC bridges
// "연료 가스" ↔ "연료가스" and `"로크 아웃"` ↔ "로크아웃". A quoted term is a single
// contiguous unit, so it still skips compound decomposition / fuzzy expansion
// (those would split the phrase) — but it IS resolved whitespace-insensitively.
async function resolveSingleTermGroup(
  supabase: SupabaseClient,
  term: QueryTerm,
  topK: number
): Promise<GroupResult> {
  // All terms are matched whitespace-insensitively → collapse spaces so the RPC
  // (which strips spaces on both sides) gets identical input for both spellings.
  // Non-quoted Korean terms use their STEM (조사/어미 stripped) so a typed
  // "배기가스가" hits the corpus form "배기가스" in the ILIKE / RPC and is the
  // term we highlight; quoted phrases stay verbatim (stemForMatch handles both).
  const stem = stemForMatch(term);
  const k = stem.replace(/\s+/g, '');
  const highlightTerms = [stem];

  if (!term.quoted && isLawNameToken(k)) {
    const aliased = resolveLawAlias(k);
    const { data: lnData } = await supabase
      .from('law_articles')
      .select('*')
      .ilike('law_name', `%${aliased}%`)
      .limit(500);
    if (lnData && lnData.length > 0) {
      return {
        rows: lnData as SupabaseRow[],
        highlightTerms: aliased !== k ? [stem, aliased] : highlightTerms,
        // Return ALL family articles so per-law UI badge counts match DB totals.
        topKOverride: lnData.length,
      };
    }
    return { rows: [], highlightTerms };
  }

  let data: SupabaseRow[] | null = null;

  // Step 1a: RPC full-text search (whitespace-insensitive on both sides) — used for
  // quoted AND non-quoted terms so a quoted `"로크 아웃"` (collapsed to "로크아웃")
  // still matches stored "로크 아웃".
  {
    const { data: rpcData, error: rpcError } = await supabase.rpc('search_law_articles', {
      search_query: k,
      max_results: topK,
    });
    if (!rpcError && rpcData && rpcData.length > 0) data = rpcData as SupabaseRow[];
  }

  // Step 1b: exact ilike on the collapsed term (no fragments). Matches the spelling
  // stored without spaces ("로크아웃"); the RPC above covers the spaced spelling.
  if (!data || data.length === 0) {
    const exactQuery = `content.ilike.%${k}%,law_name.ilike.%${k}%,title.ilike.%${k}%`;
    const { data: exactData } = await supabase
      .from('law_articles')
      .select('*')
      .or(exactQuery)
      .limit(topK * 2);
    if (exactData && exactData.length > 0) data = exactData as SupabaseRow[];
  }

  // Quoted terms stop here: no compound decomposition / fuzzy expansion (those
  // would split the phrase into fragments and defeat the contiguous-unit contract).
  if (term.quoted) return { rows: data ?? [], highlightTerms };

  // Step 1b-2: compound AND — when the literal compound has no exact match, require
  // ALL meaningful parts (e.g. "등록신고" -> 등록 AND 신고) instead of OR-flooding.
  let resultHighlight = highlightTerms;
  if (!data || data.length === 0) {
    const parts = decomposeCompound(k);
    if (parts.length > 1) {
      let q = supabase.from('law_articles').select('*');
      for (const p of parts) {
        q = q.or(`content.ilike.%${p}%,law_name.ilike.%${p}%,title.ilike.%${p}%`);
      }
      const { data: andData } = await q.limit(topK * 3);
      if (andData && andData.length > 0) {
        const lower = parts.map((p) => p.toLowerCase());
        const strict = (andData as SupabaseRow[]).filter((r) => {
          const hay = `${r.content || ''} ${r.law_name || ''} ${r.title || ''}`.toLowerCase();
          return lower.every((p) => hay.includes(p));
        });
        if (strict.length > 0) {
          data = strict;
          resultHighlight = parts; // highlight the parts the user actually matched on
        }
      }
    }
  }

  // Step 1c: fuzzy fallback — 2-char compound expansion, only when exact returns 0.
  if (!data || data.length === 0) {
    const expansions = new Set<string>([k]);
    if (/[가-힣]/.test(k) && k.length >= 3) {
      splitKoreanCompound(k).forEach((t) => expansions.add(t));
      if (k.length === 4) { expansions.add(k.slice(0, 2)); expansions.add(k.slice(2, 4)); }
      if (k.length === 5) { expansions.add(k.slice(0, 2)); expansions.add(k.slice(2)); }
      if (k.length === 6) { expansions.add(k.slice(0, 3)); expansions.add(k.slice(3)); }
    }
    const tokens = [...expansions].filter((t) => t.length >= 2).slice(0, 20);
    const orQuery = tokens
      .map((t) => `content.ilike.%${t}%,law_name.ilike.%${t}%,title.ilike.%${t}%`)
      .join(',');
    const { data: ilikeData } = await supabase
      .from('law_articles')
      .select('*')
      .or(orQuery)
      .limit(topK * 4);
    if (ilikeData && ilikeData.length > 0) {
      const exact = (ilikeData as SupabaseRow[]).filter((r) => rowContainsKeyword(r, k));
      data = exact.length > 0 ? exact : (ilikeData as SupabaseRow[]);
    }
  }

  return { rows: data ?? [], highlightTerms: resultHighlight };
}

// Resolve a MULTI-term OR-group (AND of its terms). Mirrors the original
// multi-keyword AND path: each term must match. Per-term routing avoids cross-ref
// leakage. Residual limitation: PostgREST can't strip spaces from a stored column
// from JS, so a non-quoted multi-term AND uses per-term `%term%` ILIKE (collapsed),
// which matches a term as a substring whether the STORED text is spaced or not for
// that term itself — but it cannot bridge a space that falls INSIDE a single typed
// term across the stored value when that term is part of a multi-term AND. Single
// 2-token compounds that are actually one word (e.g. "연료 전지") are handled by the
// caller, which re-routes them through the single-term whitespace-insensitive RPC.
async function resolveMultiTermGroup(
  supabase: SupabaseClient,
  terms: QueryTerm[],
  topK: number
): Promise<GroupResult> {
  let q = supabase.from('law_articles').select('*');
  for (const term of terms) {
    // All terms collapse spaces (whitespace-insensitive). A quoted term is still a
    // single contiguous unit, so it skips the 제N조 / law-name routing and matches
    // its collapsed literal as a substring. Non-quoted Korean terms use their STEM
    // (조사/어미 stripped) so "배기가스가" ANDs on the corpus form "배기가스".
    const k = stemForMatch(term).replace(/\s+/g, '');
    if (!term.quoted && /^제\d+조(?:의\d+)?$/.test(k)) {
      q = q.eq('article_no', k);
    } else if (!term.quoted && isLawNameToken(k)) {
      q = q.ilike('law_name', `%${resolveLawAlias(k)}%`);
    } else {
      q = q.or(`content.ilike.%${k}%,law_name.ilike.%${k}%,title.ilike.%${k}%`);
    }
  }
  const { data: andData } = await q.limit(topK * 2);
  const highlightTerms = terms.map((t) => stemForMatch(t));
  return { rows: (andData as SupabaseRow[]) ?? [], highlightTerms };
}

async function searchViaSupabase(query: string, topK: number): Promise<NextResponse | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const supabase = makeSupabaseClient(supabaseUrl, supabaseKey);

    // Parse into OR-groups of AND-terms (space=AND, OR/또는=OR, "quotes"=phrase).
    // Each group is resolved independently; the row sets are UNIONed (dedup by id).
    const orGroups: OrGroup[] = parseSearchQuery(query);
    if (orGroups.length === 0) {
      // Defensive: empty parse (e.g. OR-only). Fall back to the raw split so a
      // pathological query still hits the DB rather than 503-ing.
      const fallback = query.split(/[\s,]+/).filter((k) => k.length > 0).slice(0, 20);
      if (fallback.length === 0) return null;
      orGroups.push(fallback.map((t) => ({ text: t, quoted: false })));
    }

    const rowsById = new Map<string, SupabaseRow>();
    const highlightSet = new Set<string>();
    let topKOverride: number | undefined;

    for (const group of orGroups) {
      // Space = AND: a multi-term group requires ALL terms (each matched
      // whitespace-insensitively via substring ILIKE). This naturally bridges a
      // stray-space compound too — "연료 전지" needs %연료% AND %전지%, both of which
      // are substrings of stored "연료전지". (The old "collapse 2 short tokens into
      // one compound" shortcut wrongly turned "용어 정의" into "용어정의", which no
      // doc contains, returning garbage — removed.)
      let result: GroupResult;
      if (group.length === 1) {
        result = await resolveSingleTermGroup(supabase, group[0], topK);
      } else {
        result = await resolveMultiTermGroup(supabase, group, topK);
      }

      for (const row of result.rows) rowsById.set(row.id, row);
      for (const t of result.highlightTerms) highlightSet.add(t);
      if (result.topKOverride && result.topKOverride > (topKOverride ?? 0)) {
        topKOverride = result.topKOverride;
      }
    }

    const data: SupabaseRow[] | null = rowsById.size > 0 ? [...rowsById.values()] : null;
    // Highlight terms = the actual surface terms that drove each group's match
    // (decomposed parts / resolved alias / user terms), deduped across groups.
    const keywords = highlightSet.size > 0 ? [...highlightSet] : allTerms(orGroups);
    if (topKOverride) topK = topKOverride;

    if (!data || data.length === 0) {
      // 0 results is a CORRECT empty answer (e.g. cross-ref to 선박법 when our DB only
      // indexes 수소/고압가스 domain laws). Return 200 empty — don't cascade to the POST
      // handler's NO_DATA_SOURCE 503 which falsely implies a server problem.
      // null is reserved for true unavailability (missing creds / exception).
      return NextResponse.json({
        query,
        total_found: 0,
        keywords,
        relevant_laws: [],
        law_groups: [],
        articles: [],
        metadata: { search_time_ms: 0, llm_used: false, search_method: 'supabase-fallback-empty' },
      });
    }

    // Relevance filter: keep a row only if at least one matched keyword is VISIBLE
    // in some displayed field (title / law_name / article_number / content). A row
    // that matched purely via a non-displayed full-text index — nothing for the
    // user to see — is dropped. Same keywords that drive highlighting, so
    // "nothing highlighted anywhere" == "filtered out". Fall back to the unfiltered
    // set if this would empty an otherwise non-empty response (never show nothing).
    const kwLower = keywords.map((k) => k.replace(/\s+/g, '').toLowerCase()).filter((k) => k.length > 0);
    const visibleRows =
      kwLower.length === 0
        ? (data as SupabaseRow[])
        : (() => {
            const matched = (data as SupabaseRow[]).filter((row) => {
              const hay = `${row.title || ''} ${row.law_name || ''} ${row.article_no || ''} ${row.content || ''}`
                .replace(/\s+/g, '')
                .toLowerCase();
              return kwLower.some((k) => hay.includes(k));
            });
            return matched.length > 0 ? matched : (data as SupabaseRow[]);
          })();

    const lawGroupMap = new Map<string, { law_name: string; law_type: string; count: number }>();
    const articles = visibleRows.slice(0, topK).map((row, i) => {
      const lawKey = row.law_name;
      const existing = lawGroupMap.get(lawKey);
      if (existing) existing.count++;
      else lawGroupMap.set(lawKey, { law_name: row.law_name, law_type: deriveLawType(row.law_name, row.law_type), count: 1 });

      // Build the displayed content snippet CENTERED on the first matched query
      // term in the row's FULL content (whitespace-insensitive, like KGS
      // `matchedSectionsFor`), so a row matched deep in its body (e.g. "용어 정의"
      // far past the lead) still shows — and highlights — the matched term.
      // If NO keyword appears in the content (matched only via title / law_name),
      // keep a lead excerpt: the highlighted_title / highlighted_law_name already
      // shows the user where the match is.
      const fullContent = row.content || '';
      const content =
        centeredSnippet(fullContent, keywords) ?? fullContent.slice(0, 400);
      const title = row.title || '';
      return {
        article_id: row.id,
        law_name: row.law_name,
        law_id: row.law_id || '',
        law_type: deriveLawType(row.law_name, row.law_type),
        article_number: row.article_no || '',
        title,
        content,
        highlighted_content: highlightText(content, keywords),
        highlighted_title: highlightText(title, keywords),
        highlighted_law_name: highlightText(row.law_name, keywords),
        relevance_score: 100 - i,
        article_type: 'article' as const,
        related_articles: [],
      };
    });

    const lawGroups = [...lawGroupMap.entries()].map(([, v]) => ({
      law_id: '',
      law_name: v.law_name,
      law_type: v.law_type,
      article_count: v.count,
      score: v.count,
    }));

    return NextResponse.json({
      query,
      total_found: articles.length,
      keywords,
      relevant_laws: [...lawGroupMap.keys()],
      law_groups: lawGroups,
      articles,
      metadata: { search_time_ms: 0, llm_used: false, search_method: 'supabase-fallback' },
    });
  } catch (e) {
    console.error('Supabase fallback error:', e);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('INVALID_JSON', '올바른 JSON 형식이 아닙니다', 400);
    }

    const { query, top_k = 10 } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return errorResponse('EMPTY_QUERY', '검색어를 입력해주세요', 400);
    }

    const sanitizedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);
    const validatedTopK = Math.min(Math.max(1, Number(top_k) || 10), MAX_RESULTS);

    // 1. Beopmang API
    try {
      return await searchViaBeopmang(sanitizedQuery, validatedTopK);
    } catch (beopmangError) {
      console.log('Beopmang failed, trying Supabase fallback:', beopmangError);
    }

    // 2. Supabase fallback
    const supabaseRes = await searchViaSupabase(sanitizedQuery, validatedTopK);
    if (supabaseRes) return supabaseRes;

    return errorResponse('NO_DATA_SOURCE', '검색 서버에 일시적 문제가 있습니다', 503);

  } catch (error) {
    console.error('API error:', error);
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', 500);
  }
}
