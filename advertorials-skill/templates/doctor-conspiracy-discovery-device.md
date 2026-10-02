---
template_slug: doctor-conspiracy-discovery-device
template_name: Doctor Conspiracy-Discovery (Triple Method Device)
template_family: doctor-conspiracy
fit_signals:
  product_type: ["device", "massager", "wearable"]
  story_archetype: doctor-first-person-conspiracy
  offer_position: late
  typical_length_words: [4000, 5500]
# ─── Shared scaffold extracted verbatim from reference URLs 1-4 ──────────
# (practicalhealthadvice.com /breakthrough-in-foot-nerve-treatment,
#  /adv-rc-rk-n-I, /adv-rc-rk-n-l-lp, smarthealthpractices.com /adv-rc-sm-ig-us-4)
#
# These elements REPEAT VERBATIM across all four reference landers. The
# anti-sameness law in skill.md §7 + the section rules below TREAT EACH
# OF THESE AS A FINGERPRINT TO ROTATE — a new generation must not re-use
# any of these literal values. The engine reads this block to score
# axis-8 (anti-sameness) and reject candidates that re-use any item.
#
# This is *not* a list of allowed values — it is the explicit blocklist
# of moves the reference set has already burned through.
shared_scaffold:
  # Named figures that recur — rotation REQUIRED.
  protagonist_name_blocklist: ["Sarah"]                              # wife in URLs 1, 2, 3, 4
  testimonial_name_seen: ["Dorothy P. (71, Tampa FL)", "Jim (6'4\", Detroit MI)", "Marcus T. (Detroit MI)", "Jennifer K. (Phoenix AZ)", "Linda Peterson (Tucson AZ)", "Brad Jenkins (Sarasota FL)", "Jessica Miller (Boise ID)"]
  testimonial_location_overused: ["Phoenix, AZ", "Detroit, MI", "Tampa, FL"]
  # Time / scene fingerprints.
  pivot_time_blocklist: ["2:47 AM on a Tuesday", "3:17 AM on a Tuesday"]
  pivot_event_blocklist: ["wife sobbing on the bathroom floor"]
  # Statistical scaffold — every number below appears verbatim in URLs 1-4.
  # Rotation required to a defensible alternative.
  stats_scaffold_blocklist:
    users_count: ["21,500", "19,847"]
    pain_relief_pct: ["91%", "93%"]
    medication_reduction_pct: ["87%", "89%"]
    surgery_avoidance_pct: ["74%", "78%"]
    refund_rate_pct: ["0.3%", "0.02%"]
  # Device specs that recur (calibration values are template-locked
  # by manufacturer; if a new product has different specs, override).
  therapeutic_specs_seen: ["122°F therapeutic heat", "45Hz vibration", "15-minute treatment duration"]
  # Industry-scale numbers recurred.
  industry_value_blocklist_usd_billions: [73, 76, 82]
  # Scarcity scaffold.
  scarcity_scaffold_blocklist:
    units_remaining: ["3,847", "4,127"]
    weekly_production: ["500 units per week"]
    amazon_sellout_window: ["19 hours"]
    discount_window: ["72 hours"]
  # Discount tier.
  discount_pct_seen: [50, 60, 65]
  # Research citation that recurred.
  research_citation_blocklist: ["1987 Swedish research study"]
  # Doctor experience claim.
  doctor_experience_years_seen: [23, 40]
  # Brand naming pattern — the reference brand. Engine never reuses
  # "Rejuvacare" for a different brand's lander.
  brand_name_seen: "Rejuvacare"
  product_naming_pattern: "{BodyPart} Triple Method Massager"
  # Trust-bar masthead.
  masthead_seen: "Health Insights Magazine"
  # Opener — STRUCTURAL (allowed to reuse the shape), but the
  # predicate after "every" must rotate.
  structural_opener_shape: "I'm about to piss off every {specialty}..."
  structural_opener_predicate_blocklist: ["piss off every neurologist", "piss off every orthopedic surgeon"]
  # Discount-section framing — recurs verbatim.
  offer_section_framing_blocklist: ["'In Your Face' to the Medical Establishment"]
