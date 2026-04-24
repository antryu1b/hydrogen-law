// Compliance check domain types — mirrors Python ComplianceReport

export type Severity = 'mandatory' | 'recommended' | 'informational';

export interface Citation {
  law_id: string;
  article_id: string;
  version: string;
  excerpt: string;
  confidence?: number;
}

export interface Violation {
  rule_id: string;
  article_ref?: Citation;
  matched_keywords: string[];
  severity: Severity;
  user_context: string;
  description: string;
}

export interface ComplianceCheck {
  id: string;
  business_type: string;
  check_date: string;
  ran_at?: string;
  violations: Violation[];
  summary: string;
}

export interface ComplianceReport {
  check?: ComplianceCheck;
  format: 'json';
  check_id: string;
  business_type: string;
  total_rules: number;
  passed_rules: number;
  failed_rules: number;
  risk_level: 'low' | 'medium' | 'high';
  summary: string;
  generated_at: string;
}
