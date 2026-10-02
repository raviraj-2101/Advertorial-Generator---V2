# Reference-URL Analysis — Phase 11

Status: **DRAFT V2** — second-pass analysis backed by verbatim fetches of
7 of the 8 reference URLs. The first-pass V1 was largely wrong:
URLs 1-4 are *not* third-party "news-discovery" landers. They are
doctor-conspiracy-discovery monologues — the entire page is the doctor's
first-person voice. Re-fetched all reachable URLs on 2026-05-20 and
re-derived four distinct families below.

None of the proposed templates go live until Liam approves the
corresponding `.md` file by name in chat (Section 0.7 of the brief).

---

## URL inventory

| # | URL                                                                                  | Headline (verbatim opening)                                                                                | Family |
|---|--------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|--------|
| 1 | practicalhealthadvice.com/breakthrough-in-foot-nerve-treatment-nrp-z-n-i             | Top Neuropathy Specialist: "This Is the Fastest Way to Fix Neuropathy for Good"                           | A      |
| 2 | practicalhealthadvice.com/adv-rc-rk-n-I                                              | Top Orthopedic Surgeon: "This Is the Fastest Way to Fix Bone-on-Bone Knee Pain for Good"                  | A      |
| 3 | practicalhealthadvice.com/adv-rc-rk-n-l-lp                                           | Top Orthopedic Surgeon: "This Is the Fastest Way to Relieve Knee Pain for Good"                           | A      |
| 4 | smarthealthpractices.com/adv-rc-sm-ig-us-4                                           | Top Orthopedic Surgeon: "This Is the Fastest Way to Fix Shoulder Pain for Good"                           | A      |
| 5 | practicalhealthadvice.com/discover-tonepatch-n-i-1                                   | How This "Patch Trick" Is Helping Millions Of Americans Melt Fat, Without Crazy Diets, Exercise, ...      | B      |
| 6 | practicalhealthadvice.com/tp-har-n-i                                                 | One Patch Before Bed – To Silence Food Noise & Melt Stubborn Weight (Women Over 35 Are Shocked!)          | C      |
| 7 | practicalhealthadvice.com/tonepatch-n-i-z-1                                          | Husband cheats with a retired woman! I initially thought he was a Deviant, but then discovered ...        | D      |
| 8 | (extensible — Liam adds more over time)                                              | —                                                                                                          | —      |

---

## Family A — Doctor-Conspiracy-Discovery (Triple Method Device)

**URLs:** 1, 2, 3, 4. Templates the brand uses across distinct devices
(Foot/Knee/Shoulder/Knee-LP variant) — same scaffold, different organ.

### Universal structural fingerprint

| Section                            | Section type     | Words | First 8 words (verbatim from URL 1)               |
|------------------------------------|------------------|-------|----------------------------------------------------|
| Opening "I'm about to piss off..." | lede             | ~150  | "I'm about to piss off every neurologist"          |
| The night everything changed       | personal_story   | ~320-400 | "It was 2:47 AM on a Tuesday"                  |
| The mind-blowing discovery         | prose            | ~250-300 | "For the next 3 months, I lived"                |
| Real root cause                    | mechanism        | ~200-250 | "Picture your knee cartilage like a sponge"     |
| 15-minute miracle                  | solution_reveal  | ~200  | "Remember my wife sobbing on the bed"              |
| Industry pushback / threats        | conspiracy       | ~180  | "First, it was 'friendly' warnings"                |
| Introducing the device             | product_intro    | ~100-150 | "It's called the {Product} Triple Method ..."   |
| How it works                       | mechanism_detail | ~300-400 | "When you wrap the {Product} around your..."    |
| Results that have ___ scrambling   | social_proof     | ~200-250 | "In the last 18 months, over 21,500"            |
| Price comparison                   | pricing          | ~250-350 | "Let me show you what fixing"                   |
| The 60% off "in your face"         | offer_reveal     | ~150-200 | "Remember those cease and desist letters I"     |
| 72-hour scarcity                   | scarcity         | ~150-200 | "This {discount} dies in 72 hours"              |
| 90-day guarantee                   | guarantee        | ~100-250 | "Look, I get it. You've been burned"            |
| Choice framing                     | choice           | ~100-180 | "Right now, you're at a crossroads"             |
| What to do next                    | cta_instructions | ~120-150 | "Click the big button below that says"          |
| (optional) Testimonial widget      | social_proof     | varies | Facebook-style comment stream                       |
| Legal disclaimer                   | legal            | ~150  | "The information presented on this website"       |

