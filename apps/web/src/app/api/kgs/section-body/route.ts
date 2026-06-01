import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export interface EquationRegion {
  page: number;
  bbox: [number, number, number, number];
  id: string;
  /** Precomputed Tesseract OCR text (only meaningful when ocr_good). */
  ocr_text?: string;
  /** Mean per-word Tesseract confidence (0–100). */
  ocr_confidence?: number;
  /**
   * Whether the OCR passed the confidence + text-quality gate. When false the
   * UI must fall back to the source PDF (legal site — never show garbled OCR).
   */
  ocr_good?: boolean;
}

interface RawSection {
  sec_no: string;
  title: string;
  level: number;
  body?: string;
  body_chars?: number;
  is_umbrella?: boolean;
  is_appendix?: boolean;
  appendix_kind?: string;
  appendix_no?: string;
  page_start?: number;
  page_end?: number;
  equation_regions?: EquationRegion[];
}

interface SectionBodyResponse {
  code: string;
  sec_no: string;
  title: string;
  body: string;
  level: number;
  is_umbrella: boolean;
  is_appendix?: boolean;
  body_chars: number;
}

export interface SectionBlock {
  sec_no: string;
  title: string;
  level: number;
  body: string;
  is_umbrella: boolean;
  is_appendix?: boolean;
  body_chars: number;
  equation_regions?: EquationRegion[];
  page_start?: number;
  page_end?: number;
}

interface RecursiveSectionBodyResponse {
  code: string;
  root: { sec_no: string; title: string; body: string; is_umbrella: boolean; is_appendix?: boolean };
  blocks: SectionBlock[];
  total_blocks: number;
  total_body_chars: number;
}

interface RawSectionFile {
  sections: RawSection[];
  appendix_sections?: RawSection[];
}

// Cache full file contents per code to avoid re-reading on repeated requests
const fileCache = new Map<string, { sections: RawSection[]; appendix_sections: RawSection[] }>();

async function getSections(code: string): Promise<{ sections: RawSection[]; appendix_sections: RawSection[] }> {
  if (fileCache.has(code)) return fileCache.get(code)!;

  const filePath = path.join(process.cwd(), 'data', 'kgs_sections', `${code}.json`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw) as RawSectionFile;
  const result = {
    sections: data.sections as RawSection[],
    appendix_sections: (data.appendix_sections ?? []) as RawSection[],
  };
  fileCache.set(code, result);
  return result;
}

// --- OCR sidecar ------------------------------------------------------------
// Precomputed by scripts/ocr-kgs.mjs into data/kgs_ocr.json:
//   { [code]: { [regionId]: { ocr_text, ocr_confidence, ocr_good } }, _meta }
// Loaded once and cached. NO OCR happens at request time.
interface OcrEntry {
  ocr_text: string;
  ocr_confidence: number;
  ocr_good: boolean;
}
let ocrIndexCache: Record<string, Record<string, OcrEntry>> | null = null;

async function getOcrIndex(): Promise<Record<string, Record<string, OcrEntry>>> {
  if (ocrIndexCache) return ocrIndexCache;
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), 'data', 'kgs_ocr.json'),
      'utf-8'
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    delete parsed._meta;
    ocrIndexCache = parsed as Record<string, Record<string, OcrEntry>>;
  } catch {
    ocrIndexCache = {};
  }
  return ocrIndexCache;
}

/** Attach precomputed OCR fields to a region (in place) if available. */
function enrichRegions(
  regions: EquationRegion[] | undefined,
  codeOcr: Record<string, OcrEntry> | undefined
): EquationRegion[] | undefined {
  if (!regions || !codeOcr) return regions;
  return regions.map((r) => {
    const o = codeOcr[r.id];
    if (!o) return r;
    return {
      ...r,
      ocr_text: o.ocr_good ? o.ocr_text : undefined,
      ocr_confidence: o.ocr_confidence,
      ocr_good: o.ocr_good,
    };
  });
}

/** Compare two sec_no strings numerically segment by segment. */
function compareSecNo(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i++) {
    const aNum = parseInt(aParts[i] ?? '0', 10);
    const bNum = parseInt(bParts[i] ?? '0', 10);
    if (isNaN(aNum) || isNaN(bNum)) {
      const aStr = aParts[i] ?? '';
      const bStr = bParts[i] ?? '';
      if (aStr < bStr) return -1;
      if (aStr > bStr) return 1;
    } else {
      if (aNum !== bNum) return aNum - bNum;
    }
  }
  return 0;
}

