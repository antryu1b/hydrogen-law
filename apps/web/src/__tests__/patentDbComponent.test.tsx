/**
 * Component render tests for PatentDbList and CompetitorPatentStats.
 * Uses react-dom/server renderToStaticMarkup (no @testing-library/dom needed).
 *
 * Three cases from cycle-7 review:
 *   1. statusWarning set, loadError null: count line and empty note are visible.
 *   2. loadError set: count line and empty note are hidden.
 *   3. CompetitorPatentStats legend contains no 이관.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PatentDbList } from '@/components/intel/PatentDb';
import { CompetitorPatentStats } from '@/components/intel/PatentWatch';
import type { FtoRecord } from '@/lib/intel';
import type { CompetitorStats } from '@/lib/patent-watch';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const BASE_PROPS = {
  autoStatus: {},
  watchRows: [] as [],
  checks: null,
  max: 2000,
} as const;

const ONE_RECORD: FtoRecord[] = [
  {
    no: 1,
    appNo: '10-2020-0001',
    title: '수전해 시스템',
    applicant: 'Toyota',
    filedDate: '2020-01-01',
    category: 'system',
    status: '등록',
    verdict: '상세검토 불필요',
    reason: '',
    link: '',
  },
];

/** Minimal CompetitorStats with total > 0 so the legend renders (not the empty note). */
const MOCK_STATS: CompetitorStats = {
  total: 1,
  years: [],
  groups: [],
};

// ── PatentDbList: count line and empty note visibility ────────────────────────

describe('PatentDbList: loadError vs statusWarning', () => {
  it('statusWarning set, loadError null, with records: count line is visible', () => {
    const html = renderToStaticMarkup(
      <PatentDbList
        {...BASE_PROPS}
        ftoRecords={ONE_RECORD}
        statusWarning="권리상태 자동조회 로드 실패 — 권리상태 필터는 FTO 원본 기준"
      />,
    );
    expect(html).toContain('건 중');
    expect(html).toContain('건 표시');
    // Error banner must NOT show
    expect(html).not.toContain('데이터 로드 실패');
  });

  it('statusWarning set, loadError null, with no records: empty note is visible', () => {
    const html = renderToStaticMarkup(
      <PatentDbList
        {...BASE_PROPS}
        ftoRecords={[]}
        statusWarning="권리상태 자동조회 로드 실패 — 권리상태 필터는 FTO 원본 기준"
      />,
    );
    expect(html).toContain('검색 결과가 없습니다.');
    // Count line must NOT be present (no rows)
    expect(html).not.toContain('건 중');
  });

  it('loadError set: no count line and no empty note', () => {
    const html = renderToStaticMarkup(
      <PatentDbList
        {...BASE_PROPS}
        ftoRecords={[]}
        loadError="테이블이 아직 없습니다."
      />,
    );
    // Count line hidden when loadError is set
    expect(html).not.toContain('건 중');
    // Empty note suppressed so it does not contradict the error banner
    expect(html).not.toContain('검색 결과가 없습니다.');
    // Error banner is shown
    expect(html).toContain('데이터 로드 실패');
  });

  it('loadError set with partial rows: rows render but no count line', () => {
    const html = renderToStaticMarkup(
      <PatentDbList
        {...BASE_PROPS}
        ftoRecords={ONE_RECORD}
        loadError="KIPRIS 로드 실패"
      />,
    );
    // Count line still hidden
    expect(html).not.toContain('건 중');
    // The row card itself is still rendered (partial data visible)
    expect(html).toContain('수전해 시스템');
  });
});

// ── PatentDbList: CheckFailures banner tone ───────────────────────────────────

describe('PatentDbList: CheckFailures banner tone', () => {
  const makeCheck = (failures: string[]): import('@/lib/patent-watch').CheckState => ({
    at: '2024-01-15T00:00:00Z',
    requests: failures.length + 1,
    failures,
  });

  it('overseas-only failure (US+EP) renders amber warning, not destructive', () => {
    const html = renderToStaticMarkup(
      <PatentDbList
        {...BASE_PROPS}
        ftoRecords={ONE_RECORD}
        checks={{ US: makeCheck(['timeout']), EP: makeCheck(['500']) }}
      />,
    );
    expect(html).toContain('해외(US·EP) 수집 일부 실패 · 국내 수집은 정상입니다');
    expect(html).not.toContain('확인 실패 · 마지막 자동 수집에서 일부 요청이 실패했습니다');
    // amber color classes present, not destructive
    expect(html).toContain('border-amber-500');
    expect(html).not.toContain('border-destructive');
  });

  it('domestic failure (KR) renders destructive banner', () => {
    const html = renderToStaticMarkup(
      <PatentDbList
        {...BASE_PROPS}
        ftoRecords={ONE_RECORD}
        checks={{ KR: makeCheck(['timeout']), US: makeCheck(['500']) }}
      />,
    );
    expect(html).toContain('확인 실패 · 마지막 자동 수집에서 일부 요청이 실패했습니다');
    expect(html).not.toContain('해외(US·EP) 수집 일부 실패');
  });
});

// ── CompetitorPatentStats: legend contains no 이관 ─────────────────────────

describe('CompetitorPatentStats: legend', () => {
  it('legend contains no 이관 label', () => {
    const html = renderToStaticMarkup(
      <CompetitorPatentStats stats={MOCK_STATS} error={null} />,
    );
    expect(html).not.toContain('이관');
  });

  it('legend shows 시스템 label', () => {
    const html = renderToStaticMarkup(
      <CompetitorPatentStats stats={MOCK_STATS} error={null} />,
    );
    expect(html).toContain('시스템');
  });
});
