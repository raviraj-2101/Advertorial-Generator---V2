---
template_slug: hidden-enemy-personal-story
template_name: Hidden-Enemy + Personal-Story Hybrid
template_family: personal-story
fit_signals:
  product_type: ["patch", "supplement", "drops"]
  story_archetype: negation-reveal-personal-story
  offer_position: mid-late
  typical_length_words: [900, 1500]
# ─── Shared scaffold extracted verbatim from reference URLs 6 + 7 ───────
# (practicalhealthadvice.com /tp-har-n-i, /tonepatch-n-i-z-1)
# The Family C "Dr. Sarah Mitchell + Metabolic Institute" pattern and the
# Family D "Lisa Jackson / husband cheats" pattern share several literals
# the engine MUST rotate when this template ships landers in the future.
shared_scaffold:
  protagonist_name_blocklist:
    - "Dr. Sarah Mitchell"     # invented researcher in URL 6
    - "Lisa Jackson"            # Family-D first-person protagonist (URL 7)
  institute_name_blocklist:
    - "Metabolic Institute of Boston"
  cited_paper_blocklist:
    - "Zhang Y, et al."
    - "Wang L, et al."
  age_callouts_seen: [48, 43, 52, 55, 59, 63, 60, 53]
  product_naming_pattern: "TonePatch" # the reference brand; never reuse for a different product
  brand_name_seen: "Rejuvacare"
  trust_byline_pattern: "By Dr. {Name} | Health & Wellness Correspondent | {N} min read"
  hidden_culprit_phrasing_blocklist:
    - "Hidden Culprit"
    - "Food Noise"
  discount_pct_seen: [65, 70]
  scarcity_seen:
    - "Limited availability in Toronto"
    - "Special pricing active for 05:00"
  cta_pattern_blocklist:
    - "Click here for a 70% discount!"
    - "CHECK AVAILABILITY (MONEY-BACK GUARANTEE)"
  results_claim_blocklist:
    - "22 lbs in 60 days"
    - "17 lbs in 5 weeks"
    - "12 pounds in 3 weeks"
    - "97% trial success rate"
sections:
  - id: headline
    type: headline
    required: true
    layout: sans-large-centered
    candidate_count: 20
    selection: top-5-presented-to-user
    rules: "Negation + reveal. 'X Is Not From Y. Meet The Real Enemy of Z'. Pattern hooks by denying a popularly-believed cause and promising a specific one."
  - id: dek
    type: subhead
    required: true
    rules: "One sentence framing the reveal: 'It's not what you think.' or equivalent. Hooks curiosity into paragraph 1."
  - id: hero_image
    type: image
    required: true
    image_slot: hero_image
    rules: "4:5 lifestyle shot. Demographic-targeted. Warm tones. Subject (the demographic, not necessarily the protagonist) in natural environment."
  - id: lede
    type: prose
    required: true
    target_words: [120, 200]
    rules: "First-person OR named-protagonist third-person, per the template_metadata declared at instance time. Opens with a scene, never a question."
  - id: hidden_enemy_reveal
    type: prose
    required: true
    target_words: [180, 280]
    rules: "The specific mechanism the headline promised. Names the 'enemy' and explains what it actually is. Pulls from 01-core.md mechanism content."
  - id: protagonist_arc
    type: prose
    required: true
    target_words: [250, 400]
    rules: "Symptom → frustration → tried X (without success) → discovery beat. The discovery is the product, named for the first time."
  - id: protagonist_photo
    type: image
    required: false
    image_slot: protagonist_photo
    rules: "1:1 or 4:5 portrait of the demographic. Never a generic stock photo. Specific detail: age, expression, environment."
  - id: cta_block_a
    type: cta
    required: true
    rules: "Soft CTA: 'See if this works for you' / 'Read [protagonist]'s full story'. Template-defined."
  - id: specifics_block
    type: prose
    required: true
    target_words: [200, 300]
    rules: "What makes this product different: mechanism + format (e.g. patch vs injection, drops vs pills). Locked-down lock-down rules from 01-core.md apply."
  - id: social_proof
    type: prose
    required: true
    target_words: [150, 250]
    rules: "Testimonial cluster (2-3 short attributed quotes). Each has a name + age + one detail. No 'amazing!', no 'life-changing!'."
  - id: closing_recap
    type: prose
    required: true
    target_words: [140, 240]
    rules: "Returns to the protagonist's voice. One sentence reflecting on the discovery. Loops back to the headline's hidden-enemy claim."
  - id: cta_block_b
    type: cta
    required: true
    rules: "Second CTA, same pattern, contextually justified."
