-- 0003_project_credits_and_brand_ctas.sql
--
-- Operator feedback batch — multiple related additions:
--
-- 1. PROJECT CREDITS: when uploading a brief, the operator needs to
--    record who wrote the brief (copywriter) and who's running the
--    angle (creative strategist). These are stored on the project so
--    they appear on the project list + detail page.
--
-- 2. BRAND-LEVEL CTA PRESETS: operator's clarification —
--    "I want the selections of click-through URLs, meaning the CTA
--    link, to be on the brand level rather than on the magazine level."
--    Brands already exist as a top-level entity (brand_magazines is the
--    many-to-many). Move the CTA preset list from magazines.cta_presets
--    to brands.cta_presets. Magazines keep their domain pool, but the
--    funnel selection is now keyed off the brand. Existing
--    magazines.cta_presets stays for now as the fallback / migration
--    breadcrumb; the UI prefers brands.cta_presets when present.
--
-- 3. IMAGE GENERATION PROGRESS: track per-lander how many image slots
--    have been generated vs how many were requested, so the project
--    detail page can show "Generating: 7/16…" while images stream in.
--
-- All additive, all nullable, all idempotent.

set search_path = advertorials_v2;

-- (1) Project credits + immediate-ack flag
alter table advertorials_v2.projects add column if not exists creative_strategist text;
alter table advertorials_v2.projects add column if not exists copywriter text;
alter table advertorials_v2.projects add column if not exists image_gen_started_at timestamptz;
alter table advertorials_v2.projects add column if not exists image_gen_done_at timestamptz;

-- (2) Brand-level CTA presets. Default to the empty JSON array; UI
--     keeps falling back to magazines.cta_presets if a brand has none
--     yet so existing data still renders.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='advertorials_v2' and table_name='brands') then
    execute 'alter table advertorials_v2.brands add column if not exists cta_presets jsonb default ''[]''::jsonb';
  end if;
end$$;

-- Some installs may have brands managed entirely from product-configs
-- (no local row). Create the table lazily so we have somewhere to store
-- the CTA presets. brand_slug is the natural key matching the
-- product-configs YAML names. Read-mostly; UI maintains the row when
-- the operator edits a brand's CTA list.
create table if not exists advertorials_v2.brands (
  slug text primary key,
  name text,
  cta_presets jsonb default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- (3) Image gen progress on landers — counts only (the actual URLs
--     live in image_urls jsonb already). The total field is set when
--     image gen kicks off; the done field bumps as each Gemini call
--     returns.
alter table advertorials_v2.landers add column if not exists image_gen_total integer default 0;
alter table advertorials_v2.landers add column if not exists image_gen_done integer default 0;

-- Notify PostgREST that the schema changed so the new columns appear
-- in the REST API immediately (no server restart needed).
notify pgrst, 'reload schema';
