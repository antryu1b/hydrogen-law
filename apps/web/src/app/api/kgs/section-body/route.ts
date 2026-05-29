import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface RawSection {
  sec_no: string;
  title: string;
  level: number;
  body?: string;
  body_chars?: number;
  is_umbrella?: boolean;
}

interface SectionBodyResponse {
  code: string;
  sec_no: string;
  title: string;
  body: string;
  level: number;
  is_umbrella: boolean;
  body_chars: number;
}

export interface SectionBlock {
  sec_no: string;
  title: string;
  level: number;
  body: string;
  is_umbrella: boolean;
  body_chars: number;
}

interface RecursiveSectionBodyResponse {
  code: string;
  root: { sec_no: string; title: string; body: string; is_umbrella: boolean };
  blocks: SectionBlock[];
  total_blocks: number;
  total_body_chars: number;
}

// Cache full file contents per code to avoid re-reading on repeated requests
const fileCache = new Map<string, RawSection[]>();

async function getSections(code: string): Promise<RawSection[]> {
  if (fileCache.has(code)) return fileCache.get(code)!;

  const filePath = path.join(process.cwd(), 'data', 'kgs_sections', `${code}.json`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const sections = data.sections as RawSection[];
  fileCache.set(code, sections);
  return sections;
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
    const sections = await getSections(code);
    const section = sections.find((s) => s.sec_no === sec_no);

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
      return NextResponse.json(response);
    }

    // --- Recursive path: return parent + all descendants as ordered blocks ---
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
      return {
        sec_no: s.sec_no,
        title: s.title,
        level: s.level,
        body,
        is_umbrella: s.is_umbrella ?? false,
        body_chars: body.length,
      };
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
