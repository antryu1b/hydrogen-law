#!/usr/bin/env node
// hydrogen-law MCP server — thin proxy over the DEPLOYED Vercel API routes.
//
// This server reimplements NO search/compare logic. Every tool is a 1:1 proxy
// to an existing Next.js API route on the deployed hydrogen-law site, so the
// Beopmang(법망) → Supabase fallback chain and the comparison tables behave
// EXACTLY as they do on the website. Only the transport (MCP stdio) is new.
//
// Set HYDRO_BASE_URL to your deployed Vercel origin (no trailing slash), e.g.
//   HYDRO_BASE_URL=https://hydrogen-law.vercel.app
//
// Proxied routes:
//   hydro_search   -> POST /api/search            { query, top_k }
//   hydro_compare  -> POST /api/kgs/compare       { codes }         (kind:"kgs")
//                  -> GET  /api/marine-compare?q=…                  (kind:"marine")
//   hydro_detail   -> POST /api/law-detail        { law_name, article_number } (kind:"law")
//                  -> GET  /api/kgs/section-body?code=…&sec_no=…&recursive=…   (kind:"section")

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = (process.env.HYDRO_BASE_URL || '').replace(/\/$/, '');
if (!BASE_URL) {
  console.error('[hydrogen-law-mcp] HYDRO_BASE_URL is not set. Set it to your deployed Vercel origin, e.g. https://hydrogen-law.vercel.app');
  process.exit(1);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text;
}

async function getPath(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text;
}

// ── Tool definitions ────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'hydro_search',
    description:
      '수소법령 통합 검색. 법망(Beopmang) API 우선 → 실패 시 Supabase 폴백 체인을 그대로 태운다(웹사이트와 동일). 법령/조문/별표를 키워드로 검색.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (예: "수소 충전소 이격거리")' },
        top_k: { type: 'number', description: '반환 결과 수 (기본 10)', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'hydro_compare',
    description:
      '비교표 조회. kind="kgs"이면 KGS 코드 배열로 상세기준 비교표(/api/kgs/compare), kind="marine"이면 검색어로 해양(선박) 비교표(/api/marine-compare)를 반환한다.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['kgs', 'marine'], description: '비교 종류' },
        codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'kind="kgs"일 때: 비교할 KGS 코드 배열',
        },
        query: { type: 'string', description: 'kind="marine"일 때: 검색어' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'hydro_detail',
    description:
      '조문/섹션 상세 조회. kind="law"이면 법령명+조번호로 조문 본문(/api/law-detail), kind="section"이면 KGS 코드+섹션번호로 섹션 본문(/api/kgs/section-body)을 반환한다.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['law', 'section'], description: '상세 종류' },
        law_name: { type: 'string', description: 'kind="law"일 때: 법령명' },
        article_number: { type: 'string', description: 'kind="law"일 때: 조번호' },
        code: { type: 'string', description: 'kind="section"일 때: KGS 코드' },
        sec_no: { type: 'string', description: 'kind="section"일 때: 섹션 번호' },
        recursive: { type: 'boolean', description: 'kind="section"일 때: 하위 섹션 포함 여부', default: false },
      },
      required: ['kind'],
    },
  },
];

// ── Server wiring ───────────────────────────────────────────────────────────
const server = new Server(
  { name: 'hydrogen-law', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let out;
    if (name === 'hydro_search') {
      out = await postJson('/api/search', {
        query: args.query,
        top_k: args.top_k ?? 10,
      });
    } else if (name === 'hydro_compare') {
      if (args.kind === 'kgs') {
        out = await postJson('/api/kgs/compare', { codes: args.codes ?? [] });
      } else if (args.kind === 'marine') {
        out = await getPath(`/api/marine-compare?q=${encodeURIComponent(args.query ?? '')}`);
      } else {
        throw new Error('hydro_compare: kind must be "kgs" or "marine"');
      }
    } else if (name === 'hydro_detail') {
      if (args.kind === 'law') {
        out = await postJson('/api/law-detail', {
          law_name: args.law_name,
          article_number: args.article_number,
        });
      } else if (args.kind === 'section') {
        const q = new URLSearchParams({
          code: args.code ?? '',
          sec_no: args.sec_no ?? '',
          recursive: String(!!args.recursive),
        });
        out = await getPath(`/api/kgs/section-body?${q.toString()}`);
      } else {
        throw new Error('hydro_detail: kind must be "law" or "section"');
      }
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: out }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[hydrogen-law-mcp] ready (stdio) ->', BASE_URL);
