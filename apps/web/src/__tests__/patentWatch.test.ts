// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_JOBS,
  FOREIGN_MAX_PAGES,
  REQUEST_BUDGET,
  SEARCH_JOBS,
  STATUS_BUDGET,
  advanceForeignJob,
  advanceJob,
  aggregateCompetitorStats,
  autoCategory,
  companiesForApplicant,
  competitorGroupFor,
  filterWatchRows,
  foreignDiag,
  formatAppNo,
  isRelevant,
  isRelevantForeign,
  krStatusTargets,
  normalizeAppNo,
  parseForeignXml,
  parseKiprisXml,
  parseStatusXml,
  planRequests,
  planRun,
  rowsFromItems,
  statusRow,
  OTHER_APPLICANT_GROUP,
  watchFacets,
  type CursorState,
  type SearchJob,
  type WatchListRow,
} from '@/lib/patent-watch';

const fixture = readFileSync(path.join(__dirname, 'fixtures/kipris-word-search.xml'), 'utf8');
const ctx = (fto: string[] = []) => ({
  ftoAppNos: new Set(fto),
  seenWatch: new Set<string>(),
  seenCompetitor: new Set<string>(),
  foundAt: '2026-11-11T00:00:00.000Z',
});
const jobF: SearchJob = { key: 'F1', set: 'F', word: '수전해 제어' };

describe('parseKiprisXml', () => {
  it('parses header, count and item fields', () => {
    const r = parseKiprisXml(fixture);
    expect(r.ok).toBe(true);
    expect(r.resultCode).toBe('00');
    expect(r.totalCount).toBe(5);
    expect(r.items).toHaveLength(5);
    expect(r.items[0]).toMatchObject({
      applicationNumber: '1020230123456',
      inventionTitle: '수전해 시스템의 부하추종 운전 제어 방법',
      applicantName: '현대자동차주식회사 | 기아 주식회사',
      applicationDate: '20230915',
      openDate: '20250320',
      registerStatus: '공개',
      ipcNumber: 'C25B 15/02',
    });
    expect(r.items[0].astrtCont).toContain('전해조 스택의 전류');
    expect(r.items[1].inventionTitle).toBe('Water electrolysis stack & separator plate');
  });

  it('flags a non-00 resultCode as an error', () => {
    const xml = '<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR.</resultMsg></header></response>';
    const r = parseKiprisXml(xml);
    expect(r.ok).toBe(false);
    expect(r.resultCode).toBe('30');
    expect(r.resultMsg).toContain('NOT REGISTERED');
    expect(r.items).toEqual([]);
  });

  it('rejects non-XML bodies', () => {
    expect(parseKiprisXml('<html>gateway error</html>').ok).toBe(false);
  });
});

describe('isRelevant', () => {
  it('전해질 alone does not qualify — solid-state / battery patents are not relevant', () => {
    expect(isRelevant('전고체 전해질 양극 소재')).toBe(false);
    expect(isRelevant('리튬 이차전지용 전해질 조성물')).toBe(false);
    expect(isRelevant('연료전지 고분자 전해질 막')).toBe(false);
  });

  // Issue 2: words that contain 전해 but mean electroplating / electrolyte / verb 전해지다 are false positives.
  it('전해액, 전해도금, 전해연마, 전해콘덴서, 전해 동박 and 전해지다 are false positives', () => {
    expect(isRelevant('리튬이온배터리 전해액 첨가제')).toBe(false);
    expect(isRelevant('금속 표면 전해도금 처리 방법')).toBe(false);
    expect(isRelevant('전해연마를 이용한 금속 표면 처리')).toBe(false);
    expect(isRelevant('전해콘덴서 제조 방법')).toBe(false);
    expect(isRelevant('전해 동박 제조 장치 및 방법')).toBe(false);
    expect(isRelevant('진동이 전해지는 구조')).toBe(false); // Korean verb 전해지다
  });

  it('수전해 / 전해조 / 전해 셀|스택|장치|시스템 / English electrolyzer·electrolysis qualify', () => {
    expect(isRelevant('수전해 스택 열화 진단')).toBe(true);
    expect(isRelevant('전해조 스택 분리판 구조')).toBe(true);
    expect(isRelevant('전해 셀 전류 제어 방법')).toBe(true);
    expect(isRelevant('전해 스택 운전 방법')).toBe(true);
    expect(isRelevant('수전해 장치 및 시스템')).toBe(true);
    expect(isRelevant('PEM electrolyzer cell design')).toBe(true);
    expect(isRelevant('water electrolysis system')).toBe(true);
    expect(isRelevant('AEM electrolyser stack')).toBe(true);
  });
});

