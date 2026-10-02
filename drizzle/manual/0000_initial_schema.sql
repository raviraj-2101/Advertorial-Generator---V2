-- 0000_initial_schema.sql — advertorials-generator initial schema.
--
-- Apply via Supabase Management API or Dashboard → SQL Editor → Run.
-- Idempotent: every CREATE uses IF NOT EXISTS.
--
-- Namespace note: the Supabase Playground is shared with rebill-dashboard,
-- approval-rates-historical, and other tools. Their `public.brands` table
-- has a different column shape than this project needs. We live in a
-- dedicated `advertorials.*` schema rather than mutating their tables.

-- ─── Extensions ─────────────────────────────────────────────────────────
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ─── Schema namespace ───────────────────────────────────────────────────
create schema if not exists advertorials;

-- ─── Brands ─────────────────────────────────────────────────────────────
create table if not exists advertorials.brands (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  domain_pool text[] not null default '{}'::text[],
  created_at timestamptz default now() not null
);

-- ─── Products ───────────────────────────────────────────────────────────
create table if not exists advertorials.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  brand_slug text references advertorials.brands(slug),
  display_name text not null,
  image_spec jsonb not null default '{}'::jsonb,
  reference_image_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz default now() not null
);

-- ─── Projects ───────────────────────────────────────────────────────────
create table if not exists advertorials.projects (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  brand_slug text,
  product_slug text not null,
  direction_prompt text not null,
  selected_template_slugs text[] not null,
  status text not null default 'in_work',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists projects_owner_idx on advertorials.projects (owner_email, updated_at desc);

-- ─── Skeletons ──────────────────────────────────────────────────────────
create table if not exists advertorials.skeletons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references advertorials.projects(id) on delete cascade,
  template_slug text not null,
  title_candidates jsonb not null default '[]'::jsonb,
  title_chosen text,
  body jsonb not null,
  status text not null default 'pending',
  revision_history jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null
);
create index if not exists skeletons_project_idx on advertorials.skeletons (project_id, created_at);

-- ─── Landers ────────────────────────────────────────────────────────────
create table if not exists advertorials.landers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references advertorials.projects(id) on delete cascade,
  skeleton_id uuid not null references advertorials.skeletons(id) on delete cascade,
  template_slug text not null,
  internal_name text not null,
  status text not null default 'generating',
  section_model jsonb not null default '[]'::jsonb,
  html text,
  image_urls jsonb not null default '{}'::jsonb,
  cta_url text,
  published_url text,
  published_domain text,
  published_path text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists landers_project_idx on advertorials.landers (project_id, created_at);

-- ─── Image bank items (with pgvector embedding) ─────────────────────────
create table if not exists advertorials.image_bank_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_url text not null,
  storage_path text not null,
  width int,
  height int,
  aspect_ratio text,
  mime_type text,
  brand_slug text references advertorials.brands(slug),
  product_slug text references advertorials.products(slug),
  tags text[] not null default '{}'::text[],
  ai_description text,
  custom_variables jsonb not null default '{}'::jsonb,
  source text not null,
  source_lander_id uuid references advertorials.landers(id),
  source_prompt text,
  source_reference_image_id uuid references advertorials.image_bank_items(id),
  embedding vector(1536),
  created_by_email text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists image_bank_items_brand_product_idx on advertorials.image_bank_items (brand_slug, product_slug);
create index if not exists image_bank_items_tags_idx on advertorials.image_bank_items using gin (tags);
create index if not exists image_bank_items_name_trgm_idx on advertorials.image_bank_items using gin (name gin_trgm_ops);
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'image_bank_items_embedding_idx' and n.nspname = 'advertorials'
  ) then
    execute 'create index image_bank_items_embedding_idx on advertorials.image_bank_items using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end if;
end$$;

-- ─── Sessions ───────────────────────────────────────────────────────────
create table if not exists advertorials.sessions (
  token varchar(64) primary key,
  email text not null,
  created_at timestamptz default now() not null
);
create index if not exists sessions_email_idx on advertorials.sessions (email);

