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

interface SectionMeta {
  sec_no: string;
  title: string;
  level: number;
  body_chars: number;
  is_umbrella: boolean;
}

// In-memory cache per code
const cache = new Map<string, SectionMeta[]>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code || typeof code !== 'string' || !/^[A-Z0-9]{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'Valid code parameter is required' }, { status: 400 });
  }

  if (cache.has(code)) {
    return NextResponse.json({ code, sections: cache.get(code) });
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'kgs_sections', `${code}.json`);
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);

    const sections: SectionMeta[] = (data.sections as RawSection[]).map((s) => ({
      sec_no: s.sec_no,
      title: s.title,
      level: s.level,
      body_chars: s.body ? s.body.length : 0,
      is_umbrella: s.is_umbrella ?? false,
    }));

    cache.set(code, sections);
    return NextResponse.json({ code, sections });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: `Code ${code} not found` }, { status: 404 });
    }
    console.error(`Failed to read sections for ${code}:`, error);
    return NextResponse.json({ error: 'Failed to load sections' }, { status: 500 });
  }
}
