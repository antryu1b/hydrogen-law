/**
 * 공유 타입 정의
 * 웹, 모바일, 데스크톱에서 공통으로 사용
 */

// Domain types (H1 foundation for H2~H6)
export * as Domain from './domain';

// 법령 기본 정보
export interface LawInfo {
  law_id: string;
  law_name: string;
  law_type: string; // '법률' | '시행령' | '시행규칙'
  promulgation_date?: string;
  enforcement_date?: string;
}

// 조문
export interface Article {
  id: string;
  law_name: string;
  article_number: string;
  title: string;
  content: string;
  highlighted_content: string;
  related_articles: RelatedArticle[];
  relevance_score: number;
}

// 참조 조항
export interface RelatedArticle {
  id: string;
  article_number: string;
  law_name: string;
}

// 검색 요청
export interface SearchRequest {
  query: string;
  top_k?: number;
  filters?: Record<string, any>;
}

// 검색 응답
export interface SearchResponse {
  query: string;
  total_found: number;
  keywords: string[];
  relevant_laws: string[];
  articles: Article[];
  metadata: {
    search_time_ms: number;
    llm_used: boolean;
    search_method: string;
  };
}

// 컴플라이언스 요청
export interface ComplianceRequest {
  business_type: string;
  details: Record<string, any>;
}

// 컴플라이언스 응답
export interface ComplianceResponse {
  business_type: string;
  checklist: ComplianceChecklistItem[];
  summary: {
    total_requirements: number;
    mandatory: number;
    optional: number;
    estimated_time: string;
    key_permits: string[];
  };
  risk_assessment: 'low' | 'medium' | 'high';
  metadata: {
    generated_by: string;
    llm_used: boolean;
  };
}

// 컴플라이언스 체크리스트 항목
export interface ComplianceChecklistItem {
  category: string;
  requirement: string;
  content: string;
  law_reference: string;
  status: 'pending' | 'in_progress' | 'completed';
  is_mandatory: boolean;
}

// API 응답
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
