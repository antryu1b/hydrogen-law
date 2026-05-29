import { NextRequest, NextResponse } from 'next/server';
import { renderPdfRegion } from '../pdf-render';

/**
 * GET /api/kgs/eq-image?code=FP217&page=23&bbox=89.2,253.0,123.6,368.0
 *
 * Renders a cropped equation region from a KGS PDF page.
 * bbox values are in PDF coordinate space (72 DPI units).
 * Returns PNG with 1-day CDN cache.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const pageStr = searchParams.get('page');
  const bboxStr = searchParams.get('bbox');

  if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'Valid code required' }, { status: 400 });
  }
  if (!pageStr || !bboxStr) {
    return NextResponse.json({ error: 'page and bbox required' }, { status: 400 });
  }

  const pageNum = parseInt(pageStr, 10);
  if (isNaN(pageNum) || pageNum < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  const parts = bboxStr.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return NextResponse.json({ error: 'bbox must be x0,y0,x1,y1' }, { status: 400 });
  }
  const bbox = parts as [number, number, number, number];

  try {
    const result = await renderPdfRegion(code, pageNum, bbox);
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
    console.error(`eq-image render failed for ${code} page ${pageNum}:`, err);
    return NextResponse.json({ error: 'Render failed' }, { status: 500 });
  }
}
