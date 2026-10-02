#!/usr/bin/env python3
"""
slotize-body.py — second-pass template-izing.

The Wix-generated reference HTML uses `<div data-text="text">prose</div>`
elements (not <p>) for body paragraphs. Each section between
{{SECTION_n_HEADER}} markers contains many such divs holding the
original RejuvaCare copy.

Strategy: walk each section span (header n → header n+1, or BYLINE →
header 1 for the lede). Inside the span, find every `<div data-text=
"text">…</div>` that holds real prose (filter out empty wrappers, image
captions, and divs that contain image slots). The FIRST one's inner text
becomes `{{SECTION_n_BODY}}`. All subsequent prose-bearing divs get
their text content blanked. Image slots stay intact.

Result: brief copy lands in one slot per section; original RejuvaCare
prose is gone.
"""
import re
from pathlib import Path

HERE = Path(__file__).parent
REF = HERE / "template.html.before-bodyslot.bak"  # start from the pre-bodyslot version each run
TPL = HERE / "template.html"

IMG_SLOT_RE = re.compile(r"\{\{(HERO_IMAGE_URL|IMG_\d+_URL)\}\}")
HEADER_SLOT_RE = re.compile(r"\{\{SECTION_(\d+)_HEADER\}\}")
TEXT_DIV_OPEN_RE = re.compile(r'<div\s+data-text="text"\s+data-secondsdelay="[^"]*"\s*(?:id="[^"]*")?\s*>', re.IGNORECASE)


def has_balanced_inner(open_match: re.Match[str], full_html: str) -> int:
    """Given the position of a <div data-text="text" ...> opening, return
    the position right AFTER the matching </div>. Manual div-balance walk
    because the divs nest inside each other."""
    depth = 1
    i = open_match.end()
    while depth and i < len(full_html):
        next_open = full_html.find("<div", i)
        next_close = full_html.find("</div>", i)
        if next_close == -1:
            return -1
        if next_open != -1 and next_open < next_close:
            depth += 1
            i = next_open + 4
        else:
            depth -= 1
            i = next_close + 6
    return i if depth == 0 else -1


def find_text_divs_in(html: str, start: int, end: int) -> list[tuple[int, int]]:
    """Return [(open_start, close_end)] of every <div data-text="text"> in
    html[start:end] — top-level only (not nested inside another such div).
    """
    out: list[tuple[int, int]] = []
    pos = start
    while pos < end:
        m = TEXT_DIV_OPEN_RE.search(html, pos, end)
        if not m:
            break
        close = has_balanced_inner(m, html)
        if close == -1 or close > end:
            break
        out.append((m.start(), close))
        pos = close
    return out


def _strip_inner(div_html: str) -> str:
    """Given an entire <div data-text="text" ...>...</div>, return the
    text-only inner content (collapsed whitespace) for inspection."""
    # Drop the outer tags then strip all HTML tags
    inner = re.sub(r"^<div[^>]*>", "", div_html, count=1)
    inner = re.sub(r"</div>$", "", inner)
    inner = re.sub(r"<[^>]+>", " ", inner)
    return re.sub(r"\s+", " ", inner).strip()


def main() -> None:
    html = REF.read_text(encoding="utf-8")
    header_positions: list[tuple[int, int, str]] = []
    for m in HEADER_SLOT_RE.finditer(html):
        header_positions.append((m.start(), m.end(), m.group(1)))
    print(f"Section header markers: {len(header_positions)}")

    # Spans (start, end, slot). Last → first so byte offsets stay stable.
    spans: list[tuple[int, int, str]] = []
    for i, (start, end, num) in enumerate(header_positions):
        body_start = end
        body_end = header_positions[i + 1][0] if i + 1 < len(header_positions) else len(html)
        spans.append((body_start, body_end, f"SECTION_{num}_BODY"))

    # Lede span: between {{BYLINE}} and {{SECTION_1_HEADER}}.
    byline = re.search(r"\{\{BYLINE\}\}", html)
    if byline and header_positions:
        spans.insert(0, (byline.end(), header_positions[0][0], "LEDE_BODY"))

    # Walk from end-of-document backward so offsets stay valid.
    new_html = html
    for span_start, span_end, slot in sorted(spans, key=lambda t: -t[0]):
        divs = find_text_divs_in(new_html, span_start, span_end)
        # Filter to ones that (a) actually have text and (b) don't wrap an
        # image slot.
        candidates: list[tuple[int, int, str]] = []
        for o, c in divs:
            chunk = new_html[o:c]
            if IMG_SLOT_RE.search(chunk):
                continue
            text = _strip_inner(chunk)
            if len(text) < 20:  # skip stub wrappers
                continue
            candidates.append((o, c, text))
        if not candidates:
            print(f"  ⚠ {slot}: no prose divs found")
            continue
        # First candidate keeps its outer wrapper but inner text becomes
        # the slot marker. Subsequent candidates are deleted entirely.
        first_o, first_c, first_text = candidates[0]
        # Preserve the opening div tag verbatim, replace the inner.
        m = TEXT_DIV_OPEN_RE.match(new_html, first_o)
        open_tag = m.group(0) if m else '<div data-text="text" data-secondsdelay="">'
        replacement = f"{open_tag}{{{{{slot}}}}}</div>"
        # Walk replacements last → first within this span so offsets in the
        # span stay consistent as we splice.
        deletions = sorted(candidates[1:], key=lambda t: -t[0])
        for o, c, _ in deletions:
            new_html = new_html[:o] + new_html[c:]
        # First candidate is still at first_o, but its end may have shifted
        # by zero (we only deleted later spans).
        # Re-find for safety:
        m2 = TEXT_DIV_OPEN_RE.search(new_html, first_o, first_o + 200)
        if not m2:
            print(f"  ⚠ {slot}: first wrapper missing after pass")
            continue
        c2 = has_balanced_inner(m2, new_html)
        if c2 == -1:
            print(f"  ⚠ {slot}: first wrapper unclosed after pass")
            continue
        new_html = new_html[: m2.start()] + replacement + new_html[c2:]
        print(f"  ✓ {slot:20} → slot inserted, {len(candidates) - 1} sibling prose divs removed")

    TPL.write_text(new_html, encoding="utf-8")
    body_count = len(re.findall(r"\{\{SECTION_\d+_BODY\}\}", new_html))
    lede_count = new_html.count("{{LEDE_BODY}}")
    print(f"\nWrote template.html — SECTION_n_BODY: {body_count}, LEDE_BODY: {lede_count}")


if __name__ == "__main__":
    main()
