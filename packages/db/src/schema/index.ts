import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const productStatusEnum = pgEnum("product_status", [
  "active",
  "inactive",
  "quarantined",
]);

export const importStatusEnum = pgEnum("import_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const rawRowStatusEnum = pgEnum("raw_row_status", [
  "staged",
  "processed",
  "rejected",
]);

export const enrichmentStatusEnum = pgEnum("enrichment_status", [
  "pending",
  "approved",
  "rejected",
  "needs_review",
]);

export const relationshipTypeEnum = pgEnum("relationship_type", [
  "accessory",
  "replacement",
  "compatible_with",
  "bundle",
]);

export const discrepancyTypeEnum = pgEnum("discrepancy_type", [
  "added",
  "updated",
  "removed",
  "conflict",
]);

export const discrepancySeverityEnum = pgEnum("discrepancy_severity", [
  "info",
  "warning",
  "error",
]);

export const refreshStatusEnum = pgEnum("refresh_status", [
  "running",
  "completed",
  "failed",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const jobTypeEnum = pgEnum("job_type", ["embed", "enrich"]);

export const manufacturers = pgTable("manufacturers", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  configPath: text("config_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("categories_parent_id_idx").on(table.parentId)]
);

export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    manufacturerId: uuid("manufacturer_id")
      .notNull()
      .references(() => manufacturers.id),
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    fileUrl: text("file_url"),
    status: importStatusEnum("status").default("pending").notNull(),
    rowCount: integer("row_count").default(0).notNull(),
    processedCount: integer("processed_count").default(0).notNull(),
    rejectedCount: integer("rejected_count").default(0).notNull(),
    errors: jsonb("errors").$type<string[]>().default([]).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("import_runs_manufacturer_id_idx").on(table.manufacturerId),
    index("import_runs_file_hash_idx").on(table.fileHash),
  ]
);

export const rawImportRows = pgTable(
  "raw_import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => importRuns.id, { onDelete: "cascade" }),
    sourceRow: integer("source_row").notNull(),
    rawFields: jsonb("raw_fields").$type<Record<string, unknown>>().notNull(),
    parseErrors: jsonb("parse_errors").$type<string[]>().default([]).notNull(),
    status: rawRowStatusEnum("status").default("staged").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("raw_import_rows_import_run_id_idx").on(table.importRunId)]
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    manufacturerId: uuid("manufacturer_id")
      .notNull()
      .references(() => manufacturers.id),
    categoryId: uuid("category_id").references(() => categories.id),
    catalogNumber: text("catalog_number").notNull(),
    mpn: text("mpn"),
    gtin: text("gtin"),
    name: text("name").notNull(),
    description: text("description"),
    status: productStatusEnum("status").default("active").notNull(),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().default({}).notNull(),
    contentHash: text("content_hash").notNull(),
    lastImportRunId: uuid("last_import_run_id").references(() => importRuns.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("products_manufacturer_catalog_idx").on(
      table.manufacturerId,
      table.catalogNumber
    ),
    index("products_catalog_number_idx").on(table.catalogNumber),
    index("products_mpn_idx").on(table.mpn),
    index("products_gtin_idx").on(table.gtin),
    index("products_category_id_idx").on(table.categoryId),
    index("products_content_hash_idx").on(table.contentHash),
  ]
);

export const enrichedContent = pgTable(
  "enriched_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    applicationDescription: text("application_description"),
    searchSummary: text("search_summary"),
    relationships: jsonb("relationships")
      .$type<
        Array<{
          catalogNumber: string;
          type: string;
          confidence: number;
          rationale: string;
        }>
      >()
      .default([])
      .notNull(),
    confidence: real("confidence").default(0).notNull(),
    modelVersion: text("model_version"),
    sourceRefs: jsonb("source_refs").$type<string[]>().default([]).notNull(),
    status: enrichmentStatusEnum("status").default("pending").notNull(),
    contentHashAtEnrichment: text("content_hash_at_enrichment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("enriched_content_product_id_idx").on(table.productId),
    index("enriched_content_status_idx").on(table.status),
  ]
);

