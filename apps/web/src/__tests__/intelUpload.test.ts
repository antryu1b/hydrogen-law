// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATENT_DATA_SECTIONS } from '@/lib/patent-watch';

// Track delete calls: each call records { filters: string[] } describing the
// PostgREST filter chain applied.
interface DeleteCall {
  lt?: { column: string; value: string };
  not?: { column: string; operator: string; value: string };
}

const deleteCalls: DeleteCall[] = [];
const upsertCalls: unknown[][] = [];

function makeDeleteBuilder(call: DeleteCall) {
  return {
    lt(column: string, value: string) {
      call.lt = { column, value };
      return this;
    },
    not(column: string, operator: string, value: string) {
      call.not = { column, operator, value };
      return this;
    },
    then(resolve: (v: { error: null; count: number }) => void) {
      resolve({ error: null, count: 2 });
      return Promise.resolve({ error: null, count: 2 });
    },
  };
}

function fakeSupabase() {
  return {
    from: () => ({
      upsert: (rows: unknown[]) => {
        upsertCalls.push(rows);
        return Promise.resolve({ error: null });
      },
      delete: ({ count }: { count: string }) => {
        void count;
        const call: DeleteCall = {};
        deleteCalls.push(call);
        return makeDeleteBuilder(call);
      },
    }),
  };
}

vi.mock('@/lib/intel', () => ({ intelSupabase: () => fakeSupabase() }));

function makeRequest(body: unknown) {
  return new NextRequest(new URL('/api/intel/upload', 'https://example.test'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/intel/upload — replace=true section guard', () => {
  beforeEach(() => {
    deleteCalls.length = 0;
    upsertCalls.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  });

  const sampleRow = { id: 'test:1', section: 'fto', sort: 1, payload: { type: 'fto' } };

  it('replace=true on intel_patents skips PATENT_DATA_SECTIONS in the delete', async () => {
    const { POST } = await import('@/app/api/intel/upload/route');
    const res = await POST(makeRequest({ table: 'intel_patents', rows: [sampleRow], replace: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // The delete call must exist and carry the NOT-IN guard for the cron sections.
    expect(deleteCalls).toHaveLength(1);
    const del = deleteCalls[0];
    expect(del.lt?.column).toBe('updated_at');
    // .not('section', 'in', '(patent-watch,patent-competitor,patent-cursor)')
    expect(del.not?.column).toBe('section');
    expect(del.not?.operator).toBe('in');
    // All three cron sections must appear in the exclusion list.
    for (const sec of PATENT_DATA_SECTIONS) {
      expect(del.not?.value).toContain(sec);
    }
  });

  it('replace=true on intel_competitors skips the official-site monitor section', async () => {
    // competitor-watch rows are written by /api/cron/competitor-sites, not by the report seed.
    const { POST } = await import('@/app/api/intel/upload/route');
    const res = await POST(makeRequest({ table: 'intel_competitors', rows: [sampleRow], replace: true }));
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].not).toEqual({ column: 'section', operator: 'in', value: '(competitor-watch)' });
  });

  it('replace=false skips the delete entirely', async () => {
    const { POST } = await import('@/app/api/intel/upload/route');
    const res = await POST(makeRequest({ table: 'intel_patents', rows: [sampleRow] }));
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(0);
  });
});
