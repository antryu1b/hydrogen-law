/**
 * ocr-pilot.mjs — Tesseract OCR quality pilot for KGS equation/table crops.
 *
 * Renders each equation_region crop with pdftoppm (poppler) at 150 DPI — the
 * same DPI the web app uses (SCALE = 150/72 in pdf-render.ts) — then runs
 * Tesseract (kor+eng) with TSV output to get per-word confidence.
 *
 * GOAL: measure OCR quality (mean confidence, sample text) per region for ONE
 * code so we can pick a confidence threshold before building the full pipeline.
 *
 * Usage: node scripts/ocr-pilot.mjs <CODE> [maxRegions]
 *   e.g. node scripts/ocr-pilot.mjs AH271 40
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

async function findPdfPath(code) {
  const entries = await fs.readdir(PDF_DIR);
  const match = entries.find(
    (e) => (e.startsWith(`${code}-`) || e.startsWith(`${code}_`)) && e.endsWith('.pdf')
  );
  return match ? path.join(PDF_DIR, match) : null;
}

/** Render a bbox crop (PDF 72-DPI units) to a PNG file at 150 DPI via pdftoppm. */
async function renderCrop(pdfPath, page, bbox, outPng) {
  const [x0, y0, x1, y1] = bbox;
  const x = Math.floor(x0 * SCALE);
  const y = Math.floor(y0 * SCALE);
  const w = Math.max(1, Math.ceil((x1 - x0) * SCALE));
  const h = Math.max(1, Math.ceil((y1 - y0) * SCALE));
  // poppler appends "-<pageNum>.png" to the prefix. Use a unique prefix dir
  // per crop so the produced file is unambiguous, then move it to outPng.
  const prefix = outPng.replace(/\.png$/, '');
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  // Clear any stale outputs for this base.
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
  if (!produced) return null;
  await fs.rename(path.join(dir, produced), outPng);
  return { w, h };
}

/**
 * Run tesseract TSV; return { text, meanConf, wordCount }.
 * NOTE: tesseract/leptonica fails on absolute input paths under the sandbox
 * ("failed to open locally with tail ...") but works with a relative basename,
 * so we run with cwd = the file's directory and pass only the basename.
 */
async function ocr(pngPath) {
  const cwd = path.dirname(pngPath);
  const base = path.basename(pngPath);
  const { stdout } = await execFileP('tesseract', [
    base, 'stdout', '-l', 'kor+eng', '--oem', '1', '--psm', '6', 'tsv',
  ], { cwd, maxBuffer: 16 * 1024 * 1024 });
  const lines = stdout.split('\n');
  const words = [];
  let confSum = 0;
  let confN = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 12) continue;
    const conf = parseFloat(cols[10]);
    const text = cols[11];
    if (!text || !text.trim()) continue;
    if (!isNaN(conf) && conf >= 0) {
      confSum += conf;
      confN += 1;
    }
    words.push(text);
  }
  // Reconstruct text with line breaks (plain text output).
  const textOut = await reconstructText(pngPath);
  return {
    text: textOut,
    meanConf: confN ? confSum / confN : 0,
    wordCount: confN,
  };
}

