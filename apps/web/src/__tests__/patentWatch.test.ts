// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  advanceJob,
  aggregateCompetitorStats,
  autoCategory,
  companiesForApplicant,
  formatAppNo,
  isRelevant,
  normalizeAppNo,
  parseKiprisXml,
  planRequests,
  rowsFromItems,
  type SearchJob,
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
