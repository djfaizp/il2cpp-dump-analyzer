-- IL2CPP Dump Analyzer MCP - Database Initialization
-- Initialize PostgreSQL extensions and basic schema

-- Enable required extensions (without role specification)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS public;

-- Create auth schema migrations table (required by Supabase)
CREATE TABLE IF NOT EXISTS auth.schema_migrations (
    version character varying(255) NOT NULL PRIMARY KEY,
    inserted_at timestamp without time zone DEFAULT NOW()
);

-- Insert initial migration version
INSERT INTO auth.schema_migrations (version) VALUES ('20171026211738') ON CONFLICT DO NOTHING;
INSERT INTO auth.schema_migrations (version) VALUES ('20171026211808') ON CONFLICT DO NOTHING;
INSERT INTO auth.schema_migrations (version) VALUES ('20171026211834') ON CONFLICT DO NOTHING;

-- Set up basic roles
DO $$
BEGIN
    -- Create anon role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;

    -- Create authenticated role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;

    -- Create service_role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
    END IF;
END
$$;

-- Grant basic permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA auth TO service_role;

-- Create essential auth tables for Supabase
CREATE TABLE IF NOT EXISTS auth.users (
    instance_id uuid,
    id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW(),
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean NOT NULL DEFAULT false,
    deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS auth.identities (
    id text NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth.sessions (
    id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT NOW(),
    updated_at timestamp with time zone DEFAULT NOW(),
    factor_id uuid,
    aal text,
    not_after timestamp with time zone
);

-- Create auth indexes
CREATE INDEX IF NOT EXISTS users_instance_id_idx ON auth.users(instance_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON auth.users(email);
CREATE INDEX IF NOT EXISTS identities_user_id_idx ON auth.identities(user_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON auth.sessions(user_id);

-- Enable Row Level Security by default
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;

-- Create IL2CPP specific tables
CREATE TABLE IF NOT EXISTS il2cpp_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name TEXT,
    document_hash TEXT UNIQUE,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding vector(384),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS il2cpp_documents_document_hash_idx ON il2cpp_documents(document_hash);
CREATE INDEX IF NOT EXISTS il2cpp_documents_embedding_idx ON il2cpp_documents USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS il2cpp_documents_metadata_idx ON il2cpp_documents USING gin(metadata);
CREATE INDEX IF NOT EXISTS il2cpp_documents_created_at_idx ON il2cpp_documents(created_at);

-- Enable RLS on IL2CPP tables
ALTER TABLE il2cpp_documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow service role full access" ON il2cpp_documents
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow authenticated read access" ON il2cpp_documents
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create file hashes table for hash manager
CREATE TABLE IF NOT EXISTS file_hashes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_path TEXT NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for file_hashes
CREATE INDEX IF NOT EXISTS file_hashes_file_path_idx ON file_hashes(file_path);
CREATE INDEX IF NOT EXISTS file_hashes_file_hash_idx ON file_hashes(file_hash);

-- Enable RLS on file_hashes table
ALTER TABLE file_hashes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for file_hashes
CREATE POLICY "Allow service role full access" ON file_hashes
    FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions on IL2CPP tables
GRANT ALL ON il2cpp_documents TO service_role;
GRANT SELECT ON il2cpp_documents TO authenticated, anon;
GRANT ALL ON file_hashes TO service_role;
GRANT SELECT ON file_hashes TO authenticated, anon;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_il2cpp_documents_updated_at
    BEFORE UPDATE ON il2cpp_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create similarity search function (match_documents - used by vector store)
CREATE OR REPLACE FUNCTION match_documents(
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

-- Create alias for backward compatibility
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
    SELECT * FROM match_documents(query_embedding, match_threshold, match_count);
$$;

-- Grant execute permission on the functions
GRANT EXECUTE ON FUNCTION match_documents TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION match_il2cpp_documents TO authenticated, anon, service_role;
