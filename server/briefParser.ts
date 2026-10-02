/**
 * briefParser.ts — turn a copywriter's DOCX brief into a structured
 * slot-value dict the template renderer can consume.
 *
 * The brief format (per the Nervalley example shipped with this repo):
 *
 *   [Heading 1] Top Pain Specialist: "This Is the Fastest Way..."
 *   <paragraph>  Sat. March 14th, 2026 | 11:11 am EST
 *   <paragraph>  Written by Dr. Nakamura, Pain Specialist, MD
 *   <paragraph>  [IMAGE PLACEHOLDER]Hero image: Close-up of woman's bare feet...
 *   <paragraph>  Dear Friend With Burning Feet,
 *   <paragraph>  If you're reading this with your feet on fire...
 *   ...
 *   [Heading 2] THE NIGHT EVERYTHING CHANGED...
 *   <paragraph>  Then at 2:43 AM on a Thursday morning, everything changed.
 *   ...
 *
 * The parser extracts:
 *   - the H1 headline → {{HEADLINE}}
 *   - all-caps H2 section headers → {{SECTION_<n>_HEADER}}
 *   - prose between section headers → {{SECTION_<n>_BODY}} (joined as
 *     HTML paragraphs separated by `<p>...</p>`)
 *   - `[IMAGE PLACEHOLDER]<description>` markers → image slots whose
 *     description becomes the gen prompt for the per-section image
 *
 * The parser writes NO AI copy. Every text slot value comes verbatim
 * from the brief. The renderer's contract is text-in, slotted-html-out.
 */

import fs from "node:fs";
import JSZip from "jszip";

// ─── DOCX parsing primitives ───────────────────────────────────────────
// A .docx is just a zip of XML files. `word/document.xml` contains the
// paragraphs. Each <w:p> is a paragraph; the <w:pStyle val="..."> child
// of <w:pPr> tells us the paragraph style (Heading1, Heading2, etc.).
// Text content lives in <w:t> children inside <w:r> runs.

export interface ParsedParagraph {
  /** "heading1" | "heading2" | "normal" | etc. */
  style: string;
  /** The paragraph's text content, runs concatenated. */
  text: string;
}

export async function parseDocxParagraphs(buf: Buffer): Promise<ParsedParagraph[]> {
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("Invalid DOCX: word/document.xml not found");
  const paragraphs: ParsedParagraph[] = [];
  // Find every <w:p> ... </w:p> block. We do this with regex rather than
  // a full XML parser because the docs we accept are small and the
  // grammar we care about is narrow.
  const pBlocks = docXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  for (const p of pBlocks) {
    const styleMatch = p.match(/<w:pStyle\s+w:val="([^"]+)"/);
    const style = (styleMatch?.[1] || "normal").toLowerCase();
    // Concatenate every <w:t>...</w:t> in document order, preserving
    // run order (so we don't lose embedded inline formatting like
    // bold runs).
    const tMatches = p.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [];
    const text = tMatches
      .map((m) => m.replace(/^<w:t(?:\s[^>]*)?>/, "").replace(/<\/w:t>$/, ""))
      .join("")
      // Decode the XML escapes the docx writer might have added.
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    paragraphs.push({ style, text });
  }
  return paragraphs;
}

// ─── Brief → slot values ───────────────────────────────────────────────

export interface ImagePlaceholder {
  /** Slot key to fill (HERO_IMAGE_URL, IMG_1_URL, …) */
  slotKey: string;
  /** Original prompt text from the brief — feed this to the image
   *  generator with the product reference attached. */
  prompt: string;
}

export interface ParsedBrief {
  /** Raw paragraphs (for debugging / future revision UX). */
  paragraphs: ParsedParagraph[];
  /** Slot values ready to feed to renderTemplate(). Image slots only
   *  get filled here if an image URL is already known (the brief
   *  yields prompts, not URLs). */
  slotValues: Record<string, string>;
  /** Per-image placeholder description the caller should turn into a
   *  real image URL (via Nano Banana Pro or upload). */
  imagePrompts: ImagePlaceholder[];
  /** Section headers in order — surfaced separately for QA / UI. */
  sectionHeaders: string[];
  /** The detected headline (first H1). */
  headline: string | null;
}

