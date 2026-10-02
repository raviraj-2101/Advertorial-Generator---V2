# advertorials-generator-v2

Live: https://adv-generator-v2.acentecom.com/

V2 of the Acentecom advertorials tool. Started as a clone of V1 (`advertorials-generator`) — same underlying stack (Express 5 + tsx + Vite + React + Supabase, deployed via pm2 + Caddy on the Hostinger dev VPS) — but rebuilt around a different mental model after the operator's session-7 review of the production reference tool at `acentecom-advertorial.pages.dev`:

## Core differences from V1

| V1 | V2 |
|---|---|
| AI generates the script from a one-line prompt | **Copywriter uploads a finished DOCX brief.** The AI does NOT rewrite the copy — it only fits the brief into a chosen template. |
| Single hand-built skeleton + lander generator, no design isolation | **Templates are source-code HTML/CSS files** in `templates-source/<slug>/`. New template = drop a folder. |
| Single template (`doctor-conspiracy-discovery-device`) | First template **`rejuvacare-doctor-discovery`** is template-ized 1:1 from the live production reference at `https://www.smarthealthpractices.com/adv-rc-sm-lg-us-5` — pixel-perfect base, slots replaced with brief content. |
| Brand/product flat | Brand → product hierarchy with editor + per-lander brand/product picker. |
| Image bank with thin tagging | Image bank with deeper tagging + named search + AI-prompting directly on the lander preview (kept from V1). |

## Brief format

Copywriters write briefs as DOCX with three markers the parser recognizes:

- `[IMAGE PLACEHOLDER]<description>` — the parser carves out an image slot and stores the description as the gen prompt.
- Heading 1 / Heading 2 styles — the parser uses the doc's heading levels to identify section breaks (main headline vs. uppercase mid-page section headers like "THE NIGHT EVERYTHING CHANGED").
- Plain paragraphs — body prose, joined under the most recent heading.

Reference: `templates-source/rejuvacare-doctor-discovery/reference-brief.docx` (the Nervalley brief used to validate the parser).

## Templates as source code

Each template lives under `templates-source/<slug>/`:

- `reference.html` — the original page we're cloning, untouched. Source of truth.
- `template.html` — slot-driven version: `{{HEADLINE}}`, `{{BYLINE}}`, `{{HERO_IMAGE_URL}}`, `{{BODY_<n>}}`, `{{SECTION_HEADER_<n>}}` etc.
- `slots.json` — list of slots, types, required-ness, default fallbacks.
- `assets/` — static images / fonts the template depends on if the reference uses any.

Adding a new template = create a new folder, copy in the source HTML, slot-ize the variable bits.

## Stack

- **Frontend**: Vite + React 18 + TypeScript (strict) + Tailwind + shadcn/ui + wouter for hash routing.
- **Backend**: Express 5 + Node 20+ + `@anthropic-ai/sdk` (Claude Opus 4.7) + Gemini 2.5 Flash Image ("Nano Banana Pro") for image gen.
- **Database**: Supabase Postgres (shared with V1 in dev — separate schema namespace `advertorials_v2`).
- **Storage**: Supabase Storage bucket `advertorial-images-v2`.
- **Deploy**: pm2 process `adv-generator-v2` on the dev VPS (`2.24.192.34`), behind Caddy at `adv-generator-v2.acentecom.com`. Port `5599` on the VPS, `5199` for local dev.

## Status

- V2 repo created, working tree cloned from V1, port wired to 5199/5599.
- RejuvaCare reference HTML saved as `templates-source/rejuvacare-doctor-discovery/reference.html`.
- Template slot-izing, brief parser, brief-upload endpoint, Templates tab UI, DNS provisioning — all in flight. See `WORK_LOG.md` for the live punch list.
