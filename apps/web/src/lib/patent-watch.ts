/**
 * Pure helpers for the KIPRIS patent watch (/api/cron/kipris-patents) and the
 * competitor filing statistics on the 특허 분석 tab. No I/O — fully testable.
 */

// ── Categories ──────────────────────────────────────────────────────────────
export type PatentCategory = 'system' | 'gas-liquid' | 'transfer' | 'stack' | 'control';

/** Display labels shared by the FTO list filter and the watch/competitor views. */
export const PATENT_CATEGORY_LABEL: Record<PatentCategory, string> = {
  system: '시스템',
  'gas-liquid': '기액분리기',
  transfer: '이관',
  stack: '스택',
  control: '제어',
};

// Keyword rule (추정 — tune later). First match wins; anything else falls back to 'system'.
// 'transfer' (이관) is a review-workflow label in the FTO DB, not a technical topic, so the
// rule never assigns it.
const CATEGORY_RULES: [Exclude<PatentCategory, 'system' | 'transfer'>, RegExp][] = [
  ['control', /제어|운전\s?방법|운전\s?장치|부하\s?추종|전력\s?변환|컨버터|인버터|열\s?관리|열화|진단|control/i],
  ['gas-liquid', /기액|기-액|분리기|미스트|demister|gas.?liquid/i],
  ['stack', /스택|막전극|전극|분리판|바이폴라|멤브레인|촉매|stack|electrode|membrane/i],
];

export function autoCategory(title: string, summary = ''): PatentCategory {
  // Title wins over summary: a stack patent whose abstract mentions 제어 stays a stack patent.
  for (const text of [title, summary]) {
    for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  }
  return 'system';
}

// ── Search terms (추정 — tuned later) ───────────────────────────────────────
/** Mirrors the original exclusion words. Applied client-side (KIPRIS NOT syntax unconfirmed). */
export const EXCLUDE_WORDS = ['이차전지', '배터리', '리튬', '레독스', '반도체', '세라믹', '암모니아', '커패시터', '안테나', '주파수'];

/** Only filings on/after this date are kept. Applied client-side (date param unconfirmed). */
export const MIN_FILED = '20100101';

/** Filing office of a collected record. KR = KIPO domestic search; US/EP = KIPRIS overseas search. */
export type Country = 'KR' | 'US' | 'EP';
export const COUNTRIES: Country[] = ['KR', 'US', 'EP'];

export interface SearchJob {
  key: string;
  /** Watch set A–F. */
  set: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  /** KR: getWordSearch `word` value (space-separated terms AND-matched, 추정). US/EP: English applicant name. */
  word: string;
  /** Set E only: the competitor label this applicant search is for. */
  company?: string;
  /** Overseas applicantSearch job; absent = domestic (KR) word search. */
  country?: Exclude<Country, 'KR'>;
}

export const WATCH_SET_LABEL: Record<SearchJob['set'], string> = {
  A: '현대차·기아 출원',
  B: '수전해 시스템',
  C: '기액분리기',
  D: '전해조 스택',
  E: '경쟁사 출원인',
  F: '제어',
};

// 「추정」 All queries below are first guesses; tune after observing real hits.
export const SEARCH_JOBS: SearchJob[] = [
  // A: 현대자동차/기아 출원 수전해
  { key: 'A1', set: 'A', word: '현대자동차 수전해' },
  { key: 'A2', set: 'A', word: '기아 수전해' },
  // B: 수전해 시스템
  { key: 'B1', set: 'B', word: '수전해 시스템' },
  { key: 'B2', set: 'B', word: '전해조 시스템' },
  // C: 기액분리기
  { key: 'C1', set: 'C', word: '수전해 기액분리기' },
  { key: 'C2', set: 'C', word: '전해조 기액분리' },
  // D: 전해조 스택
  { key: 'D1', set: 'D', word: '전해조 스택' },
  { key: 'D2', set: 'D', word: '수전해 스택' },
  // F: 제어
  { key: 'F1', set: 'F', word: '수전해 제어' },
  { key: 'F2', set: 'F', word: '수전해 운전' },
  { key: 'F3', set: 'F', word: '전해조 부하추종' },
  { key: 'F4', set: 'F', word: '수전해 전력변환' },
  { key: 'F5', set: 'F', word: '수전해 열관리' },
  { key: 'F6', set: 'F', word: '전해조 열화진단' },
  // E: competitor applicants (+ electrolysis term). Applicant names as registered at KIPO (추정).
  { key: 'E-hmc', set: 'E', word: '현대자동차 전해', company: '현대차' },
  { key: 'E-kia', set: 'E', word: '기아 전해', company: '현대차' },
  { key: 'E-toyota', set: 'E', word: '도요타 전해', company: 'Toyota' },
  { key: 'E-honda', set: 'E', word: '혼다 전해', company: 'Honda' },
  { key: 'E-nel', set: 'E', word: '넬 에이에스에이 전해', company: 'NEL' },
  { key: 'E-itm', set: 'E', word: '아이티엠 파워 전해', company: 'ITM Power' },
  { key: 'E-plug', set: 'E', word: '플러그 파워 전해', company: 'Plug Power' },
  { key: 'E-hydrogenics', set: 'E', word: '하이드로제닉스 전해', company: 'Accelera' },
  { key: 'E-siemens', set: 'E', word: '지멘스 전해', company: 'Siemens Energy' },
  { key: 'E-samsung', set: 'E', word: '삼성이앤에이 전해', company: '삼성E&A' },
  { key: 'E-samsung-old', set: 'E', word: '삼성엔지니어링 전해', company: '삼성E&A' },
  { key: 'E-posco', set: 'E', word: '포스코 수전해', company: '포스코홀딩스' },
  // Later competitor additions. Korean applicant transliterations are 추정 (not yet seen in KIPRIS data).
  { key: 'E-htec', set: 'E', word: '에이치텍 전해', company: 'H-TEC' },
  { key: 'E-denora', set: 'E', word: '노라 전해', company: 'De Nora' },
  { key: 'E-ohmium', set: 'E', word: '오미움 전해', company: 'Ohmium' },
  { key: 'E-verdagy', set: 'E', word: '버다지 전해', company: 'Verdagy' },
  { key: 'E-bloom', set: 'E', word: '블룸 에너지 전해', company: 'Bloom Energy' },
  { key: 'E-linde', set: 'E', word: '린데 전해', company: 'Linde' },
  { key: 'E-airproducts', set: 'E', word: '에어 프로덕츠 전해', company: 'Air Products' },
  { key: 'E-thyssenkrupp', set: 'E', word: '티센크루프 전해', company: 'thyssenkrupp' },
];

