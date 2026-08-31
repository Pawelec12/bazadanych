# Product Knowledge Base

Searchable product knowledge base for technical distribution catalogs with normalization, LLM enrichment, hybrid search, and refresh monitoring.

## Stack

- **Next.js 15** — verification API and internal UI
- **Neon Postgres** — `pgvector` + `pg_trgm` for hybrid search
- **Drizzle ORM** — schema and migrations
- **Vercel AI SDK** — embeddings and enrichment
- **pnpm workspaces** — monorepo layout

## Project Structure

```
apps/web              Next.js verification UI + API routes
packages/db           Drizzle schema and database client
packages/ingest       Parsers, YAML mapping, normalization
packages/search       Hybrid search + confidence scoring
packages/enrich       LLM enrichment + embedding generation
packages/refresh      SFTP polling, diffing, discrepancy reports
configs/manufacturers Per-supplier YAML mapping configs
scripts/              Seed and utility scripts
```

## Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npx pnpm install
```

3. Run migrations against Neon (direct connection):

```bash
npx pnpm db:generate
npx pnpm db:migrate
```

4. Apply extension/index SQL manually if needed:

```bash
# Run packages/db/drizzle/0001_extensions_indexes.sql
# Run packages/db/drizzle/0002_hardening.sql
```

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS products_catalog_number_trgm_idx ON products USING gin (catalog_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_embeddings_hnsw_idx ON product_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS products_attributes_gin_idx ON products USING gin (attributes jsonb_path_ops);
```

5. Start the dev server:

```bash
npx pnpm dev
```

6. Seed sample data (requires `DATABASE_URL`):

```bash
npx pnpm seed
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search` | Hybrid search with confidence explanations |
| GET | `/api/products/:id` | Full product pipeline view |
| POST | `/api/ingest` | Upload and ingest catalog file |
| GET | `/api/ingest` | List import runs |
| GET/PATCH | `/api/enrich` | Review queue / approve / reject |
| POST | `/api/enrich` | Batch enrichment (cron) |
| GET/POST | `/api/refresh` | Refresh runs and discrepancy reports |
| POST | `/api/jobs` | Process background embed/enrich jobs (cron) |
| PUT | `/api/jobs` | Enqueue enrichment batch job |

## Background Jobs

After ingest, changed products are queued as `embed` jobs in `background_jobs`.
Cron `/api/jobs` processes batches every 15 minutes.

```bash
npx pnpm test           # unit tests
npx pnpm eval:search    # precision@5 against labeled queries (requires DB + seed)
```

## Verification UI

- `/search` — Search Playground
- `/products/:id` — Product Inspector
- `/review` — Enrichment Review Queue
- `/refresh` — Refresh Dashboard
- `/ingest` — Ingest Monitor

## Adding a Manufacturer

Create a YAML config in `configs/manufacturers/`:

```yaml
manufacturer: my-supplier
filePattern: "my_supplier_*.csv"
delimiter: ";"
columns:
  catalog_number:
    source: SKU
    transform: [trim, uppercase]
  name:
    source: ProductName
categoryRules:
  - match:
      column: Category
      equals: Bolts
    category: fasteners/bolts
```

## Cron Jobs

Configured in `apps/web/vercel.json`:

- `/api/refresh` — every 6 hours (SFTP poll + diff)
- `/api/enrich` — every 6 hours at :30 (batch enrichment)

Protect cron endpoints with `CRON_SECRET` and `Authorization: Bearer <secret>`.
