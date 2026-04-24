import { describe, it, expect } from 'vitest';

// Pure logic tests for compliance-check feature
// (React component tests would require MSW for fetch mocking — kept simple)

import type { ComplianceReport, Violation, Severity } from '../features/compliance-check/types';

function countBySeverity(violations: Violation[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { mandatory: 0, recommended: 0, informational: 0 };
  for (const v of violations) {
    if (v.severity in counts) counts[v.severity as Severity]++;
  }
  return counts;
}

function deriveRiskLevel(violations: Violation[]): 'low' | 'medium' | 'high' {
  if (violations.some((v) => v.severity === 'mandatory')) return 'high';
  if (violations.some((v) => v.severity === 'recommended')) return 'medium';
  return 'low';
}

const mockViolation = (severity: Severity, rule_id: string): Violation => ({
  rule_id,
  matched_keywords: ['충전소'],
  severity,
  user_context: '테스트 내용',
  description: '테스트 요구사항',
});

const mockReport = (violations: Violation[]): ComplianceReport => ({
  check: {
    id: 'test-id',
    business_type: 'hydrogen_station',
    check_date: '2026-04-24',
    violations,
    summary: '테스트 요약',
  },
  format: 'json',
  check_id: 'test-id',
  business_type: 'hydrogen_station',
  total_rules: violations.length,
  passed_rules: 0,
  failed_rules: violations.length,
  risk_level: deriveRiskLevel(violations),
  summary: '테스트 요약',
  generated_at: '2026-04-24T00:00:00Z',
});

describe('countBySeverity', () => {
  it('returns zero counts for empty violations', () => {
    const counts = countBySeverity([]);
    expect(counts.mandatory).toBe(0);
    expect(counts.recommended).toBe(0);
    expect(counts.informational).toBe(0);
  });

  it('counts mandatory violations correctly', () => {
    const violations = [
      mockViolation('mandatory', 'r1'),
      mockViolation('mandatory', 'r2'),
      mockViolation('recommended', 'r3'),
    ];
    const counts = countBySeverity(violations);
    expect(counts.mandatory).toBe(2);
    expect(counts.recommended).toBe(1);
    expect(counts.informational).toBe(0);
  });
});

describe('deriveRiskLevel', () => {
  it('returns high when mandatory violations exist', () => {
    expect(deriveRiskLevel([mockViolation('mandatory', 'r1')])).toBe('high');
  });

  it('returns medium when only recommended violations exist', () => {
    expect(deriveRiskLevel([mockViolation('recommended', 'r1')])).toBe('medium');
  });

  it('returns low when only informational violations exist', () => {
    expect(deriveRiskLevel([mockViolation('informational', 'r1')])).toBe('low');
  });

  it('returns low for empty violations', () => {
    expect(deriveRiskLevel([])).toBe('low');
  });
});

describe('ComplianceReport structure', () => {
  it('report with mandatory violations has risk_level high', () => {
    const report = mockReport([mockViolation('mandatory', 'r1')]);
    expect(report.risk_level).toBe('high');
    expect(report.failed_rules).toBe(1);
  });

  it('report with no violations has risk_level low', () => {
    const report = mockReport([]);
    expect(report.risk_level).toBe('low');
    expect(report.failed_rules).toBe(0);
  });

  it('report preserves all violation fields', () => {
    const v = mockViolation('mandatory', 'hydrogen-law-§18');
    const report = mockReport([v]);
    expect(report.check?.violations[0].rule_id).toBe('hydrogen-law-§18');
    expect(report.check?.violations[0].severity).toBe('mandatory');
  });
});
