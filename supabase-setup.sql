-- Run these commands in the Supabase SQL Editor

-- Step 1: Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Create the il2cpp_documents table with vector support
CREATE TABLE IF NOT EXISTS il2cpp_documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT,
  metadata JSONB,
  embedding VECTOR(384),
  document_hash TEXT UNIQUE
);

-- Step 3: Create a function to match documents
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

-- Step 4: No index for now to avoid dimension limitations
-- You can add an appropriate index later if needed for performance
-- CREATE INDEX IF NOT EXISTS il2cpp_documents_embedding_idx
-- ON il2cpp_documents
-- USING GiST (embedding vector_cosine_ops);
