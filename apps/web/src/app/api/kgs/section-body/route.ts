import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface RawSection {
  sec_no: string;
  title: string;
  level: number;
  body?: string;
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const sec_no = searchParams.get('sec_no');

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
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: `Code ${code} not found` }, { status: 404 });
    }
    console.error(`Failed to read section body for ${code}/${sec_no}:`, error);
    return NextResponse.json({ error: 'Failed to load section body' }, { status: 500 });
  }
}
