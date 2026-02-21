export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface Article {
  article_id: string;
  law_name: string;
  article_number: string;
  title: string;
  content: string;
  highlighted_content: string;
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
