/**
 * Core law domain types — source of truth for H2~H6 features
 */

export interface Law {
  id: string;              // e.g., "013670"
  nameKo: string;          // "수소경제 육성 및 수소 안전관리에 관한 법률"
  nameEn?: string;
  type: 'statute' | 'decree' | 'rule' | 'ordinance';
  enforcementDate: string; // ISO date
  lastAmended?: string;
  articles: Article[];
  metadata?: {
    articleCount?: number;
    caseCount?: number;
    xrefCount?: number;
    historyCount?: number;
  };
}

export interface Article {
  id: string;              // "§2(7)"
  number: string;          // "2"
  title?: string;          // 조 제목
  text: string;            // 원문
  paragraphs?: Paragraph[];
  references?: string[];   // article ids this article cites
}

export interface Paragraph {
  number: string;          // "①", "②"
  text: string;
}

export interface Citation {
  lawId: string;
  articleId: string;
  version: string;         // enforcementDate
  excerpt: string;         // 200 chars
  confidence?: number;     // 0.0-1.0
}