### Voice register
First-person doctor, aggressive, adversarial against "Big {Industry}".
Opens with "I'm about to piss off every {specialty}..." — earns
permission for editorial truth-telling. Sustained anger as voice.

### Recurring fingerprints across URLs 1-4 (use this as the
**anti-sameness registry** when generating new Family-A landers):

- **The doctor's wife is named Sarah.** Always. URLs 1, 2, 3 confirm; URL 4 also names Sarah.
- **The incident time is "2:47 AM on a Tuesday".** URLs 1, 2, 3 verbatim.
- **The doctor has 40 years experience.** URL 1, 2, 3 verbatim (URL 4 says 23, taught at Johns Hopkins).
- **The brand is Rejuvacare; products are "{Body Part} Triple Method Massager".**
- **The stats scaffold:** 21,500 users, 91% pain relief, 87% medication reduction, 74% surgery avoidance, 0.3% refund rate.
- **Scarcity: 3,847 units remaining, 500/week production, 19 hours Amazon sellout, 72-hour discount window.**
- **Discount tier: 60-65%. Sale price $39.95-$79.99.** Regular $99.95-$199.95.
- **Testimonial locations: Phoenix AZ, Detroit MI, Tampa FL.** Dorothy P. age 71 from Tampa appears repeatedly.
- **Swedish research year cited: 1987. Therapeutic heat: 122°F. Vibration: 45Hz.**

A new Family-A lander MUST rotate the named figure off "Sarah", the time off "2:47 AM Tuesday", and the locations off the trio above. If the anti-sameness law fails to rotate these, the engine has degenerated.

### CTA pattern
- Primary: "CLAIM MY 60% DISCOUNT" / "CLAIM MY 65% DISCOUNT"
- Secondary: "CHECK AVAILABILITY NOW"
- Long: "GET 60% OFF {Product} Now!"

### Trust elements
- "Health Insights Magazine™" masthead
- Specific datetime stamp + view counter (e.g. "Mon. Oct. 27th, 2025 | 11:11 am EST — 251.328 👁")
- Byline: "By Dr. {Name}, {Specialty}, MD"
- **No real publication names cited** (compliance-safe).

### Length
4,000-5,500 words. Long-form. Long enough that the reader emotionally
commits before reaching the offer.

### Image strategy
Hero 16:9 of doctor or device. Mid-page product 1:1. Comparison chart
visual. Customer-portrait testimonial cards. Stock-scarcity visual.

### Offer placement
Mid-late. Product name surfaces at ~60% of page depth. Offer reveal at
~75%. CTA repetition: 3-5 times across the lower 50%.

---

## Family B — GLP-1 Patch Mechanism (Banner-Style)

**URLs:** 5 (`discover-tonepatch-n-i-1`).

### Structural fingerprint

| Section                  | Section type    | Words | First 8 words (verbatim)              |
|--------------------------|-----------------|-------|---------------------------------------|
| Burns Fat 24/7 banner    | hero_claim      | ~90   | "Burns Fat 24/7 While You SLEEP"      |
| GLP-1 mechanism          | mechanism       | ~85   | "Tonepatch naturally stimulates GLP-1, the same" |
| Food-noise hook          | identification  | ~70   | "Do you ever feel like food"         |
| Diet-doesn't-work        | mechanism       | ~75   | "If diet and exercise actually worked" |
| How to apply             | how_to          | ~65   | "Just stick it below your belly"     |
| Social proof             | testimonials    | ~55   | "Tonepatch is changing lives FAST. Women" |
| Risk-free offer          | cta             | ~65   | "Try Tonepatch for 30 days RISK-FREE" |
| Scarcity / closing       | scarcity        | ~75   | "Women everywhere are discovering this banned" |

### Voice register
Direct-marketing, second-person ("you"). No protagonist. Mechanism-led.
Pacing is fast — 600 total words. Designed for a top-funnel ad click.

### Length
~600 words. Banner-style. Single CTA "CHECK AVAILABILITY".

### Offer placement
Almost-immediate. Product named in paragraph 2. Offer at ~60% depth.

---

## Family C — GLP-1 Patch Doctor-Discovery (Editorial Long)

**URLs:** 6 (`tp-har-n-i`).

### Structural fingerprint

