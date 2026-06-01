/**
 * ocr-kgs.mjs — Offline precompute of free Tesseract OCR for KGS equation/table
 * crops, with a confidence + text-quality gate so a legal site never shows
 * garbled OCR.
 *
 * For every equation_region across apps/web/data/kgs_sections/*.json it:
 *   1. renders the bbox crop at 150 DPI via pdftoppm (same DPI as the web app),
 *   2. runs Tesseract (kor+eng, --oem 1 --psm 6) for text + per-word confidence,
 *   3. computes a composite "good" gate (see GATE below),
 *   4. writes { ocr_text, ocr_confidence, ocr_good } into a sidecar
 *      apps/web/data/kgs_ocr.json keyed by code -> regionId.
 *
 * The render layer reads ocr_good: true  -> show ocr_text as readable text,
 *                        ocr_good: false -> show "원본 PDF에서 확인" + page link.
 *
 * WHY the composite gate (not conf alone): the pilot showed Tesseract is
 * "confident" (80-88) about garbage in the narrow left-margin equation-number
 * columns. Real legal text is Hangul-dominated, multi-char lines. So a region
 * is "good" only when it has enough real Korean content.
 *
 * NOTE: identical crops (same page+bbox) recur across duplicated sec_nos in the
 * source data; we OCR each unique crop once and reuse the result.
 *
 * Usage:
 *   node scripts/ocr-kgs.mjs                # all codes
 *   node scripts/ocr-kgs.mjs AH271 FU211    # specific codes
 */
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execFileP = promisify(execFile);

const DPI = 150;
const SCALE = DPI / 72;
const ROOT = path.resolve(process.cwd());
const WEB = path.join(ROOT, 'apps', 'web');
const SECTIONS_DIR = path.join(WEB, 'data', 'kgs_sections');
const PDF_DIR = path.join(WEB, 'data', 'kgs_pdfs');
const OUT_FILE = path.join(WEB, 'data', 'kgs_ocr.json');

// --- GATE: confidence floor + composite text-quality ------------------------
// Tuned conservatively from the pilot: false positives (showing garbled text as
// if authoritative) are the dangerous failure on a legal site, so the gate errs
// toward fallback. Every reliably-correct pilot region had hangul>=10 AND
// mean line length>=8 (real prose/tables); borderline garbage had short lines.
const CONF_MIN = 60; // mean per-word confidence floor (pilot-derived)
const MIN_HANGUL = 10; // need real Korean content
const MIN_HANGUL_RATIO = 0.35; // not symbol soup
const MIN_MEAN_LINE_LEN = 8; // not short 1-2 char column / fragment strips

function textQuality(text) {
  const hangul = (text.match(/[가-힣]/g) || []).length;
  const total = text.replace(/\s/g, '').length;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const meanLineLen = lines.length ? total / lines.length : 0;
  const hangulRatio = total ? hangul / total : 0;
  return { hangul, hangulRatio, meanLineLen };
}

function isGood(conf, text) {
  const q = textQuality(text);
  return (
    conf >= CONF_MIN &&
    q.hangul >= MIN_HANGUL &&
    q.hangulRatio >= MIN_HANGUL_RATIO &&
    q.meanLineLen >= MIN_MEAN_LINE_LEN
  );
}

// --- render + ocr (proven in ocr-pilot.mjs) ---------------------------------
async function findPdfPath(code) {
  const entries = await fs.readdir(PDF_DIR);
  const match = entries.find(
    (e) => (e.startsWith(`${code}-`) || e.startsWith(`${code}_`)) && e.endsWith('.pdf')
  );
  return match ? path.join(PDF_DIR, match) : null;
}

async function renderCrop(pdfPath, page, bbox, outPng) {
  const [x0, y0, x1, y1] = bbox;
  const x = Math.floor(x0 * SCALE);
  const y = Math.floor(y0 * SCALE);
  const w = Math.max(1, Math.ceil((x1 - x0) * SCALE));
  const h = Math.max(1, Math.ceil((y1 - y0) * SCALE));
  const prefix = outPng.replace(/\.png$/, '');
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  for (const f of await fs.readdir(dir)) {
    if (f.startsWith(base + '-') && f.endsWith('.png')) {
      await fs.rm(path.join(dir, f), { force: true });
    }
  }
  await execFileP('pdftoppm', [
    '-png', '-r', String(DPI),
    '-f', String(page), '-l', String(page),
    '-x', String(x), '-y', String(y), '-W', String(w), '-H', String(h),
    pdfPath, prefix,
  ]);
  const produced = (await fs.readdir(dir)).find(
    (f) => f.startsWith(base + '-') && f.endsWith('.png')
  );
  if (!produced) return false;
  await fs.rename(path.join(dir, produced), outPng);
  return true;
}