sections:
  - id: trust_bar
    type: trust_bar
    required: true
    layout: top-strip
    content_rules: "Static editorial masthead. Format: '{Weekday}. {Mon}. {Date}, {Year} | {hh:mm} {am/pm} {tz} - {view_count} 👁 / ADVERTORIAL'. Masthead text: 'Health Insights Magazine' or template-defined alternative. Never names a real major publication."
  - id: byline
    type: byline
    required: true
    rules: "Format: 'By Dr. {Name}, {Specialty}, MD'. Specialty rotates with body part being addressed."
  - id: headline
    type: headline
    required: true
    layout: serif-large-centered
    candidate_count: 20
    selection: top-5-presented-to-user
    rules: "Format: 'Top {Specialist}: \"This Is the Fastest Way to Fix {Condition} for Good\"'. Specialist rotates: Neuropathy Specialist, Orthopedic Surgeon, Endocrinologist, Cardiologist, etc."
  - id: dek
    type: subhead
    required: true
    rules: "Format: '{Former chronic pain sufferer | Former surgeon} exposes the ${XX} billion {industry} conspiracy — and the {N}-minute trick that ended {N} years of agony (without pills, shots, or surgery)'. Dollar amounts and durations rotate per generation. Anti-sameness law rejects re-use of '${XX} billion' value seen in last 50 generations for this product."
  - id: lede
    type: prose
    required: true
    target_words: [120, 180]
    rules: "Opens with: 'I'm about to piss off every {specialty}...' This opener is structural — it earns permission for the rest of the page's editorial truth-telling tone. Establishes the doctor's first-person voice. Sets up the conspiracy frame."
  - id: night_everything_changed
    type: personal_story
    required: true
    target_words: [280, 400]
    rules: "Pivot moment in the doctor's life — when a family member's condition couldn't be fixed by the doctor's own field. ANTI-SAMENESS: the name 'Sarah', the time '2:47 AM Tuesday', and the duration '4-5 years' are FINGERPRINTS from URLs 1-4. A new lander MUST rotate name, time, location, and trigger event so two landers from this template never share their pivot moment. Rotation is required, not optional."
  - id: mind_blowing_discovery
    type: prose
    required: true
    target_words: [220, 280]
    rules: "The doctor's journey of investigation. Off-the-clock research, hidden papers, suppressed studies. Cites a specific year (URLs use 1987 Sweden — also a fingerprint to rotate)."
  - id: real_root_cause
    type: mechanism
    required: true
    target_words: [200, 260]
    rules: "Pulled from product 01-core.md mechanism block. Frames the mechanism as 'the thing your {specialty} doesn't want you to know'. Uses an analogy — 'Picture your {body part} like a sponge'."
  - id: fifteen_minute_miracle
    type: solution_reveal
    required: true
    target_words: [180, 240]
    rules: "Loops back to the family member from the night-everything-changed section. Their recovery moment. The realization that the mechanism + a delivery format = a fixable problem."
  - id: hero_image
    type: image
    required: false
    image_slot: hero_image
    rules: "Doctor + device or device + body part. 16:9. Clinical-but-warm lighting."
  - id: industry_pushback
    type: conspiracy
    required: true
    target_words: [150, 220]
    rules: "Cease-and-desist letters, friendly warnings, lost referrals. Establishes the doctor as embattled. NEVER names a specific medical board or publication — uses generic 'the industry', 'colleagues', 'the licensing board'."
  - id: product_intro
    type: product_intro
    required: true
    target_words: [80, 150]
    rules: "Format: 'It's called the {Product Name}.' First place the product is named on the page. Earlier mentions in non-name terms ('the device', 'what I built') are allowed in product_intro itself but never before this section."
  - id: how_it_works
    type: mechanism_detail
    required: true
    target_words: [280, 400]
    rules: "Numbered phases (typically 3): the device's wrap/apply/use sequence. Includes therapeutic specifics from the product's 01-core.md (temperature, frequency, duration) verbatim. Paraphrasing the mechanism is a hard-reject."
  - id: demo_image
    type: image
    required: false
    image_slot: demo_image
    rules: "1:1 demo of the device on-body. Locked product silhouette."
  - id: results_section
    type: social_proof
    required: true
    target_words: [200, 280]
    rules: "Stats scaffold (rotate exact percentages to avoid the URL-1-4 fingerprint): {N}+ users, {%}% pain relief, {%}% medication reduction, {%}% surgery avoidance, {decimal}% refund rate. Numbers come from product config; if absent, default to a defensible scaffold."
  - id: price_comparison
    type: pricing
    required: true
    target_words: [250, 350]
    rules: "Lists alternatives by price (surgery $X, cortisone $X/month, other devices $X). Establishes that the product is dramatically cheaper than any of them."
  - id: offer_reveal
    type: offer_reveal
    required: true
    target_words: [140, 220]
    rules: "Discount tier from brand config (60-70% typical). Frames as 'in your face to the {industry}'. Names the regular and sale price explicitly."
  - id: scarcity
    type: scarcity
    required: true
    target_words: [140, 200]
    rules: "72-hour window. Specific units remaining number (rotated per generation). Weekly production cap. ANTI-SAMENESS: '3,847 units remaining', '500/week production', '19 hours Amazon sellout' are URL 1-4 fingerprints; rotate all three across new landers."
  - id: guarantee
    type: guarantee
    required: true
    target_words: [100, 220]
    rules: "90-day money-back. Phrase from product 04-competitors voice bank, or a defensible default if absent. Includes 'Look, I get it. You've been burned before...' opener as voice signature."
  - id: choice_framing
    type: choice
    required: true
    target_words: [100, 180]
    rules: "Crossroads metaphor. Two paths — keep doing what's not working, or try the device. Soft pressure."
  - id: cta_instructions
    type: cta_instructions
    required: true
    target_words: [100, 150]
    rules: "Step-by-step on how to claim the discount. Mentions the button label, the form, the email confirmation."
  - id: cta_block_repeat
    type: cta
    required: true
    rules: "Final CTA. Template default copy: 'CLAIM MY {discount}% DISCOUNT'. Secondary line: 'CHECK AVAILABILITY NOW'."
  - id: testimonials_widget
    type: social_proof
    required: false
    rules: "Optional Facebook-style comment widget rendered as a section. Each entry: name + age + city + 1-2 sentences. Anti-sameness rotates the cities — URL 1-4 over-use Phoenix AZ, Detroit MI, Tampa FL."
  - id: legal_disclaimer
    type: legal
    required: true
    target_words: [120, 180]
    rules: "Standard medical-product disclaimer. Not editorial — pulled from brand config legal block. Never written fresh by the model."
