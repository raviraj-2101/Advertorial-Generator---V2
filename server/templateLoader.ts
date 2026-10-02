import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

// In dev (tsx/ESM) this resolves via native `import.meta.url`; in the production
// CJS bundle esbuild rewrites `import.meta.url` to a `__filename`-based URL (see
// the `define`/`banner` in script/build.ts), so this works in both formats.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads advertorial templates from `advertorials-skill/templates/`.
 *
 * Two paths:
 * - LIVE templates: `templates/*.md` (excluding `_proposed/`). These are
 *   the only files exposed in the user-facing template selector.
 * - PROPOSED templates: `templates/_proposed/*.md`. Visible only via the
 *   debug endpoint for Liam's review. They never appear in the production
 *   template selector. Section 0.7 of the brief is the authority on this
 *   separation.
 *
 * The placeholder template (`templates/_placeholder.md`, if it exists) is
 * gated behind the `ENABLE_PLACEHOLDER_TEMPLATE=1` env flag.
 */

export interface TemplateSection {
  id: string;
  type: string;
  required?: boolean;
  layout?: string;
  class_options?: Record<string, string[]>;
  candidate_count?: number;
  target_words?: [number, number];
  image_slot?: string | null;
  rules?: string;
  content_rules?: string;
  [key: string]: unknown;
}

export interface TemplateImageSlot {
  key: string;
  aspect_ratio: string;
  spec: string;
  [key: string]: unknown;
}

export interface TemplateDesign {
  font_family_headline?: string;
  font_family_body?: string;
  color_accent?: string;
  cta_button_style?: string;
  divider_style?: string;
  layout_density?: string;
  [key: string]: unknown;
}

export interface TemplateOffer {
  position?: "early" | "mid" | "late" | string;
  style?: string;
  cta_text_pattern?: string;
  cta_repetition?: number;
  [key: string]: unknown;
}

export interface TemplateMeta {
  template_slug: string;
  template_name: string;
  template_family?: string;
  fit_signals?: Record<string, unknown>;
  sections: TemplateSection[];
  image_slots?: TemplateImageSlot[];
  design?: TemplateDesign;
  offer?: TemplateOffer;
}

export interface Template {
  meta: TemplateMeta;
  body: string;
  filePath: string;
  source: "live" | "proposed";
}

function resolveTemplatesDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "advertorials-skill", "templates"),
    path.resolve(__dirname, "..", "advertorials-skill", "templates"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

function readTemplateFile(filePath: string, source: "live" | "proposed"): Template | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    const data = parsed.data as Partial<TemplateMeta>;
    if (!data.template_slug || !data.template_name || !Array.isArray(data.sections)) {
      return null;
    }
    return {
      meta: data as TemplateMeta,
      body: parsed.content.trim(),
      filePath,
      source,
    };
  } catch {
    return null;
  }
}

let cache: { live: Template[]; proposed: Template[]; loadedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 1000;

function loadFromDisk(): { live: Template[]; proposed: Template[] } {
  const dir = resolveTemplatesDir();
  const live: Template[] = [];
  const proposed: Template[] = [];

  const placeholderEnabled = process.env.ENABLE_PLACEHOLDER_TEMPLATE === "1";

  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
        const isPlaceholder = entry.name === "_placeholder.md";
        if (isPlaceholder && !placeholderEnabled) continue;
        const t = readTemplateFile(path.join(dir, entry.name), "live");
        if (t) live.push(t);
      }
    }
    const proposedDir = path.join(dir, "_proposed");
    if (fs.existsSync(proposedDir)) {
      for (const entry of fs.readdirSync(proposedDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
          const t = readTemplateFile(path.join(proposedDir, entry.name), "proposed");
          if (t) proposed.push(t);
        }
      }
    }
  }

  return { live, proposed };
}

export function loadTemplates(force = false): { live: Template[]; proposed: Template[] } {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return { live: cache.live, proposed: cache.proposed };
  }
  const out = loadFromDisk();
  cache = { ...out, loadedAt: Date.now() };
  return out;
}

export function getLiveTemplate(slug: string): Template | null {
  const { live } = loadTemplates();
  return live.find((t) => t.meta.template_slug === slug) || null;
}

export function getProposedTemplate(slug: string): Template | null {
  const { proposed } = loadTemplates();
  return proposed.find((t) => t.meta.template_slug === slug) || null;
}

export function listLiveTemplates(): Template[] {
  return loadTemplates().live;
}

export function listProposedTemplates(): Template[] {
  return loadTemplates().proposed;
}

export function clearTemplateCache(): void {
  cache = null;
}
