CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed');
CREATE TYPE "public"."job_type" AS ENUM('embed', 'enrich');

CREATE TABLE IF NOT EXISTS "background_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" "job_type" NOT NULL,
  "status" "job_status" DEFAULT 'pending' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "background_jobs_status_idx" ON "background_jobs" ("status");
CREATE INDEX IF NOT EXISTS "background_jobs_type_idx" ON "background_jobs" ("type");

CREATE UNIQUE INDEX IF NOT EXISTS "product_relationships_unique_idx"
  ON "product_relationships" ("source_product_id", "target_product_id", "type");

CREATE INDEX IF NOT EXISTS "products_attributes_gin_idx"
  ON "products" USING gin ("attributes" jsonb_path_ops);
