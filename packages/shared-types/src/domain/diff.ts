/**
 * Law version diff domain types — target for H5
 */

export interface ChangedArticle {
  articleId: string;
  articleNumber: string;
  changeType: 'added' | 'modified' | 'deleted';
  before?: string;         // previous text
  after?: string;          // new text
}

export interface VersionDiff {
  lawId: string;
  fromVersion: string;     // ISO date (enforcementDate)
  toVersion: string;       // ISO date
  changedArticles: ChangedArticle[];
  summary: string;
}
