import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./systemPrompt";

/**
 * Title generator (Phase 6).
 *
 * Generates 20 candidate headlines per the active template's headline
 * rules. Internally scores them along the rubric (including the headline-
 * punch axis). Returns the top 5 to the UI. Scores are NOT exposed to the
 * user — only the picks.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

export interface RegenerateTitleArgs {
  templateSlug: string;
  productSlug: string;
  landerSummary: string;
}

const TITLE_USER_PROMPT = `
Generate 20 title candidates for the lander summarised below, following this template's headline rules exactly.

Lander summary:
<<<SUMMARY>>>
{{landerSummary}}
<<<END>>>

Score each candidate 1-10 along these axes:
  fit, voice, specificity, banned_check, length, factual, cta_integrity, anti_sameness, headline_punch

Return strict JSON — no preface, no fences:

{
  "candidates": [
    { "title": "...", "scores": { "fit":n, "voice":n, ..., "headline_punch":n } }
  ]
}

Exactly 20 entries. Integer scores 1-10.
`.trim();

export async function regenerateTitles(args: RegenerateTitleArgs): Promise<string[]> {
  if (!anthropic) {
    throw new Error("Title regeneration requires ANTHROPIC_API_KEY in .env.");
  }
  const system = await buildSystemPrompt({
    templateSlug: args.templateSlug,
    productSlug: args.productSlug,
  });
  const user = TITLE_USER_PROMPT.replace("{{landerSummary}}", args.landerSummary);

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");

  const parsed = JSON.parse(extractJsonObject(text)) as {
    candidates: Array<{ title: string; scores: Record<string, number> }>;
  };

  for (const c of parsed.candidates) {
    const s = c.scores;
    s.total = Object.values(s).reduce((a, b) => a + (b || 0), 0);
  }
  parsed.candidates.sort((a, b) => (b.scores.total || 0) - (a.scores.total || 0));
  return parsed.candidates.slice(0, 5).map((c) => c.title);
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
