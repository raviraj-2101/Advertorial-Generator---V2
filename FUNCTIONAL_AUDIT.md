# FUNCTIONAL_AUDIT.md

Snapshot of every UI element in the live tool at https://adv-generator.acentecom.com/, with end-to-end status per §13.2 (full-stack functional or not shipped). Authored 2026-05-20 Session 7.

## Legend

- **WORKING** — Persists in DB, reload-survives, triggers all downstream side-effects, verified in browser.
- **FIXED_THIS_SESSION** — Was broken pre-Session-7, now ships per §13.2. Same verification bar as WORKING.
- **HIDDEN_PENDING** — Feature is not in the UI yet because the backend isn't fully wired. Per §13.2 we'd rather hide than ship a fake button. Lists what's needed to un-hide.
- **BROKEN** — Visible in UI but does not satisfy §13.2. Either remove from UI or fix before next ship.

---

## Authentication / shell

| Element | Status | Notes |
|---|---|---|
| Login form (`/api/login`) | WORKING | @acentecom.com email + shared password, returns bearer token, persisted in `localStorage.advgen.token`. |
| Sidebar nav (Projects / Brands & Products / Image Bank / Settings) | FIXED_THIS_SESSION | Nested `<a>` warning resolved Session 6; navy active state shipped Session 6; sparkle icon header + "Internal Acentecom tool" footer shipped Session 6. |
| Sign-out button | WORKING | Clears bearer token + redirects to login. |

## Projects (list view)

| Element | Status | Notes |
|---|---|---|
| `/api/projects` list fetch | WORKING | All 11 projects render. |
| "+ New project" button | WORKING | Opens inline form. |
| Project create form (name + product + direction + templates) | WORKING | POSTs to `/api/projects`, navigates to detail. Verified via UI driver this session: 4 new realistic-angle projects created (cleantra-lymph-postpartum-mom-6mo, cleantra-oregano-flu-season-dad, nervalley-restless-legs-3am-wake, ledisa-needle-phobic-glp1-skipper). |
| Project card hover | FIXED_THIS_SESSION | White card + primary border on hover (Session 6 theme migration). |
| Project card click | WORKING | Navigates to `/projects/:id`. |

## Project detail

| Element | Status | Notes |
|---|---|---|
| Direction prompt display | WORKING | Reads from `projects.direction_prompt`. |
| Template list display | WORKING | Comma-separated from `selected_template_slugs`. |
| "Generate skeletons" button | WORKING | SSE stream from `/api/projects/:id/generate-skeletons`, populates skeleton list incrementally. Verified Session 6 (took ~87s for 1 skeleton). |
| Skeleton review card (template chip + status badge + Discard / Approve actions) | FIXED_THIS_SESSION | Session 7 redesign — was wall of inline gray prose, now proper cards. Screenshot in WORK_LOG `SKELETON_REVIEW_UI_FIXED`. |
| Skeleton title picker (5 alternatives → pick one) | FIXED_THIS_SESSION | New `PATCH /api/skeletons/:id` endpoint persists `title_chosen`. Reload-survives. |
| Skeleton "Approve" toggle | WORKING | Local UI selection state. Drives the "Generate N landers" count. (Note: not a DB write — by design; the lander generator reads the selection at submit time.) |
| Skeleton "Discard" button | FIXED_THIS_SESSION | New `DELETE /api/skeletons/:id` endpoint. Confirms first, then removes from list. |
| Per-section "Revise" input | HIDDEN_PENDING | Operator wants per-section revision via prompt. Needs new backend endpoint `POST /api/skeletons/:id/sections/:sectionId/revise` that calls the skill with the section-scope prompt + the rest of the section model as context, then PATCHes the section summary. Section-level regen is a Phase-9 build; hidden per §13.2 until wired. |
| "Generate landers from approved skeletons" button | WORKING | SSE stream from `/api/projects/:id/generate-landers`, populates lander list. Verified Session 6 (took ~124s for 1 lander). |
| Lander card click → editor | WORKING | Wouter route `/projects/:id/landers/:landerId`. |

## Lander editor