// Overseas (US/EP) applicantSearch names, one job per name per country. 「추정」 English names as
// filed; several entries may share a competitor label. Broad applicants (Toyota, Linde …) return
// their whole portfolio, so overseas rows are gated by isRelevantForeign() and a page cap.
const FOREIGN_APPLICANTS: { key: string; company: string; name: string }[] = [
  { key: 'hmc', company: '현대차', name: 'Hyundai Motor Company' },
  { key: 'kia', company: '현대차', name: 'Kia Corporation' },
  { key: 'toyota', company: 'Toyota', name: 'Toyota Jidosha' },
  { key: 'honda', company: 'Honda', name: 'Honda Motor' },
  { key: 'nel', company: 'NEL', name: 'Nel ASA' },
  { key: 'itm', company: 'ITM Power', name: 'ITM Power' },
  { key: 'plug', company: 'Plug Power', name: 'Plug Power' },
  { key: 'hydrogenics', company: 'Accelera', name: 'Hydrogenics' },
  { key: 'htec', company: 'H-TEC', name: 'H-TEC Systems' },
  { key: 'denora', company: 'De Nora', name: 'De Nora' },
  { key: 'ohmium', company: 'Ohmium', name: 'Ohmium International' },
  { key: 'verdagy', company: 'Verdagy', name: 'Verdagy' },
  { key: 'bloom', company: 'Bloom Energy', name: 'Bloom Energy' },
  { key: 'siemens', company: 'Siemens Energy', name: 'Siemens Energy' },
  { key: 'samsung', company: '삼성E&A', name: 'Samsung E&A' },
  { key: 'posco', company: '포스코홀딩스', name: 'POSCO Holdings' },
  { key: 'linde', company: 'Linde', name: 'Linde' },
  { key: 'airproducts', company: 'Air Products', name: 'Air Products' },
  { key: 'thyssenkrupp', company: 'thyssenkrupp', name: 'thyssenkrupp' },
];

export const FOREIGN_JOBS: SearchJob[] = (['US', 'EP'] as const).flatMap((country) =>
  FOREIGN_APPLICANTS.map((a) => ({ key: `${country}-${a.key}`, set: 'E' as const, word: a.name, company: a.company, country })),
);

/**
 * Every search job of the cron, interleaved KR / US / EP so each run's round-robin window
 * touches all three countries (a failing country then shows up after the next run).
 */
