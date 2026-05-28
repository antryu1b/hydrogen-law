import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'env not set', url: !!url, key: !!key });
  }

  try {
    const res = await fetch(`${url}/rest/v1/law_articles?select=id,law_name&limit=1`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    });
    const text = await res.text();
    return NextResponse.json({
      url_set: !!url,
      key_len: key.length,
      status: res.status,
      ok: res.ok,
      preview: text.slice(0, 500),
    });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({
      error_type: err?.constructor?.name,
      error_message: err?.message,
      url_used: url,
      key_len: key.length,
    });
  }
}
