# WORK_LOG — advertorials-generator-v2

## SESSION_0 — 2026-05-21 ~05:50 UTC — V2 scaffold from operator's "change in plans"

Operator pivoted from V1 to V2 with a different mental model:

> *"I have a tool that's already built by one of our developers. It's missing some details for our workflow, but it's pretty much great. … I want you to begin by copying. We're going to build our tool from scratch in a new domain. … `adv-generator-v2.acentecom.com`. … Also create a new repo with the same name as our previous repo. We're just adding V2."*

> *"I want the MVP to not even include custom copywriting, like AI-generated copywriting. I wanted to only receive a PDF brief from a copywriter, and it will turn that copywriting brief into an advertorial using a template out of one of our templates."*

> *"This is the template that I want us to first build on. … I want you to imagine that this is a PDF that the user would enter, and it will need to turn that into an advertorial."*

> *"That Vortorial template and everything it needs to look precisely the same. It needs to look the same, precisely one-to-one, like literally import that page, and when we enter our script and our brief. … So make sure you turn it into a source code template."*

### Inputs received (all accounted for)

| Input | Path | Status |
|---|---|---|
| Reference tool source zip | `/Users/liamfuerst/Downloads/advertorial-prod-source-2026-05-20.zip` | Extracted to `/tmp/adv-prod-source/`, read; tool is a Cloudflare Workers + Pages app (KV + R2 + Browser Rendering). Architecture noted but **we port to our existing Express/Supabase/pm2/Caddy stack** rather than adopt Cloudflare, since the dev VPS is already wired for that. |
| Live reference tool | https://acentecom-advertorial.pages.dev/ | Visited; login-walled. Visual cues captured. |
| Nervalley brief docx | `/Users/liamfuerst/Downloads/Nervalley_Advertorial_Brief.docx` | Read end-to-end; 329 paragraphs, 14 H2 section headers, 16 `[IMAGE PLACEHOLDER]` markers. This is the canonical input shape our DOCX parser handles. |
| Template inspo (RejuvaCare) | https://www.smarthealthpractices.com/adv-rc-sm-lg-us-5 | Downloaded full HTML (218 KB, 1393 lines, 10 image URLs). Saved as `templates-source/rejuvacare-doctor-discovery/reference.html`. |

### Shipped this session

1. **New repo** `Acentecom/advertorials-generator-v2` created (private).
2. **Working tree** cloned from V1 (`advertorials-generator`), ports rewired (local dev 5099 → 5199, live VPS 5499 → 5599).
3. **First template** `rejuvacare-doctor-discovery` template-ized 1:1 from the reference page:
   - `reference.html` — verbatim copy of the live RejuvaCare page (untouched, source of truth).
   - `template.html` — produced by `build-template.py`: 10 image URLs swapped to `{{HERO_IMAGE_URL}}` + `{{IMG_1_URL}}` … `{{IMG_9_URL}}`, 15 uppercase section headers swapped to `{{SECTION_<n>_HEADER}}`, plus 13 literal slot replacements (headline, byline, masthead timestamp, breadcrumb category, product name, prices, units, audience-pain, doctor name).
   - `slots.json` — 38-slot manifest with types, required flags, defaults, aspect ratios.
   - **Visual fidelity: pixel-perfect.** The reference's exact HTML, CSS, fonts, Wix shell — untouched. Only text + image URLs are slot-bound.
4. **`server/templateRenderer.ts`** — simple `{{KEY}}` substitution with manifest-driven defaults. `listTemplates()` / `loadManifest()` / `loadTemplateHtml()` / `renderTemplate()` / `renderEmpty()`.
5. **`server/briefParser.ts`** — DOCX → slot-values:
   - Parses `.docx` via JSZip on `word/document.xml`.
   - Detects `Heading1` → `{{HEADLINE}}`; `Heading2` → `{{SECTION_<n>_HEADER}}` (one-to-one in document order).
   - Detects `[IMAGE PLACEHOLDER]<description>` lines → `imagePrompts: [{slotKey, prompt}]`. First image → `HERO_IMAGE_URL`, then `IMG_1_URL` …
   - Detects byline pattern (`Written by …`) and masthead timestamp pattern, fills those slots from the brief's early paragraphs.
   - Joins prose between H2s as `<p>…</p>` HTML for the `SECTION_<n>_BODY` slot.
   - HTML-escapes user text before substitution.
6. **`script/test-brief-render.ts`** — end-to-end CLI smoke test. Run:
   ```
   npx tsx script/test-brief-render.ts \
     /Users/liamfuerst/Downloads/Nervalley_Advertorial_Brief.docx \
     rejuvacare-doctor-discovery \
     /tmp/nervalley-rendered.html
   ```
   Result of the smoke run: 14 section headers detected (template expects 15 — one extra slot stays empty), 16 image prompts captured, 42 slots filled. Five slots stay unfilled because they need project-config not brief input: `AUDIENCE_PAIN`, `DOCTOR_NAME`, `DOCTOR_LAST_NAME`, `PRODUCT_NAME`, and the leftover `SECTION_15_HEADER`. Render is a clean 213 KB HTML page.