const IMAGE_MARKER_RE = /^\[IMAGE\s*PLACEHOLDER\]\s*(.*)$/i;
const HEADING_STYLES = new Set(["heading1", "heading2"]);

/**
 * The renderer template was built from a 15-section reference. A brief
 * for a different angle (e.g. Nervalley nerve-pain) might emit fewer or
 * more H2-style mid-page headers. We map them one-to-one in document
 * order: the brief's k-th heading2 fills SECTION_<k>_HEADER and its
 * body fills SECTION_<k>_BODY (joined as <p>…</p> paragraphs).
 *
 * If the brief has fewer headings than the template, leftover slots
 * stay as `{{SECTION_n_HEADER}}` so the operator sees they're empty.
 * If more, we keep them under SECTION_(N+k) and the renderer ignores
 * them (template's last section header is the highest indexed one).
 */
export function briefToSlotValues(paragraphs: ParsedParagraph[]): ParsedBrief {
  const slotValues: Record<string, string> = {};
  const imagePrompts: ImagePlaceholder[] = [];
  const sectionHeaders: string[] = [];
  let headline: string | null = null;
  let imageIndex = 0;
  let currentSection = 0; // 0 = pre-section (lede), 1+ = after first H2
  let currentBuffer: string[] = [];

  const flushSectionBody = () => {
    if (currentBuffer.length === 0) return;
    const html = currentBuffer.map((t) => `<p>${escapeHtml(t)}</p>`).join("\n");
    if (currentSection === 0) {
      // Lede / pre-section prose — store under a special LEDE key the
      // template can use or ignore.
      const existing = slotValues.LEDE_BODY || "";
      slotValues.LEDE_BODY = (existing ? existing + "\n" : "") + html;
    } else {
      slotValues[`SECTION_${currentSection}_BODY`] = html;
    }
    currentBuffer = [];
  };

  for (const p of paragraphs) {
    const text = p.text.trim();
    if (!text) continue;

    // ── Image placeholder marker — does NOT contribute to body prose
    const imgMatch = text.match(IMAGE_MARKER_RE);
    if (imgMatch) {
      imageIndex += 1;
      const slotKey = imageIndex === 1 ? "HERO_IMAGE_URL" : `IMG_${imageIndex - 1}_URL`;
      imagePrompts.push({ slotKey, prompt: imgMatch[1]!.trim() });
      continue;
    }

    // ── Heading 1 → headline + extract masthead/byline if present.
    if (p.style === "heading1") {
      flushSectionBody();
      if (!headline) {
        headline = text;
        slotValues.HEADLINE = text;
      }
      continue;
    }

    // ── Heading 2 → section header
    if (p.style === "heading2") {
      flushSectionBody();
      currentSection += 1;
      sectionHeaders.push(text);
      slotValues[`SECTION_${currentSection}_HEADER`] = text;
      continue;
    }

    // ── First few normal paragraphs after H1 capture masthead +
    //    byline if they match those shapes — otherwise they're prose.
    if (currentSection === 0 && !slotValues.MASTHEAD_TIMESTAMP) {
      // Pattern: "Sat. March. 14th, 2026 | 11:11 am EST"
      if (/^[A-Z][a-z]+\.?\s+[A-Z][a-z]+\.?\s+\d/.test(text) && text.includes("|")) {
        slotValues.MASTHEAD_TIMESTAMP = text;
        continue;
      }
    }
    if (currentSection === 0 && !slotValues.BYLINE) {
      const byline = text.match(/^Written by\s+(.+?)(?:\s*\|.*)?$/i);
      if (byline) {
        slotValues.BYLINE = byline[1]!.trim();
        continue;
      }
    }

    // Everything else is body prose for the current section.
    currentBuffer.push(text);
  }
  flushSectionBody();

  return {
    paragraphs,
    slotValues,
    imagePrompts,
    sectionHeaders,
    headline,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Convenience: read a DOCX off disk + parse it end-to-end. */
export async function parseBriefFile(path: string): Promise<ParsedBrief> {
  const buf = fs.readFileSync(path);
  const paragraphs = await parseDocxParagraphs(buf);
  return briefToSlotValues(paragraphs);
}
