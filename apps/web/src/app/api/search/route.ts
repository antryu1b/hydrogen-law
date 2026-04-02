import { NextResponse } from 'next/server';

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

// Escape regex special chars
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlight keywords in text
function highlightText(text: string, keywords: string[]): string {
  if (!keywords.length) return text;
  
  const keywordRegex = new RegExp(`(${keywords.map(escapeRegex).join('|')})`, 'gi');
  let highlighted = text.replace(
    keywordRegex,
    '<mark style="background-color: #fef08a; padding: 2px 4px; border-radius: 2px;">$1</mark>'
  );
  
  // Format newlines for display
  highlighted = highlighted.replace(/\n\n+/g, '<br><br>');
  highlighted = highlighted.replace(/\n/g, ' ');
  
  return highlighted;
}

async function searchViaBeopmang(query: string, topK: number): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Extract keywords for highlighting
    const keywords = query
      .split(/[\s,]+/)
      .filter((k: string) => k.length > 0);
    
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
      console.error('Beopmang API error:', response.status, await response.text());
      return errorResponse('BEOPMANG_ERROR', '법망 API 검색 중 오류가 발생했습니다', 502);
    }
    
    const beopmangData: BeopmangResponse = await response.json();
    
    // Transform Beopmang response to frontend format
    const articles = [];
    const lawNames = new Set<string>();
    
    for (const result of beopmangData.data.results) {
      const lawName = result.law_name_short || result.law_name;
      lawNames.add(lawName);
      
      // If no matched_articles, create one entry for the law itself
      if (!result.matched_articles || result.matched_articles.length === 0) {
        articles.push({
          article_id: result.law_id,
          law_name: lawName,
          article_number: '',
          title: result.law_name,
          content: `[${result.law_type}]`,
          highlighted_content: `[${result.law_type}]`,
          relevance_score: result.score * 100,
          article_type: 'article' as const,
          related_articles: [],
        });
        continue;
      }
      
      // Flatten matched articles into Article[] format
      for (const article of result.matched_articles) {
        const content = article.snippet || '';
        const highlightedContent = highlightText(content, keywords);
        
        articles.push({
          article_id: `${result.law_id}_${article.label}`,
          law_name: lawName,
          article_number: article.label,
          title: `${lawName} ${article.label}`,
          content,
          highlighted_content: highlightedContent,
          relevance_score: result.score * 100,
          article_type: 'article' as const,
          related_articles: [],
        });
      }
    }
    
    // Limit results
    const limitedArticles = articles.slice(0, topK);
    
    const elapsed = Date.now() - startTime;
    
    return NextResponse.json({
      query,
      total_found: limitedArticles.length,
      keywords,
      relevant_laws: Array.from(lawNames),
      articles: limitedArticles,
      metadata: {
        search_time_ms: elapsed,
        llm_used: false,
        search_method: beopmangData.data.mode || 'keyword',
      },
    });
    
  } catch (error) {
    console.error('Beopmang search error:', error);
    return errorResponse('BEOPMANG_ERROR', '법망 API 호출 실패', 502);
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

    // Use Beopmang API as primary
    return await searchViaBeopmang(sanitizedQuery, validatedTopK);

  } catch (error) {
    console.error('API error:', error);
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', 500);
  }
}
