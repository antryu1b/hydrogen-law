# CLAUDE.md - hydrogen-law-rag

## 🔴 CRITICAL — Source, Machine, Deploy (read before touching anything)

| 항목 | 값 |
|---|---|
| **Canonical edit source** | **m4max `~/PRJs/hydrogen-law`** (NOT M1) |
| **M1 sibling path** | `~/Thairon/hydrogen-law-rag` — **STALE, do not edit** |
| **GitHub repo** | `antryu1b/hydrogen-law` (note: `antryu1b`, not `antryu`) |
| **Live deploy** | https://hydrogen-law.vercel.app |
| **Deploy mechanism** | 🔴 **`vercel --prod --yes` direct CLI** (bypasses GitHub) |
| **Vercel CLI auth** | `antryu1b-5214` (already logged in via `~/PRJs/hydrogen-law/.vercel/project.json`) |
| **git push to origin** | secondary concern — antryu PAT in keychain has **NO write** to antryu1b/hydrogen-law. Origin may lag behind live. TODO: add antryu1b PAT. |
| **Push hook** | `PUSH_OK=1` prefix required (`m1-safety-guard`) |
| **Husky pre-commit** | uses `npx`; if non-interactive (Bash tool), commit with `--no-verify` |

**Why this matters**: This repo's pattern is OPPOSITE of y-company / govrfp-alerts (those = M1 canonical). Treating M1 as canonical here = wrong base + lost work. 2026-05-28 incident: orchestrator built family page on M1's stale base, "WIP preserved" was actually abandoned exploration. Recovery via rsync m4max + re-apply.

**Deploy command (anywhere on m4max)**:
```bash
cd ~/PRJs/hydrogen-law && vercel --prod --yes
```
→ ~50s build → aliased to https://hydrogen-law.vercel.app

**KGS family map data files (Phase 1, 2026-05-28)** — large, do NOT commit:
- `data/kgs_pdfs/` (20 PDFs, ~30MB) — gitignored
- `data/kgs_sections/` (20 parsed JSONs, ~300KB each) — gitignored
- `data/kgs_families.json`, `data/kgs-canonical-toc.json` — small, tracked
- `services/kgs-parser/.venv/` — gitignored

---

## Project Overview

Hydrogen Law RAG System (수소법률 RAG 시스템) - A RAG-based legal search and compliance system for Korean hydrogen-related laws from the National Law Information Center (국가법령정보센터).

**Key Design Principle**: LLM-minimal approach. 90% of searches use pure vector + BM25 retrieval. LLM is only used for complex interpretation when explicitly requested.

## Tech Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind CSS 3 (shadcn/ui components)
- **Backend API**: Next.js API routes (apps/web/src/app/api/)
- **RAG Engine**: Python 3.10+ + FastAPI + uvicorn
- **Vector DB**: ChromaDB (dev) / Pinecone (production)
- **Database**: PostgreSQL via Supabase (@supabase/supabase-js)
- **Embeddings**: jhgan/ko-sroberta-multitask (Korean-optimized, 768 dimensions)
- **Search**: Hybrid retrieval (vector 0.7 + BM25 0.3), BM25-only fallback when offline
- **LLM**: Claude 3.5 Sonnet (optional, for AI summaries only)

## Directory Structure

```
hydrogen-law-rag/
├── apps/
│   ├── web/                  # Next.js frontend + API routes
│   │   ├── src/app/          # App router pages & API
│   │   ├── src/components/   # React components (shadcn/ui)
│   │   ├── src/lib/          # Utilities
│   │   └── src/types/        # TypeScript types
│   ├── api/                  # (Placeholder) Node.js backend
│   ├── mobile/               # (Placeholder) React Native app
│   └── desktop/              # (Placeholder) Desktop app
├── services/
│   └── rag-engine/           # Python RAG service
│       ├── src/
│       │   ├── collectors/   # Law data collectors & parsers
│       │   ├── embeddings/   # Embedder, chunker, vector store
│       │   └── retrieval/    # Hybrid retriever (vector + BM25)
│       ├── main.py           # FastAPI entrypoint
│       ├── load_pdfs_to_rag.py  # PDF ingestion pipeline
│       ├── law_documents.json   # Pre-parsed law documents (BM25 fallback data)
│       ├── law_config.yaml   # Law collection configuration
│       └── chroma_db/        # Local ChromaDB data (HNSW only; sqlite not in git)
├── packages/
│   ├── shared-types/         # Shared TypeScript types (@hydrogen-law/shared-types)
│   └── ui-components/        # (Placeholder) Shared UI components
└── scripts/                  # Utility scripts
```

## Commands

### Frontend (apps/web/)
```bash
cd apps/web
npm run dev          # Dev server with Turbopack
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript type checking
```

