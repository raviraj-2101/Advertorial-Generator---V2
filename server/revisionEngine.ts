import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./systemPrompt";
import { getLiveTemplate } from "./templateLoader";

/**
 * Section-level revision engine (Phase 6).
 *
 * Given a section's surrounding context, a selection range, and a user
 * revision prompt, generate 5 candidate replacements, score each against
 * the rubric in Section 10 of the brief, pick the top scorer, run a
 * continuity QA pass, and either commit or fall back to the second-best.
 *
 * Other candidates are discarded. Nothing is cached across revisions —
 * revising the same selection again starts fresh.
 *
 * Rubric axes (from Section 10):
 *   1. Fit with surrounding text
 *   2. Voice consistency
 *   3. Specificity (concrete > generic)
 *   4. Banned-phrase check
 *   5. Length appropriate to section target_words
 *   6. No factual drift vs 01-core.md
 *   7. CTA-integrity
 *   8. Anti-sameness vs the rest of the lander
 *
 * Final score = sum of axes. Weights are tunable in skill.md (the model
 * reads weights from there at scoring time; this module only enforces the
 * top-1 + continuity-QA pipeline).
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

export interface ReviseSectionArgs {
  templateSlug: string;
  productSlug: string;
  contextBefore: string;
  sectionContent: string;
  contextAfter: string;
  /** Optional substring of `sectionContent` the user dragged-selected.
   *  If absent, the whole section is treated as the selection. */
  selection?: string;
  userPrompt: string;
  /** The surrounding lander, for the anti-sameness axis. */
  landerCorpus?: string;
}

export interface RevisionCandidate {
  index: number;
  text: string;
  scores: {
    fit: number;
    voice: number;
    specificity: number;
    banned_check: number;
    length: number;
    factual: number;
    cta_integrity: number;
    anti_sameness: number;
    total: number;
  };
}

export interface RevisionResult {
  appliedText: string;
  pickedIndex: number;
  candidates: RevisionCandidate[];
  continuityRegenerated: boolean;
  fellBackToSecondBest: boolean;
}

const REVISION_USER_PROMPT_TEMPLATE = `
You are running the SECTION REVISION engine.

Goal: produce 5 candidate replacements for the SELECTION within the SECTION, then score each candidate 1-10 along the rubric below, then return both the candidates AND your scoring.

CONTEXT BEFORE the section (the prose immediately preceding):
<<<CONTEXT_BEFORE>>>
{{contextBefore}}
<<<END>>>

THE SECTION (the user is editing inside this section; the SELECTION is a substring or the whole section):
<<<SECTION>>>
{{sectionContent}}
<<<END>>>

THE SELECTION (the substring to replace; replace ONLY this substring; leave the rest of SECTION exactly as written):
<<<SELECTION>>>
{{selection}}
<<<END>>>

CONTEXT AFTER:
<<<CONTEXT_AFTER>>>
{{contextAfter}}
<<<END>>>

USER REVISION PROMPT:
<<<PROMPT>>>
{{userPrompt}}
<<<END>>>

LANDER CORPUS (for anti-sameness):
<<<CORPUS>>>
{{landerCorpus}}
<<<END>>>

Produce STRICT-JSON in this shape:

{
  "candidates": [
    {
      "index": 1,
      "text": "...the candidate replacement for SELECTION...",
      "scores": {
        "fit": 1-10,
        "voice": 1-10,
        "specificity": 1-10,
        "banned_check": 1-10,
        "length": 1-10,
        "factual": 1-10,
        "cta_integrity": 1-10,
        "anti_sameness": 1-10
      }
    }
  ]
}

Exactly 5 candidates. Scores integer 1-10. No prose outside the JSON. The "text" is the literal replacement for SELECTION — do not include the rest of SECTION.
`.trim();

const CONTINUITY_USER_PROMPT_TEMPLATE = `
Continuity QA: re-read CONTEXT_BEFORE + the SECTION with the new candidate substituted in + CONTEXT_AFTER. Tell me whether the result reads as continuous prose.

CONTEXT_BEFORE:
{{contextBefore}}

SECTION (with new candidate inserted):
{{sectionWithCandidate}}

CONTEXT_AFTER:
{{contextAfter}}

Reply with strict JSON:
{ "continuous": true|false, "rationale": "..." }
`.trim();

