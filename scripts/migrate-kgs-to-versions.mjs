#!/usr/bin/env node
/**
 * One-off migration: static KGS files -> Supabase table kgs_code_versions.
 *
 * Reads (all under apps/web/data/):
 *   - kgs_sections/<CODE>.json   per-code section bodies       -> body (verbatim)
 *   - kgs_ocr.json               equation OCR keyed by code     -> body.ocr
 *   - kgs-canonical-toc.json     cross-code canonical TOC       -> toc (per-code projection)
 *   - kgs_pdfs/<CODE>_<YYMMDD>.pdf                              -> revision_date, source_pdf_path
 *
 * Inserts one status='active' row per code. Idempotent: rows whose
 * (code, revision_date) already exist are skipped (on_conflict ... ignore-duplicates).
 * A code with no matching PDF still gets a row with revision_date 1970-01-01.
 *
 * Usage (from repo root):
 *   node --env-file=apps/web/.env.local scripts/migrate-kgs-to-versions.mjs --dry-run
 *   node --env-file=apps/web/.env.local scripts/migrate-kgs-to-versions.mjs
 *
 * Env (real run only): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'apps', 'web', 'data');
const SECTIONS_DIR = path.join(DATA, 'kgs_sections');
const PDF_DIR = path.join(DATA, 'kgs_pdfs');
const OCR_FILE = path.join(DATA, 'kgs_ocr.json');
const TOC_FILE = path.join(DATA, 'kgs-canonical-toc.json');

const NO_PDF_DATE = '1970-01-01';
const TABLE = 'kgs_code_versions';
const DRY_RUN = process.argv.includes('--dry-run');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));

/** "AC116_260211.pdf" / "AC411-260508.pdf" -> { code, date: "2026-02-11" } */
function parsePdfName(file) {
  const m = /^([A-Z0-9]+)[_-](\d{2})(\d{2})(\d{2})\.pdf$/i.exec(file);
  if (!m) return null;
  return { code: m[1].toUpperCase(), date: `20${m[2]}-${m[3]}-${m[4]}` };
}

/** Per-code projection of the cross-code canonical TOC (see 001_kgs_code_versions.sql). */
function projectToc(toc, code) {
  const fam = (toc.families ?? []).find((f) => (f.members ?? []).includes(code)) ?? null;
  const cellsOf = (entries) =>
    (entries ?? [])
      .filter((e) => e.codes && Object.prototype.hasOwnProperty.call(e.codes, code))
      .map((e) => ({ sec_no: e.sec_no, title: e.title, level: e.level, cell: e.codes[code] }));
  return {
    version: toc.version ?? null,
    family_id: fam ? fam.id : null,
    family: fam ? cellsOf(fam.canonical_toc) : [],
    universal: cellsOf(toc.universal),
  };
}

function buildRows() {
  const ocr = readJson(OCR_FILE);
  const toc = readJson(TOC_FILE);

  const sectionFiles = new Map(
    readdirSync(SECTIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.replace(/\.json$/, ''), path.join(SECTIONS_DIR, f)])
  );

  const pdfByCode = new Map();
  const pdfNotes = [];
  for (const f of readdirSync(PDF_DIR)) {
    const p = parsePdfName(f);
    if (!p) continue;
    const prev = pdfByCode.get(p.code);
    if (prev) pdfNotes.push(`${p.code}: multiple PDFs (${prev.file}, ${f}) — using latest date`);
    if (!prev || p.date > prev.date) pdfByCode.set(p.code, { date: p.date, file: f });
  }

  const codes = new Set([...Object.keys(ocr).filter((k) => k !== '_meta'), ...sectionFiles.keys()]);
  for (const fam of toc.families ?? []) for (const m of fam.members ?? []) codes.add(m);
  for (const e of toc.universal ?? []) for (const c of Object.keys(e.codes ?? {})) codes.add(c);

  const rows = [];
  const notes = [...pdfNotes];
  for (const code of [...codes].sort()) {
    const secPath = sectionFiles.get(code);
    const sectionsDoc = secPath ? readJson(secPath) : null;
    if (!sectionsDoc) notes.push(`${code}: no kgs_sections/${code}.json — body has OCR only`);
    const pdf = pdfByCode.get(code);
    if (!pdf) notes.push(`${code}: no PDF in kgs_pdfs/ — revision_date=${NO_PDF_DATE}`);
    if (pdf && sectionsDoc?.version_date && sectionsDoc.version_date !== pdf.date) {
      notes.push(`${code}: PDF date ${pdf.date} != sections version_date ${sectionsDoc.version_date} (PDF date used)`);
    }
    rows.push({
      code,
      revision_date: pdf ? pdf.date : NO_PDF_DATE,
      title: sectionsDoc?.title ?? null,
      toc: projectToc(toc, code),
      body: { ...(sectionsDoc ?? {}), ocr: ocr[code] ?? {} },
      source_pdf_path: pdf ? `apps/web/data/kgs_pdfs/${pdf.file}` : null,
      status: 'active',
      uploaded_by: 'migrate-kgs-to-versions',
    });
  }
  return { rows, notes };
}

async function insertRow(baseUrl, key, row) {
  const res = await fetch(`${baseUrl}/rest/v1/${TABLE}?on_conflict=code,revision_date`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const inserted = await res.json();
  return Array.isArray(inserted) && inserted.length > 0;
}

async function main() {
  const { rows, notes } = buildRows();

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}KGS codes to migrate: ${rows.length}`);
  console.log('code    revision_date  sections  appendix  ocr_regions  toc_cells  pdf');
  for (const r of rows) {
    const secs = r.body.sections?.length ?? 0;
    const apps = r.body.appendix_sections?.length ?? 0;
    const ocrN = Object.keys(r.body.ocr).length;
    const tocN = r.toc.family.length + r.toc.universal.length;
    console.log(
      `${r.code.padEnd(8)}${r.revision_date.padEnd(15)}${String(secs).padStart(8)}${String(apps).padStart(10)}` +
        `${String(ocrN).padStart(13)}${String(tocN).padStart(11)}  ${r.source_pdf_path ?? '(none)'}`
    );
  }
  const noPdf = rows.filter((r) => r.revision_date === NO_PDF_DATE).map((r) => r.code);
  console.log(`codes without PDF (revision_date=${NO_PDF_DATE}): ${noPdf.length ? noPdf.join(', ') : '(none)'}`);
  for (const n of notes) console.log(`note: ${n}`);

  if (DRY_RUN) {
    console.log('[dry-run] no rows written.');
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (use --env-file).');
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (await insertRow(baseUrl, key, row)) {
        inserted++;
        console.log(`inserted ${row.code} ${row.revision_date}`);
      } else {
        skipped++;
        console.log(`skipped  ${row.code} ${row.revision_date} (already exists)`);
      }
    } catch (err) {
      failed++;
      console.error(`FAILED   ${row.code} ${row.revision_date}: ${err.message}`);
    }
  }
  console.log(`done: inserted=${inserted} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