export const productEmbeddings = pgTable(
  "product_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    searchableText: text("searchable_text").notNull(),
    modelVersion: text("model_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("product_embeddings_product_id_idx").on(table.productId)]
);

export const productRelationships = pgTable(
  "product_relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceProductId: uuid("source_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    targetProductId: uuid("target_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: relationshipTypeEnum("type").notNull(),
    confidence: real("confidence").default(0).notNull(),
    rationale: text("rationale"),
    isVerified: boolean("is_verified").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_relationships_source_idx").on(table.sourceProductId),
    index("product_relationships_target_idx").on(table.targetProductId),
    uniqueIndex("product_relationships_unique_idx").on(
      table.sourceProductId,
      table.targetProductId,
      table.type
    ),
  ]
);

export const refreshRuns = pgTable(
  "refresh_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    manufacturerId: uuid("manufacturer_id")
      .notNull()
      .references(() => manufacturers.id),
    importRunId: uuid("import_run_id").references(() => importRuns.id),
    status: refreshStatusEnum("status").default("running").notNull(),
    filesProcessed: integer("files_processed").default(0).notNull(),
    addedCount: integer("added_count").default(0).notNull(),
    updatedCount: integer("updated_count").default(0).notNull(),
    removedCount: integer("removed_count").default(0).notNull(),
    conflictCount: integer("conflict_count").default(0).notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>().default({}).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("refresh_runs_manufacturer_id_idx").on(table.manufacturerId)]
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: jobTypeEnum("type").notNull(),
    status: jobStatusEnum("status").default("pending").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("background_jobs_status_idx").on(table.status),
    index("background_jobs_type_idx").on(table.type),
  ]
);

export const discrepancies = pgTable(
  "discrepancies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    refreshRunId: uuid("refresh_run_id")
      .notNull()
      .references(() => refreshRuns.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),
    catalogNumber: text("catalog_number"),
    type: discrepancyTypeEnum("type").notNull(),
    severity: discrepancySeverityEnum("severity").default("info").notNull(),
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("discrepancies_refresh_run_id_idx").on(table.refreshRunId)]
);

export const manufacturersRelations = relations(manufacturers, ({ many }) => ({
  products: many(products),
  importRuns: many(importRuns),
  refreshRuns: many(refreshRuns),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  manufacturer: one(manufacturers, {
    fields: [products.manufacturerId],
    references: [manufacturers.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  enrichedContent: one(enrichedContent),
  embedding: one(productEmbeddings),
  sourceRelationships: many(productRelationships, { relationName: "source" }),
  targetRelationships: many(productRelationships, { relationName: "target" }),
}));

export const importRunsRelations = relations(importRuns, ({ one, many }) => ({
  manufacturer: one(manufacturers, {
    fields: [importRuns.manufacturerId],
    references: [manufacturers.id],
  }),
  rawRows: many(rawImportRows),
}));

export const enrichedContentRelations = relations(enrichedContent, ({ one }) => ({
  product: one(products, {
    fields: [enrichedContent.productId],
    references: [products.id],
  }),
}));

export const productRelationshipsRelations = relations(productRelationships, ({ one }) => ({
  sourceProduct: one(products, {
    fields: [productRelationships.sourceProductId],
    references: [products.id],
    relationName: "source",
  }),
  targetProduct: one(products, {
    fields: [productRelationships.targetProductId],
    references: [products.id],
    relationName: "target",
  }),
}));

export const productEmbeddingsRelations = relations(productEmbeddings, ({ one }) => ({
  product: one(products, {
    fields: [productEmbeddings.productId],
    references: [products.id],
  }),
}));

export const discrepanciesRelations = relations(discrepancies, ({ one }) => ({
  refreshRun: one(refreshRuns, {
    fields: [discrepancies.refreshRunId],
    references: [refreshRuns.id],
  }),
  product: one(products, {
    fields: [discrepancies.productId],
    references: [products.id],
  }),
}));

export const refreshRunsRelations = relations(refreshRuns, ({ one, many }) => ({
  manufacturer: one(manufacturers, {
    fields: [refreshRuns.manufacturerId],
    references: [manufacturers.id],
  }),
  importRun: one(importRuns, {
    fields: [refreshRuns.importRunId],
    references: [importRuns.id],
  }),
  discrepancies: many(discrepancies),
}));
