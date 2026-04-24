import type { ComplianceReport } from '../types';

export async function runComplianceCheck(file: File): Promise<ComplianceReport> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch('/api/compliance', {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || '컴플라이언스 체크 실패');
  }

  return data as ComplianceReport;
}
