/**
 * Search handler — pure business logic extracted from /api/search/route.ts
 * The API route is a thin wrapper that calls these functions.
 */

const BEOPMANG_API_URL = 'https://api.beopmang.org/api/v4';

export interface BeopmangArticle {
  label: string;
  snippet: string;
}

export interface BeopmangResult {
  law_id: string;
  law_name: string;
  law_name_short?: string;
  law_type: string;
  matched_articles?: BeopmangArticle[];
  score: number;
}

export interface BeopmangResponse {
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

export interface SearchArticle {
  article_id: string;
  law_name: string;
  law_id: string;
  law_type: string;
  article_number: string;
  title: string;
  content: string;
  highlighted_content: string;
  relevance_score: number;
  article_type: 'article' | 'appendix';
  related_articles: unknown[];
}

export interface SearchResult {
  articles: SearchArticle[];
  lawNames: string[];
  lawGroups: {
    law_id: string;
    law_name: string;
    law_type: string;
    article_count: number;
    score: number;
  }[];
  keywords: string[];
  mode?: string;
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(text: string, keywords: string[]): string {
  if (!keywords.length) return text;
  const keywordRegex = new RegExp(`(${keywords.map(escapeRegex).join('|')})`, 'gi');
  let highlighted = text.replace(
    keywordRegex,
    '<mark style="background-color: #fef08a; padding: 2px 4px; border-radius: 2px;">$1</mark>'
  );
  highlighted = highlighted.replace(/\n\n+/g, '<br><br>');
  highlighted = highlighted.replace(/\n/g, ' ');
  return highlighted;
}

export async function searchViaBeopmang(query: string, topK: number): Promise<BeopmangResponse> {
  const url = new URL(`${BEOPMANG_API_URL}/law`);
  url.searchParams.set('action', 'search');
  url.searchParams.set('q', query);
  url.searchParams.set('mode', 'keyword');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Beopmang API error: ${response.status}`);
  }

  const beopmangData: BeopmangResponse = await response.json();

  if (!beopmangData.data?.results) {
    throw new Error('Invalid Beopmang response');
  }

  return beopmangData;
}

export function transformBeopmangResults(
  beopmangData: BeopmangResponse,
  query: string,
  topK: number,
): SearchResult {
  const keywords = query.split(/[\s,]+/).filter((k: string) => k.length > 0);
  const articles: SearchArticle[] = [];
  const lawNames = new Set<string>();
  const lawGroups: SearchResult['lawGroups'] = [];

  for (const result of beopmangData.data.results) {
    const lawName = result.law_name_short || result.law_name;
    lawNames.add(lawName);

    lawGroups.push({
      law_id: result.law_id,
      law_name: result.law_name,
      law_type: result.law_type || '법률',
      article_count: result.matched_articles?.length || 0,
      score: result.score,
    });

    if (!result.matched_articles || result.matched_articles.length === 0) {
      articles.push({
        article_id: result.law_id,
        law_name: lawName,
        law_id: result.law_id,
        law_type: result.law_type || '법률',
        article_number: '',
        title: result.law_name,
        content: `[${result.law_type}]`,
        highlighted_content: `[${result.law_type}]`,
        relevance_score: result.score * 100,
        article_type: 'article',
        related_articles: [],
      });
      continue;
    }

    // Merge snippets from same article
    const mergedArticles = new Map<string, { label: string; snippets: string[] }>();
    for (const article of result.matched_articles) {
      const key = `${result.law_id}_${article.label}`;
      const existing = mergedArticles.get(key);
      const snippet = (article.snippet || '').trim();
      if (existing) {
        if (snippet && !existing.snippets.includes(snippet)) existing.snippets.push(snippet);
      } else {
        mergedArticles.set(key, { label: article.label, snippets: snippet ? [snippet] : [] });
      }
    }

    for (const [key, merged] of mergedArticles) {
      const content = merged.snippets.join(' ... ');
      articles.push({
        article_id: key,
        law_name: lawName,
        law_id: result.law_id,
        law_type: result.law_type || '법률',
        article_number: merged.label,
        title: `${lawName} ${merged.label}`,
        content,
        highlighted_content: highlightText(content, keywords),
        relevance_score: result.score * 100,
        article_type: 'article',
        related_articles: [],
      });
    }
  }

  return {
    articles: articles.slice(0, topK),
    lawNames: Array.from(lawNames),
    lawGroups,
    keywords,
    mode: beopmangData.data.mode || 'keyword',
  };
}