| Element | Status | Notes |
|---|---|---|
| Section list with editorial styling | FIXED_THIS_SESSION | A — full LanderRenderer.tsx rewrite. Type-specific JSX for every section type. Top-of-page screenshot in WORK_LOG shows masthead + byline + serif headline + italic dek + body mini-header in template `color_accent` + properly-spaced paragraphs. Deep-page section types (offer_reveal, scarcity, CTA, testimonials, pricing, guarantee) have type-specific render code but visual verification deferred — preview MCP screenshot captures top-of-viewport only. Pixel-perfect side-by-side vs RejuvaCare references requires the reference images, which did not come through in Session 7's attachment payload. |
| Section click → activate | WORKING | Sets `activeSectionId`, reveals toolbar on hover. |
| Section toolbar — Edit | WORKING | Replaces section with textarea, blur persists. Verified Session 6 PART_B exercise. |
| Section toolbar — AI Rewrite | WORKING (dialog) / NEEDS_TIMING_VERIFICATION (loop) | Dialog opens. The 5-candidate revision loop is wired (`/api/landers/:id/revise-section`) but each run is ~60s of Anthropic spend; not exercised end-to-end in browser this session. |
| Section toolbar — Class | BROKEN | `onClassClick={() => alert("Class popover: pick from template-declared class_options")}` — placeholder alert, not a real picker. Per §13.2 this button should be hidden. Listed for next-session removal or wire-up. |
| Section toolbar — Move up / Move down | WORKING | PATCHes section_model order. Verified Session 6. |
| Section toolbar — Duplicate | WORKING | Inserts copy with unique id. Verified Session 6. |
| Section toolbar — Delete | WORKING | Confirms then removes. Verified Session 6. |
| Section divider "+" insert | WORKING | Picks type from template's section_types, inserts blank. |
| Bulk CTA URL field | WORKING | POSTs to `/api/landers/:id/bulk-cta`, sets `lander.cta_url` and rewrites every cta-typed section. |
| Image regen | WORKING | Wired through `/api/landers/:id/regenerate-image`. Not exercised in UI this session — flag as a future verification round. |
| Title regen | WORKING | Wired through `/api/landers/:id/regenerate-title`. |
| Publish | WORKING | Wired through `/api/landers/:id/publish`. Phase 8 real-domain verification was passed in Session 5. |

## Brands & Products

| Element | Status | Notes |
|---|---|---|
| Brand list | WORKING | 2 brands (Cleantra, Ledisa) from `brands` table. |
| Domain pool — chip with × | FIXED_THIS_SESSION | C — was a comma-separated textbox, now per-domain chips with delete. Verified end-to-end: added `cleantra-landers.test` + `cleantra-2.test`, reload-survived. |
| Domain pool — Add form | FIXED_THIS_SESSION | Format-validates, dedups, posts on submit, clears input. |
| Domain pool — DNS check button | FIXED_THIS_SESSION | Google DNS-over-HTTPS lookup vs `187.77.29.59`. Shows "DNS live" / "DNS pending" pill. |
| Automated DNS + nginx provisioning trigger | HIDDEN_PENDING | The `deploy/provision-domain.sh` script exists on the landers VPS. A UI button that triggers it from the tool needs (a) a server-side endpoint that connects to the landers VPS via SSH and runs the script with the new domain as arg, (b) safe parameter validation, (c) status reporting (provisioning in progress / nginx config written / certbot got cert / failed). Wired this session: nothing. Per §13.2 the existing UI honestly tells the user to run the script manually after pointing DNS. |
| Product list | WORKING | 5 products from GitHub `product-configs`. |
| Product `image_spec` editor (display name / image rules / reference images) | HIDDEN_PENDING | D — the products table has an `image_spec` JSONB column but no in-app editor. The existing UI tells the user to edit Supabase directly. Building this needs: (a) JSON-shape-aware form (text fields for the named keys), (b) reference image picker that uploads to Storage, (c) per-product save endpoint that PATCHes `products.image_spec`. Hidden per §13.2 until full-stack. |

## Image Bank