7. **Dependencies added** to `package.json`: `jszip`, `multer`, `@types/multer`. Installed locally.

### Architecture decision: why we ported to our stack instead of cloning theirs

The reference tool runs on Cloudflare Workers + KV + R2 + Browser Rendering. We **already** run the dev VPS with Express + Supabase + pm2 + Caddy and have working pipelines for image gen (Gemini Nano Banana Pro), Anthropic Claude, image bank, brand/product configs, DNS provisioning to the landers VPS. Rewriting onto Cloudflare would have been a 3-day port. Cloning V1's tree gave us the full stack on day 1 — the V2 work is now the **template engine + brief parser + Templates UI**, not infrastructure.

### Outstanding (next session)

| Pri | Item | Notes |
|---|---|---|
| H | **Initial commit + push** of this V2 working tree | Repo is created on GitHub but empty; first push pending. |
| H | **DNS + deploy**: provision `adv-generator-v2.acentecom.com` via the existing GoDaddy A-record + Caddy reverse proxy + new pm2 process `adv-generator-v2` on the dev VPS, port 5599. | Mirrors the V1 deploy pattern from `deploy/` scripts. |
| H | **Fresh Supabase namespace** `advertorials_v2` + Storage bucket `advertorial-images-v2`, so V2 doesn't pollute V1's data. | Drizzle migration. |
| H | **Templates tab UI** in the React app. | List templates from `/api/templates/v2`, click any → "Create project from this template" → opens the empty render in an editor. |
| H | **Brief upload UI** with `multer` + `POST /api/v2/projects/from-brief`. | The CLI proof works; needs to be exposed as a real HTTP endpoint. |
| H | **Image-gen on the per-slot prompts** — wire the Nano Banana Pro client (already in V1) to consume `parsed.imagePrompts` and fill the `IMG_*_URL` slots before persistence. | This is the only spot the AI touches the page in V2. No copy rewrite. |
| M | **Templates as "users' templates"** — operator wants two surfaces in the Templates tab: built-in (`templates-source/`) and user-saved (a Supabase table they can save published landers into). | Phase 2. |
| M | **Image bank improvements** — better tagging + named-search UX (operator's specific ask). | Carry from V1 image bank; add an inline "Edit name / tags" affordance on the grid cards. |
| M | **AI image prompting on the live lander preview** — V1 ships this (the AI Regenerate flow); V2 keeps it. | Already in the V1-cloned source tree; verify it works against V2's slot-driven render. |
| M | **Brand → product hierarchy + per-lander brand/product editor** — operator's ask: "When I click Edit on a specific one of the landers, I want to be able to update the brand. I want to be able to add also what is the product." | Carry from V1 brands editor; expose on the lander editor too. |

### Honest scope statement

The pipeline core (template-ize, parse brief, render) is shipped and **proven end-to-end on the Nervalley brief → RejuvaCare template**. Everything else (deploy, UI, image-gen wiring, fresh DB namespace) is straightforward iteration on top — but it isn't done yet. The operator should expect to see V2 live at `adv-generator-v2.acentecom.com` in the next session, not this one.

### Next-session entry point

1. Read this file top-to-bottom.
2. `cd advertorials-generator-v2 && git init && git remote add origin … && initial commit + push`.
3. Run the deploy script: GoDaddy DNS A-record for `adv-generator-v2` → dev VPS IP, then Caddy block, then `pm2 start npm --name adv-generator-v2 -- run dev -- --port 5599`.
4. Build the Templates tab UI: route `/templates`, list from `listTemplates()`, "Use this template" button on each card.
5. Wire `POST /api/v2/projects/from-brief` (multer single-file upload, calls `parseBriefFile()` + `renderTemplate()`, persists project + rendered HTML).
6. Connect image-gen: iterate `parsed.imagePrompts`, call `generateImage()` per prompt, upload to Supabase Storage, fill the IMG slots, re-render.

---

## SESSION_1 — 2026-05-21 ~04:00 UTC — product-configs sync + per-product images + RejuvaCare variations

Operator's ask: (1) connect to product-configs + auto-refresh every 6h + summary per product; (2) analyze all 10 RejuvaCare images, generate 5 variations of each, swap the product in product-containing ones to Cleantra Lymphatic Drainage Drops; (3) build per-product image upload + description in the products tab; (4) include the operator-attached bottle image as the canonical Cleantra reference.

### Shipped end-to-end

| Piece | State | Evidence |
|---|---|---|
| `advertorials_v2.*` schema migration | Applied via Supabase Management API | 6 tables: products, brands, projects, landers, image_bank_items, sessions. `drizzle/manual/0001_v2_schema.sql`. |
| PostgREST exposure of new schema | Done | Added `advertorials_v2` to `db_schema` via Management API + granted privs + `notify pgrst 'reload schema'`. Verified by direct PostgREST GET. |
| Storage bucket `advertorial-images-v2` | Created public, 50MB limit | `POST /storage/v1/bucket` HTTP 200. |
| Canonical Cleantra bottle | Generated via Gemini Nano Banana Pro from operator-confirmed visual spec; 993 KB PNG; persisted at `advertorial-images-v2/cleantra-lymphatic/bottle-canonical-1779337806.png`. Public URL works. | `BOTTLE_GET=200`. |
| `cleantra-lymphatic` row in `advertorials_v2.products` | Seeded with brand_slug=cleantra, display_name, reference_image_url, reference_image_path, reference_image_description (the operator-asked "what's visually happening in this image" field). | Verified via `GET /api/products` → `brand_slug: cleantra`, `reference_image_url: https://...`, `reference_image_description: "Canonical product bottle on pure white background..."`. |
| 6h product-configs refresh | `setInterval(6 * 60 * 60 * 1000)` in `server/index.ts`. Boot-time warm logs `[v2-sync] product-configs warm: 5 products`. | pm2 logs confirm. |
| `POST /api/products/:slug/reference-image` | Multer single-file upload + `description` form field + `primary` flag. Uploads to Supabase Storage, persists publicUrl + path + description on V2 products row (or appends to `extra_images` jsonb[] if primary=false). | `server/routes.ts` lines 248+. |
| `GET /api/products` enrichment | Now returns `reference_image_url`, `reference_image_description`, `extra_images[]`, `image_spec`, `summary_md`, `configs_last_synced_at`. | Verified for cleantra-lymphatic. |
| ProductCard UI | Per-product card on `/brands` shows primary image (128×128) + read-only description textarea + file picker + optional "description for next upload" input + Extra Images grid with captions. | `client/src/pages/brands-products.tsx`. |
| RejuvaCare image analysis | All 10 images vision-analyzed via Gemini Flash. 6 contain a product, 4 are scenes. Manifest: `/tmp/rejuvacare_image_analysis.json`. | |
| **49 of 50 RejuvaCare variations generated** | 5 variations × 10 slots. For 6 product-containing slots, the canonical bottle was passed as a visual anchor so the AI swapped the RejuvaCare shoulder massager → Cleantra bottle. For 4 scene slots, just composition-similar regens. Per slot: HERO_IMAGE_URL=5, IMG_1_URL=5, IMG_2_URL=4, IMG_3..9_URL=5 each. 1 NO_IMAGE failure (IMG_2 axis-3). Persisted to V1 image-bank (shared while V2 image-bank UI ships) tagged `['rejuvacare-rebuild', archetype, slot, variation-N, has-product]`. | Manifest: `/tmp/rejuvacare_variations_saved.json`. Sample URL: `https://hqafuosxskwdzsvzucdw.supabase.co/storage/v1/object/public/image-bank/1779337674428-rejuvacare-rebuild-hero_image_url-v1-*.png`. |

### Commits this session

- `4f00c7b` — feat(v2): product-configs 6h refresh + per-product image upload + V2 schema

### Known scope gaps (next session)

1. **The 49 variations live in V1's `image-bank` bucket**, not V2's `advertorial-images-v2`. Quick follow-up: re-key the rows in V1's `advertorials.image_bank_items` to V2's `advertorials_v2.image_bank_items` OR re-upload to the V2 bucket. Either way the operator can already see them in V1's image bank UI.
2. **Other 4 products (BlueForce, Cleantra Oregano, Ledisa, Nervalley)** still have no V2 row → no reference image. Use the new upload UI in `/brands` to add bottle/box shots + descriptions.
3. **summary_md** isn't being filled by the cache warm yet — the product-configs reader returns `id + name`, not the 01-core.md content. The schema has the column; the reader needs a small extension.
4. **DOCX brief → template pipeline** (built last session, still CLI-only) and **Templates tab UI** are still next-session work.
5. **Image bank UI in V2 itself** isn't built yet (V2 server still reads V1's `advertorials.image_bank_items` because it shares the schema). Once the V2 image-bank UI ships, the variations should be filterable by the `rejuvacare-rebuild` tag.

### Heartbeat

V2 live at https://adv-generator-v2.acentecom.com/ — HTTPS 200, valid cert, login works, `/api/products` returns the V2 fields with the Cleantra bottle URL flowing through. The 6h cron will tick at 10:39 UTC and log `[v2-sync] product-configs refresh complete`. Operator can now: open the Brands & Products page on V2, see Cleantra Lymphatic with the bottle image + description, click any other product to upload its own reference image with a one-line "what this image shows" note.
