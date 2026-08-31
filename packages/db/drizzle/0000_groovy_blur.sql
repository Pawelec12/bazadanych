CREATE TYPE "public"."discrepancy_severity" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."discrepancy_type" AS ENUM('added', 'updated', 'removed', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."enrichment_status" AS ENUM('pending', 'approved', 'rejected', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'inactive', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."raw_row_status" AS ENUM('staged', 'processed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."refresh_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('accessory', 'replacement', 'compatible_with', 'bundle');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refresh_run_id" uuid NOT NULL,
	"product_id" uuid,
	"catalog_number" text,
	"type" "discrepancy_type" NOT NULL,
	"severity" "discrepancy_severity" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enriched_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"application_description" text,
	"search_summary" text,
	"relationships" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"model_version" text,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "enrichment_status" DEFAULT 'pending' NOT NULL,
	"content_hash_at_enrichment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"file_url" text,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "manufacturers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"config_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manufacturers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"searchable_text" text NOT NULL,
	"model_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_product_id" uuid NOT NULL,
	"target_product_id" uuid NOT NULL,
	"type" "relationship_type" NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"rationale" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"category_id" uuid,
	"catalog_number" text NOT NULL,
	"mpn" text,
	"gtin" text,
	"name" text NOT NULL,
	"description" text,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"last_import_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_run_id" uuid NOT NULL,
	"source_row" integer NOT NULL,
	"raw_fields" jsonb NOT NULL,
	"parse_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "raw_row_status" DEFAULT 'staged' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"import_run_id" uuid,
	"status" "refresh_status" DEFAULT 'running' NOT NULL,
	"files_processed" integer DEFAULT 0 NOT NULL,
	"added_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"removed_count" integer DEFAULT 0 NOT NULL,
	"conflict_count" integer DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_refresh_run_id_refresh_runs_id_fk" FOREIGN KEY ("refresh_run_id") REFERENCES "public"."refresh_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enriched_content" ADD CONSTRAINT "enriched_content_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relationships" ADD CONSTRAINT "product_relationships_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relationships" ADD CONSTRAINT "product_relationships_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_last_import_run_id_import_runs_id_fk" FOREIGN KEY ("last_import_run_id") REFERENCES "public"."import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_import_rows" ADD CONSTRAINT "raw_import_rows_import_run_id_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_runs" ADD CONSTRAINT "refresh_runs_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_runs" ADD CONSTRAINT "refresh_runs_import_run_id_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "discrepancies_refresh_run_id_idx" ON "discrepancies" USING btree ("refresh_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enriched_content_product_id_idx" ON "enriched_content" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "enriched_content_status_idx" ON "enriched_content" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_runs_manufacturer_id_idx" ON "import_runs" USING btree ("manufacturer_id");--> statement-breakpoint
CREATE INDEX "import_runs_file_hash_idx" ON "import_runs" USING btree ("file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "product_embeddings_product_id_idx" ON "product_embeddings" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_relationships_source_idx" ON "product_relationships" USING btree ("source_product_id");--> statement-breakpoint
CREATE INDEX "product_relationships_target_idx" ON "product_relationships" USING btree ("target_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_manufacturer_catalog_idx" ON "products" USING btree ("manufacturer_id","catalog_number");--> statement-breakpoint
CREATE INDEX "products_catalog_number_idx" ON "products" USING btree ("catalog_number");--> statement-breakpoint
CREATE INDEX "products_mpn_idx" ON "products" USING btree ("mpn");--> statement-breakpoint
CREATE INDEX "products_gtin_idx" ON "products" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_content_hash_idx" ON "products" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "raw_import_rows_import_run_id_idx" ON "raw_import_rows" USING btree ("import_run_id");--> statement-breakpoint
CREATE INDEX "refresh_runs_manufacturer_id_idx" ON "refresh_runs" USING btree ("manufacturer_id");