describe('application numbers', () => {
  it('normalizes dashed and plain forms to the same digits', () => {
    expect(normalizeAppNo('10-2011-0042643')).toBe('1020110042643');
    expect(normalizeAppNo('1020110042643')).toBe('1020110042643');
    expect(normalizeAppNo(undefined)).toBe('');
    expect(formatAppNo('1020110042643')).toBe('10-2011-0042643');
  });
});

describe('companiesForApplicant', () => {
  it('maps Honda case/language variants', () => {
    for (const a of ['HONDA MOTOR CO., LTD.', 'Honda Motor Co., Ltd.', '혼다 기켄 고교 가부시키가이샤', '혼다']) {
      expect(companiesForApplicant(a)).toEqual(['Honda']);
    }
  });

  it('maps Siemens Energy (and Siemens AG pre-spin-off), Toyota, Hydrogenics, 삼성이앤에이 and 현대/기아', () => {
    expect(companiesForApplicant('SIEMENS ENERGY GLOBAL GMBH & CO. KG')).toEqual(['Siemens Energy']);
    expect(companiesForApplicant('TOYOTA JIDOSHA KABUSHIKI KAISHA')).toEqual(['Toyota']);
    expect(companiesForApplicant('HYDROGENICS CORPORATION')).toEqual(['Accelera']);
    expect(companiesForApplicant('삼성이앤에이 주식회사')).toEqual(['삼성E&A']);
    expect(companiesForApplicant('기아 주식회사')).toEqual(['현대차']);
    expect(companiesForApplicant('NEL ASA')).toEqual(['NEL']);
  });

  // Issue 2: narrow aliases must exclude subsidiary / unrelated entities.
  it('excludes POSCO subsidiaries and non-Energy Siemens entities', () => {
    // POSCO Future M and POSCO ICT are subsidiaries — not the POSCO Holdings parent.
    expect(companiesForApplicant('포스코퓨처엠(주)')).toEqual([]);
    expect(companiesForApplicant('POSCO FUTURE M CO., LTD.')).toEqual([]);
    expect(companiesForApplicant('포스코아이씨티')).toEqual([]);
    // Siemens Healthineers is not Siemens Energy.
    expect(companiesForApplicant('Siemens Healthineers')).toEqual([]);
    // 추정: Siemens AG pre-spin-off electrolysis filings are attributed to Siemens Energy (isRelevant gates).
    expect(companiesForApplicant('SIEMENS AKTIENGESELLSCHAFT')).toEqual(['Siemens Energy']);
    expect(companiesForApplicant('지멘스 악티엔게젤샤프트')).toEqual(['Siemens Energy']);
    // POSCO Holdings parent (post-2022 name) does match.
    expect(companiesForApplicant('포스코홀딩스(주)')).toEqual(['포스코홀딩스']);
    expect(companiesForApplicant('POSCO HOLDINGS CO., LTD.')).toEqual(['포스코홀딩스']);
  });

  it('returns every competitor on a joint filing, once each', () => {
    expect(companiesForApplicant('TOYOTA JIDOSHA KABUSHIKI KAISHA | HONDA MOTOR CO., LTD.')).toEqual(['Toyota', 'Honda']);
    expect(companiesForApplicant('현대자동차주식회사 | 기아 주식회사')).toEqual(['현대차']);
  });

  it('ignores non-competitors and look-alikes', () => {
    expect(companiesForApplicant('(주) 테크윈')).toEqual([]);
    expect(companiesForApplicant('한국패널산업')).toEqual([]);
    expect(companiesForApplicant('')).toEqual([]);
  });
});

