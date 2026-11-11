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

export interface SearchJob {
  key: string;
  /** Watch set A–F. */
  set: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  /** getWordSearch `word` value. Space-separated terms are AND-matched (추정). */
  word: string;
  /** Set E only: the competitor label this applicant search is for. */
  company?: string;
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
];

const RELEVANT = /수전해|전해|전기\s?분해|electroly/i;

/** Mentions electrolysis (guards competitor stats against off-topic applicant hits). */
export function isRelevant(text: string): boolean {
  return RELEVANT.test(text);
}

export function isExcluded(text: string): boolean {
  return EXCLUDE_WORDS.some((w) => text.includes(w));
}

// ── Competitors ─────────────────────────────────────────────────────────────
/** Labels match the news tab's COMPANIES labels (intel-news cron). */
export const COMPETITOR_GROUPS: { group: string; companies: string[] }[] = [
  { group: '자동차 업체', companies: ['현대차', 'Toyota', 'Honda'] },
  { group: '수전해 전문업체', companies: ['NEL', 'ITM Power', 'Plug Power', 'Accelera'] },
  { group: '에너지·플랜트(EPC)', companies: ['Siemens Energy', '삼성E&A', '포스코홀딩스'] },
];

// Matched as substrings of the normalized applicant name (lowercase, no spaces/punctuation).
const APPLICANT_ALIASES: [string, string[]][] = [
  ['현대차', ['현대자동차', '기아주식회사', '기아자동차', 'hyundaimotor', 'kiacorporation', 'kiamotors']],
  ['Toyota', ['도요타', '토요타', 'toyota']],
  ['Honda', ['혼다', 'honda']],
  ['NEL', ['넬에이에스에이', '넬하이드로젠', 'nelasa', 'nelhydrogen']],
  ['ITM Power', ['아이티엠파워', 'itmpower']],
  ['Plug Power', ['플러그파워', 'plugpower']],
  ['Accelera', ['하이드로제닉스', 'hydrogenics', '액셀레라', 'accelera', '커민스', 'cummins']],
  ['Siemens Energy', ['지멘스', 'siemens']],
  ['삼성E&A', ['삼성이앤에이', '삼성엔지니어링', 'samsungea', 'samsungengineering']],
  ['포스코홀딩스', ['포스코', 'posco']],
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

// ── Rows ────────────────────────────────────────────────────────────────────
export interface PatentWatchPayload {
  type: 'patent-watch' | 'patent-competitor';
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
/** Sections owned by this feature — never rendered as content blocks. */
export const PATENT_DATA_SECTIONS = [WATCH_SECTION, COMPETITOR_SECTION, CURSOR_SECTION];

const SUMMARY_MAX = 500;

function baseRow(item: KiprisItem, set: SearchJob['set'], foundAt: string) {
  const filedDate = formatDate(item.applicationDate);
  return {
    sort: filedDate ? Number(filedDate.replace(/-/g, '')) : 0,
    payload: {
      appNo: formatAppNo(item.applicationNumber),
      title: item.inventionTitle,
      applicant: item.applicantName,
      filedDate,
      pubDate: formatDate(item.openDate),
      regDate: formatDate(item.registerDate),
      status: item.registerStatus,
      ipc: item.ipcNumber,
      summary: item.astrtCont.slice(0, SUMMARY_MAX),
      link: kiprisLink(item.applicationNumber),
      category: autoCategory(item.inventionTitle, item.astrtCont),
      categorySource: 'auto' as const,
      verdict: null,
      matchedSet: set,
      foundAt,
    },
  };
}

/**
 * Turns one job's search hits into rows to insert. Watch rows skip appNos in `known`
 * (FTO records); competitor rows are kept for every relevant competitor filing.
 * Within-run duplicates are dropped via the shared `seen` sets.
 */
export function rowsFromItems(
  items: KiprisItem[],
  job: SearchJob,
  ctx: { ftoAppNos: Set<string>; seenWatch: Set<string>; seenCompetitor: Set<string>; foundAt: string },
): PatentRow[] {
  const out: PatentRow[] = [];
  for (const item of items) {
    const no = normalizeAppNo(item.applicationNumber);
    const filed = item.applicationDate.replace(/\D/g, '');
    if (!no || (filed && filed < MIN_FILED)) continue;
    const text = `${item.inventionTitle} ${item.astrtCont}`;
    if (isExcluded(text)) continue;
    const companies = companiesForApplicant(item.applicantName);
    // Set E: the applicant must actually be the searched competitor.
    if (job.company && !companies.includes(job.company)) continue;
    const base = baseRow(item, job.set, ctx.foundAt);
    if (!ctx.ftoAppNos.has(no) && !ctx.seenWatch.has(no)) {
      ctx.seenWatch.add(no);
      out.push({ id: `watch:${no}`, section: WATCH_SECTION, sort: base.sort, payload: { type: 'patent-watch', ...base.payload } });
    }
    if (companies.length && isRelevant(text) && !ctx.seenCompetitor.has(no)) {
      ctx.seenCompetitor.add(no);
      out.push({
        id: `pcomp:${no}`,
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
export interface CursorState {
  /** Round-robin start index into SEARCH_JOBS. */
  offset: number;
  jobs: Record<string, JobState>;
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

/** State after a successful fetch of `page` returning `count` items out of `total`. */
export function advanceJob(prev: JobState | undefined, page: number, count: number, total: number | null, rows: number): JobState {
  if (prev?.done) return { ...prev, total: total ?? prev.total };
  const done = count < rows || (total !== null && page * rows >= total);
  return { page, total, done };
}

// ── Aggregation ─────────────────────────────────────────────────────────────
export interface CompetitorStatRow {
  companies?: string[];
  category?: string;
  filedDate?: string | null;
}

export interface StatBucket {
  label: string;
  total: number;
  byCategory: Record<PatentCategory, number>;
  byYear: Record<string, number>;
}

export interface CompetitorStats {
  groups: (StatBucket & { companies: StatBucket[] })[];
  years: string[];
  total: number;
}

function emptyBucket(label: string): StatBucket {
  return { label, total: 0, byCategory: { system: 0, 'gas-liquid': 0, transfer: 0, stack: 0, control: 0 }, byYear: {} };
}

function add(b: StatBucket, cat: PatentCategory, year: string | null) {
  b.total++;
  b.byCategory[cat]++;
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
    const companies = [...new Set(r.companies ?? [])];
    let counted = false;
    for (const g of groups) {
      const hits = g.companies.filter((c) => companies.includes(c.label));
      if (!hits.length) continue;
      hits.forEach((c) => add(c, cat, year));
      add(g, cat, year);
      counted = true;
    }
    if (counted) {
      total++;
      if (year) years.add(year);
    }
  }
  return { groups, years: [...years].sort(), total };
}
