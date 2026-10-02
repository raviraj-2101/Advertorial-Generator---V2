#!/usr/bin/env python3
"""
build-template.py — turn reference.html into template.html + slots.json.

The reference HTML is the live RejuvaCare advertorial scraped from
https://www.smarthealthpractices.com/adv-rc-sm-lg-us-5 . We do NOT touch
the markup or CSS — we ONLY replace the variable text + image URLs with
{{SLOT}} placeholders. That preserves pixel-perfect visual fidelity while
making the template content-driven.

Slot naming convention:
  {{HEADLINE}}              — the H1 headline
  {{BYLINE}}                — "Written by Dr. X, ..."
  {{MASTHEAD_TIMESTAMP}}    — "Sat. March 14th, 2026 | 11:11 am EST -"
  {{MASTHEAD_VIEWS}}        — "251.328"
  {{BREADCRUMB_CATEGORY}}   — "Shoulder Health" → "Nerve Health"
  {{HERO_IMAGE_URL}}        — first big image (doctor portrait)
  {{IMG_<n>_URL}}           — later images, ordered as they appear (1..N)
  {{SECTION_<n>_HEADER}}    — the all-caps mid-page headers
  {{SECTION_<n>_BODY}}      — prose under each section header
  {{PRODUCT_NAME}}          — "RejuvaCare Triple Method Shoulder Massager"
  {{DISCOUNT_PCT}}          — "60"
  {{SALE_PRICE}}            — "$79.95"
  {{REGULAR_PRICE}}         — "$199.95"
  {{GUARANTEE_DAYS}}        — "90"
  {{CTA_URL}}               — final checkout URL
  {{UNITS_REMAINING}}       — "4,127"
  {{UNITS_PER_WEEK}}        — "500"

The script writes:
  - template.html (with slot placeholders)
  - slots.json (slot manifest the renderer reads)
"""
from __future__ import annotations
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
REF = HERE / "reference.html"
OUT_HTML = HERE / "template.html"
OUT_SLOTS = HERE / "slots.json"

# Source image URLs we identified in the reference, in document order.
IMAGE_URLS = [
    "https://assets.checkoutchamp.com/a96c96cf-ff8a-4605-baf1-37a324100ef8/1771998713488_Old_19_.jpg",
    "https://assets.checkoutchamp.com/edd2478e-6edc-46ce-a24d-753a4a29929c/1769109049451_01_4_.jpg",
    "https://assets.checkoutchamp.com/edd2478e-6edc-46ce-a24d-753a4a29929c/1769109421148_03_6_.jpg",
    "https://assets.checkoutchamp.com/edd2478e-6edc-46ce-a24d-753a4a29929c/1769286005884_10_1_.jpg",
    "https://assets.checkoutchamp.com/edd2478e-6edc-46ce-a24d-753a4a29929c/1769286008696_09_1_.jpg",
    "https://assets.checkoutchamp.com/edd2478e-6edc-46ce-a24d-753a4a29929c/1769109773339_06_4_.jpg",
    "https://assets.checkoutchamp.com/9a5e120a-1691-48bb-b293-c4ce9d739240/1762531775417_1761210462357_imgi_8_1741782436532_1736770581948_1726492251345_1706025492_happy_customers.png",
    "https://assets.checkoutchamp.com/edd2478e-6edc-46ce-a24d-753a4a29929c/1769110125274_07_5_.jpg",
    "https://assets.checkoutchamp.com/edd2478e-6edc-46ce-a24d-753a4a29929c/1769110183868_04_6_.jpg",
    "https://assets.checkoutchamp.com/edd2478e-6edc-46ce-a24d-753a4a29929c/1769110586572_product_with_box_mockup.png",
]

# The all-caps section headers from the reference, in document order. The
# parser swaps each with {{SECTION_<n>_HEADER}}. Body prose between headers
# is identified via line-pattern, not by markup, since the reference uses
# Wix-style nested divs.
SECTION_HEADERS = [
    "THE NIGHT EVERYTHING CHANGED",
    "THE MIND BLOWING DISCOVERY",
    "THE REAL ROOT CAUSE OF ROTATOR CUFF PAIN",
    "THE 12-MINUTE MIRACLE HIDING IN PLAIN SIGHT",
    "THIS BREAKTHROUGH IS PISSING OFF AN ENTIRE INDUSTRY",
    "WHEN YOU MESS WITH $73 BILLION, THEY COME FOR YOU",
    "INTRODUCING THE DEVICE THAT ACTUALLY RELIEVES SHOULDER PAIN",
    "HERE'S EXACTLY HOW IT EASES SHOULDER PAIN IN 12 MINUTES",
    "THE RESULTS THAT HAVE SURGEONS SCRAMBLING",
    "THE PRICE THAT'S CAUSING MEDICAL INDUSTRY PANIC",
    'THE 60% OFF "IN YOUR FACE" TO THE MEDICAL ESTABLISHMENT',
    'MY PERSONAL 90-DAY "PAIN-FREE" GUARANTEE',
    "BUT HERE'S THE CATCH (AND IT'S A BIG ONE)",
    "THE CHOICE THAT WILL DEFINE YOUR NEXT DECADE",
    "HERE'S EXACTLY WHAT TO DO NEXT",
]

