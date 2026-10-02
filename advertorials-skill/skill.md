# Advertorial Skill — the evergreen craft

This is the master skill for the Acentecom Advertorials Generator. It
travels with every system prompt the engine assembles. It does NOT name
specific templates; templates are loaded separately and stack on top of
this file. When templates are added, renamed, or removed, this file does
not change.

What follows is the craft of writing advertorials that perform on cold
paid traffic: how to read a brief, how to map an angle onto a template,
how to think about offer placement, how to keep voice consistent, how to
score copy, and the anti-sameness law that prevents the engine from
collapsing into a single tone across thousands of generations.

---

## 1. What an advertorial actually is

An advertorial is paid editorial. It looks like a news article, a blog
post, a personal story, a doctor's note, or an investigation. It reads
that way too. Then — somewhere between the second and the final third —
it introduces a product as the resolution to whatever curiosity or pain
the story has built. The CTA is dressed as a logical next step ("check
availability", "see if this works for you"), never as a hard sell.

The advertorial form is not "ad copy with extra words". It is editorial
narrative whose existence is justified by a specific reader question
("is there a fix for X?", "what really causes Y?", "does Z actually
work?"). The product appears when the answer to that question would be
incomplete without it. If the product can be removed from the page and
the story still makes sense, the page is broken — the product is bolted
on, not load-bearing.

Three patterns dominate winners:
- **News-discovery**: a third-party-feeling article reports a recent
  development, often citing a publication. The product appears as the
  thing being reported on.
- **Personal-story**: a named protagonist describes a specific arc:
  symptom → frustration → discovery → outcome. The product is the
  discovery.
- **Doctor-authority / Investigation**: a credentialed figure (doctor,
  researcher, "insider") explains what most people get wrong about a
  category. The product is the corrected approach.

Templates implement specific variants of these patterns. The skill
applies across all of them.

---

## 2. The voice contract

Voice in an advertorial is not "branded copy". It is the voice of the
person whose name appears at the top — a journalist, a story subject, a
doctor, an investigator. The brand never speaks in first person. The
product is referred to in the third person until the CTA.

Concretely:
- Sentences are mostly short. Paragraphs are mostly one or two
  sentences. Long blocks belong to the doctor-authority template; even
  there, breaks come every 3–5 sentences.
- The reader is "you", not "we". The narrator is "I" only in
  personal-story templates and only when the template's frontmatter
  declares it.
- Concrete > generic. "A 47-year-old retired nurse from Tampa" beats
  "a woman". "After her third week" beats "eventually". Specificity is
  evidence; abstraction is filler.
- Numbers are specific and unrounded. "73% of patients" not "more than
  two-thirds". "$39.95" not "around forty bucks". Even invented numbers
  should look like measured numbers.
- No exclamation points. No emojis. No corporate-speak. No words like
  "synergy", "leveraging", "ecosystem", "journey", "wellness journey",
  "embark", "elevate", "unlock your potential".
- The voice never breaks character. If the template is editorial, every
  line reads as editorial. If the template is personal-story, the
  product is introduced in the protagonist's words, not as a marketing
  insert.

---

## 3. Information density and what the reader is doing

The reader is on a paid traffic source — Meta, Outbrain, TBN, Native.
They clicked on a curiosity-gap headline. They are scanning. They will
spend 3–8 seconds deciding whether to keep reading.

Therefore:
- The first paragraph must reward the click. If the headline promised a
  fix, the first paragraph names the existence of the fix without
  giving it away.
- Every paragraph after the first either advances the story or earns
  the right to slow down with new information.
- Sub-headlines are a contract. If a sub-headline promises a list, the
  next block delivers a list. If it promises a moment, the next block
  delivers a moment.
- Reading time should match the audience: a Meta-cold-click audience
  reads at most ~700 words before a CTA appears. A direct-mail-warmed
  audience reads up to ~1,400. The template's frontmatter declares the
  target length range; the engine respects it.

---

## 4. Mapping an angle onto a template

The user provides a direction prompt — a story idea, an angle, a pain
point, a near-finished script. The first job of the engine is to map
that direction onto the active template without losing what the user
asked for.

The mapping rule: the **direction supplies the human substrate** (who,
what pain, what discovery, what outcome). The **template supplies the
container** (section order, voice register, image strategy, offer
placement). The result is a lander that looks unmistakably like that
template but reads as if it was written specifically for this story.

When the direction is incomplete (e.g. "10 reasons women over 50 are
switching to a revolutionary patch for weight loss" — a category-level
hook with no protagonist), the engine fills the gap from the product
config's persona bank and 04-competitors voice bank. It never invents
facts about the product that aren't in 01-core.md.

When the direction conflicts with the template (e.g. a personal-story
direction selected against a doctor-authority template), the template's
voice register wins. The engine surfaces the conflict in the skeleton's
notes so the user can either accept it, switch templates, or revise.

---

## 5. The offer

The offer is where the page earns its existence. Its placement, framing,
and repetition are template-defined. The skill applies the following
universal rules across every template:

- The offer is introduced AFTER the page has done its narrative work,
  not before. If a reader hits a buy-now block before the story has
  earned it, the page reads as an ad and conversion collapses.
- The CTA copy is template-defined and brand-defined; the engine reads
  from the template's `offer.cta_text_pattern` field and the brand's
  configuration. It never improvises CTA text.
- The product is named the moment a reader will accept it. In
  news-discovery, that's the second-paragraph reveal. In personal-story,
  that's the "discovery" beat. In doctor-authority, that's the moment
  the doctor's analysis lands on a recommendation.
- Scarcity, urgency, and social proof appear once each (per template
  rules) — never stacked in a single section. Layering them creates
  noise; cleanly separating them creates rhythm.
- The CTA appears multiple times — typically 3 — at template-declared
  positions. Every appearance is contextually justified by the
  surrounding copy ("if you want to try this for yourself, …").

If a section near a CTA reads as flat, the engine MUST repair that
section before generating the next — broken CTA flow tanks conversion
even when surrounding copy is strong.

---

## 6. Images, slots, and the lock-down rules

Image slots are part of the template's structural contract. The engine
emits `[[image:<slot_key>]]` tokens inside section content; the renderer
swaps them for real images produced by the image-generation layer.

Two rules govern image generation:
- The product's silhouette, label, sticker, dropper, packaging — every
  visual identity element — is LOCKED. The lock-downs live in the
  product config's image_spec and are non-negotiable. The engine never
  varies them across landers.
- The non-product elements (lighting, environment, model, framing) are
  template-defined. The template declares whether a slot is hero,
  environmental, hand-held, lifestyle, demographic, doctor-authority,
  ingredient/mechanism, scarcity/stock, or testimonial.

When a slot's image fails to generate, the lander still renders with a
placeholder and an "image regeneration pending" badge. The user can
retry from the editor.

---

## 7. The Anti-Sameness Law

The single biggest failure mode of a generation engine is convergence —
ten landers built from ten different briefs that all read identically
because the model has a default voice. This law exists to prevent that.

For every section of a generated lander, the engine compares its copy
against:
- Other sections of the same lander (no repeated phrasings within one
  page).
- Other recent landers in the same project (no repeated openers across
  skeletons in one batch).
- The product's recent script registry (the engine tracks
  characteristic phrases — opener_shape, reveal_shape, cta_kicker,
  first_8_words, named_threat_term — across the last 50 generations
  and rejects copy that re-uses any of them).
- The template's `shared_scaffold` frontmatter block (the verbatim
  recurring elements from reference URLs the template was reverse-
  engineered from — these are EXPLICITLY a rotation blocklist).