describe('autoCategory', () => {
  it('assigns control, gas-liquid, stack and falls back to system', () => {
    expect(autoCategory('수전해 시스템의 부하추종 운전 제어 방법')).toBe('control');
    expect(autoCategory('전해조 열화 진단 장치')).toBe('control');
    expect(autoCategory('수전해용 기액분리기')).toBe('gas-liquid');
    expect(autoCategory('전해조 스택 및 분리판')).toBe('stack');
    expect(autoCategory('수소 생산 설비')).toBe('system');
  });

  it('lets the title win over the summary', () => {
    expect(autoCategory('수전해 스택', '스택 온도를 제어한다')).toBe('stack');
    expect(autoCategory('수소 생산 설비', '전력 변환 장치를 포함한다')).toBe('control');
  });
});

describe('rowsFromItems', () => {
  const items = parseKiprisXml(fixture).items;

  it('drops excluded words, pre-2010 filings and FTO duplicates', () => {
    const rows = rowsFromItems(items, jobF, ctx(['1020110042643']));
    const watch = rows.filter((r) => r.section === 'patent-watch').map((r) => r.id);
    expect(watch).toEqual(['watch:1020230123456', 'watch:1020190087654']);
  });

  it('builds watch payloads with auto category and null verdict', () => {
    const [row] = rowsFromItems(items, jobF, ctx());
    expect(row.sort).toBe(20230915);
    expect(row.payload).toMatchObject({
      type: 'patent-watch',
      appNo: '10-2023-0123456',
      filedDate: '2023-09-15',
      pubDate: '2025-03-20',
      category: 'control',
      categorySource: 'auto',
      verdict: null,
      matchedSet: 'F',
    });
    expect(row.payload.link).toContain('1020230123456');
  });

  it('adds competitor rows for competitor applicants', () => {
    const comp = rowsFromItems(items, jobF, ctx()).filter((r) => r.section === 'patent-competitor');
    expect(comp.map((r) => [r.id, r.payload.companies])).toEqual([
      ['pcomp:1020230123456', ['현대차']],
      ['pcomp:1020190087654', ['Honda']],
    ]);
  });

  it('dedupes across jobs within a run', () => {
    const c = ctx();
    rowsFromItems(items, jobF, c);
    expect(rowsFromItems(items, { key: 'B1', set: 'B', word: '수전해 시스템' }, c)).toEqual([]);
  });

  it('keeps only the searched competitor for set E jobs', () => {
    const rows = rowsFromItems(items, { key: 'E-honda', set: 'E', word: '혼다 전해', company: 'Honda' }, ctx());
    expect(rows.map((r) => r.id)).toEqual(['watch:1020190087654', 'pcomp:1020190087654']);
  });
});

describe('planRequests / advanceJob', () => {
  const jobs: SearchJob[] = ['a', 'b', 'c'].map((k) => ({ key: k, set: 'B', word: k }));

  it('round-robins from the offset within the budget', () => {
    const plan = planRequests(jobs, { offset: 2, jobs: { c: { page: 3, total: 500, done: false }, a: { page: 9, total: 9, done: true } } }, 2);
    expect(plan.map((p) => [p.job.key, p.page])).toEqual([
      ['c', 4],
      ['a', 1],
    ]);
  });

  it('marks a job done on the last page and keeps it done on refresh', () => {
    expect(advanceJob(undefined, 1, 50, 120, 50)).toEqual({ page: 1, total: 120, done: false });
    expect(advanceJob({ page: 2, total: 120, done: false }, 3, 20, 120, 50).done).toBe(true);
    expect(advanceJob({ page: 3, total: 120, done: true }, 1, 50, 125, 50)).toEqual({ page: 3, total: 125, done: true });
  });
});