### RAG Engine (services/rag-engine/)
```bash
cd services/rag-engine
pip install -r requirements.txt         # Install dependencies

# Start dev server (BM25-only mode when HuggingFace is unreachable)
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 uvicorn main:app --reload --port 8000

python load_pdfs_to_rag.py              # Ingest PDF law documents into ChromaDB
pytest                                  # Run tests
black .                                 # Format Python code
```

### Local Development (start both services)
```bash
# 1. Start RAG engine first (port 8000) — required when Supabase env vars are not set
cd services/rag-engine
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 uvicorn main:app --reload --port 8000

# 2. Then start frontend (port 3000)
cd apps/web
npm run dev
```

### Shared Types (packages/shared-types/)
```bash
cd packages/shared-types
npm run type-check   # TypeScript type checking
```

## Environment Variables

Reference: `services/rag-engine/.env.example`

| Variable | Required | Description |
|----------|----------|-------------|
| `LAW_API_KEY` | No | 국가법령정보센터 API key (data.go.kr) |
| `DATABASE_URL` | No | PostgreSQL connection string (Supabase) |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL (frontend); if unset, falls back to RAG engine |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key (frontend); if unset, falls back to RAG engine |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key (API route server-side) |
| `PINECONE_API_KEY` | No | Pinecone API key (production only) |
| `ANTHROPIC_API_KEY` | No | Claude API key (optional AI features) |

**Note**: No env vars are strictly required for local dev. Without Supabase vars, the frontend API route falls back to the RAG engine at `localhost:8000`.

## Conventions

- **Python**: snake_case, formatted with `black`
- **TypeScript**: camelCase for variables/functions, PascalCase for components
- **Commits**: Conventional Commits (feat/fix/refactor)
- **Korean law structure**: 장(Chapter) > 조(Article) > 항(Paragraph) > 호(Item) > 목(Subitem)
- **Chunking**: Articles < 500 chars = single chunk; longer articles split by paragraph (항)

## Key APIs

### RAG Engine (FastAPI - port 8000)
- `GET /` - Health check
- `POST /search` - Hybrid law search (vector + BM25)
- `POST /compliance/check` - Rule-based compliance check (WIP)
- `POST /ai-summary` - Optional LLM summary (WIP)

### Frontend API Routes (Next.js)
- `POST /api/search` - Search endpoint (Supabase → RAG engine fallback)

## Testing

```bash
# RAG Engine
cd services/rag-engine
pytest                                  # Unit tests
python test_hybrid_search.py            # Integration search test

# Frontend
cd apps/web
npm run lint && npm run build           # Lint + build check
```

## Search Fallback Architecture

The search system has a multi-layer fallback chain to ensure results are always returned:

1. **Frontend API route** (`/api/search`): Tries Supabase first. If `NEXT_PUBLIC_SUPABASE_URL` is not set, falls back to RAG engine at `localhost:8000`.
2. **RAG engine** (`main.py`): Tries to load ChromaDB + embedding model for hybrid search. If embedding model is unavailable (e.g. HuggingFace blocked), falls back to BM25-only mode.
3. **Document loading**: Tries ChromaDB first. If ChromaDB is empty (0 documents), loads pre-parsed documents from `law_documents.json`.
4. **BM25 search**: If BM25 returns insufficient results, falls back to substring search with Korean compound word splitting.

## Korean Search Considerations

- BM25 tokenizes on spaces, which is inadequate for Korean agglutinative morphology
- Korean particles (은/는/이/가/을/를 etc.) are stripped during tokenization to improve matching
- Compound words like "안전기준" are split into 2-char sliding window substrings for substring search
- Always test searches with Korean compound words after making search changes

## Known Issues & Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `unexpected token...is not valid JSON` | API route returns non-JSON (e.g. HTML error page) | Frontend reads response as text first, then `JSON.parse` with error handling |
| ChromaDB has 0 documents after clone | `chroma.sqlite3` was never committed to git (only HNSW index files) | RAG engine falls back to `law_documents.json` |
| Embedding model fails to load | HuggingFace may be blocked by proxy/firewall | Set `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1`; engine falls back to BM25-only |
| Search returns 0 results for Korean compound words | BM25 space-based tokenization misses compounds | Substring search fallback with compound word splitting handles this |
| Supabase rows with null metadata | Some DB rows have null metadata/content fields | API route uses null guards (`row.metadata \|\| {}`) and per-row try-catch |
| Port 8000/3000 already in use | Previous dev server not stopped | Kill existing process before restarting |

## Law PDFs

The project includes Korean law PDFs (고압가스 안전관리법 and related regulations) at the project root. These are ingested via `load_pdfs_to_rag.py` into ChromaDB for vector search. Pre-parsed versions are stored in `law_documents.json` as a fallback when ChromaDB is empty.
