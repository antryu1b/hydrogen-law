import { createHash } from 'node:crypto';

// Daily official-website monitor for the 경쟁사 비교 tab (/api/cron/competitor-sites).
// One row per company in intel_competitors (id = competitor-watch:<key>, section = 'competitor-watch'),
// kept apart from the seeded report blocks: loadBlocks skips the section and the upload
// replace flow never deletes it.
//
// No-fabrication rule: a figure is stored only when one of the narrowly anchored patterns below
// matches the fetched page text; the captured text is stored verbatim (no unit conversion, no
// rounding). Pages without a reliable pattern are change-detected only.

export const COMPETITOR_WATCH_SECTION = 'competitor-watch';
export const COMPETITOR_WATCH_ID_PREFIX = 'competitor-watch:';
/** intel_competitors sections owned by the cron — protected from upload replace=true. */
export const COMPETITOR_DATA_SECTIONS = [COMPETITOR_WATCH_SECTION] as const;
/** 「변경 감지」 badge stays this long after a detected change (daily cron → a week of visibility). */
export const CHANGE_BADGE_DAYS = 7;

export interface FigureRule {
  label: string;
  /** Exactly one capture group — the value as printed on the page. */
  pattern: RegExp;
  unit: string;
}

export interface CompetitorSource {
  key: string;
  company: string;
  /** Official page on the company's own domain. */
  url: string;
  page: string;
  figures?: FigureRule[];
}

// Patterns were written against saved copies of each page (src/__tests__/fixtures/competitor-*.html,
// fetched 2026-11-11) and are anchored on the spec label printed next to the value.
export const COMPETITOR_SOURCES: CompetitorSource[] = [
  {
    key: 'siemens-energy',
    company: 'Siemens Energy',
    url: 'https://www.siemens-energy.com/global/en/home/products-services/product-offerings/hydrogen-solutions.html',
    page: '수소 솔루션(Elyzer) 제품 페이지',
    figures: [
      { label: '대기압 PEM 전해조 전력', pattern: /\(PEM\) electrolyzer with (\d+(?:\.\d+)?) MW power demand/, unit: 'MW' },
      { label: '대기압 PEM 전해조 수소 생산', pattern: /MW power demand and (\d[\d,]*) kg hydrogen production per hour/, unit: 'kg/h' },
    ],
  },
  {
    key: 'nel',
    company: 'Nel ASA',
    url: 'https://nelhydrogen.com/product/mc-series-pem/',
    page: 'MC Series PEM 제품 페이지',
    figures: [
      { label: 'MC 라인업', pattern: /Model (MC\d+(?: MC\d+)*) Class/, unit: '' },
      { label: '수소 순도', pattern: /(\d{2}\.\d+)% purity/, unit: '%' },
    ],
  },
  {
    key: 'plug-power',
    company: 'Plug Power',
    url: 'https://www.plugpower.com/technology-products/pem-electrolyzers/',
    page: 'PEM 전해조(GenEco) 제품 페이지',
    figures: [
      { label: '5 MW 시스템 수소 생산', pattern: /\b5 MW input Up to (\d+(?:\.\d+)?) metric tons of hydrogen per day/, unit: 't/일' },
      { label: '10 MW 시스템 수소 생산', pattern: /\b10 MW input Up to (\d+(?:\.\d+)?) metric tons of hydrogen per day/, unit: 't/일' },
    ],
  },
  {
    key: 'accelera',
    company: 'Accelera(Cummins)',
    url: 'https://www.accelerazero.com/electrolyzers/products/HyLYZER-1000',
    page: 'HyLYZER 1000 제품 페이지',
    figures: [
      { label: '정격 출력', pattern: /Nominal power rating (\d+(?:\.\d+)?)-megawatts/, unit: 'MW' },
      { label: '수소 생산량', pattern: /Hydrogen production (\d[\d,]*(?:\.\d+)?) kg\/h/, unit: 'kg/h' },
      { label: '공급 압력', pattern: /Hydrogen delivery pressure (\d+(?:\.\d+)?) barg/, unit: 'barg' },
      { label: '운전 범위', pattern: /Operating range (\d+-\d+)%/, unit: '%' },
      { label: '시스템 비소비전력', pattern: /System-specific consumption (\d+(?:\.\d+)?) kWh\/kg/, unit: 'kWh/kg' },
    ],
  },
  {
    key: 'itm-power',
    company: 'ITM Power',
    url: 'https://itm-power.com/products/neptune-5',
    page: 'NEPTUNE V 제품 페이지',
    figures: [
      { label: 'NEPTUNE V 용량', pattern: /NEPTUNE V is our full scope (\d+(?:\.\d+)?) MW/, unit: 'MW' },
      { label: 'NEPTUNE V 공시 가격', pattern: /NEPTUNE V is our full scope [^.]{0,120}\. EUR (\d[\d,]*)\*/, unit: 'EUR' },
    ],
  },
  {
    key: 'toyota',
    company: 'Toyota',
    url: 'https://global.toyota/en/newsroom/corporate/40388622.html',
    page: '수전해 장치 개발 보도자료',
    figures: [
      { label: '5MW급 유닛 수소 생산', pattern: /hydrogen production capacity: approx\. (\d+(?:\.\d+)?) kg\/hr/, unit: 'kg/h' },
      { label: '5MW급 유닛 바닥면적', pattern: /floor area: (\d+(?:\.\d+)? m x \d+(?:\.\d+)? m)/, unit: '' },
    ],
  },
  {
    key: 'samsung-ena',
    company: '삼성E&A',
    url: 'https://www.samsungena.com/kr/newsroom/news/view?idx=15758',
    page: 'CompassH2-P 출시 보도자료',
    figures: [
      { label: 'CompassH2-P 압력', pattern: /고압\((\d+(?:\.\d+)?)barg\)/, unit: 'barg' },
      { label: 'CompassH2-P 순도', pattern: /고순도\((\d{2}\.\d+)%\)/, unit: '%' },
    ],
  },
  {
    key: 'thyssenkrupp-nucera',
    company: 'thyssenkrupp nucera',
    url: 'https://www.thyssenkrupp-nucera.com/technologies/alkaline-water-electrolysis',
    page: '알칼라인 수전해(scalum®) 기술 페이지',
    figures: [
      { label: 'scalum® 유닛 용량', pattern: /Our (\d+(?:\.\d+)?) MW scalum/, unit: 'MW' },
      { label: '운전 범위', pattern: /operating range between (\d+-\d+)%/, unit: '%' },
    ],
  },
  {
    key: 'john-cockerill',
    company: 'John Cockerill',
    url: 'https://hydrogen.johncockerill.com/en/products/electrolysers/',
    page: '가압 알칼라인 전해조 제품 페이지',
    figures: [
      { label: '단일 스택 최대 용량', pattern: /offers a (\d+(?:\.\d+)?) MW single stack pressurised electrolyser/, unit: 'MW' },
    ],
  },
  {
    key: 'sunfire',
    company: 'Sunfire',
    url: 'https://sunfire.de/en/products/hylink-alkaline-23/',
    page: 'HyLink® Alkaline 23 제품 페이지',
    figures: [
      { label: '표준 압력', pattern: /Standard Pressure (\d+(?:\.\d+)?) bar\(g\)/, unit: 'bar(g)' },
      { label: '모듈 용량', pattern: /Standard Pressure \d+(?:\.\d+)? bar\(g\) (\d+(?:\.\d+)?) MW Capacity/, unit: 'MW' },
      { label: '수소 생산량', pattern: /(\d[\d,]*) kg H₂\/h High Efficiency/, unit: 'kg/h' },
      { label: '효율', pattern: /High Efficiency (\d+(?:\.\d+)?)% LHV/, unit: '% (LHV, DC)' },
    ],
  },
  {
    key: 'longi',
    company: 'LONGi Hydrogen',
    url: 'https://www.longi.com/en/products/hydrogen/alk-hi-1/',
    page: 'ALK Hi1 제품 페이지',
    figures: [
      { label: '최저 에너지 소비', pattern: /minimum energy consumption of (\d+(?:\.\d+)?) ?kwh\/Nm3/i, unit: 'kWh/Nm³' },
    ],
  },
  {
    key: 'sungrow',
    company: 'Sungrow Hydrogen',
    url: 'https://www.sungrowpower.com/en/hydrogen',
    page: '수소 사업 페이지',
  },
  {
    key: 'peric',
    company: 'PERIC(派瑞氢能)',
    url: 'https://www.h2peric.com/EN/',
    page: '영문 홈페이지',
  },
];

