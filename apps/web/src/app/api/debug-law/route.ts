import { NextResponse } from 'next/server';

export async function GET() {
  const OC = process.env.LAW_API_OC || 'NOT_SET';
  
  try {
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=law&type=JSON&query=%EA%B3%A0%EC%95%95%EA%B0%80%EC%8A%A4&display=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HydrogenLaw/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    return NextResponse.json({ 
      OC_value: OC,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      response_preview: text.slice(0, 300)
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ 
      OC_value: OC,
      error_type: err?.constructor?.name,
      error_message: err?.message,
      error_cause: (err as NodeJS.ErrnoException)?.cause ? String((err as NodeJS.ErrnoException)?.cause) : undefined,
    });
  }
}
