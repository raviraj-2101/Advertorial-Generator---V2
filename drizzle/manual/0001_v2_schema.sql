-- V2 schema migration: fresh `advertorials_v2` namespace so V2 can read/write
-- without polluting V1's `advertorials.*` tables. Idempotent — safe to re-run.

create schema if not exists advertorials_v2;
grant usage on schema advertorials_v2 to service_role, authenticated, anon;

-- ─── Brands ──────────────────────────────────────────────────────────────
create table if not exists advertorials_v2.brands (
  slug text primary key,
  name text not null,
  domain_pool text[] not null default '{}',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ─── Products ────────────────────────────────────────────────────────────
-- Slug + display_name come from the product-configs repo at refresh time.
-- The image fields are tool-owned (operator uploads via the UI).
create table if not exists advertorials_v2.products (
  slug text primary key,
  brand_slug text references advertorials_v2.brands(slug) on delete set null,
  display_name text not null,
  -- Summary lifted from product-configs/<slug>/01-core.md at refresh time.
  summary_md text default '',
  -- Operator-uploaded primary product reference image (the bottle / box /
  -- device shot). storage_path lives in `advertorial-images-v2` bucket.
  reference_image_url text,
  reference_image_path text,
  reference_image_description text,
  -- Extra reference images (e.g. "transparent background variant",
  -- "lifestyle composite", "before/after grid"). Each entry is
  -- {url, path, description}. JSONB so the schema doesn't change every
  -- time we add an image kind.
  extra_images jsonb not null default '[]'::jsonb,
  -- Free-form image-spec the operator + image generator both read (e.g.
  -- "label color: white + black + blue", "do_not_change: ['wordmark']").
  image_spec jsonb not null default '{}'::jsonb,
  -- Sync state from product-configs.
  configs_last_synced_at timestamptz,
  configs_revision text,           -- git short SHA of the source revision
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ─── Projects / Skeletons / Landers ─────────────────────────────────────
-- V2's project shape mirrors V1's so the existing UI keeps working; the
-- key difference is `brief_pdf_url` + `parsed_brief_json` (the brief stays
-- the canonical source of copy, no AI rewriting).
create table if not exists advertorials_v2.projects (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  brand_slug text,
  product_slug text,
  template_slug text not null,
  brief_pdf_url text,
  parsed_brief_json jsonb,
  status text default 'in_work' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists advertorials_v2.landers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references advertorials_v2.projects(id) on delete cascade,
  template_slug text not null,
  internal_name text not null,
  status text default 'in_work' not null,
  -- Slot values dict the renderer consumed.
  slot_values jsonb not null default '{}'::jsonb,
  -- Final rendered HTML (cached).
  html text,
  -- Image URLs keyed by slot (HERO_IMAGE_URL, IMG_1_URL, …).
  image_urls jsonb not null default '{}'::jsonb,
  cta_url text,
  published_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ─── Image bank ─────────────────────────────────────────────────────────
-- Mirrors V1's `advertorials.image_bank_items` but lives in v2 schema so
-- V2 owns its own bank + tagging.
create table if not exists advertorials_v2.image_bank_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_url text not null,
  storage_path text,
  aspect_ratio text,
  width integer,
  height integer,
  brand_slug text,
  product_slug text,
  -- Operator-set human-readable explanation of what's in the image — the
  -- same field that the per-product reference images use. This is the
  -- "title for this image — bottle with transparent background" the
  -- operator asked for. AI generators read it as the lock-down hint.
  description text default '',
  tags text[] not null default '{}',
  source text default 'ai-generated' not null,
  source_prompt text,
  source_reference_image_id uuid,
  ai_description text,
  custom_variables jsonb not null default '{}'::jsonb,
  created_by_email text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_img_bank_v2_product on advertorials_v2.image_bank_items(product_slug);
create index if not exists idx_img_bank_v2_brand on advertorials_v2.image_bank_items(brand_slug);
create index if not exists idx_img_bank_v2_source on advertorials_v2.image_bank_items(source);

-- ─── Sessions ───────────────────────────────────────────────────────────
create table if not exists advertorials_v2.sessions (
  token text primary key,
  email text not null,
  created_at timestamptz default now() not null,
  expires_at timestamptz not null
);
