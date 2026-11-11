import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import { filterPatentRows, parsePatentSec, stripSectionWords } from '@/lib/intel-utils';

const COMP_WORDS = ['경쟁사', '비교'];

describe('stripSectionWords', () => {
  it('removes both words from a heading that repeats the section name', () => {
    expect(stripSectionWords('경쟁사 상세 스펙 비교', COMP_WORDS)).toBe('상세 스펙');
  });

  it('strips from tab labels — PEM 경쟁사 비교 → PEM', () => {
    expect(stripSectionWords('PEM 경쟁사 비교', COMP_WORDS)).toBe('PEM');
  });

  it('strips from tab labels — ALK 경쟁사 비교 → ALK', () => {
    expect(stripSectionWords('ALK 경쟁사 비교', COMP_WORDS)).toBe('ALK');
  });

  it('strips trailing word only — PEM vs ALK 기술 비교 → PEM vs ALK 기술', () => {
    expect(stripSectionWords('PEM vs ALK 기술 비교', COMP_WORDS)).toBe('PEM vs ALK 기술');
  });

  it('strips — 中 경쟁사 비교 → 中', () => {
    expect(stripSectionWords('中 경쟁사 비교', COMP_WORDS)).toBe('中');
  });

  it('no-ops when no words match', () => {
    expect(stripSectionWords('수전해 PEM 기술 현황', COMP_WORDS)).toBe('수전해 PEM 기술 현황');
  });

  it('handles empty words array', () => {
    expect(stripSectionWords('경쟁사 비교', [])).toBe('경쟁사 비교');
  });

  it('collapses extra whitespace', () => {
    expect(stripSectionWords('경쟁사  상세   스펙  비교', COMP_WORDS)).toBe('상세 스펙');
  });
});

describe('patent sec filtering', () => {
  const rows = ['fto-review', 'own', 'competitor', 'triz', 'own'].map((section, i) => ({ id: i, section }));

  it('parsePatentSec accepts known keys and rejects the rest', () => {
    expect(parsePatentSec('competitor')).toBe('competitor');
    expect(parsePatentSec('hmg')).toBe('hmg');
    expect(parsePatentSec('proposals')).toBe('proposals');
    expect(parsePatentSec('bogus')).toBeNull();
    expect(parsePatentSec('toString')).toBeNull();
    expect(parsePatentSec(undefined)).toBeNull();
  });

  it('competitor = fto-review + competitor sections', () => {
    expect(filterPatentRows(rows, 'competitor').map((r) => r.section)).toEqual(['fto-review', 'competitor']);
  });

  it('hmg = own, proposals = triz', () => {
    expect(filterPatentRows(rows, 'hmg').map((r) => r.id)).toEqual([1, 4]);
    expect(filterPatentRows(rows, 'proposals').map((r) => r.section)).toEqual(['triz']);
  });

  it('unknown or missing sec falls back to all rows', () => {
    expect(filterPatentRows(rows, parsePatentSec('bogus'))).toHaveLength(5);
    expect(filterPatentRows(rows, parsePatentSec(null))).toHaveLength(5);
  });

  it('strips TRIZ from proposals headings without leaving a dangling 기반', () => {
    const w = ['TRIZ 기반', 'TRIZ'];
    expect(stripSectionWords('당사 vs 경쟁사 특허 비교 · TRIZ 기반 신규 특허 제안', w)).toBe('당사 vs 경쟁사 특허 비교 · 신규 특허 제안');
    expect(stripSectionWords('TRIZ 참조 — 39가지 공학적 매개변수', w)).toBe('참조 — 39가지 공학적 매개변수');
  });
});

// Structural guard: competitors.json must have the 3 merged tabs and no dangling rows.
// Skipped when the generated file is absent (CI / clean checkout without extract.mjs output).
const COMPETITORS_PATH = path.resolve(__dirname, '../../../../scripts/intel/out/competitors.json');
const competitorsAvailable = fs.existsSync(COMPETITORS_PATH);

describe.skipIf(!competitorsAvailable)('competitors.json — mergeCompetitorTabs structure', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[];
  beforeAll(() => {
    const { rows: r } = JSON.parse(fs.readFileSync(COMPETITORS_PATH, 'utf8'));
    rows = r;
  });

  it('has exactly 3 top-level rows (compare:000, compare:001, compare:002)', () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((r: any) => r.id)).toEqual(['compare:000', 'compare:001', 'compare:002']);
  });

  it('compare:002 tabs block has 7 tabs (4 original + 3 merged)', () => {
    const tabsRow = rows.find((r: any) => r.id === 'compare:002');
    expect(tabsRow.payload.type).toBe('tabs');
    expect(tabsRow.payload.tabs).toHaveLength(7);
  });

  it('merged tab labels are correct', () => {
    const tabs = rows.find((r: any) => r.id === 'compare:002').payload.tabs;
    expect(tabs[4].label).toBe('개별 기업 상세');
    expect(tabs[5].label).toBe('당사 결과·개선항목');
    expect(tabs[6].label).toBe('글로벌 리포트');
  });

  it('"개별 기업 상세" tab starts with the heading block and contains 7 details blocks', () => {
    const tab = rows.find((r: any) => r.id === 'compare:002').payload.tabs[4];
    expect(tab.blocks[0].type).toBe('heading');
    expect(tab.blocks.filter((b: any) => b.type === 'details')).toHaveLength(7);
  });

  it('"당사 결과·개선항목" tab starts with the heading block and contains 3 card blocks', () => {
    const tab = rows.find((r: any) => r.id === 'compare:002').payload.tabs[5];
    expect(tab.blocks[0].type).toBe('heading');
    expect(tab.blocks.filter((b: any) => b.type === 'card')).toHaveLength(3);
  });

  it('"글로벌 리포트" tab starts with the heading block and contains 2 card blocks', () => {
    const tab = rows.find((r: any) => r.id === 'compare:002').payload.tabs[6];
    expect(tab.blocks[0].type).toBe('heading');
    expect(tab.blocks.filter((b: any) => b.type === 'card')).toHaveLength(2);
  });
});
