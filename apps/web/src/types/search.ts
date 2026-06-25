export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface Article {
  article_id: string;
  law_name: string;
  law_id?: string; // 법망 API law_id (국가법령정보센터 링크용)
  law_type?: string; // 법률/시행령/시행규칙/별표 등
  article_number: string;
  title: string;
  content: string;
  highlighted_content: string;
  highlighted_title?: string; // title with matched keywords <mark>-wrapped
  highlighted_law_name?: string; // law_name with matched keywords <mark>-wrapped
  relevance_score: number;
  article_type?: 'article' | 'appendix';
  related_articles?: RelatedArticle[];
}

export interface RelatedArticle {
  id: string;
  article_number: string;
}

export interface SearchMetadata {
  search_time_ms: number;
  llm_used: boolean;
  search_method: string;
}

export interface SearchResponse {
  query: string;
  total_found: number;
  keywords: string[];
  relevant_laws: string[];
  articles: Article[];
  metadata: SearchMetadata;
}

export interface SearchRequest {
  query: string;
  top_k?: number;
}