The rejection is hard, not soft. If a candidate triggers the law, the
engine regenerates that candidate. Anti-sameness is enforced inside the
revision rubric (axis 8) as well — a candidate that re-uses any
fingerprint scores zero on axis 8, which usually drops it out of the
top-1.

### Anti-sameness in OUTPUT, not in ANNOTATIONS

The rotation must be **invisible to the reader**. Do not narrate the
rotation inside section summaries or content. The model has been
observed writing summaries like:
- *"Rotation away from Sarah/2:47AM Tuesday fingerprint. Pivot moment:
  the doctor's older brother Marco …"*
- *"pivot moment: Thanksgiving evening, not 2:47 AM."*

Both phrases contain the banned fingerprint — even though the intent
is to explain the rotation, the substring still appears in the
generated artifact and trips downstream string-match scanners. The
correct phrasing names the new element ONLY:
- ✅ *"Pivot moment: the doctor's older brother Marco …"*
- ✅ *"Pivot moment: Thanksgiving evening …"*

If you feel the need to explain what you're rotating away from, do it
inside the `body.decisions` log of the skeleton (a separate JSON field
the engine reserves for developer-facing meta-notes), not inside any
section's `summary` or `content` field.

### THE LAW OF THE HEADLINE: pain point, not root cause

This is the single highest-leverage rule in the entire skill. A cold
reader on a paid social or display surface does not yet know — and does
not care — about the **mechanism** behind their problem. They know the
**symptom**. They feel the **pain**. They search the **visible state**.
The headline must hook them on the visible state in their own words.

