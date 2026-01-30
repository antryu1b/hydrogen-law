-- Korean-optimized keyword search function using LIKE
-- Simple tokenizer doesn't work well for Korean text, so using pattern matching instead
CREATE OR REPLACE FUNCTION search_law_documents(
  search_query TEXT,
  max_results INT DEFAULT 10
)
RETURNS TABLE (
  id TEXT,
  content TEXT,
  metadata JSONB,
  relevance_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ld.id,
    ld.content,
    ld.metadata,
    -- Score based on number of occurrences
    (LENGTH(ld.content) - LENGTH(REPLACE(ld.content, search_query, '')))::FLOAT / LENGTH(search_query)::FLOAT AS relevance_score
  FROM law_documents ld
  WHERE ld.content LIKE '%' || search_query || '%'
  ORDER BY relevance_score DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
