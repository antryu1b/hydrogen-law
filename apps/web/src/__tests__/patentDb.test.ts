import { describe, it, expect } from 'vitest';
import {
  parseDbParams,
  filterPatentDb,
  rightsStatusBucket,
  buildDbRows,
  computePortfolioCounts,
  type PatentDbRow,
} from '@/lib/patent-db';
import { COMPETITOR_GROUPS } from '@/lib/patent-watch';
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
    const result = parseDbParams({ q: ['first', 'second'] });
    expect(result.q).toBe('first');
  });

  it('trims whitespace from q', () => {
    const result = parseDbParams({ q: '  수전해  ' });
    expect(result.q).toBe('수전해');
  });

  it('accepts valid group', () => {
    expect(parseDbParams({ group: '자동차 업체' }).group).toBe('자동차 업체');
  });

  it('rejects unknown group, falls back to empty', () => {
    expect(parseDbParams({ group: '알 수 없는 그룹' }).group).toBe('');
  });

  it('accepts valid company', () => {
    expect(parseDbParams({ company: '현대차' }).company).toBe('현대차');
  });

  it('rejects unknown company', () => {
    expect(parseDbParams({ company: '알 수 없는 회사' }).company).toBe('');
  });

  it('accepts Korean company name exactly', () => {
    expect(parseDbParams({ company: 'Toyota' }).company).toBe('Toyota');
  });

  it('accepts valid verdict', () => {
    expect(parseDbParams({ verdict: 'need' }).verdict).toBe('need');
  });

  it('rejects unknown verdict', () => {
    expect(parseDbParams({ verdict: 'unknown' }).verdict).toBe('');
  });

  it('accepts valid country', () => {
    expect(parseDbParams({ country: 'KR' }).country).toBe('KR');
  });

  it('rejects unknown country', () => {
    expect(parseDbParams({ country: 'JP' }).country).toBe('');
  });

  it('accepts valid rights status bucket', () => {
    expect(parseDbParams({ rights: '등록' }).rights).toBe('등록');
  });

  it('rejects unknown rights value', () => {
    expect(parseDbParams({ rights: '이상한상태' }).rights).toBe('');
  });

  it('handles array param for group — takes first, validates it', () => {
    expect(parseDbParams({ group: ['자동차 업체', '수전해 전문업체'] }).group).toBe('자동차 업체');
  });

  it('handles array param where first is invalid — falls back to empty', () => {
    expect(parseDbParams({ group: ['모르는그룹', '자동차 업체'] }).group).toBe('');
  });

  it('cross-validation: drops group when company does not belong to it', () => {
    // Toyota is in 자동차 업체, not 수전해 전문업체
    const result = parseDbParams({ group: '수전해 전문업체', company: 'Toyota' });
    expect(result.company).toBe('Toyota');
    expect(result.group).toBe('');
  });

  it('cross-validation: keeps group when company belongs to it', () => {
    const result = parseDbParams({ group: '자동차 업체', company: 'Toyota' });
    expect(result.company).toBe('Toyota');
    expect(result.group).toBe('자동차 업체');
  });
});

// ── rightsStatusBucket ────────────────────────────────────────────────────────