image_slots:
  - key: hero_image
    aspect_ratio: "4:5"
    spec: "Lifestyle demographic shot. Warm light. Outdoor or natural indoor environment. Product not necessarily in frame (template choice; default no)."
  - key: protagonist_photo
    aspect_ratio: "1:1"
    spec: "Specific, demographic-true portrait. Age-appropriate. Genuine expression."
  - key: product_close_up
    aspect_ratio: "1:1"
    spec: "Macro detail of product. Silhouette and label locked per product config."
design:
  font_family_headline: "'Source Serif Pro', Georgia, serif"
  font_family_body: "system-ui, -apple-system, sans-serif"
  color_accent: "#0F766E"
  cta_button_style: "warm-coral-pill"
  divider_style: "soft-rule"
  layout_density: "intimate"
offer:
  position: mid-late
  style: "soft-discovery"
  cta_text_pattern: "See if this works for you"
  cta_repetition: 2
---

## The voice of this template

Personal-story. Intimate. The protagonist speaks — either in first
person or in a close-third tone — about a specific arc. The brand
never speaks. The product is named only at the discovery beat and
referred to in the protagonist's words from then on.

The reader should finish the lede already invested in the protagonist.
They should finish the hidden_enemy_reveal believing the headline's
claim. They should finish the protagonist_arc emotionally ready to
accept the product as the resolution. The CTAs read as the protagonist
inviting the reader to try what worked for them.

## Section-by-section instructions

### Section: headline
The 20-candidate framework:
- 6 candidates emphasise the negation half ("Stubborn Belly Fat Is Not
  From Aging", "Joint Pain Is Not From Old Cartilage").
- 6 candidates emphasise the reveal half ("Meet The Real Enemy of …",
  "It's Actually Caused By …").
- 4 candidates use a contrast structure ("They Said It Was X. Turns
  Out It's Y.").
- 4 candidates are headline-punch outliers (a specific number, a
  surprising contrast, a time-bound claim).

Scoring: same 9 axes as the skill rubric. Anti-sameness fires on
"hidden", "real enemy of", "what they don't tell you" — these phrases
are powerful but easy to over-use. Rotate.

### Section: hidden_enemy_reveal
Pulls from 01-core.md's mechanism block. Frames the mechanism as the
"hidden enemy" — names it specifically. Avoids stacking three named
causes; one named cause, deeply explained.

### Section: protagonist_arc
The named protagonist starts with a moment ("In April 2023, after my
sister's wedding, …"). The arc lists what they tried in concrete terms
("Whole30, kettlebells, a one-month gym membership at Crunch, …"). The
discovery beat names the product for the first time, in the
protagonist's words.

### Section: specifics_block
What makes this product different. The mechanism is template-rendered
from 01-core.md verbatim. The format (patch / drops / patch-and-sticker
combo / sublingual) is named explicitly. The protagonist's voice
narrates the explanation.

## Anti-sameness rules specific to this template

- The protagonist's name, age, location, and one specific detail must
  rotate across landers in the same project.
- The "tried X (without success)" list must not re-use any item
  across landers in the same project.
- The discovery-beat sentence must not re-use a fingerprint from the
  registry.

## Banned moves for this template

- The protagonist NEVER uses brand-speak. No "I knew this was going to
  be a game-changer for me". No "this product really delivers".
- The reveal NEVER stacks three named causes. One named cause.
- The product is named ONLY at the discovery beat. References before
  that are abstract ("something my doctor mentioned", "a friend's
  recommendation").
- "Amazing", "life-changing", "miracle" are banned everywhere.
- Stock-photo demographics are banned — the protagonist_photo must be
  a specific, demographic-true portrait or the slot stays empty.
