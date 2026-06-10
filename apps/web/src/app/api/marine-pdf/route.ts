import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/marine-pdf?code=MOFFC|GC12K
 *
 * Streams the original marine standard PDF inline so the browser's
 * native viewer shows the full document (모든 페이지). Used by the
 * "원문 전체 보기" link on marine standard columns.
 */

const PDF_DIR = path.join(process.cwd(), 'data', 'kgs_pdfs');

const CODE_FILE: Record<string, string> = {
  MOFFC: 'MOFFC_2024.pdf',
  GC12K: 'GC12K_2024.pdf',
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code') || '';
  const file = CODE_FILE[code];
  if (!file) {
    return NextResponse.json({ error: 'Valid code required (MOFFC|GC12K)' }, { status: 400 });
  }

  try {
    const buf = await fs.readFile(path.join(PDF_DIR, file));
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${file}"`,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err) {
    console.error(`marine-pdf read failed for ${code}:`, err);
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 });
  }
}
