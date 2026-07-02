import { NextResponse } from 'next/server';

// Visitor counter backed by Supabase (page_visits table + increment_visit RPC).
// GET  -> read-only { today, total }
// POST -> atomically increments today's count, returns { today, total }

export const dynamic = 'force-dynamic';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseHeaders() {
  return {
    apikey: key as string,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function envMissing() {
  return !url || !key;
}

// Read-only: today's count and cumulative total, no increment.
export async function GET() {
  if (envMissing()) {
    return NextResponse.json({ today: 0, total: 0 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${url}/rest/v1/page_visits?select=day,views`, {
      headers: supabaseHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ today: 0, total: 0 });

    const rows: Array<{ day: string; views: number }> = await res.json();
    const total = rows.reduce((sum, r) => sum + Number(r.views ?? 0), 0);
    const todayRow = rows.find((r) => r.day === today);
    return NextResponse.json({ today: Number(todayRow?.views ?? 0), total });
  } catch {
    return NextResponse.json({ today: 0, total: 0 });
  }
}

// Increment today's count (once per browser session, enforced client-side).
export async function POST() {
  if (envMissing()) {
    return NextResponse.json({ today: 0, total: 0 });
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/increment_visit`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: '{}',
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ today: 0, total: 0 });

    // RPC returning a table comes back as an array of one row.
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      today: Number(row?.today ?? 0),
      total: Number(row?.total ?? 0),
    });
  } catch {
    return NextResponse.json({ today: 0, total: 0 });
  }
}