export interface Figure {
  label: string;
  value: string;
  unit: string;
}

export interface SiteSnapshot {
  type: typeof COMPETITOR_WATCH_SECTION;
  key: string;
  company: string;
  url: string;
  page: string;
  checkedAt: string;
  status: 'ok' | 'fail';
  error?: string;
  /** sha256 of the normalized page text from the last successful fetch. */
  contentHash: string | null;
  /** When a successful fetch last produced a different hash than the previous one. */
  changedAt: string | null;
  /** Last successful fetch — the 반영일 of contentHash and figures. */
  lastOkAt: string | null;
  figures: Figure[];
}

export type FetchOutcome = { ok: true; text: string } | { ok: false; error: string };

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  middot: '·',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Visible page text: scripts/styles/comments dropped, tags → spaces, entities decoded, whitespace collapsed. */
export function normalizeHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function extractFigures(text: string, rules: FigureRule[] = []): Figure[] {
  const out: Figure[] = [];
  for (const r of rules) {
    const m = r.pattern.exec(text);
    const value = m?.[1]?.trim();
    if (value) out.push({ label: r.label, value, unit: r.unit });
  }
  return out;
}

/**
 * Next stored snapshot for one source. A failed fetch keeps the last good hash/figures/dates
 * and only flips status. A URL change in the registry restarts the baseline (no 변경 감지).
 */
export function nextSnapshot(
  source: CompetitorSource,
  prev: SiteSnapshot | undefined,
  outcome: FetchOutcome,
  now: string,
): SiteSnapshot {
  const base = prev && prev.url === source.url ? prev : undefined;
  const common = {
    type: COMPETITOR_WATCH_SECTION,
    key: source.key,
    company: source.company,
    url: source.url,
    page: source.page,
    checkedAt: now,
  } as const;
  if (!outcome.ok) {
    return {
      ...common,
      status: 'fail',
      error: outcome.error,
      contentHash: base?.contentHash ?? null,
      changedAt: base?.changedAt ?? null,
      lastOkAt: base?.lastOkAt ?? null,
      figures: base?.figures ?? [],
    };
  }
  const contentHash = hashText(outcome.text);
  const changed = !!base?.contentHash && base.contentHash !== contentHash;
  return {
    ...common,
    status: 'ok',
    contentHash,
    changedAt: changed ? now : (base?.changedAt ?? null),
    lastOkAt: now,
    figures: extractFigures(outcome.text, source.figures),
  };
}

/** True while a detected change is younger than CHANGE_BADGE_DAYS. */
export function isRecentChange(changedAt: string | null, nowMs: number): boolean {
  if (!changedAt) return false;
  const t = Date.parse(changedAt);
  return Number.isFinite(t) && nowMs - t < CHANGE_BADGE_DAYS * 86_400_000;
}
