-- ─── 0002 — Magazines + brand_magazines join + lander publish/CTA fields ──
-- Operator's V2 spec: brands belong to one or more "magazines" (e.g.
-- MyHealthyShape, MyHealthyLife). Each magazine has a name, a logo
-- (uploaded or generated), a set of domains, and a list of preset
-- click-through URLs the lander's CTA buttons point at (Voluum tracking
-- links). The brand→magazine relationship is many-to-many.
-- A lander chooses ONE magazine + ONE of its domains + an extension
-- path (e.g. /pages/top-5-magnesium-creams) + one CTA preset from the
-- magazine's list.
-- Brand + product stay locked at the PROJECT level — never editable
-- per lander.

create table if not exists advertorials_v2.magazines (
  slug text primary key,
  name text not null,
  logo_url text,
  logo_path text,
  -- jsonb so we don't have to migrate the schema every time we add a
  -- per-magazine attribute. Shape: { font_family, accent_color, tagline,
  -- copyright_text, disclaimer_text, header_treatment }
  branding jsonb not null default '{}'::jsonb,
  -- Domains under this magazine. Each entry: { domain, is_primary,
  -- dns_status: 'pending' | 'live', last_checked_at }
  domains jsonb not null default '[]'::jsonb,
  -- Preset CTA URLs (Voluum tracking) with operator-provided
  -- descriptions so copywriters know which to pick. Each entry:
  -- { id, url, label, description, funnel_shape }
  cta_presets jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Many-to-many: a brand can appear in N magazines.
create table if not exists advertorials_v2.brand_magazines (
  brand_slug text not null references advertorials_v2.brands(slug) on delete cascade,
  magazine_slug text not null references advertorials_v2.magazines(slug) on delete cascade,
  is_default_for_brand boolean not null default false,
  created_at timestamptz default now() not null,
  primary key (brand_slug, magazine_slug)
);

-- Per-lander publish + CTA fields. These are LANDER-level (not project-
-- level) so the operator can have multiple landers per project with
-- different magazines + CTA destinations for A/B-style funnel tests.
alter table advertorials_v2.landers add column if not exists magazine_slug text;
alter table advertorials_v2.landers add column if not exists domain text;
alter table advertorials_v2.landers add column if not exists extension_path text;
alter table advertorials_v2.landers add column if not exists cta_preset_id text;
alter table advertorials_v2.landers add column if not exists voluum_status text default 'not_submitted';
alter table advertorials_v2.landers add column if not exists voluum_submitted_at timestamptz;
alter table advertorials_v2.landers add column if not exists voluum_metadata jsonb default '{}'::jsonb;

-- Seed: MyHealthyShape magazine with the 2 Voluum CTA presets the
-- operator named. Brand→magazine assignment defaults to all 4 brands
-- so any project in V2 today can pick MyHealthyShape.
insert into advertorials_v2.magazines (slug, name, branding, domains, cta_presets) values (
  'myhealthyshape',
  'MyHealthyShape',
  jsonb_build_object(
    'tagline', 'Real Stories. Real Science.',
    'copyright_text', '© MyHealthyShape. All rights reserved.',
    'disclaimer_text', 'This is an advertisement. Statements have not been evaluated by the FDA. Results may not be typical.'
  ),
  jsonb_build_array(
    jsonb_build_object('domain', 'myhealthyshape.com', 'is_primary', true, 'dns_status', 'pending')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'lander-to-sales',
      'url', 'https://trvl.tryledisa.com/click',
      'label', 'Lander → Sales Page',
      'description', 'Direct funnel: this advertorial leads straight to the product sales page. Use when there''s no quiz / pre-sell step.',
      'funnel_shape', 'lander → sales'
    ),
    jsonb_build_object(
      'id', 'lander-quiz-sales',
      'url', 'https://trvl.tryledisa.com/click/1',
      'label', 'Lander → Quiz → Sales Page',
      'description', 'Two-step funnel: this advertorial leads to a quiz, then a second lander, then the sales page. Use when the buyer needs more pre-sell.',
      'funnel_shape', 'lander → quiz → sales'
    )
  )
) on conflict (slug) do update set
  branding = excluded.branding,
  domains = excluded.domains,
  cta_presets = excluded.cta_presets,
  updated_at = now();

-- Assign all existing brands to MyHealthyShape so projects can pick it
-- immediately. Idempotent.
insert into advertorials_v2.brand_magazines (brand_slug, magazine_slug, is_default_for_brand)
select slug, 'myhealthyshape', true from advertorials_v2.brands
on conflict (brand_slug, magazine_slug) do nothing;

create index if not exists idx_landers_magazine on advertorials_v2.landers(magazine_slug);
create index if not exists idx_brand_magazines_magazine on advertorials_v2.brand_magazines(magazine_slug);
