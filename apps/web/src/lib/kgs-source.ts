/**
 * Single server-side read path for KGS CODE data.
 *
 * KGS_SOURCE=db  -> newest status='active' row per code in Supabase `kgs_code_versions`
 *                   (see supabase/migrations/001_kgs_code_versions.sql for the jsonb layout).
 * anything else  -> static files under apps/web/data/ (default; unchanged behaviour).
 *
 * In db mode any failure (missing env, network, missing table, no row) falls back to
 * the static files and logs a one-line warning. Results in db mode are cached for
 * DB_CACHE_TTL_MS so a newly activated revision shows up without a redeploy.
 */
import { promises as fs } from 'fs';
import path from 'path';

export type KgsSourceMode = 'file' | 'db';

export interface KgsSectionsDoc {
  sections: unknown[];
  appendix_sections?: unknown[];
  [key: string]: unknown;
}

export interface KgsOcrEntry {
  ocr_text: string;
  ocr_confidence: number;
  ocr_good: boolean;
}

/** code -> regionId -> OCR entry (the `_meta` key of kgs_ocr.json is stripped). */
export type KgsOcrIndex = Record<string, Record<string, KgsOcrEntry>>;

interface TocCellEntry {
  sec_no: string;
  codes?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CanonicalToc {
  families?: Array<{ id: string; canonical_toc?: TocCellEntry[]; [key: string]: unknown }>;
  universal?: TocCellEntry[];
  [key: string]: unknown;
}

/** Per-code TOC projection stored in kgs_code_versions.toc. */
interface TocProjection {
  family_id?: string | null;
  family?: Array<{ sec_no: string; cell: unknown }>;
  universal?: Array<{ sec_no: string; cell: unknown }>;
}

const DB_CACHE_TTL_MS = 60_000;
const DB_TIMEOUT_MS = 5_000;
const TABLE = 'kgs_code_versions';

const dataPath = (...parts: string[]) => path.join(process.cwd(), 'data', ...parts);

export function getKgsSourceMode(): KgsSourceMode {
  return process.env.KGS_SOURCE === 'db' ? 'db' : 'file';
}

// --- static file readers (cached for the process lifetime, as before) -------

const fileSectionsCache = new Map<string, KgsSectionsDoc>();
let fileOcrCache: KgsOcrIndex | null = null;
let fileTocCache: CanonicalToc | null = null;

/** Throws like fs.readFile (ENOENT when the code has no file). */
async function readSectionsFile(code: string): Promise<KgsSectionsDoc> {
  const hit = fileSectionsCache.get(code);
  if (hit) return hit;
  const raw = await fs.readFile(dataPath('kgs_sections', `${code}.json`), 'utf-8');
  const doc = JSON.parse(raw) as KgsSectionsDoc;
  fileSectionsCache.set(code, doc);
  return doc;
}

/** Never throws: a missing/broken OCR file yields an empty index. */
async function readOcrFile(): Promise<KgsOcrIndex> {
  if (fileOcrCache) return fileOcrCache;
  try {
    const parsed = JSON.parse(await fs.readFile(dataPath('kgs_ocr.json'), 'utf-8')) as Record<string, unknown>;
    delete parsed._meta;
    fileOcrCache = parsed as KgsOcrIndex;
  } catch {
    fileOcrCache = {};
  }
  return fileOcrCache;
}

async function readTocFile(): Promise<CanonicalToc> {
  if (fileTocCache) return fileTocCache;
  const raw = await fs.readFile(dataPath('kgs-canonical-toc.json'), 'utf-8');
  fileTocCache = JSON.parse(raw) as CanonicalToc;
  return fileTocCache;
}

// --- Supabase REST -----------------------------------------------------------

async function queryVersions<T>(params: Record<string, string>): Promise<T[]> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  const qs = new URLSearchParams({ status: 'eq.active', ...params });
  const res = await fetch(`${baseUrl}/rest/v1/${TABLE}?${qs.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()) as T[];
  if (!Array.isArray(rows)) throw new Error('unexpected response');
  return rows;
}

/** Keep only the first row per code (rows must be ordered code asc, revision_date desc). */
function latestPerCode<T extends { code: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
}

const dbCache = new Map<string, { expires: number; result: Promise<unknown> }>();

/**
 * Run `fromDb`, falling back to `fromFile` (with one warning line) on any error.
 * The outcome — DB value, fallback value, or the fallback's error (e.g. ENOENT ->
 * route 404) — is cached for DB_CACHE_TTL_MS, so a broken DB warns once per TTL.
 */
function viaDb<T>(cacheKey: string, fromDb: () => Promise<T>, fromFile: () => Promise<T>): Promise<T> {
  const hit = dbCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.result as Promise<T>;
  const result = fromDb().catch((err: unknown) => {
    console.warn(`[kgs-source] db read failed for ${cacheKey}, falling back to static files: ${(err as Error).message}`);
    return fromFile();
  });
  result.catch(() => {}); // rejection is observed by the caller; avoid unhandled-rejection noise
  dbCache.set(cacheKey, { expires: Date.now() + DB_CACHE_TTL_MS, result });
  return result;
}

// --- public API --------------------------------------------------------------

/** Section document for one code (kgs_sections/<code>.json shape). Throws ENOENT when absent. */
export async function getKgsSectionsDoc(code: string): Promise<KgsSectionsDoc> {
  if (getKgsSourceMode() !== 'db') return readSectionsFile(code);
  return viaDb(
    `sections:${code}`,
    async () => {
      const rows = await queryVersions<{ body: KgsSectionsDoc | null }>({
        select: 'body',
        code: `eq.${code}`,
        order: 'revision_date.desc',
        limit: '1',
      });
      const body = rows[0]?.body;
      if (!body || !Array.isArray(body.sections)) throw new Error(`no active row for ${code}`);
      return body;
    },
    () => readSectionsFile(code)
  );
}

/** Equation OCR index for all codes. Codes missing from the DB keep their file entry. */
export async function getKgsOcrIndex(): Promise<KgsOcrIndex> {
  if (getKgsSourceMode() !== 'db') return readOcrFile();
  return viaDb(
    'ocr',
    async () => {
      const rows = await queryVersions<{ code: string; ocr: Record<string, KgsOcrEntry> | null }>({
        select: 'code,ocr:body->ocr',
        order: 'code.asc,revision_date.desc',
      });
      if (rows.length === 0) throw new Error('no active rows');
      const index: KgsOcrIndex = { ...(await readOcrFile()) };
      for (const r of latestPerCode(rows)) if (r.ocr) index[r.code] = r.ocr;
      return index;
    },
    readOcrFile
  );
}

/** Overlay per-code TOC cells from DB rows onto the cross-code skeleton (mutates `toc`). */
function overlayTocCells(toc: CanonicalToc, code: string, proj: TocProjection): void {
  const apply = (entries: TocCellEntry[] | undefined, cells: TocProjection['family']) => {
    if (!entries || !cells) return;
    const bySecNo = new Map(cells.map((c) => [c.sec_no, c.cell]));
    for (const e of entries) {
      if (e.codes && Object.prototype.hasOwnProperty.call(e.codes, code) && bySecNo.has(e.sec_no)) {
        e.codes[code] = bySecNo.get(e.sec_no);
      }
    }
  };
  const fam = toc.families?.find((f) => f.id === proj.family_id);
  apply(fam?.canonical_toc, proj.family);
  apply(toc.universal, proj.universal);
}

/**
 * Canonical cross-code TOC (kgs-canonical-toc.json shape). In db mode the per-code
 * cells come from each code's active row; family labels/members/order stay static.
 */
export async function getKgsCanonicalToc(): Promise<unknown> {
  if (getKgsSourceMode() !== 'db') return readTocFile();
  return viaDb(
    'toc',
    async () => {
      const rows = await queryVersions<{ code: string; toc: TocProjection | null }>({
        select: 'code,toc',
        order: 'code.asc,revision_date.desc',
      });
      if (rows.length === 0) throw new Error('no active rows');
      const toc = structuredClone(await readTocFile());
      for (const r of latestPerCode(rows)) if (r.toc) overlayTocCells(toc, r.code, r.toc);
      return toc;
    },
    readTocFile
  );
}

/** Test-only: drop every cache. */
export function __resetKgsSourceCache(): void {
  fileSectionsCache.clear();
  fileOcrCache = null;
  fileTocCache = null;
  dbCache.clear();
}
