# hydrogen-law — Architecture (post H1)

## Phase overview

| Phase | Target | Status |
|-------|--------|--------|
| H1 | Foundation refactor (this doc) | Done |
| H2 | A — Compliance check | Next |
| H3 | D — Multi-corpus (legalize-kr 2303 laws) | Planned |
| H4 | E — PDF report export | Planned |
| H5 | C — Law comparison / diff | Planned |
| H6 | B — Discord alerts | Planned |

---

## Repository layout

```
hydrogen-law/
├── apps/
│   └── web/                          Next.js frontend
│       └── src/
│           ├── app/
│           │   ├── api/
│           │   │   └── search/route.ts   # thin wrapper — delegates to features/search/
│           │   └── page.tsx
│           ├── components/           shadcn/ui primitives only
│           ├── features/             # H1: feature-first structure
│           │   ├── search/
│           │   │   ├── api/
│           │   │   │   └── search-handler.ts   # pure search logic
│           │   │   ├── components/   # (H2+)
│           │   │   ├── hooks/        # (H2+)
│           │   │   └── types.ts      # re-exports from shared-types
│           │   ├── compliance-check/ # H2 shell
│           │   ├── alerts/           # H6 shell
│           │   ├── law-comparison/   # H5 shell
│           │   └── report-export/    # H4 shell
│           └── types/
│               └── search.ts         # UI-layer search types
├── packages/
│   └── shared-types/
│       └── src/
│           ├── domain/               # H1: new domain type layer
│           │   ├── law.ts            # Law, Article, Paragraph, Citation
│           │   ├── compliance.ts     # Rule, Violation, ComplianceCheck, ComplianceReport
│           │   ├── subscription.ts   # Subscription, Alert, DeliveryChannel
│           │   └── diff.ts           # VersionDiff, ChangedArticle
│           └── index.ts
├── services/
│   └── rag-engine/                   Python FastAPI
│       ├── main.py                   # thin: FastAPI init + mount routers (< 50 lines)
│       ├── law_config.yaml           # config-driven law list (H3 extends to 2303 laws)
│       └── src/
│           ├── api/                  # H1: route handlers extracted from main.py
│           │   ├── health.py         # GET / and GET /health
│           │   ├── search.py         # POST /search
│           │   ├── law.py            # GET /laws, GET /laws/{id}
│           │   ├── compliance.py     # POST /compliance/check (H2 shell)
│           │   └── upload.py         # POST /upload (PDF ingest)
│           ├── domain/               # H1: Pydantic v2 domain models
│           │   ├── law.py
│           │   ├── compliance.py
│           │   ├── subscription.py
│           │   └── diff.py
│           ├── retrievers/           # H1: pluggable retriever registry
│           │   ├── base.py           # AbstractRetriever ABC
│           │   └── registry.py       # register / get / list_available
│           ├── services/             # H1: business logic extracted from main.py
│           │   ├── search_service.py
│           │   └── compliance_service.py  # H2 shell
│           ├── embeddings/
│           │   ├── chunker.py
│           │   ├── embedder.py
│           │   └── vector_store.py
│           └── retrieval/
│               └── hybrid_retriever.py
└── tests/
    ├── fixtures/
    │   ├── smoke_queries.json        # 5 smoke test queries
    │   └── search_before.json        # baseline (captured before H1 — run smoke_test.py capture)
    └── smoke_test.py                 # H1 gate: before/after top-3 equivalence
```

---

## Search flow (H1)

```
Browser → POST /api/search (Next.js route — thin wrapper)
            ↓ delegates to
          features/search/api/search-handler.ts
            ↓ tries Beopmang API
            ↓ falls back to Supabase RPC
          → JSON response
```

## RAG engine search flow (H1)

```
POST /search (FastAPI)
  → src/api/search.py
  → retriever registry get('hybrid')
  → HybridRetriever.search()
       ├── vector search (ChromaDB)
       └── BM25 search
       → RRF fusion → rule-based reranking
  → SearchResponse
```

---

## Adding a new retriever (H3+)

```python
from src.retrievers import register
from src.retrievers.base import AbstractRetriever

@register('bm25-extended')
class BM25ExtendedRetriever(AbstractRetriever):
    name = 'bm25-extended'
    def search(self, query: str, top_k: int): ...
```

---

## Extending law corpus (H3)

Add entries to `services/rag-engine/law_config.yaml` under `laws:`.
H3 targets: legalize-kr 2303 laws. No code changes needed — YAML only.

---

## H2 implementation notes

- Entry: `services/rag-engine/src/api/compliance.py` (`POST /compliance/check`)
- Service: `services/rag-engine/src/services/compliance_service.py`
- Domain: `src/domain/compliance.py` (Rule, Violation, ComplianceCheck, ComplianceReport)
- Frontend shell: `apps/web/src/features/compliance-check/index.ts`
- Law config: `law_config.yaml` → `compliance_rules.business_types`