export async function reviseSection(args: ReviseSectionArgs): Promise<RevisionResult> {
  if (!anthropic) {
    throw new Error("Revision engine requires ANTHROPIC_API_KEY in .env.");
  }
  const template = getLiveTemplate(args.templateSlug);
  if (!template) throw new Error(`Revision engine: template ${args.templateSlug} is not live.`);

  const system = await buildSystemPrompt({
    templateSlug: args.templateSlug,
    productSlug: args.productSlug,
  });

  const selection = args.selection ?? args.sectionContent;
  const user = REVISION_USER_PROMPT_TEMPLATE
    .replace("{{contextBefore}}", args.contextBefore || "(none)")
    .replace("{{sectionContent}}", args.sectionContent)
    .replace("{{selection}}", selection)
    .replace("{{contextAfter}}", args.contextAfter || "(none)")
    .replace("{{userPrompt}}", args.userPrompt)
    .replace("{{landerCorpus}}", args.landerCorpus || "(empty)");

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = textOf(msg);
  const parsed = JSON.parse(extractJsonObject(text)) as { candidates: RevisionCandidate[] };

  if (!parsed.candidates || parsed.candidates.length < 1) {
    throw new Error("Revision engine returned no candidates.");
  }

  for (const c of parsed.candidates) {
    const s = c.scores;
    s.total = s.fit + s.voice + s.specificity + s.banned_check + s.length + s.factual + s.cta_integrity + s.anti_sameness;
  }

  const sorted = [...parsed.candidates].sort((a, b) => b.scores.total - a.scores.total);
  let picked = sorted[0]!;
  let pickedIndex = picked.index;
  let continuityRegenerated = false;
  let fellBack = false;

  // Continuity QA: regenerate the picked candidate once if discontinuous;
  // otherwise fall back to second-best.
  const continuity1 = await continuityCheck(args, picked.text);
  if (!continuity1.continuous) {
    const regenerated = await regenerateSingleCandidate(args, picked.text, continuity1.rationale, system);
    if (regenerated) {
      const continuity2 = await continuityCheck(args, regenerated);
      if (continuity2.continuous) {
        picked = { ...picked, text: regenerated };
        continuityRegenerated = true;
      } else if (sorted[1]) {
        picked = sorted[1];
        pickedIndex = picked.index;
        fellBack = true;
      }
    } else if (sorted[1]) {
      picked = sorted[1];
      pickedIndex = picked.index;
      fellBack = true;
    }
  }

  return {
    appliedText: picked.text,
    pickedIndex,
    candidates: parsed.candidates,
    continuityRegenerated,
    fellBackToSecondBest: fellBack,
  };
}

async function continuityCheck(
  args: ReviseSectionArgs,
  candidateText: string,
): Promise<{ continuous: boolean; rationale: string }> {
  if (!anthropic) return { continuous: true, rationale: "no model" };
  const sectionWithCandidate = (args.selection
    ? args.sectionContent.replace(args.selection, candidateText)
    : candidateText);

  const prompt = CONTINUITY_USER_PROMPT_TEMPLATE
    .replace("{{contextBefore}}", args.contextBefore || "(none)")
    .replace("{{sectionWithCandidate}}", sectionWithCandidate)
    .replace("{{contextAfter}}", args.contextAfter || "(none)");

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });
  const text = textOf(msg);
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as { continuous: boolean; rationale: string };
    return { continuous: Boolean(parsed.continuous), rationale: parsed.rationale || "" };
  } catch {
    return { continuous: true, rationale: "continuity-check unparseable, defaulting to pass" };
  }
}

async function regenerateSingleCandidate(
  args: ReviseSectionArgs,
  previousText: string,
  rationale: string,
  system: string,
): Promise<string | null> {
  if (!anthropic) return null;
  const prompt = `
You generated this candidate but the continuity QA flagged it as discontinuous:
"${previousText}"

Reason: ${rationale}

Regenerate the candidate once. Same constraints as the original revision call. Reply with the replacement text only — no JSON, no commentary, no quotes.
`.trim();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return textOf(msg).trim() || null;
}

function textOf(msg: { content: Array<{ type: string; text?: string }> }): string {
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
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
