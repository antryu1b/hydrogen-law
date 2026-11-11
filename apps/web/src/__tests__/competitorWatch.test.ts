// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPETITOR_SOURCES,
  extractFigures,
  hashText,
  isRecentChange,
  nextSnapshot,
  normalizeHtml,
  type CompetitorSource,
  type SiteSnapshot,
} from '@/lib/competitor-watch';

// Fixtures are copies of the official pages fetched 2026-11-11 (scripts/styles stripped, text kept).
function pageText(key: string): string {
  return normalizeHtml(readFileSync(path.join(__dirname, `fixtures/competitor-${key}.html`), 'utf8'));
}
function source(key: string): CompetitorSource {
  const s = COMPETITOR_SOURCES.find((x) => x.key === key);
  if (!s) throw new Error(`no source ${key}`);
  return s;
}
function figuresOf(key: string): Record<string, string> {
  return Object.fromEntries(extractFigures(pageText(key), source(key).figures).map((f) => [f.label, `${f.value} ${f.unit}`.trim()]));
}

describe('COMPETITOR_SOURCES registry', () => {
  it('uses unique keys and https URLs only', () => {
    const keys = COMPETITOR_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(COMPETITOR_SOURCES.every((s) => s.url.startsWith('https://'))).toBe(true);
  });
  it('every figure pattern has exactly one capture group', () => {
    for (const s of COMPETITOR_SOURCES) {
      for (const f of s.figures ?? []) {
        expect(new RegExp(`${f.pattern.source}|`).exec('')!.length - 1, `${s.key} ${f.label}`).toBe(1);
      }
    }
  });
});

describe('normalizeHtml', () => {
  it('drops scripts/styles/comments, decodes entities and collapses whitespace', () => {
    const html =
      '<html><head><style>.a{}</style><script>var x = "Hidden 99 kWh/kg";</script></head>' +
      '<body><!-- note --><p>O&#8322; &lt; 100&nbsp;ppm</p>\n\n<div>52 kWh/kg &amp; more &#x2014; ok</div></body></html>';
    expect(normalizeHtml(html)).toBe('O₂ < 100 ppm 52 kWh/kg & more — ok');
  });
});

describe('extractFigures against saved official pages', () => {
  it('Accelera HyLYZER 1000 spec table', () => {
    expect(figuresOf('accelera')).toEqual({
      '정격 출력': '5 MW',
      '수소 생산량': '90 kg/h',
      '공급 압력': '30 barg',
      '운전 범위': '15-100 %',
      '시스템 비소비전력': '52 kWh/kg',
    });
  });
  it('Nel MC series lineup and purity', () => {
    expect(figuresOf('nel')).toEqual({ 'MC 라인업': 'MC250 MC500 MC1000 MC2000 MC4000', '수소 순도': '99.9995 %' });
  });
  it('Sunfire HyLink Alkaline 23', () => {
    expect(figuresOf('sunfire')).toEqual({
      '표준 압력': '30 bar(g)',
      '모듈 용량': '50 MW',
      '수소 생산량': '1000 kg/h',
      효율: '67 % (LHV, DC)',
    });
  });
  it('Toyota, Samsung E&A, ITM, Siemens Energy, Plug, thyssenkrupp nucera, John Cockerill, LONGi', () => {
    expect(figuresOf('toyota')).toEqual({ '5MW급 유닛 수소 생산': '100 kg/h', '5MW급 유닛 바닥면적': '2.5 m x 6 m' });
    expect(figuresOf('samsung-ena')).toEqual({ 'CompassH2-P 압력': '30 barg', 'CompassH2-P 순도': '99.9995 %' });
    expect(figuresOf('itm-power')).toEqual({ 'NEPTUNE V 용량': '5 MW', 'NEPTUNE V 공시 가격': '5,000,000 EUR' });
    expect(figuresOf('siemens-energy')).toEqual({ '대기압 PEM 전해조 전력': '17.5 MW', '대기압 PEM 전해조 수소 생산': '335 kg/h' });
    expect(figuresOf('plug-power')).toEqual({ '5 MW 시스템 수소 생산': '2 t/일', '10 MW 시스템 수소 생산': '4 t/일' });
    expect(figuresOf('thyssenkrupp-nucera')).toEqual({ 'scalum® 유닛 용량': '20 MW', '운전 범위': '10-100 %' });
    expect(figuresOf('john-cockerill')).toEqual({ '단일 스택 최대 용량': '5 MW' });
    expect(figuresOf('longi')).toEqual({ '최저 에너지 소비': '4.0 kWh/Nm³' });
  });
  it('omits a figure when its label is not on the page (no guessing)', () => {
    expect(extractFigures('Hydrogen production about ninety kg/h', source('accelera').figures)).toEqual([]);
    expect(extractFigures(pageText('nel'), source('accelera').figures)).toEqual([]);
  });
});

