#!/usr/bin/env python3
"""
slotize-buttons.py — second pass at templatization.

The original clone left every CTA button's href + inner text + the Privacy
Policy / Terms links hardcoded to RejuvaCare URLs. As a result, when the
operator saved a project with a different cta_url, the rendered page
still pointed at https://ad.rejuvacare.com/click. This script swaps all
of those for {{KEY}} placeholders so the renderer + brand-CTA picker
actually reach the live page.

Slots introduced:
  - {{CTA_URL}}            — set from lander.cta_url
  - {{CTA_LABEL}}          — default-driven, editable in-iframe
  - {{PRIVACY_POLICY_URL}} — brand-level, default-falls-through
  - {{TERMS_URL}}          — same

Idempotent — re-run safe.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
TEMPLATE = HERE / "template.html"
MANIFEST = HERE / "slots.json"

CTA_HREFS = {
    "https://ad.rejuvacare.com/click": "{{CTA_URL}}",
}
PRIVACY_HREFS = {
    "https://www.rejuvacare.com/policies/privacy-policy": "{{PRIVACY_POLICY_URL}}",
}
TERMS_HREFS = {
    "https://www.rejuvacare.com/policies/terms-of-service": "{{TERMS_URL}}",
}


def slotize(html: str) -> tuple[str, dict[str, int]]:
    counts: dict[str, int] = {"cta_hrefs": 0, "privacy_hrefs": 0, "terms_hrefs": 0, "masthead_views": 0}
    for old, new in CTA_HREFS.items():
        n = html.count(f'href="{old}"')
        counts["cta_hrefs"] += n
        html = html.replace(f'href="{old}"', f'href="{new}"')
    for old, new in PRIVACY_HREFS.items():
        n = html.count(f'href="{old}"')
        counts["privacy_hrefs"] += n
        html = html.replace(f'href="{old}"', f'href="{new}"')
    for old, new in TERMS_HREFS.items():
        n = html.count(f'href="{old}"')
        counts["terms_hrefs"] += n
        html = html.replace(f'href="{old}"', f'href="{new}"')
    # Slot-ize the hardcoded views count ("251.328 👁") so operators can
    # edit it. The eye emoji stays as literal.
    n = html.count("251.328")
    if n > 0:
        html = html.replace("251.328", "{{MASTHEAD_VIEWS}}")
        counts["masthead_views"] = n
    return html, counts


def add_slots_to_manifest(path: Path) -> int:
    import json
    data = json.loads(path.read_text())
    existing = {s["key"] for s in data.get("slots", [])}
    new_slots = [
        {
            "key": "CTA_URL",
            "type": "text",
            "required": False,
            "description": "The Voluum (or other) tracking URL the CTA button points at. Picked from brand.cta_presets.",
            "default": "#",
        },
        {
            "key": "CTA_LABEL",
            "type": "text",
            "required": False,
            "description": "Visible CTA button label. Defaults to the original RejuvaCare label so existing tests still pass.",
            "default": "Order Now",
        },
        {
            "key": "PRIVACY_POLICY_URL",
            "type": "text",
            "required": False,
            "description": "Footer privacy policy link.",
            "default": "#",
        },
        {
            "key": "TERMS_URL",
            "type": "text",
            "required": False,
            "description": "Footer terms-of-service link.",
            "default": "#",
        },
    ]
    added = 0
    for s in new_slots:
        if s["key"] in existing:
            continue
        data["slots"].append(s)
        added += 1
    if added > 0:
        path.write_text(json.dumps(data, indent=2) + "\n")
    return added


def main() -> None:
    if not TEMPLATE.exists():
        sys.exit(f"missing {TEMPLATE}")
    src = TEMPLATE.read_text()
    out, counts = slotize(src)
    if out != src:
        TEMPLATE.write_text(out)
        print("[slotize-buttons] template.html updated:")
        for k, v in counts.items():
            print(f"  {k}: {v}")
    else:
        print("[slotize-buttons] template.html already slotized.")
    added = add_slots_to_manifest(MANIFEST)
    print(f"[slotize-buttons] manifest: added {added} new slot definitions.")


if __name__ == "__main__":
    main()
