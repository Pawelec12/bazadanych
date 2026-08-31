CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_catalog_number_trgm_idx ON products USING gin (catalog_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_embeddings_hnsw_idx ON product_embeddings USING hnsw (embedding vector_cosine_ops);
