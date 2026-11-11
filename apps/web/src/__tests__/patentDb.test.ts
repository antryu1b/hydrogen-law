import { describe, it, expect } from 'vitest';
import { parseDbParams, filterPatentDb, rightsStatusBucket, type PatentDbRow } from '@/lib/patent-db';
import type { FtoRecord } from '@/lib/intel';
import type { WatchListRow } from '@/lib/patent-watch';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFtoRow(overrides: Partial<FtoRecord> = {}): PatentDbRow {
  const record: FtoRecord = {
    no: 1,
    category: 'system',
    appNo: '10-2020-0001234',
    title: '수전해 시스템',
    applicant: '현대자동차',
    status: '등록',
    verdict: '상세검토 불필요',
    reason: '선행기술 없음',
    link: 'https://example.com',
    filedDate: '2020-05-10',
    ...overrides,
  };
  return { source: 'fto', sortKey: record.filedDate ?? '', record };
}

function makeWatchRow(overrides: Partial<WatchListRow> = {}): PatentDbRow {
  const row: WatchListRow = {
    id: 'watch-1',
    country: 'KR',
    appNo: '10-2022-0009999',
    title: '기액분리기 장치',
    applicant: 'Toyota',
    filedDate: '2022-01-15',
    status: '공개',
    link: 'https://kipris.example.com',
    category: 'gas-liquid',
    matchedSet: 'C',
    ...overrides,
  };
  return { source: 'watch', sortKey: row.filedDate ?? '', row };
}

// ── parseDbParams ─────────────────────────────────────────────────────────────

describe('parseDbParams', () => {
  it('returns empty strings for missing params', () => {
    const result = parseDbParams({});
    expect(result).toEqual({ group: '', company: '', q: '', cat: '', verdict: '', country: '', rights: '' });
  });

  it('takes first value when param is an array', () => {
    // Repeated ?q=a&q=b arrives as string[]
    const result = parseDbParams({ q: ['first', 'second'] });
    expect(result.q).toBe('first');
  });

  it('trims whitespace from q', () => {
    const result = parseDbParams({ q: '  수전해  ' });
    expect(result.q).toBe('수전해');
  });

  it('accepts valid group', () => {
    const result = parseDbParams({ group: '자동차 업체' });
    expect(result.group).toBe('자동차 업체');
  });

  it('rejects unknown group, falls back to empty', () => {
    const result = parseDbParams({ group: '알 수 없는 그룹' });
    expect(result.group).toBe('');
  });

  it('accepts valid company', () => {
    const result = parseDbParams({ company: '현대차' });
    expect(result.company).toBe('현대차');
  });

  it('rejects unknown company', () => {
    const result = parseDbParams({ company: '알 수 없는 회사' });
    expect(result.company).toBe('');
  });

  it('accepts Korean company name exactly', () => {
    const result = parseDbParams({ company: 'Toyota' });
    expect(result.company).toBe('Toyota');
  });

  it('accepts valid verdict', () => {
    const result = parseDbParams({ verdict: 'need' });
    expect(result.verdict).toBe('need');
  });

  it('rejects unknown verdict', () => {
    const result = parseDbParams({ verdict: 'unknown' });
    expect(result.verdict).toBe('');
  });

  it('accepts valid country', () => {
    const result = parseDbParams({ country: 'KR' });
    expect(result.country).toBe('KR');
  });

  it('rejects unknown country', () => {
    const result = parseDbParams({ country: 'JP' });
    expect(result.country).toBe('');
  });

  it('accepts valid rights status bucket', () => {
    const result = parseDbParams({ rights: '등록' });
    expect(result.rights).toBe('등록');
  });

  it('rejects unknown rights value', () => {
    const result = parseDbParams({ rights: '이상한상태' });
    expect(result.rights).toBe('');
  });

  it('handles array param for group — takes first, validates it', () => {
    const result = parseDbParams({ group: ['자동차 업체', '수전해 전문업체'] });
    expect(result.group).toBe('자동차 업체');
  });

  it('handles array param where first is invalid — falls back to empty', () => {
    const result = parseDbParams({ group: ['모르는그룹', '자동차 업체'] });
    expect(result.group).toBe('');
  });
});

// ── rightsStatusBucket ────────────────────────────────────────────────────────

describe('rightsStatusBucket', () => {
  it('maps 등록 to 등록', () => expect(rightsStatusBucket('등록')).toBe('등록'));
  it('maps 거절 to 거절·취하·소멸', () => expect(rightsStatusBucket('거절')).toBe('거절·취하·소멸'));
  it('maps 취하 to 거절·취하·소멸', () => expect(rightsStatusBucket('취하')).toBe('거절·취하·소멸'));
  it('maps 소멸 to 거절·취하·소멸', () => expect(rightsStatusBucket('소멸')).toBe('거절·취하·소멸'));
  it('maps 포기 to 거절·취하·소멸', () => expect(rightsStatusBucket('포기')).toBe('거절·취하·소멸'));
  it('maps 공개 to 공개·심사중', () => expect(rightsStatusBucket('공개')).toBe('공개·심사중'));
  it('maps 심사중 to 공개·심사중', () => expect(rightsStatusBucket('심사중')).toBe('공개·심사중'));
  it('maps empty string to 상태없음', () => expect(rightsStatusBucket('')).toBe('상태없음'));
  it('maps null to 상태없음', () => expect(rightsStatusBucket(null)).toBe('상태없음'));
  it('maps undefined to 상태없음', () => expect(rightsStatusBucket(undefined)).toBe('상태없음'));
  it('maps dash to 상태없음', () => expect(rightsStatusBucket('-')).toBe('상태없음'));
  it('maps unknown string to 상태없음', () => expect(rightsStatusBucket('알수없음')).toBe('상태없음'));
});

