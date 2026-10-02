# Manual migrations

These are raw SQL migrations that have to run against the Supabase
Playground database (project_id `hqafuosxskwdzsvzucdw`).

## Why "manual"

Drizzle-kit's `db:push` needs a Postgres connection string (`SUPABASE_DB_URL`
in `.env`). Liam's notes don't list the db password, and the Supabase
Service Role JWT can't open a Postgres connection — it only authenticates
the REST/Storage clients. Until the db password lands in `api-keys/supabase.env`,
apply these via the Supabase Dashboard's SQL Editor.

## How to apply

1. Open https://supabase.com/dashboard/project/hqafuosxskwdzsvzucdw/sql/new
2. Paste the contents of each `*.sql` file in numerical order.
3. Click **Run**.
4. Verify with: `select count(*) from products;` — expect 4.

Once `SUPABASE_DB_URL` lands, `npm run db:push` will pick up the Drizzle
schema in `shared/schema.ts` for incremental changes; raw migrations
(triggers, RPC functions, pgvector index tuning) keep living here.

## Files

- `0000_initial_schema.sql` — every table the brief requires, plus the
  pgvector extension, the ivfflat embedding index, the `_set_updated_at`
  trigger helper, the `set_image_bank_embedding` and `match_image_bank_items`
  RPCs (referenced from `server/imageBank.ts` and `server/imageSearch.ts`),
  and the MVP brand + product seed rows.

## Verification queries

```sql
-- Tables present (expect 7 rows)
select table_name from information_schema.tables
where table_schema = 'public'
and table_name in ('brands','products','projects','skeletons','landers','image_bank_items','sessions')
order by table_name;

-- Extensions present (expect vector + pg_trgm)
select extname from pg_extension where extname in ('vector','pg_trgm') order by extname;

-- RPCs present (expect 2)
select proname from pg_proc where proname in ('set_image_bank_embedding','match_image_bank_items') order by proname;

-- Seed rows present (expect 2 brands, 4 products)
select 'brands' as t, count(*) from brands
union all
select 'products', count(*) from products;
```