describe('nextSnapshot change detection', () => {
  const src = source('accelera');
  const t1 = '2026-11-10T21:00:00.000Z';
  const t2 = '2026-11-11T21:00:00.000Z';
  const text = pageText('accelera');

  it('first successful fetch sets the baseline without a change', () => {
    const s = nextSnapshot(src, undefined, { ok: true, text }, t1);
    expect(s).toMatchObject({ status: 'ok', contentHash: hashText(text), changedAt: null, lastOkAt: t1, checkedAt: t1 });
    expect(s.figures).toHaveLength(5);
  });

  it('same text keeps changedAt; different text sets changedAt', () => {
    const base = nextSnapshot(src, undefined, { ok: true, text }, t1);
    expect(nextSnapshot(src, base, { ok: true, text }, t2).changedAt).toBeNull();
    const changed = nextSnapshot(src, base, { ok: true, text: text.replace('52 kWh/kg', '51 kWh/kg') }, t2);
    expect(changed.changedAt).toBe(t2);
    expect(changed.figures.find((f) => f.label === '시스템 비소비전력')?.value).toBe('51');
    // A later unchanged check keeps the original change date.
    expect(nextSnapshot(src, changed, { ok: true, text: text.replace('52 kWh/kg', '51 kWh/kg') }, '2026-11-12T21:00:00.000Z').changedAt).toBe(t2);
  });

  it('a failed fetch keeps the last good hash, figures and dates', () => {
    const base = nextSnapshot(src, undefined, { ok: true, text }, t1);
    const failed = nextSnapshot(src, base, { ok: false, error: 'HTTP 503' }, t2);
    expect(failed).toMatchObject({ status: 'fail', error: 'HTTP 503', contentHash: base.contentHash, lastOkAt: t1, checkedAt: t2 });
    expect(failed.figures).toEqual(base.figures);
    // Recovery with identical text is not a change.
    expect(nextSnapshot(src, failed, { ok: true, text }, '2026-11-12T21:00:00.000Z').changedAt).toBeNull();
  });

  it('a failed first fetch stores no figures', () => {
    expect(nextSnapshot(src, undefined, { ok: false, error: '시간 초과' }, t1)).toMatchObject({
      status: 'fail',
      contentHash: null,
      lastOkAt: null,
      figures: [],
    });
  });

  it('a registry URL change restarts the baseline instead of flagging a change', () => {
    const old: SiteSnapshot = { ...nextSnapshot(src, undefined, { ok: true, text }, t1), url: 'https://old.example/page' };
    const s = nextSnapshot(src, old, { ok: true, text: 'x'.repeat(300) }, t2);
    expect(s.changedAt).toBeNull();
  });
});

describe('isRecentChange', () => {
  const now = Date.parse('2026-11-11T00:00:00Z');
  it('is true within 7 days and false after or when unset', () => {
    expect(isRecentChange('2026-11-05T00:00:00Z', now)).toBe(true);
    expect(isRecentChange('2026-11-03T00:00:00Z', now)).toBe(false);
    expect(isRecentChange(null, now)).toBe(false);
    expect(isRecentChange('not-a-date', now)).toBe(false);
  });
});
