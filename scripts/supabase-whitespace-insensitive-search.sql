-- Hydrogen-law: whitespace-insensitive keyword search
-- =====================================================================
-- GOAL: a query like "연료전지" must match stored text "연료 전지" and
-- vice versa. PostgREST `.ilike('%kw%')` compares the stored column as-is,
-- so we cannot strip spaces from stored content from the JS side. The fix
-- lives in Postgres: compare the space-stripped term against space-stripped
-- columns (replace(col,' ','')).
--
-- This file ONLY rewrites the existing `search_law_articles` RPC (same
-- signature, so apps/web/src/app/api/search/route.ts keeps calling it
-- unchanged) and adds functional trigram indexes so the space-stripped
-- ILIKE stays fast. The previous fixed-content RPC lives in
-- scripts/supabase-search-indexes.sql; apply that first (pg_trgm + base
-- indexes), then this file.
--
-- DO NOT auto-run. Apply manually in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ygohwygdwbckgtotlogm/sql
-- =====================================================================

-- 0. pg_trgm is required (no-op if scripts/supabase-search-indexes.sql ran)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Functional trigram indexes on space-stripped columns so
--    replace(col,' ','') ILIKE '%...%' uses an index instead of a seq scan.
CREATE INDEX IF NOT EXISTS law_articles_content_nospace_trgm
  ON law_articles USING gin (replace(content, ' ', '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS law_articles_title_nospace_trgm
  ON law_articles USING gin (replace(title, ' ', '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS law_articles_law_name_nospace_trgm
  ON law_articles USING gin (replace(law_name, ' ', '') gin_trgm_ops);

-- 2. Rewrite the RPC to be whitespace-insensitive on BOTH sides.
DROP FUNCTION IF EXISTS search_law_articles(text, int);

CREATE OR REPLACE FUNCTION search_law_articles(
  search_query text,
  max_results int DEFAULT 50
)
RETURNS TABLE (
  id text,
  law_name text,
  law_id text,
  law_type text,
  article_no text,
  title text,
  content text,
  relevance_score real
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    -- nterm = term with all whitespace removed (matched against the
    -- space-stripped columns); term = original (kept for trgm similarity)
    SELECT
      search_query AS term,
      replace(search_query, ' ', '') AS nterm
  )
  SELECT
    a.id,
    a.law_name,
    a.law_id,
    a.law_type,
    a.article_no,
    a.title,
    a.content,
    (
      CASE WHEN replace(a.law_name, ' ', '') ILIKE '%' || q.nterm || '%' THEN 3.0 ELSE 0 END +
      CASE WHEN replace(a.title, ' ', '')    ILIKE '%' || q.nterm || '%' THEN 2.0 ELSE 0 END +
      CASE WHEN replace(a.content, ' ', '')  ILIKE '%' || q.nterm || '%' THEN 1.0 ELSE 0 END +
      similarity(a.content, q.term) * 0.5
    )::real AS relevance_score
  FROM law_articles a, q
  WHERE
    replace(a.law_name, ' ', '') ILIKE '%' || q.nterm || '%'
    OR replace(a.title, ' ', '') ILIKE '%' || q.nterm || '%'
    OR replace(a.content, ' ', '') ILIKE '%' || q.nterm || '%'
  ORDER BY relevance_score DESC
  LIMIT max_results;
$$;

-- 3. Verify
SELECT 'whitespace-insensitive search_law_articles installed' AS status;
-- Expect rows whose content reads "연료 전지" to surface for term "연료전지":
-- SELECT id, law_name FROM search_law_articles('연료전지', 5);
