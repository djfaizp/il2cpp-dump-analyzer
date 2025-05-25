-- Enable the pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the main table for storing IL2CPP code chunks and their embeddings
CREATE TABLE IF NOT EXISTS il2cpp_documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(384) NOT NULL,
  document_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS il2cpp_documents_embedding_idx ON il2cpp_documents
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS il2cpp_documents_document_hash_idx ON il2cpp_documents(document_hash);

CREATE INDEX IF NOT EXISTS il2cpp_documents_metadata_idx ON il2cpp_documents USING GIN(metadata);

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

-- Create triggers to automatically update the updated_at column
CREATE TRIGGER update_file_hashes_updated_at
  BEFORE UPDATE ON file_hashes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_il2cpp_documents_updated_at
  BEFORE UPDATE ON il2cpp_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- PERFORMANCE OPTIMIZATIONS
-- =============================================================================

-- Create additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS il2cpp_documents_created_at_idx ON il2cpp_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS il2cpp_documents_content_trgm_idx ON il2cpp_documents USING gin(content gin_trgm_ops);

-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create composite indexes for filtered searches
CREATE INDEX IF NOT EXISTS il2cpp_documents_metadata_type_idx ON il2cpp_documents USING gin((metadata->>'type'));
CREATE INDEX IF NOT EXISTS il2cpp_documents_metadata_namespace_idx ON il2cpp_documents USING gin((metadata->>'namespace'));

-- Optimize vector search with better index parameters
DROP INDEX IF EXISTS il2cpp_documents_embedding_idx;
CREATE INDEX il2cpp_documents_embedding_idx ON il2cpp_documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- ENHANCED SEARCH FUNCTIONS
-- =============================================================================

-- Enhanced match function with metadata filtering
CREATE OR REPLACE FUNCTION match_documents_filtered(
  query_embedding VECTOR(384),
  match_threshold FLOAT DEFAULT 0.0,
  match_count INT DEFAULT 10,
  filter_metadata JSONB DEFAULT '{}'::jsonb
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
  WHERE
    (1 - (il2cpp_documents.embedding <=> query_embedding)) > match_threshold
    AND (
      filter_metadata = '{}'::jsonb
      OR il2cpp_documents.metadata @> filter_metadata
    )
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Hybrid search function combining vector and text search
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(384),
  match_threshold FLOAT DEFAULT 0.0,
  match_count INT DEFAULT 10,
  text_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE(
  id BIGINT,
  content TEXT,
  metadata JSONB,
  combined_score FLOAT,
  text_score FLOAT,
  vector_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    il2cpp_documents.id,
    il2cpp_documents.content,
    il2cpp_documents.metadata,
    (text_weight * ts_rank_cd(to_tsvector('english', il2cpp_documents.content), plainto_tsquery('english', query_text)) +
     vector_weight * (1 - (il2cpp_documents.embedding <=> query_embedding))) AS combined_score,
    ts_rank_cd(to_tsvector('english', il2cpp_documents.content), plainto_tsquery('english', query_text)) AS text_score,
    (1 - (il2cpp_documents.embedding <=> query_embedding)) AS vector_score
  FROM il2cpp_documents
  WHERE
    (1 - (il2cpp_documents.embedding <=> query_embedding)) > match_threshold
    OR to_tsvector('english', il2cpp_documents.content) @@ plainto_tsquery('english', query_text)
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- =============================================================================
-- SECURITY & ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on tables
ALTER TABLE il2cpp_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_hashes ENABLE ROW LEVEL SECURITY;

-- Create policies for il2cpp_documents (allow all operations for authenticated users)
CREATE POLICY "Allow all operations for authenticated users" ON il2cpp_documents
  FOR ALL USING (auth.role() = 'authenticated');

-- Create policies for file_hashes (allow all operations for authenticated users)
CREATE POLICY "Allow all operations for authenticated users" ON file_hashes
  FOR ALL USING (auth.role() = 'authenticated');

-- =============================================================================
-- MONITORING & ANALYTICS
-- =============================================================================

-- Create table for tracking query performance
CREATE TABLE IF NOT EXISTS query_performance_log (
  id BIGSERIAL PRIMARY KEY,
  operation_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  query_params JSONB DEFAULT '{}',
  result_count INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance log
CREATE INDEX IF NOT EXISTS query_performance_log_operation_idx ON query_performance_log(operation_name);
CREATE INDEX IF NOT EXISTS query_performance_log_created_at_idx ON query_performance_log(created_at DESC);
CREATE INDEX IF NOT EXISTS query_performance_log_duration_idx ON query_performance_log(duration_ms DESC);

-- Function to log query performance
CREATE OR REPLACE FUNCTION log_query_performance(
  operation_name TEXT,
  duration_ms INTEGER,
  query_params JSONB DEFAULT '{}',
  result_count INTEGER DEFAULT NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO query_performance_log (
    operation_name, duration_ms, query_params, result_count, success, error_message
  ) VALUES (
    operation_name, duration_ms, query_params, result_count, success, error_message
  );
END;
$$;

-- =============================================================================
-- MAINTENANCE & CLEANUP FUNCTIONS
-- =============================================================================

-- Function to clean up old performance logs
CREATE OR REPLACE FUNCTION cleanup_old_performance_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM query_performance_log
  WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function to get database statistics
CREATE OR REPLACE FUNCTION get_database_stats()
RETURNS TABLE(
  table_name TEXT,
  row_count BIGINT,
  table_size TEXT,
  index_size TEXT,
  total_size TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    schemaname||'.'||tablename AS table_name,
    n_tup_ins - n_tup_del AS row_count,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS index_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) + pg_indexes_size(schemaname||'.'||tablename)) AS total_size
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
    AND tablename IN ('il2cpp_documents', 'file_hashes', 'query_performance_log');
END;
$$;

-- =============================================================================
-- BACKUP & MIGRATION HELPERS
-- =============================================================================

-- Function to export documents metadata for backup
CREATE OR REPLACE FUNCTION export_documents_metadata()
RETURNS TABLE(
  id BIGINT,
  document_hash TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    il2cpp_documents.id,
    il2cpp_documents.document_hash,
    il2cpp_documents.metadata,
    il2cpp_documents.created_at
  FROM il2cpp_documents
  ORDER BY il2cpp_documents.created_at;
END;
$$;