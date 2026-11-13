import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  getKgsSourceMode,
  getKgsSectionsDoc,
  getKgsOcrIndex,
  getKgsCanonicalToc,
  __resetKgsSourceCache,
} from '@/lib/kgs-source';

const DATA = path.join(process.cwd(), 'data');
const readJson = async (...p: string[]) => JSON.parse(await fs.readFile(path.join(DATA, ...p), 'utf-8'));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetKgsSourceCache();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  warnSpy.mockRestore();
});

function dbMode() {
  vi.stubEnv('KGS_SOURCE', 'db');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
}

describe('getKgsSourceMode', () => {
  it('defaults to file when KGS_SOURCE is unset or not "db"', () => {
    vi.stubEnv('KGS_SOURCE', '');
    expect(getKgsSourceMode()).toBe('file');
    vi.stubEnv('KGS_SOURCE', 'supabase');
    expect(getKgsSourceMode()).toBe('file');
  });

  it('is db only when KGS_SOURCE=db', () => {
    vi.stubEnv('KGS_SOURCE', 'db');
    expect(getKgsSourceMode()).toBe('db');
  });
});

describe('file mode (default)', () => {
  it('reads the static section file and never calls the network', async () => {
    const doc = await getKgsSectionsDoc('AC116');
    expect(doc).toEqual(await readJson('kgs_sections', 'AC116.json'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with ENOENT for an unknown code', async () => {
    await expect(getKgsSectionsDoc('ZZ999')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('serves the OCR index without _meta and the canonical TOC verbatim', async () => {
    const ocr = await getKgsOcrIndex();
    expect(ocr).not.toHaveProperty('_meta');
    expect(ocr.AC116).toEqual((await readJson('kgs_ocr.json')).AC116);
    expect(await getKgsCanonicalToc()).toEqual(await readJson('kgs-canonical-toc.json'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('db mode', () => {
  it('returns the newest active row body and queries the right filter', async () => {
    dbMode();
    const body = { code: 'AC116', sections: [{ sec_no: '1', title: 'DB', level: 1 }], appendix_sections: [] };
    fetchMock.mockResolvedValueOnce(jsonResponse([{ body }]));

    expect(await getKgsSectionsDoc('AC116')).toEqual(body);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/rest/v1/kgs_code_versions');
    expect(url.searchParams.get('status')).toBe('eq.active');
    expect(url.searchParams.get('code')).toBe('eq.AC116');
    expect(url.searchParams.get('order')).toBe('revision_date.desc');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('caches the result within the TTL', async () => {
    dbMode();
    fetchMock.mockResolvedValue(jsonResponse([{ body: { sections: [] } }]));
    await getKgsSectionsDoc('AC116');
    await getKgsSectionsDoc('AC116');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['table missing (HTTP 404)', () => fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'relation does not exist' }, 404))],
    ['no active row', () => fetchMock.mockResolvedValueOnce(jsonResponse([]))],
    ['network error', () => fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))],
  ])('falls back to the static file with one warning on %s', async (_label, arrange) => {
    dbMode();
    arrange();
    const doc = await getKgsSectionsDoc('AC116');
    expect(doc).toEqual(await readJson('kgs_sections', 'AC116.json'));
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back without calling the network when Supabase env is missing', async () => {
    vi.stubEnv('KGS_SOURCE', 'db');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await getKgsSectionsDoc('AC116')).toEqual(await readJson('kgs_sections', 'AC116.json'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('still rejects with ENOENT when neither DB nor file has the code', async () => {
    dbMode();
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await expect(getKgsSectionsDoc('ZZ999')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('OCR index: newest DB row per code wins, other codes keep the file entry', async () => {
    dbMode();
    const fileOcr = await readJson('kgs_ocr.json');
    const newer = { r1: { ocr_text: 'new', ocr_confidence: 90, ocr_good: true } };
    const older = { r1: { ocr_text: 'old', ocr_confidence: 90, ocr_good: true } };
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { code: 'AC116', ocr: newer },
        { code: 'AC116', ocr: older },
      ])
    );
    const ocr = await getKgsOcrIndex();
    expect(ocr.AC116).toEqual(newer);
    expect(ocr.AC411).toEqual(fileOcr.AC411);
  });

  it('canonical TOC: overlays DB cells onto the static skeleton without changing its shape', async () => {
    dbMode();
    const fileToc = await readJson('kgs-canonical-toc.json');
    const fam = fileToc.families.find((f: { members: string[] }) => f.members.includes('AC411'));
    const entry = fam.canonical_toc.find((e: { codes: Record<string, unknown> }) => 'AC411' in e.codes);
    const cell = { present: true, matched_sec_no: entry.sec_no, matched_title: 'DB title', body_chars: 1, is_umbrella: false };
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ code: 'AC411', toc: { family_id: fam.id, family: [{ sec_no: entry.sec_no, cell }], universal: [] } }])
    );

    const toc = (await getKgsCanonicalToc()) as typeof fileToc;
    const outFam = toc.families.find((f: { id: string }) => f.id === fam.id);
    const outEntry = outFam.canonical_toc.find((e: { sec_no: string }) => e.sec_no === entry.sec_no);
    expect(outEntry.codes.AC411).toEqual(cell);

    // Same structure apart from that one cell; the static cache is not mutated.
    outEntry.codes.AC411 = entry.codes.AC411;
    expect(toc).toEqual(fileToc);
    vi.stubEnv('KGS_SOURCE', '');
    expect(await getKgsCanonicalToc()).toEqual(fileToc);
  });
});