image_slots:
  - key: hero_image
    aspect_ratio: "16:9"
    spec: "Doctor with device, or device on-body in clinical context. Bright but warm lighting. Product silhouette locked per product config."
  - key: demo_image
    aspect_ratio: "1:1"
    spec: "Device in-use, hand-held, or macro detail. Locked product elements stay locked."
  - key: comparison_chart
    aspect_ratio: "4:5"
    spec: "Visual comparison of alternatives (price vs effectiveness). Rendered cleanly, no real brand names."
  - key: testimonial_portraits
    aspect_ratio: "1:1"
    spec: "Demographic-true portrait crops. One per testimonial. Rotated locations."
design:
  font_family_headline: "'Source Serif Pro', Georgia, serif"
  font_family_body: "'system-ui', -apple-system, sans-serif"
  color_accent: "#B91C1C"
  cta_button_style: "warm-red-pill"
  divider_style: "thin-rule"
  layout_density: "editorial-long"
offer:
  position: late
  style: "discount-stack"
  cta_text_pattern: "CLAIM MY {discount}% DISCOUNT"
voice_specifics:
  # Calibration applied on top of skill.md §2 (voice contract).
  sentence_length_target_words: [6, 16]   # short, often one-clause
  paragraph_length_target_sentences: [1, 3]
  first_person_pronoun_use: "doctor only"  # the reader is 'you'; 'we' is rare and signals industry, not allyship
  contraction_register: "informal-clinical" # 'I'd', 'don't', 'it's' OK; 'we'll' rare; never 'shouldn't've'
  rhetorical_question_quota: 2              # the whole page may use at most 2 rhetorical questions; more = sermon
  imperative_quota: 8                       # short imperatives are voice signature, but >8 → hard-sell
  banned_doctor_speak:
    - "let me tell you"
    - "trust me on this"
    - "as a doctor I can tell you"
    - "speaking from years of experience"
    - "in my professional opinion"
    - "I'll be honest with you"
    - "the truth of the matter is"
  banned_industry_speak:
    - "evidence-based"
    - "FDA cleared" # use "FDA-registered" only if 01-core.md whitelists; never invent
    - "best-in-class"
    - "doctor formulated"
    - "physician approved"
  hedging_quota: 1                           # one "may help" or "supports" per page max; medical disclaimers don't count
  punctuation_rules:
    em_dash_per_section_max: 2               # the model over-uses em-dashes; cap at 2
    exclamation_marks: 0                     # banned entirely
    ellipsis_marks_per_page_max: 3
  reading_grade_target: [7, 9]               # Flesch-Kincaid; advertorial sweet spot
  cta_repetition: 4
