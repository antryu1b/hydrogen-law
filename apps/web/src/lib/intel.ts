import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { COMPETITOR_DATA_SECTIONS, COMPETITOR_WATCH_SECTION, type SiteSnapshot } from '@/lib/competitor-watch';
import {
  COMPETITOR_SECTION,
  CURSOR_ID,
  PATENT_DATA_SECTIONS,
  STATUS_SECTION,
  WATCH_SECTION,
  type CheckKey,
  type CheckState,
  type CompetitorStatRow,
  type WatchListRow,
} from '@/lib/patent-watch';

// ── Content block model (produced by scripts/intel/extract.mjs) ─────────────
export interface IntelLink {
  label: string;
  url: string;
}
export interface TableCell {
  t: string;
  best?: string;
  hl?: boolean;
  zero?: boolean;
  span?: number;
  links?: IntelLink[];
}
export type IntelBlock =
  | { type: 'heading'; title: string; desc?: string }
  | { type: 'text'; text: string; tone?: 'info'; links?: IntelLink[] }
  | { type: 'line'; text: string; badges?: string[]; strong?: boolean; links?: IntelLink[] }
  | { type: 'kv'; label: string; text: string; links?: IntelLink[] }
  | { type: 'list'; items: string[] }
  | { type: 'stats'; items: { label: string; value: string; desc?: string }[] }
  | { type: 'table'; headers: string[]; rows: TableCell[][]; hlCol?: number }
  | { type: 'card'; blocks: IntelBlock[] }
  | { type: 'details'; title: string; badges?: string[]; blocks: IntelBlock[] }
  | { type: 'tabs'; tabs: { label: string; blocks: IntelBlock[]; divider?: boolean }[] };

export interface BlockRow {
  id: string;
  section: string;
  sort: number;
  payload: IntelBlock;
  updated_at: string;
}

export interface FtoRecord {
  no: number;
  category?: string;
  appNo?: string;
  title?: string;
  applicant?: string;
  status?: string;
  verdict?: string;
  reason?: string;
  link?: string;
  filedDate?: string;
}

export interface NewsRow {
  url: string;
  title: string;
  published_at: string | null;
  category: string | null;
  company: string | null;
  source: string;
  payload: { variants?: { date: string | null; title: string }[]; publisher?: string } | null;
  created_at: string;
}

export const INTEL_TABLES = ['intel_news', 'intel_competitors', 'intel_patents'] as const;
export type IntelTable = (typeof INTEL_TABLES)[number];

export function intelSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Only render http(s) links — guards against javascript: URLs in uploaded JSON. */
export function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

export interface Loaded<T> {
  rows: T[];
  lastUpdated: string | null;
  error: string | null;
}

function describeError(message: string): string {
  // PostgREST: relation does not exist → tables not created yet.
  if (/does not exist|schema cache|Could not find the table/i.test(message)) {
    return '테이블이 아직 없습니다. docs/intel-schema.sql 을 Supabase SQL Editor 에서 실행한 뒤 시드를 넣어 주세요.';
  }
  return message;
}

const PAGE = 1000;

async function selectAll<T>(
  sb: SupabaseClient,
  table: IntelTable,
  columns: string,
  order: { column: string; ascending: boolean },
  excludeSections?: string[],
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(columns);
    if (excludeSections) q = q.not('section', 'in', `(${excludeSections.join(',')})`);
    const { data, error } = await q
      .order(order.column, { ascending: order.ascending })
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: describeError(error.message) };
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

const NOT_CONFIGURED = 'Supabase 환경변수가 설정되지 않았습니다.';

export async function loadBlocks(table: 'intel_competitors' | 'intel_patents'): Promise<Loaded<BlockRow>> {
  const sb = intelSupabase();
  if (!sb) return { rows: [], lastUpdated: null, error: NOT_CONFIGURED };
  const { rows, error } = await selectAll<BlockRow>(
    sb,
    table,
    // FTO records (section = 'fto') are loaded separately and trimmed by loadFto;
    // KIPRIS watch/competitor rows by loadPatentWatch; official-site snapshots by loadCompetitorWatch.
    'id,section,sort,updated_at,payload',
    { column: 'sort', ascending: true },
    table === 'intel_patents' ? ['fto', ...PATENT_DATA_SECTIONS] : [...COMPETITOR_DATA_SECTIONS],
  );
  const lastUpdated = rows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
  return { rows, lastUpdated, error };
}

/** FTO review records, trimmed to the fields the list shows (full rows carry claims/summaries). */
export async function loadFto(): Promise<Loaded<FtoRecord>> {
  const sb = intelSupabase();
  if (!sb) return { rows: [], lastUpdated: null, error: NOT_CONFIGURED };
  const rows: FtoRecord[] = [];
  let lastUpdated: string | null = null;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('intel_patents')
      .select(
        'updated_at,no:payload->no,category:payload->>category,appNo:payload->>appNo,title:payload->>title,' +
          'applicant:payload->>applicant,status:payload->>status,verdict:payload->>verdict,reason:payload->>reason,' +
          'link:payload->>link,filedDate:payload->>filedDate',
      )
      .eq('section', 'fto')
      .order('sort', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows: [], lastUpdated: null, error: describeError(error.message) };
    for (const r of (data ?? []) as unknown as (FtoRecord & { updated_at: string })[]) {
      const { updated_at, ...rec } = r;
      if (!lastUpdated || updated_at > lastUpdated) lastUpdated = updated_at;
      rows.push(rec);
    }
    if (!data || data.length < PAGE) break;
  }
  return { rows, lastUpdated, error: null };
}