/** Return true if candidate is a descendant of prefix (e.g. "2.4.1" descends from "2.4"). */
function isDescendant(candidate: string, prefix: string): boolean {
  return candidate.startsWith(prefix + '.');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const sec_no = searchParams.get('sec_no');
  const recursive = searchParams.get('recursive') === 'true';

  if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'Valid code parameter is required' }, { status: 400 });
  }
  if (!sec_no) {
    return NextResponse.json({ error: 'sec_no parameter is required' }, { status: 400 });
  }

  try {
    const { sections, appendix_sections } = await getSections(code);
    const codeOcr = (await getOcrIndex())[code];

    // Search in both sections and appendix_sections
    const allSections = [...sections, ...appendix_sections];
    const section = allSections.find((s) => s.sec_no === sec_no);

    if (!section) {
      return NextResponse.json({ error: `Section ${sec_no} not found in ${code}` }, { status: 404 });
    }

    // --- Non-recursive (default) path — backward compatible ---
    if (!recursive) {
      const body = section.body ?? '';
      const response: SectionBodyResponse = {
        code,
        sec_no: section.sec_no,
        title: section.title,
        body,
        level: section.level,
        is_umbrella: section.is_umbrella ?? false,
        body_chars: body.length,
      };
      if (section.is_appendix) response.is_appendix = true;
      return NextResponse.json(response);
    }

    // --- Recursive path: return parent + all descendants as ordered blocks ---
    // For appendix sections: since appendix entries are top-level (not hierarchical),
    // just return the single appendix entry as a block.
    if (section.is_appendix) {
      const body = section.body ?? '';
      const block: SectionBlock = {
        sec_no: section.sec_no,
        title: section.title,
        level: section.level,
        body,
        is_umbrella: false,
        is_appendix: true,
        body_chars: body.length,
      };
      if (section.equation_regions && section.equation_regions.length > 0) {
        block.equation_regions = enrichRegions(section.equation_regions, codeOcr);
      }
      if (section.page_start !== undefined) block.page_start = section.page_start;
      if (section.page_end !== undefined) block.page_end = section.page_end;

      const response: RecursiveSectionBodyResponse = {
        code,
        root: {
          sec_no: section.sec_no,
          title: section.title,
          body,
          is_umbrella: false,
          is_appendix: true,
        },
        blocks: [block],
        total_blocks: 1,
        total_body_chars: body.length,
      };
      return NextResponse.json(response);
    }

    // --- Regular recursive path: return parent + all descendants as ordered blocks ---
    // Dedup: source data has duplicate sec_nos from PDF table-row artifacts.
    // Keep only first occurrence per sec_no (consistent with sections-tree route).
    const matched = sections
      .filter((s) => s.sec_no === sec_no || isDescendant(s.sec_no, sec_no))
      .sort((a, b) => compareSecNo(a.sec_no, b.sec_no));
    const seen = new Set<string>();
    const descendants = matched.filter((s) => {
      if (seen.has(s.sec_no)) return false;
      seen.add(s.sec_no);
      return true;
    });

    const blocks: SectionBlock[] = descendants.map((s) => {
      const body = s.body ?? '';
      const block: SectionBlock = {
        sec_no: s.sec_no,
        title: s.title,
        level: s.level,
        body,
        is_umbrella: s.is_umbrella ?? false,
        body_chars: body.length,
      };
      if (s.equation_regions && s.equation_regions.length > 0) {
        block.equation_regions = enrichRegions(s.equation_regions, codeOcr);
      }
      if (s.page_start !== undefined) block.page_start = s.page_start;
      if (s.page_end !== undefined) block.page_end = s.page_end;
      return block;
    });

    const rootBody = section.body ?? '';
    const response: RecursiveSectionBodyResponse = {
      code,
      root: {
        sec_no: section.sec_no,
        title: section.title,
        body: rootBody,
        is_umbrella: section.is_umbrella ?? false,
      },
      blocks,
      total_blocks: blocks.length,
      total_body_chars: blocks.reduce((sum, b) => sum + b.body_chars, 0),
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: `Code ${code} not found` }, { status: 404 });
    }
    console.error(`Failed to read section body for ${code}/${sec_no}:`, error);
    return NextResponse.json({ error: 'Failed to load section body' }, { status: 500 });
  }
}
