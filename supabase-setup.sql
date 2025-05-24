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

-- Create the file_hashes table for tracking processed dump.cs files
CREATE TABLE IF NOT EXISTS file_hashes (
  id BIGSERIAL PRIMARY KEY,
  file_path TEXT UNIQUE NOT NULL,
  hash_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on file_path for faster lookups
CREATE INDEX IF NOT EXISTS file_hashes_file_path_idx ON file_hashes(file_path);

-- Create an index on hash_value for faster hash lookups
CREATE INDEX IF NOT EXISTS file_hashes_hash_value_idx ON file_hashes(hash_value);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_file_hashes_updated_at
  BEFORE UPDATE ON file_hashes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
