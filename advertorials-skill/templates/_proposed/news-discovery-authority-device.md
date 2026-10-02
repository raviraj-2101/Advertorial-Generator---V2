---
template_slug: news-discovery-authority-device
template_name: News-Discovery — Authority Device Breakthrough
template_family: news-discovery
fit_signals:
  product_type: ["device", "patch", "supplement"]
  story_archetype: third-party-news-discovery
  offer_position: late
  typical_length_words: [800, 1400]
sections:
  - id: trust_bar
    type: trust_bar
    required: true
    layout: top-strip
    class_options:
      density: ["compact", "normal"]
      alignment: ["left", "center"]
    content_rules: "Static. 'As featured on' + generic news-style placeholders. NEVER names Forbes, NYT, Time, Bloomberg, or CNN unless the brand owns documented rights to those logos."
  - id: headline
    type: headline
    required: true
    layout: serif-large-centered
    image_slot: null
    candidate_count: 20
    selection: top-5-presented-to-user
    rules: "Authority-stunned format. '[Authority] [Stunned|Baffled]: [New Device] [Is Changing Lives|Relieves X] [Fast|Years of Pain]'. Specific stakeholder (Neuropathy experts, Knee surgeons, etc.). No exclamation point."
  - id: subhead_dek
    type: subhead
    required: true
    rules: "One sentence (10-20 words). Names the publication frame (the journalist tone). Never a real publication."
  - id: hero_image
    type: image
    required: true
    image_slot: hero_image
    rules: "16:9 environmental shot, product in clinical-feeling context (workshop, clinic, hands close-up). Product silhouette LOCKED per product config."
  - id: lede
    type: prose
    required: true
    target_words: [80, 140]
    rules: "Third-person editorial. Names the device once. Sets the scene. Never opens with a question. Never opens with 'Have you ever...'."
  - id: mechanism_block
    type: prose
    required: true
    target_words: [200, 320]
    rules: "Pulled verbatim from product 01-core.md mechanism. Paraphrasing the mechanism is a hard-reject (Ingredient Mechanism Fidelity Law)."
  - id: demo_image
    type: image
    required: false
    image_slot: section_3_demo
    rules: "1:1 demo: product in use OR macro detail. Locked elements stay locked."
  - id: demographic_evidence
    type: prose
    required: true
    target_words: [150, 250]
    rules: "Testimonial-style, attributed (name + age + city). Detail-rich. The named-detail (occupation, hobby, locale) is the credibility anchor."
  - id: cta_block_a
    type: cta
    required: true
    rules: "Template CTA copy pattern (e.g. 'Check Availability'). Single CTA. No 'BUY NOW'."
  - id: scarcity_block
    type: prose
    required: true
    target_words: [40, 90]
    rules: "Single sentence. Stock-style scarcity ('Currently in stock at the manufacturer'). Never invents quantities the brand hasn't authorised."
  - id: closing_recap
    type: prose
    required: true
    target_words: [120, 220]
    rules: "Loops back to the authority figure / stakeholder named in the headline. Same protagonist, same beat. Never closes with 'thanks for reading'."
  - id: cta_block_b
    type: cta
    required: true
    rules: "Second CTA, same pattern as cta_block_a, contextually justified by the preceding sentence."
image_slots:
  - key: hero_image
    aspect_ratio: "16:9"
    spec: "Editorial product-in-context environmental. Product silhouette locked. Lighting: bright, clinical, slightly desaturated. No models in frame unless the demographic_evidence section uses a portrait crop."
  - key: section_3_demo
    aspect_ratio: "1:1"
    spec: "Product demo or macro detail. Background neutral. Product silhouette locked."
  - key: scarcity_visual
    aspect_ratio: "4:5"
    spec: "Stock-style visual. Subtle, not loud."
design:
  font_family_headline: "Georgia, 'Times New Roman', serif"
  font_family_body: "system-ui, -apple-system, sans-serif"
  color_accent: "#B91C1C"
  cta_button_style: "warm-orange-pill"
  divider_style: "thin-rule"
  layout_density: "editorial"
offer:
  position: late
  style: "stock-scarcity"
  cta_text_pattern: "Check Availability"
  cta_repetition: 2
---

## The voice of this template

Editorial. Third person. The narrator sounds like a stringer for a
small newspaper assigned to cover a local-interest breakthrough story.
No first-person voice ever. No marketing exclamation. No "we", no "our
team". The article reports on the device; it does not sell it.

The reader should finish the lede thinking they're reading a news
report. They should finish the mechanism_block thinking they understand
why this works. They should finish the demographic_evidence section
thinking other people like them have actually used it. The CTAs read as
the logical next step — "if you want to see if this is still available
at the manufacturer, here's the page" — never as a hard sell.

## Section-by-section instructions

### Section: trust_bar
"As featured on [generic newspaper-style frame]." Never names a real
major publication. Generic frames are acceptable: "As reported by health
correspondents nationwide", "Featured in regional health news",
"Originally published in syndicated health coverage".

### Section: headline
The 20-candidate framework:
- 5 candidates emphasise the stakeholder ("Neuropathy Experts Stunned",
  "Knee Surgeons Baffled", "Endocrinologists Speechless").
- 5 candidates emphasise the device's action verb ("Changing Lives
  Fast", "Relieves Years of Pain", "Restores What Most Lose by 50").
- 5 candidates combine stakeholder + device action.
- 5 candidates are headline-punch outliers (specific number,
  surprising contrast, time-bound claim) that the rubric will surface
  if traditional candidates underperform.

Scoring axes (1–10):
- Specificity (concrete stakeholder + device action).
- Headline punch (curiosity-gap + stakes).
- Voice consistency (editorial third-person).
- Anti-sameness (no fingerprint from the registry).

Top 5 by total score → presented to the user.

### Section: hero_image
Prompt template: "{product_name} in a {clinical | workshop | counter}
environment. Bright, clean lighting. Slightly desaturated. No people in
frame. Editorial wide-shot composition. Product silhouette locked per
spec."

### Section: lede
Opens with a specific scene or number. "On the morning of October 14,
in a small physical-therapy clinic outside Wichita, …" or "Roughly 28
million Americans live with knee pain serious enough to limit
walking — and most still rely on the same three options: cortisone,
braces, and surgery."

### Section: mechanism_block
Loads verbatim from 01-core.md. The engine pulls the mechanism section,
preserves chemistry/biology terms exactly, and frames it as the article
explaining the device's working principle. No paraphrasing of mechanism
language.

### Section: demographic_evidence
A named protagonist. Age + city + one specific occupational or
biographical detail. One direct quote (≤30 words). Never invents
medical claims the protagonist couldn't legitimately make. The detail
("a retired postal worker from Tulsa who walks four blocks to the diner
every morning") is the realism anchor.

## Anti-sameness rules specific to this template

- The named stakeholder in `headline` must rotate across landers in
  the same project. If a previous skeleton used "Neuropathy Experts",
  this skeleton picks a different stakeholder family.
- The opener of `lede` must not re-use a fingerprint registered for
  this product in the last 50 generations.
- The protagonist's named-detail must not repeat across landers in the
  same project.

## Banned moves for this template

- "Revolutionary device" — banned unless the surrounding sentence
  earns it (see Section 10 of the skill).
- Stacking scarcity + urgency + social-proof in one section.
- A pull-quote without attribution.
- A subhead that's a complete sentence ending in a period.
- A protagonist whose detail is generic ("a working mom from the
  Midwest" — too vague to be evidence).
- Real publication names in `trust_bar` unless the brand owns rights.
