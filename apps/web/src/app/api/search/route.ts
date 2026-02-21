import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 100;
const MAX_KEYWORDS = 20;
const RAG_ENGINE_URL = process.env.RAG_ENGINE_URL || 'http://localhost:8000';

interface SupabaseSearchResult {
  id: string;
  content: string;
  relevance_score: number;
  metadata: {
    law_name?: string;
    article_number?: string;
    title?: string;
    article_type?: 'article' | 'appendix';
  };
}

interface RagArticle {
  id: string;
  law_name: string;
  article_number: string;
  title: string;
  content: string;
  highlighted_content: string;
  related_articles: { id: string; article_number: string }[];
  relevance_score: number;
}

interface RagResponse {
  query: string;
  total_found: number;
  keywords: string[];
  relevant_laws: string[];
  articles: RagArticle[];
  metadata: {
    search_time_ms: number;
    llm_used: boolean;
    search_method: string;
  };
}

// Phase 2: 표준 에러 응답 헬퍼
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status }
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchViaRagEngine(query: string, topK: number): Promise<NextResponse> {
  const response = await fetch(`${RAG_ENGINE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('RAG engine error:', response.status, errorBody);
    return errorResponse('RAG_ERROR', 'RAG 엔진 검색 중 오류가 발생했습니다', 502);
  }

  const ragData: RagResponse = await response.json();

  // Transform RAG engine response to match frontend format
  const articles = ragData.articles.map(article => ({
    article_id: article.id,
    law_name: article.law_name || '(법령명 없음)',
    article_number: article.article_number || '',
    title: article.title || '',
    content: article.content || '',
    highlighted_content: article.highlighted_content || article.content || '',
    relevance_score: article.relevance_score,
    article_type: 'article' as const,
    related_articles: article.related_articles || [],
  }));

  return NextResponse.json({
    query: ragData.query,
    total_found: ragData.total_found,
    keywords: ragData.keywords,
    relevant_laws: ragData.relevant_laws,
    articles,
    metadata: ragData.metadata,
  });
}

async function searchViaSupabase(
  query: string,
  topK: number,
  supabaseUrl: string,
  supabaseKey: string
): Promise<NextResponse> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const keywords = query
    .split(/[\s,]+/)
    .filter((k: string) => k.length > 0)
    .slice(0, MAX_KEYWORDS);

  let data: SupabaseSearchResult[];

  if (keywords.length <= 1) {
    const { data: result, error } = await supabase.rpc('search_law_documents', {
      search_query: query,
      max_results: topK
    });

    if (error) {
      throw new Error(`Supabase RPC error: ${error.message}`);
    }

    data = result;
  } else {
    const searchPromises = keywords.map(keyword =>
      supabase.rpc('search_law_documents', {
        search_query: keyword,
        max_results: topK
      })
    );

    const searchResults = await Promise.all(searchPromises);

    const firstError = searchResults.find(r => r.error);
    if (firstError?.error) {
      throw new Error(`Supabase RPC error: ${firstError.error.message}`);
    }

    const mergedMap = new Map<string, SupabaseSearchResult & { matchCount: number }>();

    for (const result of searchResults) {
      if (!result.data) continue;
      for (const row of result.data as SupabaseSearchResult[]) {
        const existing = mergedMap.get(row.id);
        if (existing) {
          existing.relevance_score += row.relevance_score;
          existing.matchCount += 1;
        } else {
          mergedMap.set(row.id, { ...row, matchCount: 1 });
        }
      }
    }

    for (const entry of mergedMap.values()) {
      entry.relevance_score *= (1 + (entry.matchCount - 1) * 0.5);
    }

    data = [...mergedMap.values()]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, topK);
  }

  if (!data || data.length === 0) {
    return NextResponse.json({
      query,
      total_found: 0,
      keywords,
      relevant_laws: [],
      articles: [],
      metadata: { search_time_ms: 0, llm_used: false, search_method: 'keyword' }
    });
  }

  const maxScore = Math.max(...data.map((row: SupabaseSearchResult) => row.relevance_score), 0.0001);

  const keywordRegex = keywords.length > 0
    ? new RegExp(`(${keywords.map(escapeRegex).join('|')})`, 'gi')
    : null;

  const articles = data
    .map((row: SupabaseSearchResult) => {
      try {
        const content = row.content || '';
        const metadata = row.metadata || {};
        let highlightedContent = content;

        if (keywordRegex) {
          highlightedContent = highlightedContent.replace(
            keywordRegex,
            '<mark style="background-color: #fef08a; padding: 2px 4px; border-radius: 2px;">$1</mark>'
          );
        }

        highlightedContent = highlightedContent.replace(/\n\n+/g, '<br><br>');
        highlightedContent = highlightedContent.replace(/\n/g, ' ');

        const score = typeof row.relevance_score === 'number' ? row.relevance_score : 0;
        const normalizedScore = (score / maxScore) * 100;

        return {
          article_id: row.id,
          law_name: metadata.law_name || '(법령명 없음)',
          article_number: metadata.article_number || row.id.split('_')[1] || '',
          title: metadata.title || '',
          content,
          highlighted_content: highlightedContent,
          relevance_score: normalizedScore,
          article_type: metadata.article_type || 'article',
          related_articles: []
        };
      } catch {
        return null;
      }
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return NextResponse.json({
    query,
    total_found: articles.length,
    keywords,
    relevant_laws: [...new Set(articles.map(a => a.law_name))],
    articles,
    metadata: { search_time_ms: 0, llm_used: false, search_method: 'keyword' }
  });
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 1. Try Supabase
    if (supabaseUrl && supabaseKey) {
      try {
        return await searchViaSupabase(sanitizedQuery, validatedTopK, supabaseUrl, supabaseKey);
      } catch (e) {
        console.error('Supabase search failed, falling back:', e);
      }
    }

    // 2. Try RAG engine
    try {
      return await searchViaRagEngine(sanitizedQuery, validatedTopK);
    } catch {
      console.log('RAG engine unreachable');
    }

    // 3. No data source available
    return errorResponse('NO_DATASOURCE', '데이터베이스에 연결되지 않았습니다. 관리자에게 문의하세요.', 503);

  } catch (error) {
    console.error('API error:', error);
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', 500);
  }
}
