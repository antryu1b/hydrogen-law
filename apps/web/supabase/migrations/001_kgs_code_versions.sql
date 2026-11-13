-- 001_kgs_code_versions.sql
-- KGS CODE version store (phase 1: schema only; applied manually by the operator).
--
-- One row per (code, revision_date). The app reads the newest row with
-- status = 'active' per code when KGS_SOURCE=db (see apps/web/src/lib/kgs-source.ts).
--
-- jsonb layout (mirrors the existing static files under apps/web/data/ verbatim):
--
--   body = {
--     ...apps/web/data/kgs_sections/<CODE>.json      -- the whole per-code file:
--          code, title, version_date, page_count, section_count, appendix_count,
--          depth_distribution, umbrella_count, orphaned_count, low_confidence_count,
--          toc_artifacts_skipped, toc_artifacts, empty_body_breakdown,
--          sections:          [{ sec_no, title, level, body?, body_chars?, is_umbrella?,
--                                body_status?, page_start?, page_end?,
--                                is_orphan_artifact?, equation_regions?: [{ page, bbox, id }] }],
--          appendix_sections: [{ ...same, is_appendix, appendix_kind, appendix_no }],
--     ocr: { <regionId>: { ocr_text, ocr_confidence, ocr_good } }
--                                                     -- = apps/web/data/kgs_ocr.json[<CODE>]
--   }
--
--   toc = per-code projection of apps/web/data/kgs-canonical-toc.json
--         (that file is a cross-code document: families[].canonical_toc[].codes[CODE]
--          and universal[].codes[CODE]). Only the CODE's own cells are stored:
--     {
--       version:   "<canonical toc version>",
--       family_id: "A" | "B" | "C" | null,
--       family:    [{ sec_no, title, level, cell: { present, matched_sec_no,
--                                                   matched_title, body_chars, is_umbrella } }],
--       universal: [{ sec_no, title, level, cell: { ...same } }]
--     }
--     The app overlays these cells onto the static cross-code skeleton
--     (family labels, member lists, ordering) so the API response shape is unchanged.

create table if not exists public.kgs_code_versions (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  revision_date   date not null,
  title           text,
  toc             jsonb,
  body            jsonb,
  source_pdf_path text,
  status          text not null default 'active'
                  check (status in ('pending', 'active', 'superseded')),
  uploaded_by     text,
  created_at      timestamptz default now(),
  unique (code, revision_date)
);

create index if not exists kgs_code_versions_code_status_idx
  on public.kgs_code_versions (code, status);

create index if not exists kgs_code_versions_code_revision_idx
  on public.kgs_code_versions (code, revision_date desc);

-- Server-only table: read/written with the service_role key, which bypasses RLS.
-- Enabling RLS with no policies blocks the public anon key from reading or writing it.
alter table public.kgs_code_versions enable row level security;
