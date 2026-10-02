import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

/**
 * Image generation client.
 *
 * "Nano Banana" is Google's internal codename for Gemini 2.5 Flash Image
 * (the image-generation variant of Gemini 2.5 Flash). The brief uses
 * "Nano Banana Pro" as the env-var name; this client speaks the Gemini
 * `:generateContent` HTTP shape against `generativelanguage.googleapis.com`.
 *
 * Operations:
 *   - generate(prompt, aspectRatio, ?referenceImageUrl) → data-URL or signed URL
 *   - editImageWithReference(prompt, referenceImageUrl, aspectRatio) → same
 *
 * When credentials are absent the client returns a deterministic
 * placehold.co URL so the lander pipeline still completes. The lander
 * preview annotates these as "image regeneration pending".
 *
 * Gemini's image output is returned as a base64-encoded `inlineData.data`
 * blob in the response. We surface that as a `data:image/png;base64,...`
 * URL — sufficient for in-app preview and Supabase Storage upload by the
 * image-bank pipeline. Callers that need a persistent URL should upload
 * the base64 to Supabase Storage and use the public URL.
 */

const API_KEY = process.env.NANO_BANANA_PRO_API_KEY || process.env.GEMINI_API_KEY || "";
const BASE_URL = (process.env.NANO_BANANA_PRO_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
const MODEL = process.env.NANO_BANANA_PRO_MODEL || "gemini-2.5-flash-image";

export interface ImageGenArgs {
  prompt: string;
  aspectRatio: string;
  referenceImageUrl?: string;
  productSpecBlock?: string;
}

export interface ImageGenResult {
  ok: boolean;
  url: string;
  /** Truthy when the result is a placeholder, not a real render. */
  placeholder: boolean;
  /** Truthy when the result is a base64 data URL the caller may want
   *  to upload to Supabase Storage for a persistent public URL. */
  isDataUrl: boolean;
  error?: string;
}

function placeholderUrl(aspectRatio: string, seed: string): string {
  const [w = 1, h = 1] = aspectRatio.split(":").map(Number);
  const ww = 1200;
  const hh = Math.round((1200 * h) / w);
  const cleanSeed = encodeURIComponent(seed.slice(0, 80));
  return `https://placehold.co/${ww}x${hh}/0f172a/cbd5e1?text=${cleanSeed}`;
}

// PEOPLE_STYLE_GUIDE is loaded lazily on first use so we don't pay the disk
// hit when callers don't need person-image style enforcement.
let _peopleStyleCache: string | null = null;
function loadPeopleStyleGuide(): string {
  if (_peopleStyleCache !== null) return _peopleStyleCache;
  try {
    // ESM-aware: resolve relative to this file's URL when running under tsx.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("node:path");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs");
    const cwd = process.cwd();
    const candidates = [
      path.join(cwd, "advertorials-skill", "PEOPLE_STYLE_GUIDE.md"),
      path.join(__dirname, "..", "advertorials-skill", "PEOPLE_STYLE_GUIDE.md"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, "utf8") as string;
        _peopleStyleCache = text;
        return text;
      }
    }
  } catch {
    // ignore — fall through to empty
  }
  _peopleStyleCache = "";
  return _peopleStyleCache as string;
}

// Cheap heuristic: does this prompt include or imply a person?
function promptHintsPerson(prompt: string): boolean {
  return /\b(person|man|woman|doctor|patient|nurse|wife|husband|mother|father|dad|mom|customer|user|client|portrait|face|man's|woman's|hand|hands|holding|wearing|smiling|elderly|retiree|teacher|worker|family|kid|child|children|teenager|adult|model|testimonial)\b/i.test(prompt);
}

function buildPrompt(args: ImageGenArgs): string {
  const parts = [args.prompt.trim()];
  parts.push(`\nDesired aspect ratio: ${args.aspectRatio}.`);
  if (promptHintsPerson(args.prompt)) {
    const guide = loadPeopleStyleGuide();
    if (guide) {
      parts.push(
        "\n---\nMandatory style guide for any image that includes a person:\n" +
          guide.trim(),
      );
    }
  }
  if (args.productSpecBlock) parts.push("\n---\nProduct lock-down rules:\n" + args.productSpecBlock.trim());
  return parts.join("\n");
}

async function fetchReferenceAsInlineData(refUrl: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    if (refUrl.startsWith("data:")) {
      const m = refUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (m) return { mimeType: m[1]!, data: m[2]! };
    }
    const res = await fetch(refUrl);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    return { mimeType, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

export async function generateImage(args: ImageGenArgs): Promise<ImageGenResult> {
  if (!API_KEY) {
    return {
      ok: false,
      url: placeholderUrl(args.aspectRatio, args.prompt),
      placeholder: true,
      isDataUrl: false,
      error: "Image-gen credentials not configured (NANO_BANANA_PRO_API_KEY or GEMINI_API_KEY).",
    };
  }

  // Gemini :generateContent
  const url = `${BASE_URL}/models/${MODEL}:generateContent?key=${encodeURIComponent(API_KEY)}`;
  const parts: Array<Record<string, unknown>> = [{ text: buildPrompt(args) }];
  if (args.referenceImageUrl) {
    const ref = await fetchReferenceAsInlineData(args.referenceImageUrl);
    if (ref) parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }
  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ["IMAGE"] },
    // Relax safety thresholds for image gen. Gemini's defaults refuse
    // many benign advertorial prompts ("real-looking older person",
    // testimonial-style portraits). BLOCK_NONE on the safety filter is
    // the standard pattern for marketing creative generation.
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return {
        ok: false,
        url: placeholderUrl(args.aspectRatio, args.prompt),
        placeholder: true,
        isDataUrl: false,
        error: `Gemini ${res.status}: ${errBody.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> } }>;
      error?: { message?: string };
    };
    const out = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!out) {
      const errMsg = data.error?.message || JSON.stringify(data).slice(0, 200);
      return {
        ok: false,
        url: placeholderUrl(args.aspectRatio, args.prompt),
        placeholder: true,
        isDataUrl: false,
        error: `Gemini returned no image part. ${errMsg}`,
      };
    }
    const dataUrl = `data:${out.mimeType};base64,${out.data}`;
    return { ok: true, url: dataUrl, placeholder: false, isDataUrl: true };
  } catch (err) {
    return {
      ok: false,
      url: placeholderUrl(args.aspectRatio, args.prompt),
      placeholder: true,
      isDataUrl: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function editImageWithReference(
  prompt: string,
  referenceImageUrl: string,
  aspectRatio: string,
  productSpecBlock?: string,
): Promise<ImageGenResult> {
  return generateImage({ prompt, aspectRatio, referenceImageUrl, productSpecBlock });
}

export function imageGenConfigured(): boolean {
  return Boolean(API_KEY);
}