describe('aggregateCompetitorStats', () => {
  it('counts by group, company, category and year (joint filings per competitor)', () => {
    const stats = aggregateCompetitorStats([
      { companies: ['현대차'], category: 'control', filedDate: '2023-09-15' },
      { companies: ['Toyota', 'Honda'], category: 'stack', filedDate: '2019-07-18' },
      { companies: ['NEL'], category: 'system', filedDate: '2023-01-02' },
      { companies: ['Siemens Energy'], category: 'bogus', filedDate: null },
      { companies: [], category: 'system', filedDate: '2020-01-01' },
    ]);
    expect(stats.total).toBe(4);
    expect(stats.years).toEqual(['2019', '2023']);
    const auto = stats.groups[0];
    expect(auto.label).toBe('자동차 업체');
    expect(auto.total).toBe(2);
    expect(auto.byCategory).toMatchObject({ control: 1, stack: 1 });
    expect(auto.byYear).toEqual({ '2019': 1, '2023': 1 });
    expect(auto.companies.map((c) => [c.label, c.total])).toEqual([
      ['현대차', 1],
      ['Toyota', 1],
      ['Honda', 1],
    ]);
    expect(stats.groups[1].total).toBe(1);
    expect(stats.groups[2].byCategory.system).toBe(1);
  });

  it('returns empty buckets for no rows', () => {
    const stats = aggregateCompetitorStats([]);
    expect(stats.total).toBe(0);
    expect(stats.groups).toHaveLength(3);
  });
});

describe('competitorGroupFor (FTO competitor regrouping)', () => {
  it('maps FTO applicants onto the KIPRIS groups', () => {
    expect(competitorGroupFor('HONDA MOTOR CO., LTD.')).toEqual({ company: 'Honda', group: '자동차 업체' });
    expect(competitorGroupFor('TOYOTA BOSHOKU KABUSHIKI KAISHA')).toEqual({ company: 'Toyota', group: '자동차 업체' });
    expect(competitorGroupFor('DENSO CORPORATION | TOYOTA JIDOSHA KABUSHIKI KAISHA')).toEqual({
      company: 'Toyota',
      group: '자동차 업체',
    });
    expect(competitorGroupFor('ITM Power (Trading) Limited')).toEqual({ company: 'ITM Power', group: '수전해 전문업체' });
    expect(competitorGroupFor('HYDROGENICS CORPORATION')).toEqual({ company: 'Accelera', group: '수전해 전문업체' });
    expect(competitorGroupFor('SIEMENS AKTIENGESELLSCHAFT')).toEqual({ company: 'Siemens Energy', group: '에너지·플랜트(EPC)' });
  });

  it('maps the FTO DB applicants added to the alias map (KR and EN legal names)', () => {
    const cases: [string, string, string][] = [
      ['Aisin Seiki Kabushiki Kaisha', 'Toyota', '자동차 업체'],
      ['AISIN CORPORATION', 'Toyota', '자동차 업체'],
      ['아이신 세이끼 가부시끼가이샤', 'Toyota', '자동차 업체'],
      ['H-TEC SYSTEMS GMBH', 'H-TEC', '수전해 전문업체'],
      ['인두스트리에 데 노라 에스.피.에이.', 'De Nora', '수전해 전문업체'],
      ['드 노라 페르멜렉 가부시키가이샤', 'De Nora', '수전해 전문업체'],
      ['INDUSTRIE DE NORA S.P.A.', 'De Nora', '수전해 전문업체'],
      ['Ohmium International, Inc.', 'Ohmium', '수전해 전문업체'],
      ['VERDAGY, INC.', 'Verdagy', '수전해 전문업체'],
      ['BLOOM ENERGY CORPORATION', 'Bloom Energy', '수전해 전문업체'],
      ['블룸 에너지 코퍼레이션', 'Bloom Energy', '수전해 전문업체'],
      ['린데 게엠베하', 'Linde', '에너지·플랜트(EPC)'],
      ['LINDE GMBH', 'Linde', '에너지·플랜트(EPC)'],
      ['Linde Aktiengesellschaft', 'Linde', '에너지·플랜트(EPC)'],
      ['AIR PRODUCTS AND CHEMICALS, INC.', 'Air Products', '에너지·플랜트(EPC)'],
      ['에어 프로덕츠 앤드 케미칼스, 인코포레이티드', 'Air Products', '에너지·플랜트(EPC)'],
      ['THYSSENKRUPP UHDE GMBH | THYSSENKRUPP AG', 'thyssenkrupp', '에너지·플랜트(EPC)'],
      ['thyssenkrupp nucera AG & Co. KGaA', 'thyssenkrupp', '에너지·플랜트(EPC)'],
      ['티센크루프 우데 게엠베하', 'thyssenkrupp', '에너지·플랜트(EPC)'],
      // 추정: Siemens Gamesa attributed to its parent Siemens Energy.
      ['SIEMENS GAMESA RENEWABLE ENERGY A/S', 'Siemens Energy', '에너지·플랜트(EPC)'],
    ];
    for (const [applicant, company, group] of cases) {
      expect(competitorGroupFor(applicant), applicant).toEqual({ company, group });
    }
  });

  it('does not match generic words or look-alike names', () => {
    for (const a of [
      'Lindenberg GmbH',
      'Linden Technologies',
      'Bloom Industries Ltd.',
      'Bloomberg L.P.',
      'Raising Cane Holdings',
      'H TECH CO., LTD.',
      'Air Liquide',
      'Siemens Healthineers',
      '',
    ]) {
      expect(competitorGroupFor(a), a).toBeNull();
    }
  });
});