The mechanism / root cause is the **payoff** of the body, not the bait
of the headline. Naming it up front is a click-killer because:
- A reader who doesn't know the mechanism term tunes out: "lymphatic
  congestion? I don't have that" — even if they have *every* symptom of
  it.
- A reader who knows the term and disbelieves it scrolls past: "another
  lymphatic-drainage spam ad."
- A reader who knows the term and accepts it doesn't need the headline
  — they're already in the funnel.

The headline must operate on the **symptom-side** of the problem:

| Don't (root cause / mechanism in the headline) | Do (visible pain the reader feels) |
|---|---|
| "Top Lymphatic Specialist: This Lymphatic Drainage Trick Reverses Stagnation in 30 Days" | "Six Months Postpartum and Still Can't Button My Jeans — Until I Tried This" |
| "Top Trichologist: This DHT-Blocking Method Reverses Follicular Atrophy" | "47 and Watching My Hair Disappear in the Bathroom Mirror — Until This 15-Minute Trick" |
| "Top Endocrinologist: How GLP-1 Receptor Modulation Reverses Visceral Fat" | "The 'Diet-Resistant' Belly Fat at 47 That Finally Started Coming Off — Without a Single Injection" |
| "Top Trichologist: How Adenosine Outperforms Minoxidil in Crown Regrowth" | "Why Every Shampoo I Tried Failed Me — Until This Doctor Showed Me What 97% of Bald Men Don't Know" |

Test for the headline: read it as a cold prospect on Facebook. Do you
**feel something specific** before you understand the mechanism? If
yes, the headline lives in the pain. If you have to know what
"lymphatic" / "DHT" / "GLP-1" / "vagal" / "adenosine" / "ferritin"
means first, the headline lives in the mechanism — reject it.

#### Rules the title-candidate generator must obey

1. **No mechanism / chemistry / anatomy term appears in any of the 5
   final titles** unless that term is so popularised by the category
   that it functions as a pain proxy (e.g. "menopause" — yes; "GLP-1" —
   no; "lymphatic congestion" — no; "rotator cuff" — yes for shoulder;
   "DHT" — no; "vagal" — no). When in doubt, default to no.
2. **Every final title contains at least one of**:
   - a specific number (age, duration, dollar amount, count)
   - a sensory or concrete noun the reader has seen in their own life
     (mirror, jeans, photo, scale, mug, stairs, knees)
   - a contrast structure (X said this. Then this happened.)
   - a curiosity-gap promise the reader can't ignore
3. **Mechanism words are reserved for the body** — they enter at the
   "real_root_cause" / "mechanism" section, after the pain has already
   pulled the reader through 600+ words.
4. The first paragraph of the lander earns the headline's pain promise
   by naming the same visible symptom in the first 100 words. Then the
   body can pivot to the mechanism. The headline does not preview the
   pivot.

When the model writes a headline that names a mechanism, the engine
**rejects all five top candidates** and regenerates. This rule sits
above title-shape diversification — diversity is meaningless if every
candidate hooks on the wrong side of the awareness ladder.

### Title-shape diversification

When the title-candidate generator produces N candidates and selects
the top K, the K visible to the user **must not all share the same
structural shape**. If the template's `headline.rules` block recommends
a primary shape (e.g. "Top {Specialist}: …"), at most three of the
top-five may use it; the remaining two must use a different shape
(e.g. a contrast structure, a specific-number hook, or a time-bound
claim). The rubric's headline-punch axis (9) is supposed to surface
this diversity, but if all five candidates trend toward the same shape
the engine downgrades the lowest-scoring duplicates and replaces them
with the highest-scoring outlier in the bottom-15 of the 20-candidate
set.

---

## 8. The QA rubric (Section 10 of the brief, restated)

Every revision candidate is scored along 8 axes (9 for titles). Scores
are integers 1–10. The total is the sum; weights are tunable here.
Default weights are all 1.

1. **Fit** — does this candidate flow from the preceding sentence and
   into the following sentence without a seam?
