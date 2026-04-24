/**
 * Compliance check domain types — target for H2
 */

import type { Citation } from './law';

export interface Rule {
  id: string;
  lawId: string;
  articleId: string;
  description: string;
  mandatory: boolean;
  businessTypes: string[];
}

export interface Violation {
  ruleId: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  remediation?: string;
}

export interface ComplianceCheck {
  id: string;
  businessType: string;
  checkDate: string;       // ISO date
  rules: Rule[];
  violations: Violation[];
  citations: Citation[];
}

export interface ComplianceReport {
  checkId: string;
  businessType: string;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  generatedAt: string;     // ISO datetime
}