describe('watch list filtering', () => {
  const row = (appNo: string, applicant: string, filedDate: string | null, title = 'title', country?: string): WatchListRow => ({
    id: country ? `watch:${country}:${appNo}` : `watch:${appNo}`,
    country,
    appNo,
    title,
    applicant,
    filedDate,
    status: '공개',
    link: null,
    category: 'system',
    matchedSet: 'B',
  });
  const rows = [
    row('1', 'HONDA MOTOR CO., LTD.', '2025-03-01', '수전해 시스템'),
    row('2', 'SIEMENS ENERGY GLOBAL GMBH & CO. KG', '2024-05-01'),
    row('3', '(주) 테크윈', '2025-01-01', '전해조 스택'),
    row('4', 'TOYOTA JIDOSHA KABUSHIKI KAISHA', null),
    row('5', 'NEL ASA', '2024-02-01', 'PEM electrolyzer', 'US'),
    row('6', 'NEL ASA', '2024-03-01', 'PEM electrolyzer', 'EP'),
  ];
  const none = { group: '', company: '', year: '', country: '', q: '' };

  it('lists facets in group order, other bucket last, years newest first', () => {
    expect(watchFacets(rows)).toEqual({
      groups: ['자동차 업체', '수전해 전문업체', '에너지·플랜트(EPC)', OTHER_APPLICANT_GROUP],
      companies: ['Toyota', 'Honda', 'NEL', 'Siemens Energy'],
      years: ['2025', '2024'],
    });
  });

  it('returns every row when no filter is set, order preserved', () => {
    expect(filterWatchRows(rows, none).map((r) => r.appNo)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('filters by group, other bucket, company, year and text', () => {
    const ids = (f: Partial<typeof none>) => filterWatchRows(rows, { ...none, ...f }).map((r) => r.appNo);
    expect(ids({ group: '자동차 업체' })).toEqual(['1', '4']);
    expect(ids({ group: OTHER_APPLICANT_GROUP })).toEqual(['3']);
    expect(ids({ company: 'Siemens Energy' })).toEqual(['2']);
    expect(ids({ year: '2025' })).toEqual(['1', '3']);
    // Rows without a country (pre-overseas) count as KR.
    expect(ids({ country: 'KR' })).toEqual(['1', '2', '3', '4']);
    expect(ids({ country: 'US' })).toEqual(['5']);
    expect(ids({ country: 'EP', company: 'NEL' })).toEqual(['6']);
    expect(ids({ q: '  스택 ' })).toEqual(['3']);
    expect(ids({ q: 'honda' })).toEqual(['1']);
    expect(ids({ group: '자동차 업체', year: '2025' })).toEqual(['1']);
    expect(ids({ group: '자동차 업체', company: 'Siemens Energy' })).toEqual([]);
  });
});

const foreignFixture = readFileSync(path.join(__dirname, 'fixtures/kipris-foreign-search.xml'), 'utf8');
const foreignAltFixture = readFileSync(path.join(__dirname, 'fixtures/kipris-foreign-alt.xml'), 'utf8');
const usNel: SearchJob = { key: 'US-nel', set: 'E', word: 'Nel ASA', company: 'NEL', country: 'US' };

describe('parseForeignXml', () => {
  it('parses <searchResult> items with the wrapper field names', () => {
    const r = parseForeignXml(foreignFixture);
    expect(r.ok).toBe(true);
    expect(r.totalCount).toBe(4);
    expect(r.items).toHaveLength(4);
    expect(r.items[0]).toMatchObject({
      applicationNumber: '17/123,456',
      applicationDate: '20230301',
      inventionTitle: 'Proton exchange membrane water electrolyzer stack with improved bipolar plate',
      applicantName: 'NEL ASA',
      openDate: '20240905',
      registerStatus: 'Published',
      ipcNumber: 'C25B 9/77',
    });
    expect(r.items[0].astrtCont).toContain('bipolar plates & porous');
  });

  it('accepts the alternate (domestic-style) field names and <item> elements', () => {
    const r = parseForeignXml(foreignAltFixture);
    expect(r.ok).toBe(true);
    expect(r.totalCount).toBe(1);
    expect(r.items[0]).toMatchObject({
      applicationNumber: 'EP20123456',
      inventionTitle: 'Alkaline electrolyzer with gas-liquid separator',
      applicantName: 'thyssenkrupp nucera AG & Co. KGaA',
      applicationDate: '2022.07.01',
      openDate: '20240110',
    });
  });

  it("treats '20' as an empty success and unknown codes as a failure (no throw)", () => {
    const empty = parseForeignXml('<response><header><resultCode>20</resultCode><resultMsg>NO DATA</resultMsg></header></response>');
    expect(empty).toMatchObject({ ok: true, resultCode: '20', items: [] });
    const bad = parseForeignXml(
      '<response><header><resultCode>99</resultCode><resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS</resultMsg></header><body><items><searchResult><applicationNo>1</applicationNo></searchResult></items></body></response>',
    );
    expect(bad.ok).toBe(false);
    expect(bad.resultCode).toBe('99');
    expect(bad.items).toEqual([]);
    expect(parseForeignXml('<html>gateway</html>').ok).toBe(false);
  });
});

describe('foreignDiag', () => {
  it("lists tag names (not values) when '00' parses to nothing but the body is non-empty", () => {
    const xml =
      '<response><header><resultCode>00</resultCode></header><body><list><patent><appNumber>17123456</appNumber>' +
      '<note>accessKey=SECRET123</note></patent></list></body></response>';
    const diag = foreignDiag(xml, parseForeignXml(xml));
    expect(diag).toBe('response,header,resultCode,body,list,patent,appNumber,note');
    expect(diag).not.toContain('SECRET123');
  });

  it('stays null when items parsed, the code is not 00, or the body is empty', () => {
    expect(foreignDiag(foreignFixture, parseForeignXml(foreignFixture))).toBeNull();
    const empty = '<response><header><resultCode>00</resultCode></header><body> </body></response>';
    expect(foreignDiag(empty, parseForeignXml(empty))).toBeNull();
    const none = '<response><header><resultCode>20</resultCode></header><body><x/></body></response>';
    expect(foreignDiag(none, parseForeignXml(none))).toBeNull();
  });

  it('truncates to 500 characters', () => {
    const tags = Array.from({ length: 80 }, (_, i) => `<field${i}>v</field${i}>`).join('');
    const xml = `<response><header><resultCode>00</resultCode></header><body>${tags}</body></response>`;
    expect(foreignDiag(xml, parseForeignXml(xml))!.length).toBe(500);
  });
});

describe('isRelevantForeign', () => {
  it('accepts English water-electrolysis wording', () => {
    expect(isRelevantForeign('PEM water electrolyzer stack')).toBe(true);
    expect(isRelevantForeign('AEM electrolyser with improved membrane')).toBe(true);
    expect(isRelevantForeign('Method for operating an electrolysis plant')).toBe(true);
    expect(isRelevantForeign('Solid oxide electrolysis cell (SOEC) interconnect')).toBe(true);
    expect(isRelevantForeign('Alkaline electrolytic cell with diaphragm')).toBe(true);
  });

  it('rejects fuel-cell-only and electrolyte-only abstracts', () => {
    expect(isRelevantForeign('PEM fuel cell having a polymer electrolyte membrane and gas diffusion layers')).toBe(false);
    expect(isRelevantForeign('Solid electrolyte for an all-solid-state battery')).toBe(false);
    expect(isRelevantForeign('Electrolytic capacitor')).toBe(false);
  });
});

describe('rowsFromItems (overseas)', () => {
  const items = parseForeignXml(foreignFixture).items;

  it('prefixes ids with the country and keeps only relevant filings of the searched applicant', () => {
    const rows = rowsFromItems(items, usNel, ctx());
    expect(rows.map((r) => r.id)).toEqual(['watch:US:17123456', 'pcomp:US:17123456']);
    expect(rows[0].payload).toMatchObject({ country: 'US', appNo: '17/123,456', link: null, filedDate: '2023-03-01' });
  });

  it('does not collide with KR ids or across countries, and skips US numbers already in the FTO DB', () => {
    const c = ctx(['17123456']);
    const us = rowsFromItems(items, usNel, c);
    expect(us.map((r) => r.id)).toEqual(['pcomp:US:17123456']);
    const ep = rowsFromItems(items, { ...usNel, key: 'EP-nel', country: 'EP' }, c);
    expect(ep.map((r) => r.id)).toEqual(['watch:EP:17123456', 'pcomp:EP:17123456']);
    const kr = rowsFromItems(parseKiprisXml(fixture).items, jobF, c);
    expect(kr[0].id).toBe('watch:1020230123456');
    expect(kr[0].payload.country).toBe('KR');
  });

  it('maps alternate-field records and the joint thyssenkrupp name', () => {
    const job: SearchJob = { key: 'EP-thyssenkrupp', set: 'E', word: 'thyssenkrupp', company: 'thyssenkrupp', country: 'EP' };
    const rows = rowsFromItems(parseForeignXml(foreignAltFixture).items, job, ctx());
    expect(rows.map((r) => [r.id, r.payload.companies ?? null])).toEqual([
      ['watch:EP:20123456', null],
      ['pcomp:EP:20123456', ['thyssenkrupp']],
    ]);
  });
});

describe('advanceForeignJob', () => {
  it('finishes on an empty page, the total, the page cap or pre-2010 filings', () => {
    expect(advanceForeignJob(undefined, 1, 20, 500, '20230101')).toEqual({ page: 1, total: 500, done: false });
    expect(advanceForeignJob(undefined, 2, 0, null, '').done).toBe(true);
    expect(advanceForeignJob(undefined, 3, 10, 30, '20200101').done).toBe(true);
    expect(advanceForeignJob(undefined, FOREIGN_MAX_PAGES, 20, 9999, '20200101').done).toBe(true);
    expect(advanceForeignJob(undefined, 2, 20, 9999, '20091231').done).toBe(true);
    expect(advanceForeignJob({ page: 5, total: 100, done: true }, 1, 20, 120, '20250101')).toEqual({
      page: 5,
      total: 120,
      done: true,
    });
  });
});

describe('planRun (request budget)', () => {
  const kr = krStatusTargets(['10-2011-0042643', '10-2011-0042643', '13/007675', null, '10-2012-0000001', '1020130000002']);

  it('collects distinct KR application numbers only (US numbers left out)', () => {
    expect(kr).toEqual(['1020110042643', '1020120000001', '1020130000002']);
  });

  it('never exceeds REQUEST_BUDGET and gives status refresh at most STATUS_BUDGET', () => {
    const p = planRun(ALL_JOBS, { offset: 0, jobs: {} }, kr);
    expect(p.status.length).toBe(STATUS_BUDGET);
    expect(p.status.length + p.search.length).toBeLessThanOrEqual(REQUEST_BUDGET);
    expect(p.search.length).toBe(REQUEST_BUDGET - STATUS_BUDGET);
    const none = planRun(ALL_JOBS, { offset: 0, jobs: {} }, []);
    expect(none.status).toEqual([]);
    expect(none.search.length).toBe(REQUEST_BUDGET);
  });

  it('visits every KR / US / EP job and every status target across runs', () => {
    const many = Array.from({ length: 10 }, (_, i) => `10202000000${String(i).padStart(2, '0')}`);
    let cursor: CursorState = { offset: 0, jobs: {} };
    const seenJobs = new Set<string>();
    const seenStatus = new Set<string>();
    const runs = Math.ceil(ALL_JOBS.length / (REQUEST_BUDGET - STATUS_BUDGET));
    for (let run = 0; run < runs; run++) {
      const p = planRun(ALL_JOBS, cursor, many);
      expect(p.search.length + p.status.length).toBeLessThanOrEqual(REQUEST_BUDGET);
      p.search.forEach((s) => seenJobs.add(s.job.key));
      p.status.forEach((s) => seenStatus.add(s));
      cursor = { ...cursor, offset: p.nextOffset, statusOffset: p.nextStatusOffset };
    }
    expect(seenJobs.size).toBe(ALL_JOBS.length);
    expect(seenStatus.size).toBe(many.length);
  });

  it('interleaves countries so every run touches KR, US and EP', () => {
    const p = planRun(ALL_JOBS, { offset: 0, jobs: {} }, kr);
    expect(new Set(p.search.map((s) => s.job.country ?? 'KR'))).toEqual(new Set(['KR', 'US', 'EP']));
    expect(ALL_JOBS.filter((j) => !j.country)).toEqual(SEARCH_JOBS);
  });

  it('adds set E KR jobs for the newly mapped competitors', () => {
    const companies = new Set(SEARCH_JOBS.map((j) => j.company));
    for (const c of ['H-TEC', 'De Nora', 'Ohmium', 'Verdagy', 'Bloom Energy', 'Linde', 'Air Products', 'thyssenkrupp']) {
      expect(companies.has(c), c).toBe(true);
    }
  });
});

describe('status refresh', () => {
  it('parses registerStatus from a detail response and builds a separate status row', () => {
    const xml =
      '<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><item>' +
      '<applicationNumber>1020110042643</applicationNumber><registerStatus>소멸</registerStatus></item></body></response>';
    const r = parseStatusXml(xml);
    expect(r).toMatchObject({ ok: true, registerStatus: '소멸' });
    expect(statusRow('1020110042643', r.registerStatus, '2026-11-11T00:00:00.000Z')).toEqual({
      id: 'pstatus:1020110042643',
      section: 'patent-status',
      sort: 0,
      payload: {
        type: 'patent-status',
        appNo: '10-2011-0042643',
        registerStatus: '소멸',
        checkedAt: '2026-11-11T00:00:00.000Z',
        source: 'KIPRIS',
      },
    });
  });

  it('falls back to a registerStatus outside <item>, and reports error codes', () => {
    const detail = '<response><header><resultCode>00</resultCode></header><body><biblioSummaryInfo><registerStatus>등록</registerStatus></biblioSummaryInfo></body></response>';
    expect(parseStatusXml(detail).registerStatus).toBe('등록');
    const err = '<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR.</resultMsg></header></response>';
    expect(parseStatusXml(err).ok).toBe(false);
  });
});

describe('Air Products alias', () => {
  it("matches '&' and 'and' legal names after normName", () => {
    expect(companiesForApplicant('Air Products & Chemicals, Inc.')).toEqual(['Air Products']);
    expect(companiesForApplicant('AIR PRODUCTS AND CHEMICALS, INC.')).toEqual(['Air Products']);
  });

  it('does not match other industrial-gas companies', () => {
    expect(companiesForApplicant('Air Liquide S.A.')).toEqual([]);
    expect(companiesForApplicant('Products of Air Ltd')).toEqual([]);
  });
});

describe('aggregateCompetitorStats by country', () => {
  it('counts KR (including rows without a country), US and EP per bucket', () => {
    const stats = aggregateCompetitorStats([
      { companies: ['NEL'], category: 'stack', filedDate: '2023-01-01' },
      { country: 'US', companies: ['NEL'], category: 'stack', filedDate: '2023-01-01' },
      { country: 'EP', companies: ['NEL'], category: 'stack', filedDate: '2023-01-01' },
      { country: 'KR', companies: ['NEL'], category: 'system', filedDate: '2024-01-01' },
    ]);
    const specialists = stats.groups[1];
    expect(specialists.byCountry).toEqual({ KR: 2, US: 1, EP: 1 });
    expect(specialists.companies.find((c) => c.label === 'NEL')?.byCountry).toEqual({ KR: 2, US: 1, EP: 1 });
  });
});