/** Plain text output (preserves line breaks) for display sampling. */
async function reconstructText(pngPath) {
  const cwd = path.dirname(pngPath);
  const base = path.basename(pngPath);
  const { stdout } = await execFileP('tesseract', [
    base, 'stdout', '-l', 'kor+eng', '--oem', '1', '--psm', '6',
  ], { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Heuristic text-quality scoring. Tesseract conf alone is misleading (it is
 * "confident" about garbage in narrow symbol columns). Real legal text is
 * dominated by Hangul + digits; garbage crops are short symbol soup.
 */
function textQuality(text) {
  const hangul = (text.match(/[가-힣]/g) || []).length;
  const digits = (text.match(/[0-9]/g) || []).length;
  const total = text.replace(/\s/g, '').length;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const meanLineLen = lines.length ? total / lines.length : 0;
  const hangulRatio = total ? hangul / total : 0;
  // "good": enough real Korean content AND lines aren't 1-2 char symbol soup.
  const good = hangul >= 8 && hangulRatio >= 0.3 && meanLineLen >= 4;
  return { hangul, digits, total, meanLineLen, hangulRatio, good };
}

async function main() {
  const code = process.argv[2] || 'AH271';
  const maxRegions = parseInt(process.argv[3] || '40', 10);

  const pdfPath = await findPdfPath(code);
  if (!pdfPath) throw new Error(`No PDF for ${code}`);
  const data = JSON.parse(await fs.readFile(path.join(SECTIONS_DIR, `${code}.json`), 'utf8'));
  const all = [...(data.sections || []), ...(data.appendix_sections || [])];

  // Flatten regions (dedup by id+page+bbox to avoid the duplicate-region artifacts).
  const regions = [];
  const seen = new Set();
  for (const s of all) {
    for (const r of s.equation_regions || []) {
      const key = `${r.id}|${r.page}|${r.bbox.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      regions.push({ ...r, sec_no: s.sec_no, title: s.title });
    }
  }

  const tmp = path.join(os.tmpdir(), 'hl-ocr-pilot');
  await fs.mkdir(tmp, { recursive: true });

  // Spread the sample across the whole document instead of the first N
  // (the first N are dominated by duplicated narrow-column artifacts).
  const stride = Math.max(1, Math.floor(regions.length / maxRegions));
  const sample = regions.filter((_, i) => i % stride === 0).slice(0, maxRegions);
  console.log(`\n=== OCR PILOT: ${code} ===`);
  console.log(`Total unique regions: ${regions.length}, sampling first ${sample.length}\n`);

  const confs = [];
  let goodCount = 0;
  for (const r of sample) {
    const png = path.join(tmp, `${code}_${r.id}.png`);
    let dims;
    try {
      dims = await renderCrop(pdfPath, r.page, r.bbox, png);
    } catch (e) {
      console.log(`  ${r.id} (p${r.page}) RENDER FAIL: ${e.message}`);
      continue;
    }
    if (!dims) continue;
    const aspect = dims.w / dims.h;
    const res = await ocr(png);
    confs.push(res.meanConf);
    const q = textQuality(res.text);
    if (q.good) goodCount += 1;
    const preview = res.text.replace(/\n/g, ' ⏎ ').slice(0, 60);
    console.log(
      `  ${r.id.padEnd(12)} p${r.page} ${String(dims.w).padStart(4)}x${String(dims.h).padStart(4)} ar${aspect.toFixed(1).padStart(5)} ` +
      `conf=${res.meanConf.toFixed(0).padStart(3)} hangul=${q.hangul.toString().padStart(3)} ` +
      `mean=${q.meanLineLen.toFixed(0).padStart(2)} good=${q.good ? 'Y' : '.'} | ${preview}`
    );
  }

  confs.sort((a, b) => a - b);
  const mean = confs.reduce((a, b) => a + b, 0) / (confs.length || 1);
  const median = confs[Math.floor(confs.length / 2)] || 0;
  const pct = (t) => ((confs.filter((c) => c >= t).length / confs.length) * 100).toFixed(0);
  console.log(`\n--- SUMMARY (${confs.length} regions) ---`);
  console.log(`mean conf=${mean.toFixed(1)}  median=${median.toFixed(1)}`);
  console.log(`conf>=50: ${pct(50)}%  >=60: ${pct(60)}%  >=65: ${pct(65)}%  >=70: ${pct(70)}%  >=75: ${pct(75)}%`);
  console.log(`composite GOOD (hangul>=8 & ratio>=0.3 & meanLine>=4): ${goodCount}/${confs.length} = ${((goodCount / confs.length) * 100).toFixed(0)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