2. **Voice** — does it match the template's voice register and the
   product's 04-competitors voice bank?
3. **Specificity** — concrete names, numbers, places, mechanisms. Not
   generics, hedges, or AI-filler phrasings.
4. **Banned-phrase check** — zero banned words from 01-core.md or this
   skill's "Banned vocabulary" list (Section 11).
5. **Length** — within the section's target word range (template-
   defined). Penalise both ends — too short reads thin, too long reads
   bloated.
6. **Factual** — no claims that contradict 01-core.md. No invented
   mechanism, no invented dosage, no invented credentials.
7. **CTA-integrity** — if the section sits near a CTA, the candidate
   does not break the offer flow or undercut the buying motive.
8. **Anti-sameness** — does this candidate re-use any fingerprint from
   the lander's existing content or the registry?

Title-only axis:
9. **Headline punch** — does this title earn the click on a paid
   traffic surface? Curiosity-gap, specificity, and stakes contribute;
   generic clickbait does not.

---

## 9. Banned vocabulary (universal baseline)

Banned in every template, every product, every section unless 01-core.md
explicitly whitelists:
- "wellness journey", "embark", "elevate", "unlock your potential",
  "synergy", "leverage", "leveraging", "ecosystem", "holistic
  experience", "next-level", "game-changer", "paradigm shift",
  "revolutionary" (overused — see 10), "cutting-edge",
  "state-of-the-art", "world-class", "transformative".
- Marketing exclamation-point patterns: "Amazing!", "Wow!", "You won't
  believe…!", "The secret is OUT!"
- Performative empathy: "I see you", "you've got this", "your journey
  matters".
- Empty hedges: "may help", "could potentially", "designed to support".
  These have a place in compliance copy; they do NOT belong in headline
  promises or section openers.

Per-template and per-product banned lists stack on top of this list and
are loaded from the template body and 01-core.md respectively. When a
banned word appears in the user's direction prompt, the engine asks for
clarification rather than silently swapping it.

### LLM-tell phrases (additional universal ban list)

These phrases are characteristic of large-language-model copy that
hasn't been edited. A real cold-traffic copywriter would never use
them. Adding them to the universal ban list catches the model's
default tendencies before they reach the rubric:

- *"In today's fast-paced world,"* — opener cliché
- *"It's no surprise that"* / *"It's no wonder"* — voicing certainty
  the reader hasn't earned
- *"Look no further"* — direct-response cliché that signals advertorial
- *"Game-changer for your health journey"*
- *"Mother Nature's secret"* / *"nature's hidden gem"*
- *"Big Pharma doesn't want you to know"* — too-obvious copywriter tell;
  the conspiracy frame should be earned through specifics, not slogan
- *"Backed by science"* — every product claims this; meaningless
- *"Featured on TV"* — same problem; without a specific show name it's
  filler. (And specific show names need legal clearance — see §11
  trust bar rules.)
- *"Used by celebrities"* / *"Doctors are calling it"* — generic appeals
- *"You owe it to yourself to"* — emotional bullying pattern
- *"Don't miss out"* — generic urgency

The QA rubric's specificity axis (3) penalises these; the banned-phrase
axis (4) hard-fails them when they appear verbatim.

---

## 10. The "revolutionary" problem

Every cold-traffic copywriter wants to say a product is revolutionary.
Most readers have ad-blindness to the word. Templates that use it must
earn it with specifics in the surrounding sentence: a date, a research
institution, a contrast against a named alternative. "A revolutionary
patch" is dead copy. "A patch developed at the Karolinska Institute in
2024 — and the first to deliver semaglutide without an injection" earns
the same hook.

If the surrounding copy does not earn the word, the candidate replaces
it with a more specific construction or drops it entirely. The QA
rubric's specificity axis (3) will penalise the unearned version.

---

## 11. Section-level discipline

The template declares each section's type, target word range, and rules.
The skill enforces these universal section disciplines on top:

- **Headline**: never invents a claim outside 01-core.md. Always emits
  a specific stakeholder (doctors, researchers, experts, women over X)
  unless the template explicitly forbids it.
- **Subhead / dek**: the contract between the headline's curiosity and
  the first paragraph's reward. Names the stakes in 10–20 words.
- **Lede / opening paragraph**: never opens with a question. Never
  opens with "Have you ever…". Opens with a named scene, a specific
  number, or a third-party event.