// ── filterPatentDb ────────────────────────────────────────────────────────────

const emptyFilter = {
  source: '',
  group: '',
  company: '',
  cat: '',
  verdict: '',
  country: '',
  rights: '',
  q: '',
};

describe('filterPatentDb', () => {
  it('returns all rows when no filters set', () => {
    const rows = [makeFtoRow(), makeWatchRow()];
    expect(filterPatentDb(rows, emptyFilter)).toHaveLength(2);
  });

  it('source=fto shows only FTO rows', () => {
    const rows = [makeFtoRow(), makeWatchRow()];
    const result = filterPatentDb(rows, { ...emptyFilter, source: 'fto' });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('fto');
  });

  it('source=watch shows only watch rows', () => {
    const rows = [makeFtoRow(), makeWatchRow()];
    const result = filterPatentDb(rows, { ...emptyFilter, source: 'watch' });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('watch');
  });

  it('verdict filter hides watch rows', () => {
    const rows = [makeFtoRow(), makeWatchRow()];
    const result = filterPatentDb(rows, { ...emptyFilter, verdict: 'need' });
    // Watch row excluded; FTO row with verdict "상세검토 불필요" also excluded
    expect(result.every((r) => r.source === 'fto')).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('verdict=need shows only FTO rows with 상세검토 필요', () => {
    const rows = [
      makeFtoRow({ verdict: '상세검토 필요' }),
      makeFtoRow({ no: 2, verdict: '상세검토 불필요' }),
      makeWatchRow(),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, verdict: 'need' });
    expect(result).toHaveLength(1);
    if (result[0].source === 'fto') expect(result[0].record.verdict).toBe('상세검토 필요');
  });

  it('verdict=noneed shows only FTO rows with 상세검토 불필요', () => {
    const rows = [
      makeFtoRow({ verdict: '상세검토 필요' }),
      makeFtoRow({ no: 2, verdict: '상세검토 불필요' }),
      makeWatchRow(),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, verdict: 'noneed' });
    expect(result).toHaveLength(1);
    if (result[0].source === 'fto') expect(result[0].record.verdict).toBe('상세검토 불필요');
  });

  it('country filter hides non-matching watch rows; FTO rows pass through', () => {
    const rows = [
      makeFtoRow(),
      makeWatchRow({ country: 'KR' }),
      makeWatchRow({ id: 'watch-2', country: 'US' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, country: 'KR' });
    // FTO row passes (no country), KR watch passes, US watch excluded
    expect(result).toHaveLength(2);
  });

  it('group filter matches FTO by applicant via competitorGroupFor', () => {
    const rows = [
      makeFtoRow({ applicant: '현대자동차' }), // in '자동차 업체'
      makeFtoRow({ no: 2, applicant: 'NEL' }), // in '수전해 전문업체'
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, group: '자동차 업체' });
    expect(result).toHaveLength(1);
    if (result[0].source === 'fto') expect(result[0].record.applicant).toBe('현대자동차');
  });

  it('company filter matches FTO by applicant', () => {
    const rows = [
      makeFtoRow({ applicant: '현대자동차' }),
      makeFtoRow({ no: 2, applicant: 'Toyota' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, company: 'Toyota' });
    expect(result).toHaveLength(1);
    if (result[0].source === 'fto') expect(result[0].record.applicant).toBe('Toyota');
  });

  it('cat filter applies to both FTO and watch', () => {
    const rows = [
      makeFtoRow({ category: 'system' }),
      makeWatchRow({ category: 'gas-liquid' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, cat: 'system' });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('fto');
  });

  it('text search matches FTO title', () => {
    const rows = [
      makeFtoRow({ title: '수전해 시스템' }),
      makeFtoRow({ no: 2, title: '기액분리기 장치' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, q: '수전해' });
    expect(result).toHaveLength(1);
  });

  it('text search matches watch applicant', () => {
    const rows = [
      makeWatchRow({ applicant: 'Toyota' }),
      makeWatchRow({ id: 'watch-2', applicant: 'Honda' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, q: 'toyota' });
    expect(result).toHaveLength(1);
  });

  it('rights filter uses autoStatus for FTO rows', () => {
    const ftoRow = makeFtoRow({ status: '등록' });
    // Override autoStatus to '거절'
    const ftoRowWithAutoStatus: PatentDbRow = {
      ...ftoRow,
      source: 'fto',
      autoStatus: { registerStatus: '거절', checkedAt: '2024-01-01' },
    } as PatentDbRow;
    const rows = [ftoRow, ftoRowWithAutoStatus];
    // Filter for 등록 — only the one without autoStatus override passes
    const result = filterPatentDb(rows, { ...emptyFilter, rights: '등록' });
    expect(result).toHaveLength(1);
    if (result[0].source === 'fto') expect(result[0].autoStatus).toBeUndefined();
  });

  it('rights filter applies to watch rows', () => {
    const rows = [
      makeWatchRow({ status: '공개' }),
      makeWatchRow({ id: 'watch-2', status: '등록' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, rights: '등록' });
    expect(result).toHaveLength(1);
  });
});
