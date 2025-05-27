CREATE OR REPLACE FUNCTION match_il2cpp_documents(
    query_embedding vector(384),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    file_name text,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        il2cpp_documents.id,
        il2cpp_documents.file_name,
        il2cpp_documents.content,
        il2cpp_documents.metadata,
        1 - (il2cpp_documents.embedding <=> query_embedding) AS similarity
    FROM il2cpp_documents
    WHERE 1 - (il2cpp_documents.embedding <=> query_embedding) > match_threshold
    ORDER BY il2cpp_documents.embedding <=> query_embedding
    LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_il2cpp_documents TO authenticated, anon, service_role;
