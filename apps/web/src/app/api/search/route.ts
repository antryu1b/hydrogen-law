import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  searchViaBeopmang,
  transformBeopmangResults,
  highlightText,
} from '@/features/search/api/search-handler';

const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 100;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface SupabaseRow {
  id: string;
  content: string;
  relevance_score?: number;
  metadata?: {
    law_name?: string;
    article_number?: string;
    title?: string;
    article_type?: 'article' | 'appendix';
  };
}

async function searchViaSupabase(query: string, topK: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const keywords = query.split(/[\s,]+/).filter((k: string) => k.length > 0).slice(0, 20);

    let data: SupabaseRow[] | null = null;

    if (keywords.length <= 1) {
      const { data: result, error } = await supabase.rpc('search_law_documents', {
        search_query: query,
        max_results: topK,
      });
      if (!error) data = result;
    } else {
      const searchPromises = keywords.map(keyword =>
        supabase.rpc('search_law_documents', { search_query: keyword, max_results: topK })
      );
      const searchResults = await Promise.all(searchPromises);
      const mergedMap = new Map<string, SupabaseRow & { matchCount: number }>();
      for (const result of searchResults) {
        if (result.error || !result.data) continue;
        for (const row of result.data as SupabaseRow[]) {
          const existing = mergedMap.get(row.id);
          if (existing) {
            existing.relevance_score = (existing.relevance_score || 0) + (row.relevance_score || 0);
            existing.matchCount += 1;
          } else {
            mergedMap.set(row.id, { ...row, matchCount: 1 });
          }
        }
      }
      for (const entry of mergedMap.values()) {
        entry.relevance_score = (entry.relevance_score || 0) * (1 + (entry.matchCount - 1) * 0.5);
      }
      data = [...mergedMap.values()]
        .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
        .slice(0, topK);
    }

    if (!data || data.length === 0) {
      const { data: articleData, error: articleError } = await supabase
        .from('law_articles')
        .select('*')
        .or(keywords.map(k => `content.ilike.%${k}%`).join(','))
        .limit(topK);

      if (!articleError && articleData && articleData.length > 0) {
        const lawGroupMap = new Map<string, { law_name: string; law_type: string; count: number }>();
        const articles = articleData.map((row, i) => {
          const lawKey = row.law_name;
          const existing = lawGroupMap.get(lawKey);
          if (existing) { existing.count++; }
          else { lawGroupMap.set(lawKey, { law_name: row.law_name, law_type: row.law_type || '법률', count: 1 }); }

          const content = (row.content || '').slice(0, 300);
          return {
            article_id: row.id,
            law_name: row.law_name,
            law_id: row.law_id || '',
            law_type: row.law_type || '법률',
            article_number: row.article_no || '',
            title: row.title || '',
            content,
            highlighted_content: highlightText(content, keywords),
            relevance_score: 50 - i,
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

        return { articles, lawGroups, lawNames: [...lawGroupMap.keys()], keywords };
      }

      return null;
    }

    const maxScore = Math.max(...data.map(r => r.relevance_score || 0), 0.0001);
    const lawGroupMap = new Map<string, { law_name: string; count: number }>();

    const articles = data.map((row: SupabaseRow) => {
      const content = row.content || '';
      const metadata = row.metadata || {};
      const lawName = metadata.law_name || '(법령명 없음)';

      const existing = lawGroupMap.get(lawName);
      if (existing) { existing.count++; }
      else { lawGroupMap.set(lawName, { law_name: lawName, count: 1 }); }

      return {
        article_id: row.id,
        law_name: lawName,
        law_id: '',
        law_type: '법률',
        article_number: metadata.article_number || '',
        title: metadata.title || '',
        content,
        highlighted_content: highlightText(content, keywords),
        relevance_score: ((row.relevance_score || 0) / maxScore) * 100,
        article_type: metadata.article_type || ('article' as const),
        related_articles: [],
      };
    });

    const lawGroups = [...lawGroupMap.entries()].map(([name, v]) => ({
      law_id: '',
      law_name: name,
      law_type: '법률',
      article_count: v.count,
      score: v.count,
    }));

    return { articles, lawGroups, lawNames: [...lawGroupMap.keys()], keywords };
  } catch (e) {
    console.error('Supabase search error:', e);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    let body;
    try { body = await request.json(); }
    catch { return errorResponse('INVALID_JSON', '올바른 JSON 형식이 아닙니다', 400); }

    const { query, top_k = 10 } = body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return errorResponse('EMPTY_QUERY', '검색어를 입력해주세요', 400);
    }

    const sanitizedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);
    const validatedTopK = Math.min(Math.max(1, Number(top_k) || 10), MAX_RESULTS);
    const startTime = Date.now();

    // 1. Try Beopmang API
    try {
      const beopmangData = await searchViaBeopmang(sanitizedQuery, validatedTopK);
      const result = transformBeopmangResults(beopmangData, sanitizedQuery, validatedTopK);
      const elapsed = Date.now() - startTime;

      return NextResponse.json({
        query: sanitizedQuery,
        total_found: result.articles.length,
        keywords: result.keywords,
        relevant_laws: result.lawNames,
        law_groups: result.lawGroups,
        articles: result.articles,
        metadata: { search_time_ms: elapsed, llm_used: false, search_method: result.mode },
      });
    } catch (beopmangError) {
      console.log('Beopmang search failed, falling back to Supabase:', beopmangError);
    }

    // 2. Fallback to Supabase
    const supabaseResult = await searchViaSupabase(sanitizedQuery, validatedTopK);
    if (supabaseResult) {
      const elapsed = Date.now() - startTime;
      return NextResponse.json({
        query: sanitizedQuery,
        total_found: supabaseResult.articles.length,
        keywords: supabaseResult.keywords,
        relevant_laws: supabaseResult.lawNames,
        law_groups: supabaseResult.lawGroups,
        articles: supabaseResult.articles,
        metadata: { search_time_ms: elapsed, llm_used: false, search_method: 'supabase' },
      });
    }

    // 3. No results
    return NextResponse.json({
      query: sanitizedQuery,
      total_found: 0,
      keywords: sanitizedQuery.split(/[\s,]+/).filter(Boolean),
      relevant_laws: [],
      law_groups: [],
      articles: [],
      metadata: { search_time_ms: Date.now() - startTime, llm_used: false, search_method: 'none' },
    });

  } catch (error) {
    console.error('API error:', error);
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', 500);
  }
}
