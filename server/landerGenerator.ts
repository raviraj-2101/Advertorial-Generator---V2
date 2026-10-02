import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { buildSystemPrompt } from "./systemPrompt";
import { getLiveTemplate, getProposedTemplate, type Template, type TemplateSection } from "./templateLoader";
import type { Skeleton } from "./skeletonGenerator";
import { generateImage, type ImageGenResult } from "./imageGen";
import { tryGetServiceClient } from "./supabase";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

/**
 * Lander generator.
 *
 * Phase 5: given an approved skeleton, write the full landing page —
 * a section-by-section JSON model (the authoritative shape stored on
 * `landers.section_model`) plus per-slot images via Nano Banana Pro.
 *
 * Generation is two-phase:
 *   1. Copy generation in one Claude call (deterministic JSON shape).
 *   2. Image generation in parallel, one Nano Banana Pro call per
 *      declared image slot in the template.
 */

export interface LanderSection {
  id: string;
  type: string;
  content: string;
  design_class?: string;
  image_slot_key?: string | null;
}

export interface LanderModel {
  template_slug: string;
  title: string;
  section_model: LanderSection[];
  image_urls: Record<string, string>;
  image_placeholders: Record<string, true>;
}

const LANDER_USER_PROMPT_TEMPLATE = `
You have an APPROVED SKELETON for an advertorial. Render the full landing page.

Approved skeleton:
\`\`\`json
{{skeletonJson}}
\`\`\`

Task:
- For every section in the skeleton, write the finished copy that conforms to the template's per-section rules (voice, banned moves, target word range, etc.).
- Apply the template's offer placement, CTA repetition pattern, and scarcity style as specified.
- Honor the active product config: do not invent claims, do not violate the dosage / mechanism lines, do not use banned vocabulary.
- Emit image slot references as bare tokens \`[[image:<slot_key>]]\` inside the copy where an image should appear. Do not emit URLs.
- Title: use the skeleton's chosen title (or the first of title_top5 if no choice is recorded).

Return one strict-JSON object — no Markdown fences, no surrounding prose:

{
  "title": "...",
  "section_model": [
    { "id": "...", "type": "...", "content": "..." }
  ]
}

Where:
- "content" is the finished copy for that section (markdown allowed inside content for prose-type sections; for structural section types like trust_bar use the literal lines, separated by newlines).
- "id" must match the skeleton's section id.
- "type" must match the template's section type for that id.
`.trim();

export interface GenerateLanderArgs {
  productSlug: string;
  skeleton: Skeleton;
  /** Per-section selections from the title top-5 picker; defaults to the
   *  first entry in title_top5. */
  chosenTitle?: string;
  /** Dev-only escape hatch — see skeletonGenerator for the same. */
  allowProposed?: boolean;
}

export interface GenerateLanderResult {
  lander: LanderModel;
  imageResults: Record<string, ImageGenResult>;
}

export async function generateLander(args: GenerateLanderArgs): Promise<GenerateLanderResult> {
  let template = getLiveTemplate(args.skeleton.template_slug);
  if (!template && args.allowProposed) template = getProposedTemplate(args.skeleton.template_slug);
  if (!template) throw new Error(`Lander generation: template ${args.skeleton.template_slug} is not live.`);
  const anthropic = getAnthropic();
  if (!anthropic) {
    throw new Error("Lander generation requires ANTHROPIC_API_KEY in .env.");
  }

  const system = await buildSystemPrompt({
    templateSlug: args.skeleton.template_slug,
    productSlug: args.productSlug,
    allowProposed: args.allowProposed,
  });

  const skeletonForPrompt = {
    ...args.skeleton,
    title_chosen: args.chosenTitle || args.skeleton.title_top5[0] || args.skeleton.title_candidates[0] || "",
  };
  const user = LANDER_USER_PROMPT_TEMPLATE.replace("{{skeletonJson}}", JSON.stringify(skeletonForPrompt, null, 2));

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");

  const parsed = JSON.parse(extractJsonObject(text)) as {
    title: string;
    section_model: LanderSection[];
  };

  const sectionsBySlot = mapImageSlotsToSections(template, parsed.section_model);
  const imageResults = await runImageGeneration(template, sectionsBySlot, parsed);

  const image_urls: Record<string, string> = {};
  const image_placeholders: Record<string, true> = {};
  for (const [k, r] of Object.entries(imageResults)) {
    image_urls[k] = r.url;
    if (r.placeholder) image_placeholders[k] = true;
  }

  return {
    lander: {
      template_slug: args.skeleton.template_slug,
      title: parsed.title,
      section_model: parsed.section_model,
      image_urls,
      image_placeholders,
    },
    imageResults,
  };
}

function mapImageSlotsToSections(template: Template, sections: LanderSection[]): Record<string, LanderSection | null> {
  const map: Record<string, LanderSection | null> = {};
  const slots = template.meta.image_slots || [];
  for (const slot of slots) {
    const referenced = sections.find((s) => (s.content || "").includes(`[[image:${slot.key}]]`));
    map[slot.key] = referenced || null;
  }
  return map;
}

