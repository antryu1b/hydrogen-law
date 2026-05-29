import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Cache the TOC in module scope (serverless function warm starts benefit)
let cachedToc: unknown | null = null;

export async function GET() {
  try {
    if (!cachedToc) {
      const tocPath = path.join(process.cwd(), 'data', 'kgs-canonical-toc.json');
      const raw = await fs.readFile(tocPath, 'utf-8');
      cachedToc = JSON.parse(raw);
    }
    return NextResponse.json(cachedToc);
  } catch (error) {
    console.error('Failed to read canonical TOC:', error);
    return NextResponse.json({ error: 'Failed to load canonical TOC' }, { status: 500 });
  }
}