// tesseract/leptonica fails on absolute paths under sandbox; pass basename + cwd.
async function tess(pngPath, extraArgs) {
  const cwd = path.dirname(pngPath);
  const base = path.basename(pngPath);
  const { stdout } = await execFileP(
    'tesseract',
    [base, 'stdout', '-l', 'kor+eng', '--oem', '1', '--psm', '6', ...extraArgs],
    { cwd, maxBuffer: 32 * 1024 * 1024 }
  );
  return stdout;
}

async function ocr(pngPath) {
  // TSV for confidence
  const tsv = await tess(pngPath, ['tsv']);
  let confSum = 0;
  let confN = 0;
  for (const line of tsv.split('\n').slice(1)) {
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    const conf = parseFloat(cols[10]);
    if (!cols[11] || !cols[11].trim()) continue;
    if (!isNaN(conf) && conf >= 0) {
      confSum += conf;
      confN += 1;
    }
  }
  const meanConf = confN ? confSum / confN : 0;
  // plain text (line breaks preserved) for display
  const text = (await tess(pngPath, [])).replace(/\n{3,}/g, '\n\n').trim();
  return { text, meanConf };
}

// ---------------------------------------------------------------------------
async function processCode(code, tmp, out) {
  const pdfPath = await findPdfPath(code);
  if (!pdfPath) {
    console.log(`  [${code}] SKIP — no PDF`);
    return { total: 0, ocrd: 0, good: 0 };
  }
  const data = JSON.parse(await fs.readFile(path.join(SECTIONS_DIR, `${code}.json`), 'utf8'));
  const all = [...(data.sections || []), ...(data.appendix_sections || [])];

  // unique crops keyed by page|bbox (dedup duplicated sec_no artifacts)
  const cropCache = new Map(); // "page|bbox" -> { ocr_text, ocr_confidence, ocr_good }
  const codeOut = {};
  let total = 0;
  let ocrd = 0;
  let good = 0;

  for (const s of all) {
    for (const r of s.equation_regions || []) {
      total += 1;
      if (codeOut[r.id]) continue; // first occurrence of a region id wins
      const cropKey = `${r.page}|${r.bbox.join(',')}`;
      let result = cropCache.get(cropKey);
      if (!result) {
        const png = path.join(tmp, `${code}_${r.id}.png`);
        let rendered = false;
        try {
          rendered = await renderCrop(pdfPath, r.page, r.bbox, png);
        } catch {
          rendered = false;
        }
        if (!rendered) {
          result = { ocr_text: '', ocr_confidence: 0, ocr_good: false };
        } else {
          const { text, meanConf } = await ocr(png);
          result = {
            ocr_text: text,
            ocr_confidence: Math.round(meanConf * 10) / 10,
            ocr_good: isGood(meanConf, text),
          };
          await fs.rm(png, { force: true });
        }
        cropCache.set(cropKey, result);
        ocrd += 1;
      }
      codeOut[r.id] = result;
      if (result.ocr_good) good += 1;
    }
  }
  out[code] = codeOut;
  console.log(
    `  [${code}] regions=${total} uniqueCrops=${ocrd} good=${good} ` +
    `(${total ? ((good / total) * 100).toFixed(0) : 0}% usable text, rest -> source PDF)`
  );
  return { total, ocrd, good };
}

async function main() {
  const argv = process.argv.slice(2);
  let codes = argv.filter((a) => !a.startsWith('-'));
  if (codes.length === 0) {
    codes = (await fs.readdir(SECTIONS_DIR))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .sort();
  }

  const tmp = path.join(os.tmpdir(), 'hl-ocr-build');
  await fs.mkdir(tmp, { recursive: true });

  // merge into existing output if present (incremental runs)
  let out = {};
  try {
    out = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'));
  } catch {
    out = {};
  }

  console.log(`OCR precompute — ${codes.length} code(s): ${codes.join(', ')}`);
  const t0 = Date.now();
  let gTotal = 0;
  let gGood = 0;
  for (const code of codes) {
    const r = await processCode(code, tmp, out);
    gTotal += r.total;
    gGood += r.good;
    // write incrementally so a long run is crash-safe
    await fs.writeFile(OUT_FILE, JSON.stringify(out));
  }

  // metadata block for coverage transparency
  out._meta = {
    generated_at: new Date().toISOString(),
    gate: { conf_min: CONF_MIN, min_hangul: MIN_HANGUL, min_hangul_ratio: MIN_HANGUL_RATIO, min_mean_line_len: MIN_MEAN_LINE_LEN },
    codes_covered: codes,
    total_regions: gTotal,
    good_regions: gGood,
    good_pct: gTotal ? Math.round((gGood / gTotal) * 1000) / 10 : 0,
  };
  await fs.writeFile(OUT_FILE, JSON.stringify(out));

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(
    `\nDONE in ${secs}s — ${gTotal} regions, ${gGood} usable as text ` +
    `(${out._meta.good_pct}%), rest fall back to source PDF.`
  );
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