async function runImageGeneration(
  template: Template,
  sectionsBySlot: Record<string, LanderSection | null>,
  parsed: { title: string; section_model: LanderSection[] },
): Promise<Record<string, ImageGenResult>> {
  const slots = template.meta.image_slots || [];
  // Group all slot uploads under one render id so they share a Storage
  // prefix and a render is easy to clean up later.
  const renderId = randomUUID();
  const tasks = slots.map(async (slot) => {
    const refSection = sectionsBySlot[slot.key];
    const promptParts: string[] = [];
    promptParts.push(`Advertorial template: ${template.meta.template_name}`);
    promptParts.push(`Slot: ${slot.key} (aspect ratio ${slot.aspect_ratio})`);
    promptParts.push(`Spec: ${slot.spec}`);
    if (refSection?.content) {
      promptParts.push(`Narrative context: ${refSection.content.slice(0, 400)}`);
    } else {
      promptParts.push(`Narrative context: title="${parsed.title}"`);
    }
    const raw = await generateImage({
      prompt: promptParts.join("\n"),
      aspectRatio: slot.aspect_ratio,
    });
    // Upload data URLs to Supabase Storage and replace with the public URL
    // so the lander row + SSE payload stay small (~7.5MB → ~5KB per slot).
    // If upload fails the data URL is kept as a graceful fallback; the
    // placeholder badge already exists for users to see.
    const uploaded = await uploadDataUrlToStorage(raw, renderId, slot.key);
    return [slot.key, uploaded] as const;
  });
  const settled = await Promise.all(tasks);
  return Object.fromEntries(settled);
}

async function uploadDataUrlToStorage(
  res: ImageGenResult,
  renderId: string,
  slotKey: string,
): Promise<ImageGenResult> {
  if (!res.ok || !res.isDataUrl || !res.url.startsWith("data:")) return res;
  const m = res.url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return res;
  const mime = m[1]!;
  const bytes = Buffer.from(m[2]!, "base64");
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "bin";
  const path = `lander-renders/${renderId}/${slotKey}.${ext}`;
  const supa = tryGetServiceClient();
  if (!supa) return res;
  const up = await supa.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET || "image-bank")
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (up.error) {
    return { ...res, error: `storage upload failed: ${up.error.message} (kept data URL)` };
  }
  const pub = supa.storage.from(process.env.SUPABASE_STORAGE_BUCKET || "image-bank").getPublicUrl(path);
  return { ...res, url: pub.data.publicUrl, isDataUrl: false };
}

function extractJsonObject(s: string): string {
  const first = s.indexOf("{");
  if (first < 0) return s;
  let depth = 0;
  for (let i = first; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(first, i + 1);
    }
  }
  return s.slice(first);
}

export function renderLanderHtml(lander: LanderModel, template: Template): string {
  const sectionMap = new Map<string, TemplateSection>();
  for (const s of template.meta.sections) sectionMap.set(s.id, s);

  const blocks: string[] = [];
  blocks.push(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(lander.title)}</title>
<style>${baseStyle(template)}</style>
</head>
<body>`);

  for (const section of lander.section_model) {
    const tSection = sectionMap.get(section.id);
    blocks.push(`<section data-section-id="${escapeAttr(section.id)}" data-section-type="${escapeAttr(section.type)}" class="adv-section adv-${escapeAttr(section.type)}${section.design_class ? " " + escapeAttr(section.design_class) : ""}">`);
    blocks.push(replaceImageTokens(section.content, lander.image_urls, lander.image_placeholders, tSection));
    blocks.push("</section>");
  }

  blocks.push("</body></html>");
  return blocks.join("\n");
}

function baseStyle(template: Template): string {
  const d = template.meta.design || {};
  return [
    "*{box-sizing:border-box}",
    `body{margin:0;font-family:${d.font_family_body || "system-ui,sans-serif"};color:#0f172a;background:#fff;line-height:1.6}`,
    ".adv-section{padding:32px 24px;max-width:780px;margin:0 auto}",
    `.adv-headline,.adv-section h1{font-family:${d.font_family_headline || "Georgia,serif"};font-weight:700;font-size:2.25rem;line-height:1.15;margin:0 0 16px}`,
    ".adv-trust_bar{background:#f8fafc;color:#475569;font-size:0.875rem;letter-spacing:0.08em;text-align:center;padding:12px 16px;max-width:none}",
    `.adv-cta a,.adv-cta button{display:inline-block;background:${d.color_accent || "#b45309"};color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;border:none;cursor:pointer}`,
    ".adv-image{margin:24px 0;text-align:center}",
    ".adv-image img{max-width:100%;height:auto;border-radius:8px}",
    ".adv-image .placeholder-badge{position:relative;top:-32px;background:rgba(15,23,42,0.85);color:#fff;font-size:0.75rem;padding:4px 8px;border-radius:4px;display:inline-block}",
  ].join("\n");
}

function replaceImageTokens(
  content: string,
  imageUrls: Record<string, string>,
  placeholders: Record<string, true>,
  templateSection?: TemplateSection,
): string {
  return content.replace(/\[\[image:([a-z0-9_-]+)\]\]/gi, (_m, slotKey: string) => {
    const url = imageUrls[slotKey];
    if (!url) return "";
    const badge = placeholders[slotKey]
      ? `<span class="placeholder-badge">image regeneration pending</span>`
      : "";
    const alt = templateSection?.id || slotKey;
    return `<div class="adv-image"><img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" />${badge}</div>`;
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
