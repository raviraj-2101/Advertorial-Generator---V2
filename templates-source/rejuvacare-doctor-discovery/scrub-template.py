#!/usr/bin/env python3
"""
scrub-template.py — remove decorative residue from the cloned RejuvaCare
template that wasn't slot-ized:
  - hardcoded <video> + <source> elements (Shopify CDN mp4s)
  - empty <li> bullets that render as dots with no text
  - <ul> wrappers left empty after the above

Idempotent. Re-run any time to re-scrub from the reference.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
TEMPLATE = HERE / "template.html"

def scrub(html: str) -> tuple[str, dict[str, int]]:
    counts: dict[str, int] = {}

    # 1. Strip every <video>...</video>
    new, n = re.subn(r"<video\b[^>]*>.*?</video>", "", html, flags=re.DOTALL | re.IGNORECASE)
    counts["videos_removed"] = n
    html = new

    # 2. Strip loose <source> elements
    new, n = re.subn(r"<source\b[^>]*/?>", "", html, flags=re.IGNORECASE)
    counts["sources_removed"] = n
    html = new

    # 2b. Strip empty Bootstrap embed-responsive aspect-ratio wrappers.
    # When <video> got nuked these wrappers (originally containing the
    # video tag) collapsed to <div class="embed-responsive embed-
    # responsive-16by9"></div>. The CSS keeps a 16:9 padding-bottom
    # placeholder so the page renders giant white gaps where the
    # videos used to be. Operator caught this on multiple landers.
    new, n = re.subn(r'<div\b[^>]*class="[^"]*\bembed-responsive\b[^"]*"[^>]*>\s*</div>', "", html, flags=re.IGNORECASE)
    counts["empty_embed_responsive_removed"] = n
    html = new

    # 2a. Strip vendor analytics — the original RejuvaCare page bundled a
    # tracking script (ad.rejuvacare.com/d/.js) plus the matching <meta
    # http-equiv="delegate-ch"> hint and a <noscript> <link> fallback.
    # None of it applies to our funnels; left in, it fires noisy network
    # calls + leaks the original advertiser's domain on every render.
    before = len(html)
    # The <meta http-equiv="delegate-ch" ...> with ad.rejuvacare.com
    html = re.sub(r'<meta\b[^>]*delegate-ch[^>]*>', '', html, flags=re.IGNORECASE | re.DOTALL)
    # Any <script>...</script> whose body references rejuvacare. Greedy
    # match the whole script block but limited to bodies < 5KB to avoid
    # nuking unrelated long scripts that happen to mention rejuvacare
    # downstream.
    def kill_rejuv_script(m: re.Match[str]) -> str:
        return "" if "rejuvacare" in m.group(0).lower() else m.group(0)
    html = re.sub(r'<script\b[^>]*>.*?</script>', kill_rejuv_script, html, flags=re.IGNORECASE | re.DOTALL)
    # The <noscript> with the <link> fallback to rejuvacare
    html = re.sub(r'<noscript\b[^>]*>[^<]*?<link[^>]*rejuvacare[^>]*>[^<]*?</noscript>', '', html, flags=re.IGNORECASE | re.DOTALL)
    # Belt-and-suspenders: any remaining tag with rejuvacare in it that
    # we missed. Targets <script>, <link>, <meta>, <iframe>. Leaves the
    # CTA <a href="{{CTA_URL}}"> alone since rejuvacare was already
    # substituted out of those.
    html = re.sub(r'<(script|link|meta|iframe)\b[^>]*rejuvacare[^>]*>.*?</\1>', '', html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r'<(script|link|meta|iframe)\b[^>]*rejuvacare[^>]*/?\s*>', '', html, flags=re.IGNORECASE)
    counts["vendor_tracking_bytes_removed"] = before - len(html)

    # 3. Remove empty <li>...</li> — strip tags from inner content, then
    #    check whether anything visible remains. Empty if no non-whitespace
    #    text AND no {{KEY}} placeholder.
    def li_replacer(m: re.Match[str]) -> str:
        inner = m.group(1)
        text_only = re.sub(r"<[^>]+>", "", inner)
        # Keep <li> if it has any {{KEY}} placeholder OR any visible text.
        if "{{" in inner or text_only.strip():
            return m.group(0)
        return ""

    new, _ = re.subn(r"<li\b[^>]*>(.*?)</li>", li_replacer, html, flags=re.DOTALL | re.IGNORECASE)
    counts["empty_li_removed"] = html.count("<li") - new.count("<li")
    html = new

    # 4. Remove <ul>...</ul> wrappers whose stripped text is empty.
    def ul_replacer(m: re.Match[str]) -> str:
        inner = m.group(1)
        text_only = re.sub(r"<[^>]+>", "", inner)
        if "{{" in inner or text_only.strip():
            return m.group(0)
        return ""

    # Run twice for nested ULs.
    for _ in range(2):
        prev = html
        html = re.sub(r"<ul\b[^>]*>(.*?)</ul>", ul_replacer, html, flags=re.DOTALL | re.IGNORECASE)
        if html == prev:
            break
    counts["empty_ul_removed"] = "(see <ul> diff)"

    return html, counts


def main() -> None:
    if not TEMPLATE.exists():
        sys.exit(f"missing {TEMPLATE}")
    src = TEMPLATE.read_text()
    out, counts = scrub(src)
    if out == src:
        print("[scrub] no changes — already clean.")
        return
    TEMPLATE.write_text(out)
    delta = len(src) - len(out)
    print(f"[scrub] template.html: {len(src):,} → {len(out):,} bytes (saved {delta:,})")
    for k, v in counts.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
