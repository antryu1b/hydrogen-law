'use client';

import { useState } from 'react';
import { runComplianceCheck } from '../api/compliance-handler';
import type { ComplianceReport } from '../types';

export interface ComplianceCheckState {
  report: ComplianceReport | null;
  loading: boolean;
  error: string | null;
  run: (file: File) => Promise<void>;
  reset: () => void;
}

export function useComplianceCheck(): ComplianceCheckState {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (file: File) => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await runComplianceCheck(file);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setReport(null);
    setError(null);
    setLoading(false);
  };

  return { report, loading, error, run, reset };
}
