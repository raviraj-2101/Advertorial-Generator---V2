# ADVERTORIALS-GENERATOR — Master Project Brief

Internal Acentecom tool that turns a copywriter's prompt (story idea / angle /
pain point / near-finished script), combined with a product selection and one
or more proven advertorial templates, into fully built, previewable,
publishable landing pages with auto-generated images.

**Production domain:** `adv-generator.acentecom.com`
**Architectural ancestor:** `NEW-UGC-Scripts` (https://github.com/Acentecom/NEW-UGC-Scripts)
**Users:** Acentecom team only. Login: `@acentecom.com` email + shared
password. Match `NEW-UGC-Scripts` auth.
**Repo:** `advertorials-generator`

---

## 0. Operating mandate

The full operating rules — continuous-work mandate, no front-loaded
questions, the 5-round self-test loop, the template approval wall, the
heartbeat rule, the self-resume rule, the don't-declare-yourself-done
rule, and the external acceptance-criteria checker — are defined in the
chat brief that initiated this project. They are not duplicated here; they
are followed.

The single hardest rule: **the agent does not write `RUN_COMPLETE` until
`scripts/check_acceptance.py` exits 0**. The checker is the gate.

---

## 1. Architecture

```
advertorials-generator/
├── README.md
├── WORK_LOG.md
├── BRIEF.md
├── scripts/check_acceptance.py      ← external gate (unmodified)
├── package.json / tsconfig / vite.config / tailwind / drizzle.config / .env.example
├── client/                          ← React + Vite + shadcn/ui + Tailwind
│   ├── index.html
│   └── src/
│       ├── App.tsx / main.tsx / index.css
│       ├── components/  (AppShell, SectionToolbar, SectionDivider, ImageBankPicker, ImageBankSearchBar, ImageCropper, ImageEditDialog, LanderPreview)
│       ├── pages/       (login, projects, project-detail, lander-editor, brands-products, image-bank, settings)
│       ├── hooks/  lib/
├── server/                          ← Express + tsx
│   ├── index.ts / routes.ts / vite.ts / static.ts
│   ├── auth.ts / supabase.ts
│   ├── systemPrompt.ts              ← assembles skill.md + template.md + product configs + user prompt
│   ├── productConfigs.ts            ← GitHub Contents API fetcher with 24h cache
│   ├── templateLoader.ts            ← reads advertorials-skill/templates/*.md (live) and _proposed/*.md
│   ├── skeletonGenerator.ts / landerGenerator.ts
│   ├── revisionEngine.ts            ← 5-candidate revision loop with rubric scoring
│   ├── titleGenerator.ts            ← 20→top-5 title candidate generator
│   ├── imageGen.ts                  ← Nano Banana Pro client + reference-image edit
│   ├── imageBank.ts                 ← bank CRUD + embedding pipeline
│   ├── imageSearch.ts               ← pgvector + tag-blend search
│   ├── publishing.ts                ← SSH-deploy to landers VPS
├── advertorials-skill/
│   ├── skill.md                     ← evergreen craft skill
│   └── templates/
│       ├── _proposed/               ← analysis + proposed templates (NOT live until approved)
│       └── ...                      ← live templates only after Liam approves by name in chat
├── shared/schema.ts                 ← Drizzle schema for Supabase Postgres
├── deploy/
│   ├── nginx-landers.conf.template
│   └── README.md
└── script/build.ts
```

## 2. The skill system (core)

`advertorials-skill/skill.md` is evergreen — the craft of writing
advertorials. `templates/*.md` are per-template skills with YAML frontmatter
defining `sections`, `image_slots`, `design` tokens, and `offer` placement
rules. The renderer reads the sections array in order and lays the page out
deterministically.

System prompt for every generation =
`base instructions` + `skill.md` + selected `template.md` +
`01-core.md` + `02-quiz.md` + `03-top-scripts.md` + `04-competitors.md` +
`05-funnels.md` (from `Acentecom/product-configs` over GitHub Contents API,
24h in-memory cache, manual refresh via `POST /api/refresh-configs`) +
`user prompt`.

`product-configs` is read-only. The agent never writes to it.

## 3. Phased delivery

| Phase | Focus | Acceptance signal |
|---|---|---|
| 1 | Repo scaffold + auth + AppShell + checker | login works, /api/me returns user, four tabs render |
| 2 | Product configs (GitHub fetch + cache + refresh endpoint) | ledisa-glp1-patches + cleantra-lymphatic appear in dropdown |
| 3 | Template loader + placeholder template + skill runtime | debug endpoint returns assembled prompt |
| 4 | Skeleton generator + skeleton review UI | two skeletons generate in parallel via SSE |
| 5 | Lander generator + live preview | sections render per template; images auto-generated |
| 6 | Editor (drag-select revision, section toolbar, title regen, image regen, bulk CTA) | 5-candidate revision loop verifiable in debug log |
| 7 | Image bank (search, upload, AI-gen, reference-edit, crop, save-from-lander) + 200-img seed per product | pgvector search returns relevant results |
| 8 | Publishing (SSH deploy to landers VPS) | published URL renders |
| 9 | Brands & Products + Settings | per-product image rules; brand domain pool |
| 10 | Self-testing loop (5 mandatory rounds) | every round documented + every fix applied |
| 11 | Template proposal pass (8 reference URLs analyzed → _proposed/*.md) | analysis + proposed templates ready for Liam approval |

## 4. Verification gate

`python3 scripts/check_acceptance.py` MUST exit 0 before `RUN_COMPLETE`.
The checker fingerprint is bound to file sizes, first-line content, and the
current UTC minute — it cannot be hand-forged. Both stdout and stderr are
pasted verbatim into WORK_LOG.md before `RUN_COMPLETE` is written.

## 5. Hosting

- Tool itself: `adv-generator.acentecom.com` on the dev VPS.
- Landers: dedicated VPS at `187.77.29.59`, nginx static serving per
  domain → path, SSH-deploy from the publishing route.

## 6. Reference URLs for Phase 11 template proposal

Eight proven advertorials Liam considers winners. Analyzed in Phase 11
into `advertorials-skill/templates/_proposed/_analysis.md` plus one
proposed `*.md` per distinct template family. None go live until Liam
approves by name.

1. practicalhealthadvice.com/breakthrough-in-foot-nerve-treatment-nrp-z-n-i
2. practicalhealthadvice.com/adv-rc-rk-n-I
3. practicalhealthadvice.com/adv-rc-rk-n-l-lp
4. smarthealthpractices.com/adv-rc-sm-ig-us-4
5. practicalhealthadvice.com/discover-tonepatch-n-i-1
6. practicalhealthadvice.com/tp-har-n-i
7. practicalhealthadvice.com/tonepatch-n-i-z-1
8. (extensible — Liam adds more over time)

## 7. The "don't half-ass" contract

Listed in the chat brief, enforced by `check_acceptance.py`'s half-ass
scan: no `TODO`/`FIXME`/`XXX`, no `throw new Error("Not implemented")`,
no trailing-ellipsis placeholders, no "placeholder for X section"
copy. Templates are sacred and never go live without explicit Liam
approval.
