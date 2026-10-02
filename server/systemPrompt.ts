import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProductFiles, deriveDisplayNameFromCore, CONFIG_FILE_NAMES } from "./productConfigs";
import { getLiveTemplate, getProposedTemplate, type Template } from "./templateLoader";

// In dev (tsx/ESM) this resolves via native `import.meta.url`; in the production
// CJS bundle esbuild rewrites `import.meta.url` to a `__filename`-based URL (see
// the `define`/`banner` in script/build.ts), so this works in both formats.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * System-prompt assembly.
 *
 * Per Section 2.1 of the brief, every generation operation builds a prompt
 * shaped exactly like this:
 *
 *   base instructions
 * + advertorials-skill/skill.md
 * + advertorials-skill/templates/<selected-template>.md
 * + product-configs/<slug>/01-core.md through 05-funnels.md
 * + user prompt
 *
 * This file is the single point of assembly. Every downstream module
 * (skeleton generator, lander generator, revision engine, title generator)
 * calls `buildSystemPrompt` rather than concatenating prompts itself.
 */

function resolveSkillDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "advertorials-skill"),
    path.resolve(__dirname, "..", "advertorials-skill"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

function readSkill(): string {
  const skillPath = path.join(resolveSkillDir(), "skill.md");
  if (!fs.existsSync(skillPath)) {
    return "(advertorials-skill/skill.md not yet authored — system prompt is incomplete; generation quality will be poor until this file lands)";
  }
  return fs.readFileSync(skillPath, "utf8");
}

function renderTemplateBlock(t: Template): string {
  const frontmatter = JSON.stringify(t.meta, null, 2);
  return [
    `===== TEMPLATE: ${t.meta.template_name} (slug=${t.meta.template_slug}) =====`,
    "",
    "Frontmatter (the structural and design contract for this template):",
    "```json",
    frontmatter,
    "```",
    "",
    "Body (the per-template copywriting skill — voice, section rules, anti-sameness, banned moves):",
    "",
    t.body,
  ].join("\n");
}

export interface BuildSystemPromptArgs {
  templateSlug: string;
  productSlug: string;
  baseInstructions?: string;
  allowProposed?: boolean;
}

export async function buildSystemPrompt(args: BuildSystemPromptArgs): Promise<string> {
  const skill = readSkill();
  const entry = await loadProductFiles(args.productSlug);
  const productName = deriveDisplayNameFromCore(entry.files["01-core.md"] || "", args.productSlug);

  let template = getLiveTemplate(args.templateSlug);
  if (!template && args.allowProposed) template = getProposedTemplate(args.templateSlug);
  if (!template) {
    throw new Error(
      `Template not found: ${args.templateSlug}. Live templates are loaded from advertorials-skill/templates/*.md; proposed templates require allowProposed=true.`,
    );
  }

  const base = args.baseInstructions || defaultBaseInstructions(productName, args.productSlug, template);

  const sections: string[] = [
    base,
    "",
    "===== ADVERTORIAL SKILL (evergreen craft) =====",
    skill,
    "",
    renderTemplateBlock(template),
    "",
    `===== PRODUCT CONFIG: ${productName} =====`,
  ];

  for (const filename of CONFIG_FILE_NAMES) {
    const content = entry.files[filename];
    if (!content) continue;
    sections.push("");
    sections.push(`----- ${filename} -----`);
    sections.push(content);
  }

  return sections.join("\n");
}

function defaultBaseInstructions(productName: string, slug: string, template: Template): string {
  return [
    "You are the Acentecom Advertorials Generator — an internal copywriting and layout engine for the Acentecom team.",
    `The active product is: ${productName} (slug: ${slug}).`,
    `The active template is: ${template.meta.template_name} (slug: ${template.meta.template_slug}).`,
    "",
    "You operate strictly according to the SKILL, TEMPLATE, and PRODUCT CONFIG below. Treat them as the single source of truth.",
    "",
    "Hard rules:",
    "  - Never invent claims that contradict 01-core.md.",
    "  - Never use any banned phrase listed in 01-core.md or skill.md.",
    "  - Follow the template's section schema exactly. Sections marked `required: true` must appear; others may be omitted only when the brief in the user prompt explicitly calls for it.",
    "  - The offer must appear at the position the template specifies (early / mid / late), with the CTA pattern, repetition count, and style declared in the template's `offer:` block.",
    "  - Image slots are placeholders the renderer fills via Nano Banana Pro; emit only the slot key (e.g. `[[image:hero_image]]`) in copy, never paste an image URL.",
    "  - Voice consistency must match the template body's voice section and the product config's 04-competitors voice bank.",
    "",
    "Output discipline:",
    "  - When asked for a SKELETON, emit a strict-JSON object matching the schema the caller provides. Do not add prose around it.",
    "  - When asked for a LANDER, emit a strict-JSON section model (array of section objects) — no Markdown, no commentary.",
    "  - When asked for a REVISION, emit only the replacement text for the selection range. No preamble. No explanation.",
    "  - When asked for TITLE candidates, emit a JSON array of strings.",
  ].join("\n");
}

/**
 * Debug endpoint helper — returns the fully-assembled prompt as a plain
 * string. Gated behind `NODE_ENV !== 'production'` in routes.
 */
export async function debugSystemPrompt(args: BuildSystemPromptArgs): Promise<string> {
  return buildSystemPrompt({ ...args, allowProposed: true });
}
