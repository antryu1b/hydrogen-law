import { NextRequest, NextResponse } from 'next/server';
import { renderPdfRegion } from '../pdf-render';

/**
 * GET /api/kgs/page-image?code=FP217&page=23
 *
 * Renders a full PDF page as PNG. Used for the "PDF 페이지 보기" fallback modal.
 * Returns PNG with 1-day CDN cache.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const pageStr = searchParams.get('page');

  if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'Valid code required' }, { status: 400 });
  }
  if (!pageStr) {
    return NextResponse.json({ error: 'page required' }, { status: 400 });
  }

  const pageNum = parseInt(pageStr, 10);
  if (isNaN(pageNum) || pageNum < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  try {
    const result = await renderPdfRegion(code, pageNum);
    if (!result) {
      return NextResponse.json({ error: `PDF not found for code ${code}` }, { status: 404 });
    }

    return new NextResponse(result.png as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Image-Width': String(result.width),
        'X-Image-Height': String(result.height),
      },
    });
  } catch (err) {
    console.error(`page-image render failed for ${code} page ${pageNum}:`, err);
    return NextResponse.json({ error: 'Render failed' }, { status: 500 });
  }
}