describe('rightsStatusBucket', () => {
  it('maps 등록 to 등록', () => expect(rightsStatusBucket('등록')).toBe('등록'));
  it('maps 등록결정 (variant) to 등록', () => expect(rightsStatusBucket('등록결정')).toBe('등록'));
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

  it('verdict filter hides watch rows and non-matching FTO', () => {
    const rows = [makeFtoRow(), makeWatchRow()];
    const result = filterPatentDb(rows, { ...emptyFilter, verdict: 'need' });
    // Watch row excluded; FTO row with verdict "상세검토 불필요" also excluded
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

  it('country filter hides FTO rows; filters watch rows by country', () => {
    const rows = [
      makeFtoRow(),                              // FTO — no country, should be hidden
      makeWatchRow({ country: 'KR' }),
      makeWatchRow({ id: 'watch-2', appNo: '10-2022-0008888', country: 'US' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, country: 'KR' });
    // FTO row hidden; KR watch passes; US watch excluded
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('watch');
  });

  it('group filter matches FTO by applicant via companiesForApplicant', () => {
    const rows = [
      makeFtoRow({ applicant: '현대자동차' }), // in 자동차 업체
      makeFtoRow({ no: 2, applicant: 'NEL' }), // in 수전해 전문업체
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
      makeFtoRow({ no: 2, appNo: '10-2020-0002222', title: '기액분리기 장치' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, q: '수전해' });
    expect(result).toHaveLength(1);
  });

  it('text search matches watch applicant', () => {
    const rows = [
      makeWatchRow({ applicant: 'Toyota' }),
      makeWatchRow({ id: 'watch-2', appNo: '10-2022-0008000', applicant: 'Honda' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, q: 'toyota' });
    expect(result).toHaveLength(1);
  });

  it('rights filter uses autoStatus for FTO rows', () => {
    const ftoRow = makeFtoRow({ status: '등록' });
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
      makeWatchRow({ id: 'watch-2', appNo: '10-2022-0007777', status: '등록' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, rights: '등록' });
    expect(result).toHaveLength(1);
  });

  // ── Joint filing ─────────────────────────────────────────────────────────────
  it('joint filing: row appears under BOTH matched companies', () => {
    // '현대자동차' matches 현대차; 'Toyota' (도요타) matches Toyota — but applicant field is a
    // single string containing both names. Use the alias-matching format: pipe-separated.
    // Actual FTO data format: "현대자동차|Toyota" or just the alias that maps.
    // companiesForApplicant('현대자동차  Toyota') → may match both depending on normName.
    // Use a known multi-match alias: 'hyundaimotor' matches 현대차, 'toyota' matches Toyota.
    // In practice, FTO applicant fields are single companies, but the filter must handle joint filings.
    // Test: watch row with applicant that matches two companies.
    const jointRow = makeWatchRow({
      id: 'watch-joint',
      appNo: '10-2023-0001111',
      applicant: '현대자동차도요타',  // normName → 현대자동차도요타 — contains 현대자동차 (→현대차) AND 도요타 (→Toyota)
    });
    const rows = [jointRow];
    // Should match 현대차 filter
    const byHyundai = filterPatentDb(rows, { ...emptyFilter, company: '현대차' });
    expect(byHyundai).toHaveLength(1);
    // Should match Toyota filter
    const byToyota = filterPatentDb(rows, { ...emptyFilter, company: 'Toyota' });
    expect(byToyota).toHaveLength(1);
  });

  it('joint filing: counted in both group and company in computePortfolioCounts', () => {
    // Build FTO records with an applicant that maps to both 현대차 AND Toyota.
    // normName('현대자동차도요타') contains 현대자동차 (→현대차) AND 도요타 (→Toyota).
    const ftoRecord: FtoRecord = {
      no: 99,
      category: 'system',
      appNo: '10-2020-9999',
      title: '공동출원 특허',
      applicant: '현대자동차도요타',
      status: '등록',
      filedDate: '2020-01-01',
    };
    const counts = computePortfolioCounts([ftoRecord], []);

    // '자동차 업체' group contains 현대차 and Toyota — joint row matches group
    const autoGroup = counts.find((g) => g.label === '자동차 업체');
    expect(autoGroup).toBeDefined();
    expect(autoGroup!.total).toBe(1);  // counts as 1 row in the group

    const hyundaiCo = autoGroup!.companies.find((c) => c.label === '현대차');
    const toyotaCo = autoGroup!.companies.find((c) => c.label === 'Toyota');
    expect(hyundaiCo!.total).toBe(1);
    expect(toyotaCo!.total).toBe(1);  // joint filing counted for both companies
  });
});

// ── Parity: card count === filterPatentDb list count ─────────────────────────

describe('computePortfolioCounts parity', () => {
  /**
   * For every group and company card, the card count must equal the number of rows
   * returned by filterPatentDb(..., {group|company}).length on the SAME allRows.
   */
  it('group card count matches filterPatentDb row count for the same group', () => {
    // Build a small representative dataset
    const ftoRecords: FtoRecord[] = [
      { no: 1, applicant: '현대자동차', appNo: '10-2020-0001', title: 'A', filedDate: '2020-01-01' },
      { no: 2, applicant: 'Toyota',     appNo: '10-2020-0002', title: 'B', filedDate: '2020-01-02' },
      { no: 3, applicant: 'NEL',        appNo: '10-2020-0003', title: 'C', filedDate: '2020-01-03' },
    ];
    const watchRows: WatchListRow[] = [
      {
        id: 'w1', country: 'KR', appNo: '10-2022-0001', title: 'W1',
        applicant: '현대자동차', filedDate: '2022-01-01', status: '공개',
        link: '', category: 'system', matchedSet: 'A',
      },
    ];

    const allRows = buildDbRows(ftoRecords, {}, watchRows);
    const counts = computePortfolioCounts(ftoRecords, watchRows);

    const baseFilter = { source: '', cat: '', verdict: '', country: '', rights: '', q: '' };

    for (const g of counts) {
      const expected = filterPatentDb(allRows, { ...baseFilter, group: g.label, company: '' }).length;
      expect(g.total, `group "${g.label}" count mismatch`).toBe(expected);

      for (const c of g.companies) {
        const expectedC = filterPatentDb(allRows, { ...baseFilter, group: '', company: c.label }).length;
        expect(c.total, `company "${c.label}" count mismatch`).toBe(expectedC);
      }
    }
  });

  it('all COMPETITOR_GROUPS are covered in portfolio counts', () => {
    const counts = computePortfolioCounts([], []);
    const countLabels = counts.map((g) => g.label);
    for (const g of COMPETITOR_GROUPS) {
      expect(countLabels).toContain(g.group);
    }
  });

  it('parity with mixed FTO + watch rows including a joint filing', () => {
    // Real pipe format "A | B" — normName strips pipe and spaces
    const ftoRecords: FtoRecord[] = [
      { no: 1, applicant: '현대자동차', appNo: '10-2020-0001', title: 'FTO1', filedDate: '2020-01-01' },
      // Joint filing: "현대자동차 | Toyota" — both names survive normName (strips pipe+space)
      { no: 2, applicant: '현대자동차 | Toyota', appNo: '10-2020-0002', title: 'FTO-joint', filedDate: '2020-01-02' },
    ];
    const watchRows: WatchListRow[] = [
      { id: 'w1', country: 'KR', appNo: '10-2022-0001', title: 'W1',
        applicant: 'Toyota', filedDate: '2022-01-01', status: '공개',
        link: '', category: 'system', matchedSet: 'E' },
    ];

    const allRows = buildDbRows(ftoRecords, {}, watchRows);
    const counts = computePortfolioCounts(ftoRecords, watchRows);
    const baseFilter = { source: '', cat: '', verdict: '', country: '', rights: '', q: '' };

    for (const g of counts) {
      const expected = filterPatentDb(allRows, { ...baseFilter, group: g.label, company: '' }).length;
      expect(g.total, `group "${g.label}" count mismatch`).toBe(expected);
      for (const c of g.companies) {
        const expectedC = filterPatentDb(allRows, { ...baseFilter, group: '', company: c.label }).length;
        expect(c.total, `company "${c.label}" count mismatch`).toBe(expectedC);
      }
    }

    // Verify: Toyota card shows 2 (joint FTO + watch), 현대차 card shows 2 (sole FTO + joint FTO)
    const autoGroup = counts.find((g) => g.label === '자동차 업체')!;
    const toyotaCount = autoGroup.companies.find((c) => c.label === 'Toyota')!.total;
    const hyundaiCount = autoGroup.companies.find((c) => c.label === '현대차')!.total;
    expect(toyotaCount).toBe(2);   // joint FTO + Toyota watch row
    expect(hyundaiCount).toBe(2);  // sole FTO + joint FTO
  });
});

// ── parseDbParams: group derivation and OTHER_APPLICANT_GROUP rules ───────────

describe('parseDbParams: group derivation', () => {
  it('?company=Toyota with no group → derives group from COMPANY_TO_GROUP', () => {
    const result = parseDbParams({ company: 'Toyota' });
    expect(result.company).toBe('Toyota');
    expect(result.group).toBe('자동차 업체');
  });

  it('?company=NEL with no group → derives 수전해 전문업체', () => {
    const result = parseDbParams({ company: 'NEL' });
    expect(result.company).toBe('NEL');
    expect(result.group).toBe('수전해 전문업체');
  });

  it('?group=그 외 출원인&company=Toyota → drops group (company wins)', () => {
    const result = parseDbParams({ group: '그 외 출원인', company: 'Toyota' });
    expect(result.company).toBe('Toyota');
    expect(result.group).toBe('');
  });

  it('no company, no group → both empty', () => {
    const result = parseDbParams({});
    expect(result.company).toBe('');
    expect(result.group).toBe('');
  });
});

// ── Joint filing "A | B" pipe format via real companiesForApplicant ───────────

describe('joint filing pipe format', () => {
  it('"현대자동차 | Toyota" matches both companies in filterPatentDb', () => {
    const rows = [
      makeFtoRow({ no: 1, appNo: '10-2020-0010', applicant: '현대자동차 | Toyota' }),
    ];
    expect(filterPatentDb(rows, { ...emptyFilter, company: '현대차' })).toHaveLength(1);
    expect(filterPatentDb(rows, { ...emptyFilter, company: 'Toyota' })).toHaveLength(1);
    expect(filterPatentDb(rows, { ...emptyFilter, company: 'Honda' })).toHaveLength(0);
  });

  it('"현대자동차 | Toyota" matches 자동차 업체 group once', () => {
    const rows = [
      makeFtoRow({ no: 1, appNo: '10-2020-0010', applicant: '현대자동차 | Toyota' }),
    ];
    const result = filterPatentDb(rows, { ...emptyFilter, group: '자동차 업체' });
    // The row appears once (not duplicated) even though two companies match
    expect(result).toHaveLength(1);
  });

  it('"현대자동차 | Toyota" does NOT match 수전해 전문업체 group', () => {
    const rows = [
      makeFtoRow({ no: 1, appNo: '10-2020-0010', applicant: '현대자동차 | Toyota' }),
    ];
    expect(filterPatentDb(rows, { ...emptyFilter, group: '수전해 전문업체' })).toHaveLength(0);
  });
});