/** Rows of one KIPRIS section, newest filing first (id breaks ties); stops after `max` rows when given. */
async function loadPatentSection<T>(section: string, columns: string, max = Infinity): Promise<Loaded<T>> {
  const sb = intelSupabase();
  if (!sb) return { rows: [], lastUpdated: null, error: NOT_CONFIGURED };
  const rows: T[] = [];
  let lastUpdated: string | null = null;
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await sb
      .from('intel_patents')
      .select(`updated_at,${columns}`)
      .eq('section', section)
      .order('sort', { ascending: false })
      .order('id', { ascending: true })
      .range(from, Math.min(from + PAGE, max) - 1);
    if (error) return { rows: [], lastUpdated: null, error: describeError(error.message) };
    for (const r of (data ?? []) as unknown as (T & { updated_at: string })[]) {
      const { updated_at, ...rec } = r;
      if (!lastUpdated || updated_at > lastUpdated) lastUpdated = updated_at;
      rows.push(rec as T);
    }
    if (!data || data.length < PAGE) break;
  }
  return { rows, lastUpdated, error: null };
}

/**
 * Upper bound on watch rows sent to the page. The cron keeps adding rows, and the list is
 * filtered client-side, so only the newest PATENT_WATCH_MAX filings (sort = filing date desc)
 * are loaded; older ones stay in the table but are not shown.
 */
export const PATENT_WATCH_MAX = 2000;

/** KIPRIS watch rows (written by /api/cron/kipris-patents), newest filing first, trimmed to list fields. */
export async function loadPatentWatch(): Promise<Loaded<WatchListRow>> {
  return loadPatentSection(
    WATCH_SECTION,
    'id,country:payload->>country,appNo:payload->>appNo,title:payload->>title,applicant:payload->>applicant,' +
      'filedDate:payload->>filedDate,status:payload->>status,link:payload->>link,category:payload->>category,' +
      'matchedSet:payload->>matchedSet',
    PATENT_WATCH_MAX,
  );
}

/** Competitor filings trimmed to what the statistics need. */
export async function loadCompetitorPatents(): Promise<Loaded<CompetitorStatRow>> {
  return loadPatentSection(
    COMPETITOR_SECTION,
    'country:payload->>country,companies:payload->companies,category:payload->>category,filedDate:payload->>filedDate',
  );
}

/** Auto-collected KR rights status (cron 'patent-status' rows) — separate from the reviewed FTO fields. */
export interface AutoStatus {
  appNo: string;
  registerStatus: string;
  checkedAt: string;
}

export async function loadPatentStatus(): Promise<Loaded<AutoStatus>> {
  return loadPatentSection(
    STATUS_SECTION,
    'appNo:payload->>appNo,registerStatus:payload->>registerStatus,checkedAt:payload->>checkedAt',
  );
}

export interface LoadedChecks {
  checks: Partial<Record<CheckKey, CheckState>> | null;
  error: string | null;
}

/** Last per-country collection result from the cron cursor row. */
export async function loadPatentChecks(): Promise<LoadedChecks> {
  const sb = intelSupabase();
  if (!sb) return { checks: null, error: null };
  const { data, error } = await sb.from('intel_patents').select('checks:payload->checks').eq('id', CURSOR_ID).maybeSingle();
  if (error) return { checks: null, error: describeError(error.message) };
  if (!data) return { checks: null, error: null };
  return {
    checks: (data as { checks: Partial<Record<CheckKey, CheckState>> | null }).checks ?? null,
    error: null,
  };
}

/** Official-site snapshots written by /api/cron/competitor-sites, in registry order. */
export async function loadCompetitorWatch(): Promise<Loaded<SiteSnapshot>> {
  const sb = intelSupabase();
  if (!sb) return { rows: [], lastUpdated: null, error: NOT_CONFIGURED };
  const { data, error } = await sb
    .from('intel_competitors')
    .select('payload,updated_at')
    .eq('section', COMPETITOR_WATCH_SECTION)
    .order('sort', { ascending: true });
  if (error) return { rows: [], lastUpdated: null, error: describeError(error.message) };
  const rows = (data ?? []) as { payload: SiteSnapshot; updated_at: string }[];
  const lastUpdated = rows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
  return { rows: rows.map((r) => r.payload), lastUpdated, error: null };
}

export async function loadNews(limit = 500): Promise<Loaded<NewsRow>> {
  const sb = intelSupabase();
  if (!sb) return { rows: [], lastUpdated: null, error: NOT_CONFIGURED };
  const { data, error } = await sb
    .from('intel_news')
    .select('url,title,published_at,category,company,source,payload,created_at')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return { rows: [], lastUpdated: null, error: describeError(error.message) };
  const rows = (data ?? []) as NewsRow[];
  const { data: latest } = await sb
    .from('intel_news')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  const lastUpdated = (latest?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
  return { rows, lastUpdated, error: null };
}

export function formatKst(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
}
