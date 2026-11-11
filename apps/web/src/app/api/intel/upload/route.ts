import { NextResponse } from 'next/server';
import { intelSupabase } from '@/lib/intel';
import { COMPETITOR_DATA_SECTIONS } from '@/lib/competitor-watch';
import { PATENT_DATA_SECTIONS } from '@/lib/patent-watch';

// Authenticated (middleware) admin upload for competitor / patent content.
// Body: the seed JSON shape { table, rows: [{ id, section, sort, payload }], replace? }.
// replace=true deletes rows of that table that are not in this upload.

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED = new Set(['intel_competitors', 'intel_patents']);
const MAX_ROWS = 5000;
const CHUNK = 500;

interface Row {
  id: string;
  section: string;
  sort: number;
  payload: Record<string, unknown>;
}

function validRow(r: unknown): r is Row {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 200 &&
    typeof o.section === 'string' && o.section.length > 0 && o.section.length <= 100 &&
    typeof o.sort === 'number' && Number.isFinite(o.sort) &&
    !!o.payload && typeof o.payload === 'object' && !Array.isArray(o.payload)
  );
}

export async function POST(req: Request) {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }
  let body: { table?: unknown; rows?: unknown; replace?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const table = typeof body.table === 'string' ? body.table : '';
  if (!ALLOWED.has(table)) {
    return NextResponse.json({ error: `table must be one of: ${[...ALLOWED].join(', ')}` }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `rows must be a non-empty array (max ${MAX_ROWS})` }, { status: 400 });
  }
  const bad = body.rows.findIndex((r) => !validRow(r));
  if (bad >= 0) {
    return NextResponse.json({ error: `rows[${bad}] needs { id, section, sort:number, payload:object }` }, { status: 400 });
  }
  const ids = new Set((body.rows as Row[]).map((r) => r.id));
  if (ids.size !== body.rows.length) {
    return NextResponse.json({ error: 'duplicate id in rows' }, { status: 400 });
  }

  const sb = intelSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase env not set' }, { status: 503 });

  const stamp = new Date().toISOString();
  const rows = (body.rows as Row[]).map(({ id, section, sort, payload }) => ({
    id,
    section,
    sort: Math.trunc(sort),
    payload,
    updated_at: stamp,
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict: 'id' });
    if (error) {
      return NextResponse.json({ error: error.message, upserted: i }, { status: 500 });
    }
  }

  let deleted = 0;
  if (body.replace === true) {
    // Every row in this upload carries `stamp`; anything older was not in the file.
    // Cron-owned sections are skipped so a re-seed does not wipe them: for intel_patents the
    // KIPRIS patent-watch / patent-competitor / patent-cursor / patent-status rows, for
    // intel_competitors the official-site competitor-watch snapshots.
    // Decision: 'fto' rows remain deletable (existing replace behaviour preserved for fto).
    const protectedSections: readonly string[] =
      table === 'intel_patents' ? PATENT_DATA_SECTIONS : COMPETITOR_DATA_SECTIONS;
    const del = sb
      .from(table)
      .delete({ count: 'exact' })
      .lt('updated_at', stamp)
      .not('section', 'in', `(${protectedSections.join(',')})`);
    const { error, count } = await del;
    if (error) return NextResponse.json({ error: error.message, upserted: rows.length }, { status: 500 });
    deleted = count ?? 0;
  }

  return NextResponse.json({ ok: true, table, upserted: rows.length, deleted });
}