| Section                        | Section type      | Words | First 8 words (verbatim) |
|--------------------------------|-------------------|-------|---------------------------|
| Intro / nightly ritual         | lede              | ~150  | "The simple nightly ritual that's helping" |
| Hidden culprit                 | mechanism         | ~200  | "For women over 35, a critical" |
| Discovery                      | narrative         | ~180  | "The breakthrough came from Dr. Sarah" |
| Science behind                 | mechanism_detail  | ~200  | "Dr. Sarah Mitchell spent the next" |
| Why a patch works              | educational       | ~120  | "Most herbs get destroyed in the" |
| Real women results             | testimonials      | ~80   | "Melissa, 52 — Lost 22 lbs" |
| Why Tonepatch works            | comparative       | ~180  | "Traditional diets focus on restriction" |
| Simple ritual                  | how_to            | ~120  | "Using TonePatch couldn't be easier" |
| Special opportunity            | offer_intro       | ~100  | "Originally, TonePatch was intended to" |
| Final thoughts                 | recap             | ~150  | "If you're a woman over 35" |
| 90-day guarantee               | guarantee         | ~100  | "Your Success Is Guaranteed" |
| Choice                         | closing           | ~180  | "You can continue battling cravings that" |

### Distinguishing markers
- Dr. Sarah Mitchell (48, metabolic researcher) — disclaimer notes character is fictional.
- "The Metabolic Institute of Boston" — invented credible institution.
- Two real-paper citations (Zhang Y, Wang L — transdermal semaglutide).
- Age-tiered CTAs ("Click here for a 70% discount!" repeated for 60+, 40-60, 20-40).
- Compares to Ozempic/Wegovy without naming them ("the same hormone in those injection drugs").

### Voice register
Third-person editorial. "Dr. Sarah Mitchell discovered..." framing.
Citations + Institute name + "8 min read" all signal pseudo-journalistic
credibility. Reads like a women's-magazine science feature.

### Length
~1,800 words.

### Offer placement
Mid-page (after "Why Tonepatch Works"). Offer is the discount tier; no
hard price ladder.

---

## Family D — Tabloid-Story (Affair-Reveal)

**URLs:** 7 (`tonepatch-n-i-z-1`).

### Structural fingerprint

| Section                  | Section type   | Words | First 8 words (verbatim) |
|--------------------------|----------------|-------|---------------------------|
| Personal narrative       | lede           | ~1,200 | "My husband and I are the same" |
| Weight struggle          | narrative      | ~800  | "After giving birth to my last" |
| Product discovery        | discovery      | ~600  | "A week later, I returned to" |
| Transformation           | narrative      | ~700  | "After two months of using them," |
| Expert interview         | interview      | ~1,100 | "Hello, Ms. Mitchell. Can you tell" |
| Ingredient list          | mechanism      | ~400  | "In fact, it is not a" |
| Comparison chart         | comparative    | ~250  | "TonePatch uses advanced transdermal technology" |
| Expert opinion           | authority      | ~300  | "After years of research, we've finally" |
| User reviews             | testimonials   | ~400  | "Okay so I'm 63 and honestly" |
| Comments section         | social_proof   | ~600  | "Emily / 10.31.2025 / The results" |

### Distinguishing markers
- Protagonist: Lisa Jackson, 43, real-name first-person.
- Headline format: tabloid-shocking ("Husband cheats with a retired woman!").
- Embedded interview format ("Hello, Ms. Mitchell. Can you tell us...") — Q&A style.
- Geo-targeted urgency banner ("Limited availability in Toronto").
- Spin-wheel discount mechanic.
- Comments-section social proof with timestamps.

### Voice register
First-person tabloid confessional. The protagonist tells the whole story
in her own voice; the doctor appears only as a Q&A interview late in the
page.

### Length
~6,500 words. Longest of the four families.

### Offer placement
Late. Product first named ~30% in; offer at ~60%.

---

## Proposed templates to create

Updating the proposal set based on this analysis:

1. **`doctor-conspiracy-discovery-device.md`** — Family A (URLs 1-4).
   Replaces the V1 `news-discovery-authority-device.md` proposal, which
   was incorrectly framed. Liam should decide whether to keep the V1
   file for reference or delete it.
2. **`patch-mechanism-banner.md`** — Family B (URL 5).
3. **`patch-doctor-discovery-editorial.md`** — Family C (URL 6).
4. **`patch-tabloid-confessional.md`** — Family D (URL 7).

Direct Ledisa relevance: Family C is the natural fit for the Ledisa
GLP-1 Patches product, with Family B as the cheaper-to-write banner
variant and Family D as the high-volatility test-cell variant.

None of these go live until Liam approves by name in chat. V1 files
remain in `_proposed/` until that conversation happens.

---

## Re-fetch plan

URL 8 is "extensible — Liam adds more over time" per the brief. As
new URLs land, append them to the inventory above and re-run the same
fingerprint catalogue. The anti-sameness registry (the specific names,
times, locations, stats that recur across Family A) is the most
load-bearing artifact in this analysis — it's what prevents the engine
from generating landers that are clones of the references.