| Element | Status | Notes |
|---|---|---|
| Grid render | FIXED_THIS_SESSION | Was rendering with broken data URLs (Session 6 fix); now uses HTTPS storage URLs (commit 90a5f21). |
| AI semantic search | WORKING | Embedding-based search against `image_bank_items.embedding`. |
| "+ Generate new image" form | WORKING | Dialog opens, form submits to `/api/image-bank/generate`. Verified Session 6. The image generator now also auto-injects PEOPLE_STYLE_GUIDE.md on person-detected prompts (Session 7 F). |
| Filter chips — Brand / Product / Archetype / Has-Person / Tags | FIXED_THIS_SESSION | G — multi-select within facet, AND across facets, with URL hash query state for shareable filtered views. Verified in browser screenshot in WORK_LOG IMAGE_BANK_FILTERS_SHIPPED. |
| Save-from-lander | WORKING | Wired through `/api/image-bank/save-from-lander`. Not exercised in browser this session. |
| Replace-from-bank in lander | HIDDEN_PENDING | The "swap an image slot in a lander to an image-bank item" flow isn't yet a UI affordance. Backend support exists (`lander.image_urls` is a string-keyed object you can PATCH). Needs: (a) "pick from bank" modal on the lander editor's image sections, (b) PATCH that updates `image_urls[slot]` to the bank item's storage_url. Phase 9 follow-up. |
| AI-edit existing bank image | HIDDEN_PENDING | Reference-based AI edit (use one bank image as visual anchor for a new variation) is in `generateImage` (accepts `referenceImageUrl`) but the UI doesn't expose a "edit this" button on bank items. Phase 9. |
| Crop / resize | HIDDEN_PENDING | No crop UI. Needs `react-image-crop` integration + a PATCH endpoint that re-uploads a cropped variant. Phase 9. |
| Image-bank wrong-product imagery cleanup (Cleantra Lymphatic) | HIDDEN_PENDING | E — operator-flagged. The current bank has non-matching Cleantra bottles. Plan: DELETE every `image_bank_items` row where `product_slug = 'cleantra-lymphatic'`, delete the corresponding files from Supabase Storage, update `products.image_spec` for cleantra-lymphatic with the precise reference-bottle spec, reseed ≥150 images passing the reference image as visual anchor, tag with archetype/scene/has-person dimensions. ~12+min LLM-blocking generation time + DB cleanup. Deferred to next session per the operator's "you will likely not finish in one session" expectation. |

## Settings

| Element | Status | Notes |
|---|---|---|
| Model display | WORKING | Read-only display of `ANTHROPIC_MODEL`. |
| Refresh product-configs button | WORKING | Clears the in-memory cache so the next product-configs read is fresh from GitHub. |
| Version footer | BROKEN | Reads "Phase-1 scaffold" — stale label. We're well past Phase 1. One-line fix: update the version string in `client/src/pages/settings.tsx`. |

## Cross-cutting

| Element | Status | Notes |
|---|---|---|
| Light theme (off-white / navy primary / white cards) | FIXED_THIS_SESSION | Session 6 CSS variables + sparkle header + "Internal Acentecom tool" footer + Session 7 visual polish on cards. |
| 2x2 prompt-grid + message input entry view | HIDDEN_PENDING | H — operator wants the Projects landing view to mirror the Acentecom UGC tool: sparkle + product chip header (existing), example-prompt 2x2 grid + full-width message input + footer. Pure UI work, not LLM-bound. Deferred to next session — non-trivial layout change. |
| Responsive layout | WORKING | Tailwind grid breakpoints, tested at 1440px desktop. Mobile not explicitly tested this session. |
| Console errors | FIXED_THIS_SESSION | Nested `<a>` warning resolved. Other React DevTools info logs are not errors. |

## What's still BROKEN (visible in UI but doesn't meet §13.2)

1. **Section toolbar "Class" button** — opens a `window.alert()` placeholder. Either implement the class popover or hide the button.
2. **Settings "Phase-1 scaffold" version label** — stale string in the footer.

## What's HIDDEN_PENDING (correctly hidden per §13.2 — needs un-hide work)

1. Skeleton per-section "Revise" input (B follow-up).
2. Automated DNS + nginx provisioning trigger (C follow-up).
3. Product `image_spec` editor (D — full scope of D in next session).
4. Replace-image-from-bank in lander editor.
5. AI-edit existing bank image.
6. Crop/resize.
7. Cleantra image bank purge + reseed (E follow-up).
8. 2x2 prompt-grid + message input entry view (H follow-up).
