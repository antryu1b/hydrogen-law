-- Hydrogen-law: Supabase search index enhancement
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ygohwygdwbckgtotlogm/sql

-- 1. Enable pg_trgm extension for fuzzy/substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram indexes on content + law_name (fast ILIKE substring search)
CREATE INDEX IF NOT EXISTS law_articles_content_trgm
  ON law_articles USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS law_articles_law_name_trgm
  ON law_articles USING gin (law_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS law_articles_title_trgm
  ON law_articles USING gin (title gin_trgm_ops);

-- 3. Drop and recreate RPC function for keyword search
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
    SELECT search_query AS term
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
      CASE WHEN a.law_name ILIKE '%' || q.term || '%' THEN 3.0 ELSE 0 END +
      CASE WHEN a.title ILIKE '%' || q.term || '%' THEN 2.0 ELSE 0 END +
      CASE WHEN a.content ILIKE '%' || q.term || '%' THEN 1.0 ELSE 0 END +
      similarity(a.content, q.term) * 0.5
    )::real AS relevance_score
  FROM law_articles a, q
  WHERE
    a.law_name ILIKE '%' || q.term || '%'
    OR a.title ILIKE '%' || q.term || '%'
    OR a.content ILIKE '%' || q.term || '%'
  ORDER BY relevance_score DESC
  LIMIT max_results;
$$;

-- 4. Verify
SELECT 'pg_trgm enabled' AS status WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm');
SELECT count(*) AS total_articles FROM law_articles;
SELECT count(DISTINCT law_name) AS total_laws FROM law_articles;
