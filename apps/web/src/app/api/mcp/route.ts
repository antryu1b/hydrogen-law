// hydrogen-law REMOTE MCP endpoint (Streamable HTTP) for claude.ai / Claude Desktop.
//
// Thin proxy over this deployment's OWN existing API routes — reimplements NO
// search/compare logic. Mirrors mcp-server/index.mjs (stdio) exactly: same 3
// tools, same names, descriptions, and input schemas. Only the transport differs
// (remote Streamable HTTP instead of stdio).
//
// Proxied routes:
//   hydro_search   -> POST /api/search            { query, top_k }
//   hydro_compare  -> POST /api/kgs/compare       { codes }         (kind:"kgs")
//                  -> GET  /api/marine-compare?q=…                  (kind:"marine")
//   hydro_detail   -> POST /api/law-detail        { law_name, article_number } (kind:"law")
//                  -> GET  /api/kgs/section-body?code=…&sec_no=…&recursive=…   (kind:"section")

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BASE = (process.env.HYDRO_SELF_ORIGIN || 'https://hydrogen-law.vercel.app').replace(/\/$/, '');

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function postJson(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text;
}

async function getPath(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text;
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

// ── Handler ─────────────────────────────────────────────────────────────────
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'hydro_search',
      {
        description:
          '수소법령 통합 검색. 법망(Beopmang) API 우선 → 실패 시 Supabase 폴백 체인을 그대로 태운다(웹사이트와 동일). 법령/조문/별표를 키워드로 검색.',
        inputSchema: {
          query: z.string().describe('검색어 (예: "수소 충전소 이격거리")'),
          top_k: z.number().default(10).describe('반환 결과 수 (기본 10)'),
        },
      },
      async ({ query, top_k }) => {
        try {
          return ok(await postJson('/api/search', { query, top_k: top_k ?? 10 }));
        } catch (err) {
          return fail(err);
        }
      },
    );

    server.registerTool(
      'hydro_compare',
      {
        description:
          '비교표 조회. kind="kgs"이면 KGS 코드 배열로 상세기준 비교표(/api/kgs/compare), kind="marine"이면 검색어로 해양(선박) 비교표(/api/marine-compare)를 반환한다.',
        inputSchema: {
          kind: z.enum(['kgs', 'marine']).describe('비교 종류'),
          codes: z.array(z.string()).optional().describe('kind="kgs"일 때: 비교할 KGS 코드 배열'),
          query: z.string().optional().describe('kind="marine"일 때: 검색어'),
        },
      },
      async ({ kind, codes, query }) => {
        try {
          if (kind === 'kgs') {
            return ok(await postJson('/api/kgs/compare', { codes: codes ?? [] }));
          }
          return ok(await getPath(`/api/marine-compare?q=${encodeURIComponent(query ?? '')}`));
        } catch (err) {
          return fail(err);
        }
      },
    );

    server.registerTool(
      'hydro_detail',
      {
        description:
          '조문/섹션 상세 조회. kind="law"이면 법령명+조번호로 조문 본문(/api/law-detail), kind="section"이면 KGS 코드+섹션번호로 섹션 본문(/api/kgs/section-body)을 반환한다.',
        inputSchema: {
          kind: z.enum(['law', 'section']).describe('상세 종류'),
          law_name: z.string().optional().describe('kind="law"일 때: 법령명'),
          article_number: z.string().optional().describe('kind="law"일 때: 조번호'),
          code: z.string().optional().describe('kind="section"일 때: KGS 코드'),
          sec_no: z.string().optional().describe('kind="section"일 때: 섹션 번호'),
          recursive: z.boolean().default(false).describe('kind="section"일 때: 하위 섹션 포함 여부'),
        },
      },
      async ({ kind, law_name, article_number, code, sec_no, recursive }) => {
        try {
          if (kind === 'law') {
            return ok(await postJson('/api/law-detail', { law_name, article_number }));
          }
          const q = new URLSearchParams({
            code: code ?? '',
            sec_no: sec_no ?? '',
            recursive: String(!!recursive),
          });
          return ok(await getPath(`/api/kgs/section-body?${q.toString()}`));
        } catch (err) {
          return fail(err);
        }
      },
    );
  },
  {
    serverInfo: { name: 'hydrogen-law', version: '0.1.0' },
  },
  {
    // Stateless Streamable HTTP (claude.ai remote connector). basePath "/api"
    // derives the endpoint "/api/mcp" from this route. No Redis: SSE disabled and
    // no sessionIdGenerator, so no session store is required.
    basePath: '/api',
    maxDuration: 60,
    disableSse: true,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
