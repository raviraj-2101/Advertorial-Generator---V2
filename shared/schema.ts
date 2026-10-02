import { pgTable, uuid, text, integer, jsonb, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Supabase Postgres schema for advertorials-generator.
 *
 * Notes on extensions:
 * - `pgvector` is required for `image_bank_items.embedding`. Enable it via
 *   `create extension if not exists vector;` in the Supabase SQL editor
 *   before running `npm run db:push`.
 * - `pg_trgm` (optional) gives faster full-text matching on tags / names.
 *
 * Brand+product slugs are surface-level identifiers, not opaque keys —
 * they match the directory names in Acentecom/product-configs and the
 * brand directory naming used by the Shopify/Acentecom stack.
 */

// ─── Brands ─────────────────────────────────────────────────────────────
export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Array of fully-qualified domain names that the publishing endpoint
   *  may target. Populated via the Brands & Products tab. */
  domainPool: text("domain_pool").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Products ───────────────────────────────────────────────────────────
export const products = pgTable("products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  brandSlug: text("brand_slug").references(() => brands.slug),
  displayName: text("display_name").notNull(),
  /** Per-product image generation rules. Shape:
   *  {
   *    spec_keys: {
   *      "product-in-context-environmental": { prompt_template, constraints },
   *      "hand-held-product":                 { prompt_template, constraints },
   *      ...
   *    },
   *    lock_downs: ["sticker proportions fixed", "label silhouette fixed", ...]
   *  } */
  imageSpec: jsonb("image_spec").notNull().default(sql`'{}'::jsonb`),
  /** Bank image IDs pinned as canonical reference photos for this product. */
  referenceImageIds: uuid("reference_image_ids").array().notNull().default(sql`'{}'::uuid[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Projects ───────────────────────────────────────────────────────────
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  brandSlug: text("brand_slug"),
  productSlug: text("product_slug").notNull(),
  directionPrompt: text("direction_prompt").notNull(),
  selectedTemplateSlugs: text("selected_template_slugs").array().notNull(),
  /** in_work | archived */
  status: text("status").notNull().default("in_work"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Skeletons ──────────────────────────────────────────────────────────
export const skeletons = pgTable("skeletons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  templateSlug: text("template_slug").notNull(),
  /** Array of 5 title candidates (top of 20 generated). */
  titleCandidates: jsonb("title_candidates").notNull().default(sql`'[]'::jsonb`),
  titleChosen: text("title_chosen"),
  /** Structured section overview before full lander generation. Shape:
   *  { sections: [{ id, type, summary, target_words?, image_slot? }], offer_strategy } */
  body: jsonb("body").notNull(),
  /** pending | approved | discarded | revised */
  status: text("status").notNull().default("pending"),
  /** Append-only log of revision prompts the user submitted for this skeleton. */
  revisionHistory: jsonb("revision_history").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Landers ────────────────────────────────────────────────────────────
export const landers = pgTable("landers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  skeletonId: uuid("skeleton_id").references(() => skeletons.id, { onDelete: "cascade" }).notNull(),
  templateSlug: text("template_slug").notNull(),
  internalName: text("internal_name").notNull(),
  /** generating | in_work | published | failed */
  status: text("status").notNull().default("generating"),
  /** Authoritative section model. Shape:
   *  [{ id, type, content, design_class?, image_slot_key?, ... }] */
  sectionModel: jsonb("section_model").notNull().default(sql`'[]'::jsonb`),
  /** Rendered HTML cached for preview + publish. */
  html: text("html"),
  /** image_slot_key -> URL (Supabase Storage public URL or bank URL). */
  imageUrls: jsonb("image_urls").notNull().default(sql`'{}'::jsonb`),
  ctaUrl: text("cta_url"),
  publishedUrl: text("published_url"),
  publishedDomain: text("published_domain"),
  publishedPath: text("published_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Image bank items ───────────────────────────────────────────────────
export const imageBankItems = pgTable("image_bank_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  storageUrl: text("storage_url").notNull(),
  storagePath: text("storage_path").notNull(),
  width: integer("width"),
  height: integer("height"),
  aspectRatio: text("aspect_ratio"),
  mimeType: text("mime_type"),
  brandSlug: text("brand_slug").references(() => brands.slug),
  productSlug: text("product_slug").references(() => products.slug),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  aiDescription: text("ai_description"),
  /** User-defined key/value pairs. Built-in typed keys: `brand`, `product`,
   *  `archetype`, `template_compatibility`. */
  customVariables: jsonb("custom_variables").notNull().default(sql`'{}'::jsonb`),
  /** ai-generated | uploaded | saved-from-lander | imported */
  source: text("source").notNull(),
  sourceLanderId: uuid("source_lander_id").references(() => landers.id),
  sourcePrompt: text("source_prompt"),
  sourceReferenceImageId: uuid("source_reference_image_id"),
  /** pgvector embedding — declared as `vector(1536)` in raw SQL since
   *  drizzle-orm/pg-core doesn't ship a vector column type. Migration in
   *  `drizzle/manual/0001_pgvector.sql` adds it. */
  // embedding: declared in raw migration; do not query through Drizzle.
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Sessions (bearer-token auth) ───────────────────────────────────────
export const sessions = pgTable("sessions", {
  token: varchar("token", { length: 64 }).primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Zod schemas for API payloads ───────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(140),
  brandSlug: z.string().optional(),
  productSlug: z.string().min(1),
  directionPrompt: z.string().min(1),
  selectedTemplateSlugs: z.array(z.string().min(1)).min(1),
});

export const skeletonReviseSchema = z.object({
  prompt: z.string().min(1),
});

export const generateLandersSchema = z.object({
  skeletonIds: z.array(z.string().uuid()).min(1),
});

export const sectionRevisionSchema = z.object({
  landerId: z.string().uuid(),
  sectionId: z.string().min(1),
  selectionRange: z.object({
    startChar: z.number().int().nonnegative(),
    endChar: z.number().int().nonnegative(),
  }).optional(),
  prompt: z.string().min(1),
});

export const publishSchema = z.object({
  landerId: z.string().uuid(),
  domain: z.string().min(1),
  path: z.string().min(1),
});

export const bulkCtaSchema = z.object({
  landerId: z.string().uuid(),
  // .url() alone accepts any scheme — javascript: and data: would be an XSS
  // vector since the URL is later interpolated into href attributes on the
  // rendered lander. Restrict to http(s).
  ctaUrl: z.string().url().refine(
    (s) => /^https?:\/\//i.test(s),
    { message: "ctaUrl must use the http(s) scheme" },
  ),
});

export const titleRegenSchema = z.object({
  landerId: z.string().uuid(),
});

export const imageRegenSchema = z.object({
  landerId: z.string().uuid(),
  slotKey: z.string().min(1),
  prompt: z.string().optional(),
  referenceImageId: z.string().uuid().optional(),
  /** If true (default), the existing rendered image for this slot is passed
   *  to the generator as a visual reference so the new image is an edit of
   *  the current one ("change the hat to yellow"), not a from-scratch
   *  regen. Set false to start fresh. */
  useCurrentAsReference: z.boolean().optional(),
});

export const imageBankCreateSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  aspectRatio: z.string().regex(/^\d+:\d+$/),
  brandSlug: z.string().optional(),
  productSlug: z.string().optional(),
  tags: z.array(z.string()).optional(),
  referenceImageId: z.string().uuid().optional(),
});

export const imageBankSaveFromLanderSchema = z.object({
  landerId: z.string().uuid(),
  slotKey: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()).optional(),
  brandSlug: z.string().optional(),
  productSlug: z.string().optional(),
  customVariables: z.record(z.string(), z.any()).optional(),
});

export const imageBankSearchSchema = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  brandSlug: z.string().optional(),
  productSlug: z.string().optional(),
});

export const imageCropSchema = z.object({
  landerId: z.string().uuid().optional(),
  slotKey: z.string().optional(),
  bankItemId: z.string().uuid().optional(),
  crop: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }),
  saveToBankAs: z.string().optional(),
});

export type LoginPayload = z.infer<typeof loginSchema>;
export type CreateProjectPayload = z.infer<typeof createProjectSchema>;
export type SectionRevisionPayload = z.infer<typeof sectionRevisionSchema>;
export type PublishPayload = z.infer<typeof publishSchema>;
