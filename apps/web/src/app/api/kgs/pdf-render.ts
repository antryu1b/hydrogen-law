/**
 * pdf-render.ts
 * Shared utility for rendering PDF pages to canvas using pdfjs-dist + @napi-rs/canvas.
 * Used by eq-image and page-image API routes.
 */

import { promises as fs } from 'fs';
import path from 'path';

const PDF_DIR = path.join(process.cwd(), 'data', 'kgs_pdfs');
const SCALE = 150 / 72; // 150 DPI

// Cache loaded PDF data buffers (memory cache — Next.js resets between cold starts)
const pdfDataCache = new Map<string, Uint8Array>();

/** Find the PDF file for a given code (handles version-suffix filenames). */
async function findPdfPath(code: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(PDF_DIR);
  } catch {
    return null;
  }
  const match = entries.find(
    (e) => (e.startsWith(`${code}-`) || e.startsWith(`${code}_`)) && e.endsWith('.pdf')
  );
  return match ? path.join(PDF_DIR, match) : null;
}

/** Load PDF data as Uint8Array (cached per code). */
async function loadPdfData(code: string): Promise<Uint8Array | null> {
  if (pdfDataCache.has(code)) return pdfDataCache.get(code)!;
  const pdfPath = await findPdfPath(code);
  if (!pdfPath) return null;
  const buf = await fs.readFile(pdfPath);
  const data = new Uint8Array(buf);
  pdfDataCache.set(code, data);
  return data;
}

/** One-time setup flag to avoid re-loading worker module. */
let pdfjsInitialized = false;

/**
 * Initialize pdfjs-dist for server-side (Node.js) usage.
 * Uses fake worker via globalThis.pdfjsWorker — the pdfjs-dist v4 pattern
 * for environments without a real browser Worker.
 */
async function initPdfjs() {
  if (pdfjsInitialized) return;
  pdfjsInitialized = true;

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // Setting globalThis.pdfjsWorker enables the built-in fake-worker fallback.
  // pdfjs checks: globalThis.pdfjsWorker?.WorkerMessageHandler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g.pdfjsWorker) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs' as any);
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'fake';
}

export interface RenderPageResult {
  /** PNG buffer of the rendered region */
  png: Buffer;
  width: number;
  height: number;
}

/**
 * Render a PDF page (or a cropped region of it) to PNG.
 * @param code  KGS code (e.g. "FP217")
 * @param pageNum  1-based page number
 * @param bbox  Optional [x0, y0, x1, y1] crop in PDF units (72 DPI space). If omitted, full page.
 */
export async function renderPdfRegion(
  code: string,
  pageNum: number,
  bbox?: [number, number, number, number]
): Promise<RenderPageResult | null> {
  const pdfData = await loadPdfData(code);
  if (!pdfData) return null;

  await initPdfjs();

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');

  // Copy the data so pdfjs doesn't detach the shared cached ArrayBuffer on transfer
  const pdfDataCopy = new Uint8Array(pdfData);
  const pdf = await pdfjsLib.getDocument({ data: pdfDataCopy }).promise;
  if (pageNum < 1 || pageNum > pdf.numPages) return null;

  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });

  const canvasWidth = Math.floor(viewport.width);
  const canvasHeight = Math.floor(viewport.height);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

  try {
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch {
    // Partial render — embedded image xobjects fail but text/vector renders fine
  }

  if (!bbox) {
    const png = canvas.toBuffer('image/png') as unknown as Buffer;
    return { png, width: canvasWidth, height: canvasHeight };
  }

  // Crop the bbox region
  const [x0, y0, x1, y1] = bbox;
  const sx0 = Math.floor(x0 * SCALE);
  const sy0 = Math.floor(y0 * SCALE);
  const sw = Math.max(1, Math.floor((x1 - x0) * SCALE));
  const sh = Math.max(1, Math.floor((y1 - y0) * SCALE));

  const cropCanvas = createCanvas(sw, sh);
  const cropCtx = cropCanvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  cropCtx.drawImage(canvas as unknown as HTMLCanvasElement, sx0, sy0, sw, sh, 0, 0, sw, sh);

  const png = cropCanvas.toBuffer('image/png') as unknown as Buffer;
  return { png, width: sw, height: sh };
}
