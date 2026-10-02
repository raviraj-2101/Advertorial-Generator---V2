import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./systemPrompt";
import { getLiveTemplate, getProposedTemplate } from "./templateLoader";

/**
 * Skeleton generator.
 *
 * Per Phase 4 of the brief: given a direction prompt, brand+product, and
 * one template slug, return a structured skeleton — the proposed sections
 * (matching the template's `sections:` schema), an array of title
 * candidates (5 of 20 generated), and an offer-presentation strategy.
 *
 * Skeletons are intentionally compact compared to the full lander: they
 * describe shape, not finished copy. The user reviews + approves
 * skeletons before any full landing-page generation happens.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

export interface SkeletonSection {
  id: string;
  type: string;
  summary: string;
  target_words?: [number, number];
  image_slot?: string | null;
}

export interface Skeleton {
  template_slug: string;
  title_candidates: string[];
  title_top5: string[];
  body: {
    sections: SkeletonSection[];
    offer_strategy: string;
  };
}

export interface GenerateSkeletonArgs {
  templateSlug: string;
  productSlug: string;
  directionPrompt: string;
  /** Dev-only escape hatch: allow generation against a `_proposed/*.md`
   *  template. The user-facing route never sets this — it's only used by
   *  the `/api/_debug/*` endpoints for runtime verification ahead of
   *  Liam's by-name template approval. Section 0.7 of the brief is
   *  preserved because nothing user-facing reads this flag. */
  allowProposed?: boolean;
}

const SKELETON_USER_PROMPT_TEMPLATE = `
You are generating a SKELETON for a single advertorial.

The user direction (treat as the angle / story / pain point):
<<<DIRECTION>>>
{{directionPrompt}}
<<<END DIRECTION>>>

CRITICAL HEADLINE RULE (read this twice):
- Headlines must hook on the **visible pain** the reader already feels,
  NOT on the mechanism / chemistry / anatomy / root cause behind it.
- A cold reader scrolling Facebook does not know what "lymphatic
  congestion", "DHT", "GLP-1 receptor", "adenosine", "vagal tone",
  "ferritin", "rotator cuff degeneration" mean. They know how their
  body feels. Lead with how it feels.
- "Top Lymphatic Specialist: How Lymphatic Drainage Reverses Stagnation"
  is a REJECTED shape. Headlines that name the mechanism / category
  jargon up front will be regenerated.
- The mechanism reveal is the body's payoff (real_root_cause / mechanism
  sections). It earns the click only after pain has done its job.
- Test: read each candidate as if you've never heard of the product.
  Do you feel a SPECIFIC PAIN you recognise BEFORE you understand the
  mechanism? Pass. Do you have to decode jargon to know what the
  headline is offering? Fail — regenerate.

HUMAN-READABLE SKELETON OUTPUT (also critical):
- The "summary" string for each section is read by a human copywriter
  reviewing the plan. It must be plain English describing what THIS
  section will say to the reader. Examples:
  - GOOD: "The opening scene that pulls the reader in — Sarah at the
     mirror in her bathroom on a Tuesday morning, noticing her jeans
     don't button. Establishes the visible problem in concrete sensory
     detail."
  - BAD: "trust_bar: Editorial masthead strip with date, time, view
     count, and ADVERTORIAL tag. Uses 'Health Insights Magazine'
     masthead." (Talking about scaffolding, not story.)
- Do NOT include internal section ids (trust_bar, byline, dek,
  cta_block_repeat, etc.) inside the summary text. Those live in the
  "id" and "type" fields only.
- Do NOT include implementation jargon (URL 1-4 fingerprints,
  blocklist references, "rotated off the canonical", template
  scaffolding notes). The summary is what the SECTION SAYS to the
  reader, in clear language.
- The "body.decisions" array IS the place for those engineering notes.

Task:
1. Generate 20 title candidates that obey THE HEADLINE RULE above and
   fit this template's headline shapes. Reject any candidate that
   names a mechanism / category jargon / anatomy term. Select the 5
   strongest survivors.
2. Produce a section-by-section overview of the lander you would
   build, in the order they appear. For each section emit:
   - id (matching the template's section id)
   - type (matching the template's section type)
   - summary (1-3 sentences in plain English describing what this
     section will say to the reader — see HUMAN-READABLE SKELETON
     OUTPUT above)
   - target_words (range, where applicable)
   - image_slot (slot key from the template, where applicable)
3. State the offer placement strategy in 2-3 sentences: where the
   offer appears, how the CTA repeats, and how the scarcity/urgency
   is layered.

Return a single strict-JSON object with this shape — no surrounding
prose, no Markdown fence:

{
  "title_candidates": ["...", "..."],
  "title_top5": ["...", "..."],
  "body": {
    "sections": [{ "id": "...", "type": "...", "summary": "...", "target_words": [80,140], "image_slot": null }],
    "offer_strategy": "..."
  }
}
`.trim();