export const ALL_JOBS: SearchJob[] = (() => {
  const lists = [SEARCH_JOBS, FOREIGN_JOBS.filter((j) => j.country === 'US'), FOREIGN_JOBS.filter((j) => j.country === 'EP')];
  const out: SearchJob[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
})();

/** Total KIPRIS requests per cron run (search + status refresh) — keeps daily calls bounded. */
export const REQUEST_BUDGET = 20;
/** Share of REQUEST_BUDGET spent on the KR rights-status refresh of FTO records. */
export const STATUS_BUDGET = 3;
/** Overseas applicant searches stop backfilling after this many pages (newest filings first). */
export const FOREIGN_MAX_PAGES = 5;
/** Timeout for overseas (US/EP) applicant searches — the foreign API is slower than domestic. */
export const OVERSEAS_TIMEOUT_MS = 20_000;
/** Concurrency cap for overseas batches (lower than domestic to reduce simultaneous load). */
export const OVERSEAS_CONCURRENCY = 3;
/**
 * Maximum overseas applicant-search requests per run. With OVERSEAS_CONCURRENCY and
 * OVERSEAS_TIMEOUT_MS, one overseas batch takes up to 20 s. Combined with the domestic
 * phase (≤ 32 s worst case at CONCURRENCY 5, timeout 8 s), the total stays under maxDuration = 60 s.
 *   Worst case: ceil(17/5) KR batches × 8 s + 1 overseas batch × 20 s = 32 + 20 = 52 s < 60 s.
 */
export const OVERSEAS_PER_RUN = 3;

// Require water-electrolysis meaning to avoid false positives:
//   전해액 (electrolyte solution), 전해도금 (electroplating), 전해연마 (electrolytic polishing),
//   전해콘덴서 (electrolytic capacitor), 전해 동박 (electrolytic copper foil), 전해지다 (Korean verb)
//   all fail; 수전해 / 전해조 / 전해 (셀|스택|장치|시스템) / English electrolyzer·electrolysis pass.
const RELEVANT = /수전해|전기분해|전해조|전해\s?(?:셀|스택|장치|시스템)|electroly[sz]er|electrolysis/i;

/** Mentions electrolysis (guards competitor stats against off-topic applicant hits). */
export function isRelevant(text: string): boolean {
  return RELEVANT.test(text);
}

/** Off-topic filter for KR records (Korean vocabulary only). */
export function isExcluded(text: string): boolean {
  return EXCLUDE_WORDS.some((w) => text.includes(w));
}

// English counterpart of RELEVANT for overseas records (applicant searches return whole portfolios).
// electroly[sz] covers electrolysis / electrolyzer / electrolyser / electrolysing but not
// electrolyte / electrolytic, so a PEM *fuel cell* abstract ("polymer electrolyte membrane") fails.
// PEM / AEM / alkaline only count together with an electrolysis word, which this already requires.
const RELEVANT_EN = /electroly[sz]|\bSOEC\b|electrolytic\s(?:cell|stack)|water\ssplitting/i;
// English off-topic filter for overseas records. Unlike EXCLUDE_WORDS it omits ceramic and
// ammonia: SOEC abstracts routinely mention a "ceramic electrolyte" and green-ammonia
// electrolyzer filings are core for the tracked EPC competitors.
const EXCLUDE_EN = /\b(?:lithium|batter(?:y|ies)|redox flow|semiconductor|capacitor|antenna)\b/i;

/** Water-electrolysis relevance for English (US/EP) title + abstract text. */
export function isRelevantForeign(text: string): boolean {
  return RELEVANT_EN.test(text) && !EXCLUDE_EN.test(text);
}

// ── Competitors ─────────────────────────────────────────────────────────────
/**
 * Original labels match the news tab's COMPANIES labels (intel-news cron); the later
 * additions (H-TEC … thyssenkrupp) cover the remaining applicants of the FTO competitor DB.
 */
export const COMPETITOR_GROUPS: { group: string; companies: string[] }[] = [
  { group: '자동차 업체', companies: ['현대차', 'Toyota', 'Honda'] },
  {
    group: '수전해 전문업체',
    companies: ['NEL', 'ITM Power', 'Plug Power', 'Accelera', 'H-TEC', 'De Nora', 'Ohmium', 'Verdagy', 'Bloom Energy'],
  },
  { group: '에너지·플랜트(EPC)', companies: ['Siemens Energy', '삼성E&A', '포스코홀딩스', 'Linde', 'Air Products', 'thyssenkrupp'] },
];

// Matched as substrings of the normalized applicant name (lowercase, no spaces/punctuation).
// Use specific strings to avoid broad-matching subsidiaries or unrelated entities.
const APPLICANT_ALIASES: [string, string[]][] = [
  ['현대차', ['현대자동차', '기아주식회사', '기아자동차', 'hyundaimotor', 'kiacorporation', 'kiamotors']],
  // Aisin is a Toyota group company; its filings were attributed to Toyota in the FTO analysis.
  // English aliases are legal-name prefixes so a bare 'aisin' substring cannot match other names.
  ['Toyota', ['도요타', '토요타', 'toyota', '아이신', 'aisinseiki', 'aisincorporation', 'aisincorp']],
  ['Honda', ['혼다', 'honda']],
  ['NEL', ['넬에이에스에이', '넬하이드로젠', 'nelasa', 'nelhydrogen']],
  ['ITM Power', ['아이티엠파워', 'itmpower']],
  ['Plug Power', ['플러그파워', 'plugpower']],
  // 추정: Cummins Inc. created Accelera specifically for electrolysis products (acquired Hydrogenics 2019).
  // Cummins/커민스 entries are kept under Accelera to cover pre-brand-transition filings.
  ['Accelera', ['하이드로제닉스', 'hydrogenics', '액셀레라', 'accelera', '커민스', 'cummins']],
  // Narrowed from bare '지멘스'/'siemens' to avoid matching Siemens Healthineers / Digital Industries /
  // Smart Infrastructure etc. '지멘스에너지'/'siemensenergy' match the post-spin-off entity.
  // 추정: Siemens AG ('siemensaktiengesellschaft'/'지멘스악티엔게젤샤프트') filed water-electrolysis patents
  // before the 2020 Siemens Energy spin-off. isRelevant() already gates; only electrolysis-relevant
  // filings are counted. Include them here so pre-2020 filings are attributed to Siemens Energy.
  // 추정: Siemens Gamesa Renewable Energy is a Siemens Energy subsidiary (majority 2020, wholly owned
  // 2023); its electrolysis filings are attributed to Siemens Energy, consistent with Siemens AG above.
  [
    'Siemens Energy',
    ['지멘스에너지', 'siemensenergy', 'siemensaktiengesellschaft', '지멘스악티엔게젤샤프트', 'siemensgamesa', '지멘스가메사'],
  ],
  ['삼성E&A', ['삼성이앤에이', '삼성엔지니어링', 'samsungea', 'samsungengineering']],
  // Narrowed from bare '포스코'/'posco' (which would also match POSCO Future M, POSCO ICT, etc.).
  // '포스코홀딩스' covers post-2022 parent; 'poscoholding' covers English-name filings.
  // Pre-2022 patents filed as plain '주식회사포스코' / 'POSCO CO., LTD.' are NOT included — conservative
  // choice: the plain '포스코' string also appears in subsidiary names (포스코케미칼, 포스코인터내셔널 etc.),
  // so including it would require manual false-positive review that pre-2020 data does not yet support.
  // If pre-2022 filings become relevant, add 'poscoco'/'주식회사포스코' and mark 추정.
  ['포스코홀딩스', ['포스코홀딩스', 'poscoholding']],
  // Electrolyzer specialists. Korean transliterations not yet seen in KIPRIS data are 추정.
  ['H-TEC', ['htecsystems', '에이치텍시스템즈']],
  // De Nora: Industrie De Nora S.p.A. and De Nora Permelec Ltd (KR: 인두스트리에 데 노라 / 드 노라 페르멜렉).
  ['De Nora', ['denora', '데노라', '드노라']],
  ['Ohmium', ['ohmiuminternational', '오미움']],
  ['Verdagy', ['verdagy', '버다지']],
  ['Bloom Energy', ['bloomenergy', '블룸에너지']],
  // Energy / industrial gas / EPC. Linde uses legal-name forms only: bare 'linde' would also match
  // names such as 'Lindenberg'.
  ['Linde', ['린데게엠베하', '린데악티엔게젤샤프트', '린데피엘씨', 'lindegmbh', 'lindeag', 'lindeaktiengesellschaft', 'lindeplc']],
  // normName drops '&' and spaces, so 'Air Products & Chemicals, Inc.' → 'airproductschemicalsinc'.
  ['Air Products', ['airproducts', '에어프로덕츠']],
  // thyssenkrupp AG, thyssenkrupp Uhde, thyssenkrupp nucera.
  ['thyssenkrupp', ['thyssenkrupp', '티센크루프']],
];

function normName(s: string): string {
  return s.toLowerCase().replace(/[\s.,()&'"\-_/·|;]+/g, '');
}

/**
 * Competitor labels for an applicant field. Joint filings ("A | B") return every
 * matching competitor once, in alias-map order.
 */
export function companiesForApplicant(applicant: string | null | undefined): string[] {
  const name = normName(applicant ?? '');
  if (!name) return [];
  return APPLICANT_ALIASES.filter(([, keys]) => keys.some((k) => name.includes(k))).map(([label]) => label);
}

export function groupOf(company: string): string | null {
  return COMPETITOR_GROUPS.find((g) => g.companies.includes(company))?.group ?? null;
}

// ── Application numbers & dates ─────────────────────────────────────────────
/** Digits only: '10-2011-0042643' and '1020110042643' both → '1020110042643'. */
export function normalizeAppNo(appNo: string | null | undefined): string {
  return (appNo ?? '').replace(/\D/g, '');
}

/** '1020110042643' → '10-2011-0042643'; anything not 13 digits is returned as given. */
export function formatAppNo(appNo: string): string {
  const d = normalizeAppNo(appNo);
  return d.length === 13 ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : appNo;
}

/** '20110504' / '2011.05.04' / '2011-05-04' → '2011-05-04'; otherwise null. */
export function formatDate(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : null;
}

/** KIPRIS bibliography page (URL pattern 추정). */
export function kiprisLink(appNo: string): string | null {
  const d = normalizeAppNo(appNo);
  return d.length === 13 ? `https://kpat.kipris.or.kr/kpat/biblioa.do?method=biblioFrame&applno=${d}` : null;
}

// ── XML parsing ─────────────────────────────────────────────────────────────
export interface KiprisItem {
  applicationNumber: string;
  inventionTitle: string;
  applicantName: string;
  applicationDate: string;
  openDate: string;
  registerDate: string;
  registerStatus: string;
  ipcNumber: string;
  astrtCont: string;
}

export interface KiprisResult {
  ok: boolean;
  resultCode: string;
  resultMsg: string;
  totalCount: number | null;
  items: KiprisItem[];
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First matching tag among `names` (case-insensitive — tag casing is unconfirmed). */
function tag(xml: string, ...names: string[]): string {
  for (const name of names) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
    if (m) return decode(m[1]);
  }
  return '';
}

/**
 * Parses a patUtiModInfoSearchSevice response. ok = resultCode '00'
 * (an empty code with successYN != 'N' is also accepted).
 */
export function parseKiprisXml(xml: string): KiprisResult {
  const header = /<header>([\s\S]*?)<\/header>/i.exec(xml)?.[1] ?? xml;
  const resultCode = tag(header, 'resultCode');
  const resultMsg = tag(header, 'resultMsg');
  const successYN = tag(header, 'successYN');
  const total = Number(tag(xml, 'totalCount'));
  const items: KiprisItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    items.push({
      applicationNumber: tag(b, 'applicationNumber'),
      inventionTitle: tag(b, 'inventionTitle'),
      applicantName: tag(b, 'applicantName', 'applicant'),
      applicationDate: tag(b, 'applicationDate'),
      openDate: tag(b, 'openDate', 'publicationDate'),
      registerDate: tag(b, 'registerDate'),
      registerStatus: tag(b, 'registerStatus'),
      ipcNumber: tag(b, 'ipcNumber'),
      astrtCont: tag(b, 'astrtCont'),
    });
  }
  return {
    ok: resultCode === '00' || (resultCode === '' && successYN.toUpperCase() !== 'N' && /<response/i.test(xml)),
    resultCode,
    resultMsg,
    totalCount: Number.isFinite(total) && tag(xml, 'totalCount') !== '' ? total : null,
    items: items.filter((i) => normalizeAppNo(i.applicationNumber)),
  };
}

/** Overseas result codes that are not failures: '00' ok, '20' no results (unconfirmed, per wrapper). */
const FOREIGN_OK_CODES = ['00', '20'];

/**
 * Parses a ForeignPatentAdvencedSearchService response. Field names come from a third-party
 * wrapper (unverified), so every field also accepts its domestic name. Items are <searchResult>
 * (falling back to <item>). Unknown result codes give ok = false — the caller records a
 * failure; this never throws.
 */
export function parseForeignXml(xml: string): KiprisResult {
  const header = /<header>([\s\S]*?)<\/header>/i.exec(xml)?.[1] ?? xml;
  const resultCode = tag(header, 'resultCode');
  const resultMsg = tag(header, 'resultMsg');
  const totalRaw = tag(xml, 'totalCount');
  let blocks = [...xml.matchAll(/<searchResult(?:\s[^>]*)?>([\s\S]*?)<\/searchResult>/gi)];
  if (!blocks.length) blocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  const items: KiprisItem[] = blocks.map(([, b]) => ({
    applicationNumber: tag(b, 'applicationNo', 'applicationNumber'),
    inventionTitle: tag(b, 'inventionName', 'inventionTitle'),
    applicantName: tag(b, 'applicant', 'applicantName'),
    applicationDate: tag(b, 'applicationDate'),
    openDate: tag(b, 'openDate', 'publicationDate'),
    registerDate: tag(b, 'registerDate'),
    registerStatus: tag(b, 'registerStatus'),
    ipcNumber: tag(b, 'ipcNumber', 'ipc'),
    astrtCont: tag(b, 'astrtCont', 'abstract'),
  }));
  // Accept an empty resultCode only when at least one item has a non-empty applicationNumber.
  // Production overseas responses sometimes use a service-name root element (not <response>),
  // which caused the previous /<response/ guard to return ok=false even with valid items.
  // Requiring a non-empty applicationNumber prevents <error>-style bodies from slipping through.
  const hasUsableItem = items.some((it) => Boolean(normalizeAppNo(it.applicationNumber)));
  const ok = FOREIGN_OK_CODES.includes(resultCode) || (resultCode === '' && hasUsableItem);
  const total = Number(totalRaw);
  return {
    ok,
    resultCode,
    resultMsg,
    totalCount: totalRaw !== '' && Number.isFinite(total) ? total : null,
    items: ok && resultCode !== '20' ? items.filter((i) => normalizeAppNo(i.applicationNumber)) : [],
  };
}

/**
 * Structure hint for the first live run: when an overseas response says '00' but parses to no
 * items while its body is non-empty, returns the distinct tag names (≤500 chars). Tag names only,
 * never element values, so the access key cannot leak into the stored payload.
 */
export function foreignDiag(xml: string, r: KiprisResult): string | null {
  if (r.resultCode !== '00' || r.items.length) return null;
  const body = /<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i.exec(xml)?.[1] ?? xml.replace(/<header>[\s\S]*?<\/header>/i, '');
  if (!body.trim()) return null;
  const names = [...new Set([...xml.matchAll(/<([A-Za-z_][\w.-]*)/g)].map((m) => m[1]))];
  return names.join(',').slice(0, 500);
}

/**
 * Parses a getBibliographyDetailInfoSearch response (one application). registerStatus is read
 * from the first item, else from anywhere in the response (detail layout unconfirmed).
 */
export function parseStatusXml(xml: string) {
  const r = parseKiprisXml(xml);
  return {
    ok: r.ok,
    resultCode: r.resultCode,
    resultMsg: r.resultMsg,
    registerStatus: r.items[0]?.registerStatus || tag(xml, 'registerStatus'),
  };
}

// ── Rows ────────────────────────────────────────────────────────────────────
export interface PatentWatchPayload {
  type: 'patent-watch' | 'patent-competitor';
  /** Filing office. Rows written before overseas collection have no country (= KR). */
  country: Country;
  appNo: string;
  title: string;
  applicant: string;
  filedDate: string | null;
  pubDate: string | null;
  regDate: string | null;
  status: string;
  ipc: string;
  summary: string;
  link: string | null;
  category: PatentCategory;
  categorySource: 'auto';
  verdict: null;
  matchedSet: SearchJob['set'];
  /** patent-competitor only. */
  companies?: string[];
  foundAt: string;
}

export interface PatentRow {
  id: string;
  section: 'patent-watch' | 'patent-competitor';
  sort: number;
  payload: PatentWatchPayload;
}

export const WATCH_SECTION = 'patent-watch';
export const COMPETITOR_SECTION = 'patent-competitor';
export const CURSOR_SECTION = 'patent-cursor';
/** Auto-collected KR rights status of FTO records — kept apart from the human-reviewed FTO payload. */
export const STATUS_SECTION = 'patent-status';
export const CURSOR_ID = 'patent-cursor:kipris';
/** Sections owned by this feature — never rendered as content blocks. */
export const PATENT_DATA_SECTIONS = [WATCH_SECTION, COMPETITOR_SECTION, CURSOR_SECTION, STATUS_SECTION];

const SUMMARY_MAX = 500;

function baseRow(item: KiprisItem, set: SearchJob['set'], country: Country, foundAt: string) {
  const filedDate = formatDate(item.applicationDate);
  return {
    sort: filedDate ? Number(filedDate.replace(/-/g, '')) : 0,
    payload: {
      country,
      appNo: country === 'KR' ? formatAppNo(item.applicationNumber) : item.applicationNumber,
      title: item.inventionTitle,
      applicant: item.applicantName,
      filedDate,
      pubDate: formatDate(item.openDate),
      regDate: formatDate(item.registerDate),
      status: item.registerStatus,
      ipc: item.ipcNumber,
      summary: item.astrtCont.slice(0, SUMMARY_MAX),
      link: country === 'KR' ? kiprisLink(item.applicationNumber) : null,
      category: autoCategory(item.inventionTitle, item.astrtCont),
      categorySource: 'auto' as const,
      verdict: null,
      matchedSet: set,
      foundAt,
    },
  };
}

/** Id/dedupe key: KR stays `<digits>` (ids unchanged); overseas is `US:<digits>` / `EP:<digits>`. */
export function countryKey(country: Country, no: string): string {
  return country === 'KR' ? no : `${country}:${no}`;
}

/**
 * Turns one job's search hits into rows to insert. Watch rows skip appNos in `known`
 * (FTO records, KR and US numbers); competitor rows are kept for every relevant competitor
 * filing. Overseas jobs (applicant searches) keep only electrolysis-relevant hits.
 * Within-run duplicates are dropped via the shared `seen` sets (keyed per country).
 */
export function rowsFromItems(
  items: KiprisItem[],
  job: SearchJob,
  ctx: { ftoAppNos: Set<string>; seenWatch: Set<string>; seenCompetitor: Set<string>; foundAt: string },
): PatentRow[] {
  const out: PatentRow[] = [];
  const country: Country = job.country ?? 'KR';
  for (const item of items) {
    const no = normalizeAppNo(item.applicationNumber);
    const filed = item.applicationDate.replace(/\D/g, '');
    if (!no || (filed && filed < MIN_FILED)) continue;
    const text = `${item.inventionTitle} ${item.astrtCont}`;
    if (country === 'KR' ? isExcluded(text) : !isRelevantForeign(text)) continue;
    const companies = companiesForApplicant(item.applicantName);
    // Set E: the applicant must actually be the searched competitor.
    if (job.company && !companies.includes(job.company)) continue;
    const base = baseRow(item, job.set, country, ctx.foundAt);
    const key = countryKey(country, no);
    // The FTO DB holds KR and US numbers only; EP digits are never checked against it.
    const inFto = country !== 'EP' && ctx.ftoAppNos.has(no);
    if (!inFto && !ctx.seenWatch.has(key)) {
      ctx.seenWatch.add(key);
      out.push({ id: `watch:${key}`, section: WATCH_SECTION, sort: base.sort, payload: { type: 'patent-watch', ...base.payload } });
    }
    if (companies.length && (country !== 'KR' || isRelevant(text)) && !ctx.seenCompetitor.has(key)) {
      ctx.seenCompetitor.add(key);
      out.push({
        id: `pcomp:${key}`,
        section: COMPETITOR_SECTION,
        sort: base.sort,
        payload: { type: 'patent-competitor', ...base.payload, companies },
      });
    }
  }
  return out;
}

// ── Pagination cursor ───────────────────────────────────────────────────────
export interface JobState {
  /** Last page fetched successfully (0 = none yet). */
  page: number;
  total: number | null;
  done: boolean;
}
/** Outcome of the last run that sent requests for one country (or for the KR status refresh). */
export interface CheckState {
  at: string;
  requests: number;
  /** Error summaries (status/result codes only — never URLs, which carry the key). */
  failures: string[];
}
export type CheckKey = Country | 'status';

/** Timing entry for one overseas request (never includes URLs or the access key). */
export interface OverseasTimingEntry {
  country: string;
  /** Job key (e.g. 'US-nel'). */
  job: string;
  /** Wall-clock milliseconds for this request; 0 for skipped entries. */
  ms: number;
  outcome: 'ok' | 'timeout' | 'error' | 'skipped';
}

export interface CursorState {
  /** Round-robin start index into the KR domestic subset of ALL_JOBS (SEARCH_JOBS). */
  offset: number;
  /**
   * Round-robin start index into the overseas subset of ALL_JOBS (US+EP interleaved).
   * Tracked separately so the domestic and overseas cursors advance independently.
   * Absent on legacy cursor rows written before overseas tracking was added (treated as 0).
   */
  foreignOffset?: number;
  jobs: Record<string, JobState>;
  /** Round-robin start index into the sorted KR FTO application numbers. */
  statusOffset?: number;
  /** Last overseas structure hint (see foreignDiag). */
  foreignDiag?: { at: string; job: string; tags: string };
  checks?: Partial<Record<CheckKey, CheckState>>;
  /**
   * Per-request timing for the most recent run's overseas phase only (no history).
   * Lets a single production run reveal the latency distribution without retaining old data.
   */
  overseasTiming?: OverseasTimingEntry[];
}

export const EMPTY_CURSOR: CursorState = { offset: 0, jobs: {} };

/**
 * Picks up to `budget` (job, page) requests, round-robin from `offset`. A job still
 * backfilling asks for its next page; a finished job re-checks page 1 for new filings.
 */
export function planRequests(jobs: SearchJob[], cursor: CursorState, budget: number): { job: SearchJob; page: number }[] {
  const plan: { job: SearchJob; page: number }[] = [];
  const n = Math.min(budget, jobs.length);
  for (let i = 0; i < n; i++) {
    const job = jobs[(cursor.offset + i) % jobs.length];
    const s = cursor.jobs[job.key];
    plan.push({ job, page: !s || s.done ? 1 : s.page + 1 });
  }
  return plan;
}

/**
 * Splits REQUEST_BUDGET for one run:
 *   - up to STATUS_BUDGET KR rights-status refreshes (round-robin over `statusAppNos`),
 *   - up to OVERSEAS_PER_RUN overseas applicant-search requests (round-robin via `foreignOffset`),
 *   - the remainder for KR domestic word-searches (round-robin via `offset`).
 *
 * Domestic and overseas are planned against separate round-robin offsets (`offset` and
 * `foreignOffset`) so each advances independently. The overseas pool is `jobs` filtered to
 * country-bearing entries, which preserves the interleaved US/EP order that ALL_JOBS builds;
 * consecutive positions alternate countries, so each run naturally covers both.
 *
 * Legacy cursor rows used `offset` as an index into ALL_JOBS (66 items). The modulo clamp
 * `(cursor.offset ?? 0) % krJobs.length` silently maps any out-of-range value to a valid
 * domestic index, so no migration is needed.
 */
export function planRun(jobs: SearchJob[], cursor: CursorState, statusAppNos: string[], budget = REQUEST_BUDGET) {
  const statusN = Math.min(STATUS_BUDGET, statusAppNos.length, budget);
  const statusOffset = cursor.statusOffset ?? 0;
  const status = Array.from({ length: statusN }, (_, i) => statusAppNos[(statusOffset + i) % statusAppNos.length]);

  const krJobs = jobs.filter((j) => !j.country);
  const foreignJobs = jobs.filter((j) => j.country);

  const remaining = budget - statusN;
  // Overseas capped per run so worst-case wall time fits within maxDuration.
  const foreignN = Math.min(OVERSEAS_PER_RUN, foreignJobs.length, remaining);
  const krN = Math.min(remaining - foreignN, krJobs.length);

  const krOffset = krJobs.length ? (cursor.offset ?? 0) % krJobs.length : 0;
  const foreignOffset = cursor.foreignOffset ?? 0;

  const kr = planRequests(krJobs, { ...cursor, offset: krOffset }, krN);
  const overseas: { job: SearchJob; page: number }[] = Array.from({ length: foreignN }, (_, i) => {
    const job = foreignJobs[(foreignOffset + i) % foreignJobs.length];
    const s = cursor.jobs[job.key];
    return { job, page: !s || s.done ? 1 : s.page + 1 };
  });

  return {
    kr,
    overseas,
    status,
    nextOffset: krJobs.length ? (krOffset + kr.length) % krJobs.length : 0,
    nextForeignOffset: foreignJobs.length ? (foreignOffset + foreignN) % foreignJobs.length : 0,
    nextStatusOffset: statusAppNos.length ? (statusOffset + statusN) % statusAppNos.length : 0,
  };
}

/** Distinct KR (13-digit) application numbers among FTO appNo fields, sorted for a stable rotation. */
export function krStatusTargets(appNos: (string | null | undefined)[]): string[] {
  return [...new Set(appNos.map(normalizeAppNo).filter((n) => n.length === 13))].sort();
}

export interface StatusRow {
  id: string;
  section: typeof STATUS_SECTION;
  sort: number;
  payload: { type: typeof STATUS_SECTION; appNo: string; registerStatus: string; checkedAt: string; source: 'KIPRIS' };
}

/** One auto-collected status row per KR application number (overwritten on every refresh). */
export function statusRow(appNo: string, registerStatus: string, checkedAt: string): StatusRow {
  const no = normalizeAppNo(appNo);
  return {
    id: `pstatus:${no}`,
    section: STATUS_SECTION,
    sort: 0,
    payload: { type: STATUS_SECTION, appNo: formatAppNo(no), registerStatus, checkedAt, source: 'KIPRIS' },
  };
}

/**
 * Overseas job state. The page size is unconfirmed, so completion uses the returned count and
 * total rather than ROWS. Results are newest first, so the backfill also stops at
 * FOREIGN_MAX_PAGES or once a page reaches filings older than MIN_FILED (`oldestFiled` 'YYYYMMDD' or '').
 */
export function advanceForeignJob(
  prev: JobState | undefined,
  page: number,
  count: number,
  total: number | null,
  oldestFiled: string,
): JobState {
  if (prev?.done) return { ...prev, total: total ?? prev.total };
  const done =
    count === 0 ||
    (total !== null && page * count >= total) ||
    page >= FOREIGN_MAX_PAGES ||
    (oldestFiled !== '' && oldestFiled < MIN_FILED);
  return { page, total, done };
}

/** State after a successful fetch of `page` returning `count` items out of `total`. */
export function advanceJob(prev: JobState | undefined, page: number, count: number, total: number | null, rows: number): JobState {
  if (prev?.done) return { ...prev, total: total ?? prev.total };
  const done = count < rows || (total !== null && page * rows >= total);
  return { page, total, done };
}

// ── Aggregation ─────────────────────────────────────────────────────────────
export interface CompetitorStatRow {
  /** Missing on rows written before overseas collection (= KR). */
  country?: string | null;
  companies?: string[];
  category?: string;
  filedDate?: string | null;
}

export interface StatBucket {
  label: string;
  total: number;
  byCategory: Record<PatentCategory, number>;
  byYear: Record<string, number>;
  byCountry: Record<Country, number>;
}

export interface CompetitorStats {
  groups: (StatBucket & { companies: StatBucket[] })[];
  years: string[];
  total: number;
}

function emptyBucket(label: string): StatBucket {
  return {
    label,
    total: 0,
    byCategory: { system: 0, 'gas-liquid': 0, transfer: 0, stack: 0, control: 0 },
    byYear: {},
    byCountry: { KR: 0, US: 0, EP: 0 },
  };
}

/** Country of a stored row; missing / unknown values count as KR (rows from before overseas collection). */
export function rowCountry(country: string | null | undefined): Country {
  return country === 'US' || country === 'EP' ? country : 'KR';
}

function add(b: StatBucket, cat: PatentCategory, year: string | null, country: Country) {
  b.total++;
  b.byCategory[cat]++;
  b.byCountry[country]++;
  if (year) b.byYear[year] = (b.byYear[year] ?? 0) + 1;
}

/**
 * Counts competitor filings by group → company, by category and by filing year.
 * A joint filing counts once for each competitor on it, and once per group.
 */
export function aggregateCompetitorStats(rows: CompetitorStatRow[]): CompetitorStats {
  const groups = COMPETITOR_GROUPS.map((g) => ({ ...emptyBucket(g.group), companies: g.companies.map(emptyBucket) }));
  const years = new Set<string>();
  let total = 0;
  for (const r of rows) {
    const cat = (Object.hasOwn(PATENT_CATEGORY_LABEL, r.category ?? '') ? r.category : 'system') as PatentCategory;
    const year = r.filedDate ? r.filedDate.slice(0, 4) : null;
    const country = rowCountry(r.country);
    const companies = [...new Set(r.companies ?? [])];
    let counted = false;
    for (const g of groups) {
      const hits = g.companies.filter((c) => companies.includes(c.label));
      if (!hits.length) continue;
      hits.forEach((c) => add(c, cat, year, country));
      add(g, cat, year, country);
      counted = true;
    }
    if (counted) {
      total++;
      if (year) years.add(year);
    }
  }
  return { groups, years: [...years].sort(), total };
}

// ── FTO competitor regrouping ───────────────────────────────────────────────
/**
 * KIPRIS company/group for one FTO applicant field, using the same alias map as the
 * watch. Joint filings take the first matching competitor in alias-map order.
 * null = applicant is not in the alias map (callers put it in a fallback bucket).
 */
export function competitorGroupFor(applicant: string | null | undefined): { company: string; group: string } | null {
  for (const company of companiesForApplicant(applicant)) {
    const group = groupOf(company);
    if (group) return { company, group };
  }
  return null;
}

// ── Watch list filtering ────────────────────────────────────────────────────
/** Filter bucket for watch rows whose applicant is not a tracked competitor. */
export const OTHER_APPLICANT_GROUP = '그 외 출원인';

export type WatchListRow = Pick<
  PatentWatchPayload,
  'appNo' | 'title' | 'applicant' | 'filedDate' | 'status' | 'link' | 'category' | 'matchedSet'
> & {
  /** Row id — unique across countries (appNo is not). */
  id: string;
  /** Missing on rows written before overseas collection (= KR). */
  country?: string | null;
};

export interface WatchFilter {
  /** Competitor group label, OTHER_APPLICANT_GROUP, or '' for all. */
  group: string;
  /** Competitor company label or '' for all. */
  company: string;
  /** Filing year ('2024') or '' for all. */
  year: string;
  /** 'KR' | 'US' | 'EP' or '' for all. */
  country: string;
  /** Case-insensitive substring over title, applicant and application number. */
  q: string;
}

export interface WatchFacets {
  groups: string[];
  companies: string[];
  years: string[];
}

/** Filter options present in `rows`: groups in COMPETITOR_GROUPS order (+ other), years newest first. */
export function watchFacets(rows: WatchListRow[]): WatchFacets {
  const companies = new Set<string>();
  const years = new Set<string>();
  let other = false;
  for (const r of rows) {
    const cs = companiesForApplicant(r.applicant);
    if (cs.length) cs.forEach((c) => companies.add(c));
    else other = true;
    if (r.filedDate) years.add(r.filedDate.slice(0, 4));
  }
  const allCompanies = COMPETITOR_GROUPS.flatMap((g) => g.companies);
  const groups = COMPETITOR_GROUPS.filter((g) => g.companies.some((c) => companies.has(c))).map((g) => g.group);
  return {
    groups: other ? [...groups, OTHER_APPLICANT_GROUP] : groups,
    companies: allCompanies.filter((c) => companies.has(c)),
    years: [...years].sort().reverse(),
  };
}

/** Rows matching every non-empty filter field, order preserved. */
export function filterWatchRows<T extends WatchListRow>(rows: T[], f: WatchFilter): T[] {
  const needle = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.group || f.company) {
      const cs = companiesForApplicant(r.applicant);
      if (f.company && !cs.includes(f.company)) return false;
      if (f.group === OTHER_APPLICANT_GROUP ? cs.length > 0 : f.group && !cs.some((c) => groupOf(c) === f.group)) {
        return false;
      }
    }
    if (f.year && (r.filedDate ?? '').slice(0, 4) !== f.year) return false;
    if (f.country && rowCountry(r.country) !== f.country) return false;
    if (!needle) return true;
    return [r.title, r.applicant, r.appNo].some((v) => (v ?? '').toLowerCase().includes(needle));
  });
}
