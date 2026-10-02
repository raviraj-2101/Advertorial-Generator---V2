#!/usr/bin/env python3
"""
expand-image-slots.py — extend the template + manifest with IMG_10
through IMG_15 slot placeholders. The original RejuvaCare template
only had 10 image slots (HERO + IMG_1..9) but real-world briefs can
have 16+ image placeholders. Without this script, briefs with more
than 10 image prompts left the extras un-rendered.

The 6 new slots are appended as a gallery block right after
{{SECTION_15_BODY}}, so they're visible without needing operator
reordering. Operator can move them via the in-iframe ↑/↓ section
controls later.

Idempotent — re-run safe.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
TEMPLATE = HERE / "template.html"
MANIFEST = HERE / "slots.json"

NEW_KEYS = [f"IMG_{n}_URL" for n in range(10, 16)]  # IMG_10..IMG_15

# Same shape as the existing IMG_9 markup so styling stays consistent.
IMG_TPL = '<img title="" target="_self" src="{{KEY}}" href="" align="center" alt="" width="" height="" onclick="" class="fk-image-defaults disable-fk-lazy">'

GALLERY_TPL = (
    '\n<!-- BRIEF-DRIVEN ADDITIONAL IMAGES — auto-inserted by expand-image-slots.py -->\n'
    '<div data-box="true" data-secondsdelay="" id="ialx-extra-img-gallery">\n'
    + "\n".join(IMG_TPL.replace("{{KEY}}", "{{" + k + "}}") for k in NEW_KEYS)
    + "\n</div>\n"
)
GALLERY_MARKER = "ialx-extra-img-gallery"


def expand_template(html: str) -> tuple[str, bool]:
    if GALLERY_MARKER in html:
        return html, False  # already extended
    m = re.search(r'\{\{SECTION_15_BODY\}\}\s*</div>', html)
    if not m:
        # Fall back to just appending after the last SECTION_n_BODY
        m = re.search(r'\{\{SECTION_(\d+)_BODY\}\}', html[::-1])
        if not m:
            raise SystemExit("Couldn't find SECTION_*_BODY to anchor after.")
    insert_at = m.end()
    return html[:insert_at] + GALLERY_TPL + html[insert_at:], True


def expand_manifest(path: Path) -> int:
    data = json.loads(path.read_text())
    existing = {s["key"] for s in data.get("slots", [])}
    added = 0
    for n, key in enumerate(NEW_KEYS, start=10):
        if key in existing:
            continue
        data["slots"].append({
            "key": key,
            "type": "image",
            "required": False,
            "description": f"Additional brief image #{n}. Brief parser maps the (n+1)-th IMAGE PLACEHOLDER from the DOCX here.",
            "aspect_ratio": "16:9",
        })
        added += 1
    # Also bump image_slot_count metadata if present.
    if "image_slot_count" in data:
        data["image_slot_count"] = max(data["image_slot_count"], 16)
    if added > 0:
        path.write_text(json.dumps(data, indent=2) + "\n")
    return added


def main() -> None:
    if not TEMPLATE.exists():
        sys.exit(f"missing {TEMPLATE}")
    src = TEMPLATE.read_text()
    out, changed = expand_template(src)
    if changed:
        TEMPLATE.write_text(out)
        print(f"[expand-image-slots] template.html: added gallery block ({len(out) - len(src):+,} bytes)")
    else:
        print("[expand-image-slots] template.html already extended.")
    added = expand_manifest(MANIFEST)
    print(f"[expand-image-slots] manifest: added {added} new slot definitions.")


if __name__ == "__main__":
    main()