export async function generateSkeleton(args: GenerateSkeletonArgs): Promise<Skeleton> {
  let template = getLiveTemplate(args.templateSlug);
  if (!template && args.allowProposed) template = getProposedTemplate(args.templateSlug);
  if (!template) {
    throw new Error(`Skeleton generation: template ${args.templateSlug} is not live.`);
  }
  const system = await buildSystemPrompt({
    templateSlug: args.templateSlug,
    productSlug: args.productSlug,
    allowProposed: args.allowProposed,
  });
  const user = SKELETON_USER_PROMPT_TEMPLATE.replace("{{directionPrompt}}", args.directionPrompt);

  const anthropic = getAnthropic();
  if (!anthropic) {
    throw new Error(
      "Skeleton generation requires ANTHROPIC_API_KEY in .env. Configure it (api-keys/anthropic.env) and retry.",
    );
  }

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  let parsed: {
    title_candidates: string[];
    title_top5: string[];
    body: Skeleton["body"];
  };
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (err) {
    throw new Error(
      `Skeleton generator returned non-JSON output (${err instanceof Error ? err.message : "parse-fail"}); raw head: ${text.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(parsed.title_candidates) || !Array.isArray(parsed.title_top5) || !parsed.body) {
    throw new Error("Skeleton generator produced JSON with the wrong shape.");
  }

  return {
    template_slug: args.templateSlug,
    title_candidates: parsed.title_candidates,
    title_top5: parsed.title_top5,
    body: parsed.body,
  };
}

export interface ReviseSkeletonArgs {
  templateSlug: string;
  productSlug: string;
  directionPrompt: string;
  current: Skeleton;
  /** Free-text revision instruction from the copywriter. */
  revisionPrompt: string;
  /** If set, only this section's summary should change. If null/undefined,
   *  the revision applies to the whole skeleton (titles + sections + offer). */
  targetSectionId?: string | null;
  allowProposed?: boolean;
}

const REVISE_USER_PROMPT_TEMPLATE = `
You are REVISING an existing advertorial SKELETON based on a copywriter's
instruction.

Original direction:
<<<DIRECTION>>>
{{directionPrompt}}
<<<END DIRECTION>>>

Current skeleton (the plan to revise):
<<<CURRENT_SKELETON_JSON>>>
{{currentJson}}
<<<END CURRENT_SKELETON_JSON>>>

Copywriter's revision instruction:
<<<REVISION>>>
{{revisionPrompt}}
<<<END REVISION>>>

{{scopeBlock}}

CRITICAL CONSTRAINTS:
1. Apply the headline pain-point rule. Mechanism / category jargon
   (lymphatic, DHT, GLP-1, vagal, adenosine, etc.) does NOT appear in
   any of the 5 final titles unless that term is so popularised it
   functions as a pain proxy. The headline hooks on the visible pain
   the reader feels.
2. Each section summary is plain English describing what the section
   says to the reader. No internal section ids inside the summary
   text. No implementation jargon.
3. Keep the template's section schema (id + type are pre-locked from
   the template; you can only change summary, target_words,
   image_slot).
4. Preserve the offer placement strategy unless the revision asks to
   change it.

Return the FULL revised skeleton, same strict-JSON shape as the
original — no surrounding prose, no Markdown fence:

{
  "title_candidates": ["...", "..."],
  "title_top5": ["...", "..."],
  "body": {
    "sections": [{ "id": "...", "type": "...", "summary": "...", "target_words": [80,140], "image_slot": null }],
    "offer_strategy": "..."
  }
}
`.trim();

export async function reviseSkeleton(args: ReviseSkeletonArgs): Promise<Skeleton> {
  let template = getLiveTemplate(args.templateSlug);
  if (!template && args.allowProposed) template = getProposedTemplate(args.templateSlug);
  if (!template) throw new Error(`Skeleton revise: template ${args.templateSlug} is not live.`);

  const system = await buildSystemPrompt({
    templateSlug: args.templateSlug,
    productSlug: args.productSlug,
    allowProposed: args.allowProposed,
  });

  const scopeBlock = args.targetSectionId
    ? `SCOPE: only revise the section with id="${args.targetSectionId}". Leave every other section's summary unchanged. Leave title_candidates and offer_strategy untouched unless the revision instruction explicitly mentions them.`
    : `SCOPE: revise the whole skeleton — titles, every section's summary, and the offer strategy where the instruction applies. Anything the instruction does not touch should stay byte-identical to the current skeleton.`;

  const user = REVISE_USER_PROMPT_TEMPLATE
    .replace("{{directionPrompt}}", args.directionPrompt)
    .replace("{{currentJson}}", JSON.stringify({
      title_candidates: args.current.title_candidates,
      title_top5: args.current.title_top5,
      body: args.current.body,
    }, null, 2))
    .replace("{{revisionPrompt}}", args.revisionPrompt)
    .replace("{{scopeBlock}}", scopeBlock);

  const anthropic = getAnthropic();
  if (!anthropic) throw new Error("Skeleton revise requires ANTHROPIC_API_KEY.");

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  let parsed: {
    title_candidates: string[];
    title_top5: string[];
    body: Skeleton["body"];
  };
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (err) {
    throw new Error(
      `Skeleton revise returned non-JSON output (${err instanceof Error ? err.message : "parse-fail"}); raw head: ${text.slice(0, 200)}`,
    );
  }
  if (!Array.isArray(parsed.title_candidates) || !Array.isArray(parsed.title_top5) || !parsed.body) {
    throw new Error("Skeleton revise produced JSON with the wrong shape.");
  }
  return {
    template_slug: args.templateSlug,
    title_candidates: parsed.title_candidates,
    title_top5: parsed.title_top5,
    body: parsed.body,
  };
}

/**
 * Pulls the first {...} JSON object out of a possibly-noisy model
 * response. We accept stray surrounding text because some prompts return
 * a brief preface despite instructions; downstream we'd rather repair
 * than reject.
 */
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