-- ─── Updated_at trigger helper ──────────────────────────────────────────
create or replace function advertorials._set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'projects_updated_at' and tgrelid = 'advertorials.projects'::regclass) then
    create trigger projects_updated_at before update on advertorials.projects
      for each row execute function advertorials._set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'landers_updated_at' and tgrelid = 'advertorials.landers'::regclass) then
    create trigger landers_updated_at before update on advertorials.landers
      for each row execute function advertorials._set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'image_bank_items_updated_at' and tgrelid = 'advertorials.image_bank_items'::regclass) then
    create trigger image_bank_items_updated_at before update on advertorials.image_bank_items
      for each row execute function advertorials._set_updated_at();
  end if;
end$$;

-- ─── Image bank RPCs (vector search + embedding write) ──────────────────
create or replace function advertorials.set_image_bank_embedding(p_id uuid, p_embedding vector(1536))
returns void language plpgsql security definer as $$
begin
  update advertorials.image_bank_items set embedding = p_embedding, updated_at = now() where id = p_id;
end$$;

create or replace function advertorials.match_image_bank_items(query_embedding vector(1536), match_count int)
returns table (
  id uuid,
  name text,
  storage_url text,
  storage_path text,
  width int,
  height int,
  aspect_ratio text,
  mime_type text,
  brand_slug text,
  product_slug text,
  tags text[],
  ai_description text,
  custom_variables jsonb,
  source text,
  source_lander_id uuid,
  source_prompt text,
  source_reference_image_id uuid,
  created_by_email text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
) language sql stable as $$
  select i.id, i.name, i.storage_url, i.storage_path, i.width, i.height,
         i.aspect_ratio, i.mime_type, i.brand_slug, i.product_slug, i.tags,
         i.ai_description, i.custom_variables, i.source, i.source_lander_id,
         i.source_prompt, i.source_reference_image_id, i.created_by_email,
         i.created_at, i.updated_at,
         1 - (i.embedding <=> query_embedding) as similarity
  from advertorials.image_bank_items i
  where i.embedding is not null
  order by i.embedding <=> query_embedding
  limit match_count
$$;

-- ─── Schema + RPC exposure for the Supabase JS client ───────────────────
-- The supabase-js client can only query schemas in the project's
-- "exposed schemas" list (Settings → API → Exposed schemas). We grant
-- usage + DML on advertorials to service_role + authenticated. The
-- exposed-schemas array also has to include 'advertorials' — that's
-- still a one-time manual toggle in the dashboard; the server falls
-- back to a direct SQL helper if not.
grant usage on schema advertorials to service_role, authenticated, anon;
grant all on all tables in schema advertorials to service_role;
grant all on all sequences in schema advertorials to service_role;
grant execute on function advertorials.set_image_bank_embedding(uuid, vector) to service_role;
grant execute on function advertorials.match_image_bank_items(vector, int) to service_role, authenticated, anon;
alter default privileges in schema advertorials grant all on tables to service_role;
alter default privileges in schema advertorials grant all on sequences to service_role;

-- ─── Seed: MVP brands + products ────────────────────────────────────────
insert into advertorials.brands (slug, name, domain_pool) values
  ('ledisa', 'Ledisa', '{}'::text[]),
  ('cleantra', 'Cleantra', '{}'::text[])
on conflict (slug) do nothing;

insert into advertorials.products (slug, brand_slug, display_name) values
  ('ledisa-glp1-patches', 'ledisa', 'Ledisa GLP-1 Patches'),
  ('cleantra-lymphatic', 'cleantra', 'Cleantra Lymphatic Drainage Drops'),
  ('cleantra-oregano', 'cleantra', 'Cleantra Oil of Oregano'),
  ('nervali-magnesium-cream', null, 'Nervali — Pure Relief Magnesium Cream')
on conflict (slug) do nothing;