---

## The voice of this template

First-person doctor, aggressive, anti-establishment. The doctor is the
narrator of the entire page; the reader is the second person ("you've
been burned before"). Sentences are short. Paragraphs are 1-3 sentences.
The voice never softens — it earns the reader's trust by sustained
willingness to attack the doctor's own profession.

The reader should finish the lede already in the doctor's camp. They
should finish the night-everything-changed section emotionally tied to
the doctor's family member. They should finish the mind-blowing-
discovery section convinced there's a suppressed mechanism. They should
finish the offer block believing the discount is a real, time-bound
favor from someone who has already proven themselves.

## Section-by-section instructions

### Section: headline
The 20-candidate framework:
- 8 candidates emphasise specialist + condition ("Top Endocrinologist:
  'This Is the Fastest Way to Reverse Insulin Resistance for Good'").
- 6 candidates emphasise the time-to-fix ("Fixes Years of {Condition}
  in 15 Minutes"). Time word matches the product's mechanism duration.
- 6 candidates are headline-punch outliers (specific number, surprising
  contrast, time-bound claim).

Scoring: full 9-axis rubric. The headline-punch axis carries extra
weight here — this format competes against direct-marketing cold-traffic
hooks and a weak headline tanks CTR.

### Section: night_everything_changed
**This section's fingerprint is the most-rotated element of the entire
template.** When generating a new lander, the engine MUST diverge from
the URL 1-4 fingerprint:

| Element       | URL 1-4 fingerprint                | New-lander requirement                                  |
|---------------|------------------------------------|----------------------------------------------------------|
| Named figure  | "Sarah" (wife)                     | Rotate to a non-Sarah name. Different relationship is OK (daughter, mother, neighbour, patient). |
| Time          | "2:47 AM on a Tuesday"             | Rotate to a different time + day. Or a daytime event.    |
| Trigger event | Collapse on a kitchen floor        | Rotate to a different mundane-but-specific event.        |
| Duration      | "4-5 years"                        | Rotate.                                                  |

If any of these match a value used in the last 50 generations for this
product (the script registry), the engine regenerates the section.

### Section: real_root_cause
Pulls verbatim from the product's 01-core.md mechanism block. The
analogy ("Picture your knee cartilage like a sponge") is template-
defined and may be re-used; the explanation of what the mechanism
*does* must come from the product config without paraphrase.

### Section: industry_pushback
Acceptable claims:
- Friendly warnings from colleagues.
- Cease-and-desist letters from "trade groups" or "associations".
- Lost referrals or speaking-circuit invitations.

Forbidden claims:
- Specific medical-board sanctions.
- Specific lawsuits with named parties.
- Named publications, news outlets, or government agencies.

If the brief asks for a forbidden specificity, the engine emits a
softer general claim and notes the substitution in the lander's
section notes.

### Section: offer_reveal
The discount percentage comes from the brand config. The regular and
sale price come from the product config. The model never invents a
price. If the product config is missing prices, the section is generated
as a placeholder and flagged in the lander's `body.decisions` log.

## Anti-sameness rules specific to this template

- Sarah, 2:47 AM Tuesday, $XX billion industry value, 21,500 users,
  91% / 87% / 74% / 0.3% stats scaffold, 3,847 units remaining, 500/week
  production, 19 hours Amazon sellout, Phoenix-Detroit-Tampa testimonial
  locations, 1987 Swedish research year, 122°F + 45Hz device specs —
  every one of these is in the registry from the four reference landers.
  A new generation that re-uses any of them scores 0 on the anti-
  sameness axis and almost always loses the top-1 selection.
- The opener "I'm about to piss off every {specialty}" is the
  structural opener and CAN be reused — but the predicate must rotate
  ("I'm about to ruin", "I'm about to lose every referral").

## Banned moves for this template

- Naming a real medical board, real lawsuit, or real publication.
- Citing a real doctor by name (the doctor in the lander is the
  brand's persona, not a real practitioner). The disclaimer at the
  bottom must explicitly note the doctor character is illustrative.
- Re-using "2:47 AM Tuesday" exactly. Rotation is mandatory.
- Claiming FDA approval the product doesn't have. The product's
  01-core.md is the truth. Falling back to "FDA-registered" is allowed
  only if 01-core.md whitelists that wording.
- Stacking 4+ scarcity markers in one section. Two per section max.
- A pull-quote without attribution.
- A subhead that's a complete sentence ending in a period.
