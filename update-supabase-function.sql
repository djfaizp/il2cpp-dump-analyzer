-- Update the match_documents function to fix the ambiguous column reference
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(384),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE(
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    il2cpp_documents.id,
    il2cpp_documents.content,
    il2cpp_documents.metadata,
    1 - (il2cpp_documents.embedding <=> query_embedding) AS similarity
  FROM il2cpp_documents
  WHERE 1 - (il2cpp_documents.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
