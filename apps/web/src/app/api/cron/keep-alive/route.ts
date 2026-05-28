import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Vercel Cron — pings Supabase daily to prevent free-tier auto-pause (7-day inactivity)
export async function GET(request: Request) {
  // Verify Vercel cron auth (optional — protects against unauthorized hits)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase env not set' }, { status: 503 });
  }

  try {
    const supabase = createClient(url, key);
    const { count, error } = await supabase
      .from('law_articles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      law_articles_count: count,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    }, { status: 500 });
  }
}