# Other landmark literal strings we slot-ize.
LITERAL_REPLACEMENTS: list[tuple[str, str]] = [
    # Masthead
    ("Top Orthopedic Surgeons: \"This Is the Fastest Way to Alleviate Shoulder Pain for Good\"", "{{HEADLINE}}"),
    ("Home &gt; Health&gt; Shoulder Health", "Home &gt; Health&gt; {{BREADCRUMB_CATEGORY}}"),
    ("Sat. March. 14th, 2026 | 11:11 am EST -", "{{MASTHEAD_TIMESTAMP}} -"),
    ("Written by Dr. Schilling, Orthopedic Surgeon, MD", "Written by {{BYLINE}}"),
    # Product name (appears multiple times)
    ("RejuvaCare Triple Method Shoulder Massager", "{{PRODUCT_NAME}}"),
    # Pricing / discount (only in the prose, not in the offer-box image)
    ('$79.95', "{{SALE_PRICE}}"),
    ('$199.95', "{{REGULAR_PRICE}}"),
    # Scarcity numbers
    ('4,127 units left', '{{UNITS_REMAINING}} units left'),
    ('500 per week', '{{UNITS_PER_WEEK}} per week'),
    # Salutation + dear-friend opener (parameterize the audience)
    ("Dear Friend With Shoulder Pain,", "Dear Friend With {{AUDIENCE_PAIN}},"),
    ("Dr. Blane Schilling", "{{DOCTOR_NAME}}"),
    ("Dr. Schilling", "{{DOCTOR_LAST_NAME}}"),
]


def main() -> None:
    html = REF.read_text(encoding="utf-8")

    # ── 1. Replace image URLs in document order. The reference has 10 ──
    # images; HERO_IMAGE_URL is the first, then IMG_1_URL .. IMG_9_URL.
    for i, src in enumerate(IMAGE_URLS):
        slot = "{{HERO_IMAGE_URL}}" if i == 0 else f"{{{{IMG_{i}_URL}}}}"
        count = html.count(src)
        if count == 0:
            print(f"  ⚠ image #{i} not found verbatim: {src[:80]}…")
            continue
        html = html.replace(src, slot)
        print(f"  ✓ image #{i:>2} → {slot:24} ({count} occurrences swapped)")

    # ── 2. Section headers. Each occurrence → {{SECTION_<n>_HEADER}}. ──
    # The reference contains every header verbatim once, inside heading
    # elements. We match the exact case.
    for i, hdr in enumerate(SECTION_HEADERS, start=1):
        count = html.count(hdr)
        if count == 0:
            print(f"  ⚠ section header missing: {hdr[:60]}")
            continue
        html = html.replace(hdr, f"{{{{SECTION_{i}_HEADER}}}}", 1)
        print(f"  ✓ section header {i:>2} → SECTION_{i}_HEADER ({count} hits, replaced 1)")

    # ── 3. Other literal slot replacements. ──
    for pat, slot in LITERAL_REPLACEMENTS:
        count = html.count(pat)
        if count == 0:
            print(f"  ⚠ literal missing: {pat[:60]}")
            continue
        html = html.replace(pat, slot)
        print(f"  ✓ literal → {slot:30} ({count} occurrences)")

    # ── 4. Write outputs ──
    OUT_HTML.write_text(html, encoding="utf-8")
    slots = {
        "slug": "rejuvacare-doctor-discovery",
        "name": "RejuvaCare Doctor-Discovery (Long-form Editorial)",
        "reference_url": "https://www.smarthealthpractices.com/adv-rc-sm-lg-us-5",
        "section_headers_count": len(SECTION_HEADERS),
        "image_slot_count": len(IMAGE_URLS),
        "slots": [
            {"key": "HEADLINE", "type": "text", "required": True, "description": "Big H1 headline — pain-point first."},
            {"key": "BYLINE", "type": "text", "required": True, "default": "Dr. [Author Name], [Specialty], MD"},
            {"key": "MASTHEAD_TIMESTAMP", "type": "text", "required": False, "default": "Sat. March 14th, 2026 | 11:11 am EST"},
            {"key": "MASTHEAD_VIEWS", "type": "text", "required": False, "default": "251.328"},
            {"key": "BREADCRUMB_CATEGORY", "type": "text", "required": False, "default": "Health"},
            {"key": "AUDIENCE_PAIN", "type": "text", "required": True, "description": 'e.g. "Shoulder Pain" or "Burning Feet"'},
            {"key": "DOCTOR_NAME", "type": "text", "required": True},
            {"key": "DOCTOR_LAST_NAME", "type": "text", "required": True},
            {"key": "PRODUCT_NAME", "type": "text", "required": True},
            {"key": "SALE_PRICE", "type": "text", "required": True, "default": "$79.95"},
            {"key": "REGULAR_PRICE", "type": "text", "required": True, "default": "$199.95"},
            {"key": "UNITS_REMAINING", "type": "text", "required": False, "default": "4,127"},
            {"key": "UNITS_PER_WEEK", "type": "text", "required": False, "default": "500"},
            {"key": "HERO_IMAGE_URL", "type": "image", "required": True, "aspect_ratio": "16:9"},
        ]
        + [{"key": f"IMG_{i}_URL", "type": "image", "required": False, "aspect_ratio": "16:9"} for i in range(1, len(IMAGE_URLS))]
        + [{"key": f"SECTION_{i}_HEADER", "type": "text", "required": True} for i in range(1, len(SECTION_HEADERS) + 1)],
    }
    OUT_SLOTS.write_text(json.dumps(slots, indent=2), encoding="utf-8")

    print()
    print(f"Wrote: {OUT_HTML.relative_to(HERE.parent.parent)}")
    print(f"Wrote: {OUT_SLOTS.relative_to(HERE.parent.parent)}")
    print(f"Template has {len(slots['slots'])} slots.")


if __name__ == "__main__":
    main()