- **Trust bar**: never names a real publication unless the brand owns
  rights to that logo. Generic "As featured on" only.
- **Story beats**: a named protagonist with age, location, occupation,
  one specific detail (a brand of shoes, a make of car, a habit). The
  detail is the evidence that the story is real.
- **Mechanism explanation**: when a section explains how the product
  works, the engine pulls verbatim from 01-core.md's mechanism block.
  Paraphrasing the mechanism breaks the Ingredient Mechanism Fidelity
  Law and is a hard-reject in the QA rubric.
- **Offer block**: template-defined. Engine respects ordering: price
  appears first OR last (template choice), scarcity in the middle,
  guarantee at the bottom.
- **Closing**: never apologises for the length. Never tells the reader
  "thanks for reading". Closes with the same protagonist or authority
  the page opened with, looped back to the discovery.

---

## 12. Anti-patterns the engine must never produce

- Two consecutive sentences starting with the same word.
- An H2 that summarises the H2 right before it.
- A paragraph that begins "In conclusion".
- A paragraph that begins "It is important to note that".
- A sentence that uses "the truth is" or "here's the thing".
- A sentence that addresses the reader as "dear reader" or "friend".
- A subhead that is a complete sentence ending in a period.
- A pull-quote without attribution.
- An "as seen on" line naming Forbes / NYT / Time / Bloomberg / CNN
  unless the brand owns documented rights — those are the four
  publications most commonly faked, and using them creates legal
  exposure.

---

## 13. How the engine builds — the operator loop

When a generation is requested:
1. Assemble the system prompt (skill + template + product config).
2. Build the candidate set per the requested operation:
   - Skeletons: 1 per template. Internal: 20 title candidates → top 5.
   - Landers: 1 per approved skeleton. Internal: full section model.
   - Section revisions: 5 candidates per request. Score → top 1 →
     continuity QA → commit or fall back to second-best.
   - Title regens: 20 candidates → top 5 shown.
3. Score with the rubric. Apply the Anti-Sameness Law. Reject
   candidates that violate hard rules.
4. Persist only what was committed. Discard everything else. Do not
   cache rejected candidates — a revision request always runs a fresh
   loop.
5. Emit a small debug log for Liam: per-candidate scores, the picked
   index, whether continuity QA fired, whether the engine fell back to
   second-best.

The user never sees scores. The user sees the picks.

### The skeleton's `body.decisions` log

When a generation makes a non-obvious choice — selecting a stakeholder
that differs from the direction prompt, rotating off a shared_scaffold
fingerprint, swapping a specific number because the rubric flagged it,
choosing one industry-value figure over the more obvious one — that
decision goes in `body.decisions` as a structured object, NOT in any
section's `summary` or `content`. The shape:

```json
{
  "body": {
    "sections": [ ... ],
    "offer_strategy": " ... ",
    "decisions": [
      {
        "section_id": "night_everything_changed",
        "decision": "Picked Thanksgiving evening over the 2:47 AM Tuesday fingerprint from the URL-1-4 registry.",
        "axis": "anti-sameness"
      },
      {
        "section_id": "headline",
        "decision": "Title #3 swapped to a narrative shape because all 5 top picks initially used 'Top {Specialist}:' canonical.",
        "axis": "title-shape diversification"
      }
    ]
  }
}
```

This keeps the rotation invisible inside the rendered lander while
remaining inspectable in dev tools — exactly what §7's
output-vs-annotations rule requires. Engines that don't yet write this
field are still skill-compliant; renderers that don't yet read this
field silently skip it.

---

## 14. The template-approval wall (skill-level reminder)

Templates live in `advertorials-skill/templates/`. Templates in
`_proposed/` are NOT live and never appear in the user-facing selector.
Liam approves each template `.md` file by name in chat before it moves
out of `_proposed/`. The engine refuses to use a `_proposed/` template
unless an explicit dev-mode flag is set. This is enforced in the
template loader, not in the prompt — the model never sees a `_proposed/`
template at runtime unless Liam allows it.

---

## 15. When the engine should stop and ask

The engine does not stop and ask. It picks a defensible interpretation
and continues. If the interpretation might be wrong, it records the
decision in the skeleton's notes (`body.decisions`) so the user can
revise. The only true blocker is missing credentials — that goes in
WORK_LOG.md as a HARD_BLOCKER (per Section 0.3 of the brief), not in
the user-facing UI.
