import { NextResponse } from 'next/server';

export async function GET() {
  const start = Date.now();

  try {
    const res = await fetch('https://api.beopmang.org/api/v4/law?action=search&q=수소', {
      headers: { 'Accept': 'application/json' },
    });

    const elapsed = Date.now() - start;
    const data = await res.json();

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      elapsed_ms: elapsed,
      total: data?.data?.total ?? null,
      first_result: data?.data?.results?.[0] ?? null,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      elapsed_ms: Date.now() - start,
    }, { status: 500 });
  }
}
