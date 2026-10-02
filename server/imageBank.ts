import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import { tryGetServiceClient } from "./supabase";
import { generateImage } from "./imageGen";

/**
 * Image bank — Phase 7.
 *
 * Persists bank images in Supabase Postgres + Supabase Storage. New images
 * arrive via three paths:
 *   - upload: client uploads a file, we store it, run AI description +
 *     embedding, write the row.
 *   - generate: prompt + aspect + optional reference image → Nano Banana
 *     Pro → store + describe + embed.
 *   - save-from-lander: copy an image already used in a lander into the
 *     bank, with user-supplied name/tags/brand/product.
 *
 * The bank's AI search bar (separate module: imageSearch.ts) uses the
 * embedding column. The describe + embed pipeline is shared via
 * `describeAndEmbed`.
 */

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
const VISION_MODEL = process.env.ANTHROPIC_VISION_MODEL || "claude-opus-4-7";

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "image-bank";

export interface BankItem {
  id: string;
  name: string;
  storage_url: string;
  storage_path: string;
  width?: number;
  height?: number;
  aspect_ratio?: string;
  mime_type?: string;
  brand_slug?: string;
  product_slug?: string;
  tags: string[];
  ai_description?: string;
  custom_variables: Record<string, unknown>;
  source: "ai-generated" | "uploaded" | "saved-from-lander" | "imported";
  source_lander_id?: string;
  source_prompt?: string;
  source_reference_image_id?: string;
  created_by_email?: string;
  created_at?: string;
  updated_at?: string;
}

export async function describeImage(url: string): Promise<string> {
  if (!anthropic) return "(AI description unavailable — ANTHROPIC_API_KEY not set.)";

  // Anthropic vision accepts either { source: { type: 'url', url } } for
  // public HTTP(S) URLs or { source: { type: 'base64', media_type, data } }
  // for inline data. /api/image-bank/generate hands us a `data:image/...;
  // base64,...` URL straight from Gemini before any Storage upload — switch
  // the source shape accordingly to avoid the (empty description) fallback.
  let source: Record<string, unknown>;
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return "(AI description failed: malformed data URL)";
    source = { type: "base64", media_type: m[1], data: m[2] };
  } else {
    source = { type: "url", url };
  }

  const msg = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          // Cast through unknown so the union of {url} | {base64,…} both fit.
          { type: "image", source } as unknown as { type: "image"; source: { type: "url"; url: string } },
          {
            type: "text",
            text: "Describe this image for an internal advertorial-lander image bank. Include: subject, composition (hero/macro/lifestyle), aspect_ratio guess, mood, palette, any visible product or packaging, and whether it could plausibly appear as: hero, in-action, before/after, ingredient/mechanism, doctor-authority, testimonial, scarcity/stock. Reply in 3-5 short sentences — no bullets.",
          },
        ],
      },
    ],
  });
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
  return text || "(empty description)";
}

/**
 * Embedding helper. The current pipeline uses a Voyage AI / OpenAI
 * embedding endpoint if configured; otherwise it falls back to a
 * deterministic hash-based embedding so the search bar still works in
 * local dev (returns nearest-by-tag-match, not nearest-by-meaning).
 *
 * Configure via `EMBEDDING_PROVIDER` = `voyage` | `openai` and the
 * provider's API key. The default 1536-dim is the schema width.
 */
export async function computeEmbedding(text: string): Promise<number[]> {
  const provider = (process.env.EMBEDDING_PROVIDER || "").toLowerCase();
  if (provider === "voyage" && process.env.VOYAGE_API_KEY) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "voyage-3", input: [text] }),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
      if (data.data?.[0]?.embedding) return data.data[0].embedding;
    }
  }
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text, dimensions: 1536 }),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
      if (data.data?.[0]?.embedding) return data.data[0].embedding;
    }
  }
  return hashEmbedding(text, 1536);
}

function hashEmbedding(text: string, dim: number): number[] {
  const out = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const t of tokens) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
    const idx = Math.abs(h) % dim;
    out[idx] += 1;
  }
  const norm = Math.sqrt(out.reduce((a, b) => a + b * b, 0)) || 1;
  return out.map((v) => v / norm);
}

export interface UploadArgs {
  filename: string;
  bytes: Buffer;
  mimeType: string;
  name: string;
  brandSlug?: string;
  productSlug?: string;
  tags?: string[];
  customVariables?: Record<string, unknown>;
  createdByEmail?: string;
}

export async function uploadImageToBank(args: UploadArgs): Promise<BankItem> {
  const supa = tryGetServiceClient();
  if (!supa) throw new Error("Image bank requires Supabase credentials.");

  const storagePath = `${Date.now()}-${randomId()}-${safeFilename(args.filename)}`;
  const up = await supa.storage.from(STORAGE_BUCKET).upload(storagePath, args.bytes, {
    contentType: args.mimeType,
    upsert: false,
  });
  if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`);

  const pub = supa.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub.data.publicUrl;

  const desc = await describeImage(publicUrl).catch(() => "(description unavailable)");
  const embedding = await computeEmbedding([args.name, desc, (args.tags || []).join(" ")].join(" "));

  const row = {
    name: args.name,
    storage_url: publicUrl,
    storage_path: storagePath,
    mime_type: args.mimeType,
    brand_slug: args.brandSlug || null,
    product_slug: args.productSlug || null,
    tags: args.tags || [],
    ai_description: desc,
    custom_variables: args.customVariables || {},
    source: "uploaded" as const,
    created_by_email: args.createdByEmail || null,
  };

  const { data, error } = await supa.from("image_bank_items").insert(row).select("*").single();
  if (error || !data) throw new Error(`bank insert failed: ${error?.message || "no row"}`);
  await persistEmbedding(supa, data.id, embedding);
  return data as BankItem;
}

export interface GenerateToBankArgs {
  name: string;
  prompt: string;
  aspectRatio: string;
  brandSlug?: string;
  productSlug?: string;
  tags?: string[];
  referenceImageUrl?: string;
  customVariables?: Record<string, unknown>;
  createdByEmail?: string;
}

export async function generateImageToBank(args: GenerateToBankArgs): Promise<BankItem> {
  const supa = tryGetServiceClient();
  if (!supa) throw new Error("Image bank requires Supabase credentials.");

  const gen = await generateImage({
    prompt: args.prompt,
    aspectRatio: args.aspectRatio,
    referenceImageUrl: args.referenceImageUrl,
  });

  // Upload to Supabase Storage so the bank stores a small HTTPS URL instead of a
  // 1MB+ inline data URL. The list endpoint serializes every item, so leaving data
  // URLs in this column inflates the response by ~1MB per row.
  let storageUrl = gen.url;
  let storagePath = gen.placeholder ? "placeholder" : gen.url;
  if (!gen.placeholder && gen.url && gen.url.startsWith("data:")) {
    const match = gen.url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mime = match[1] ?? "image/png";
      const bytes = Buffer.from(match[2] ?? "", "base64");
      const ext = mime.split("/")[1] ?? "png";
      const path = `${Date.now()}-${randomId()}-${safeFilename(args.name)}.${ext}`;
      const up = await supa.storage.from(STORAGE_BUCKET).upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`);
      const pub = supa.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      storageUrl = pub.data.publicUrl;
      storagePath = path;
    }
  }

  const desc = storageUrl ? await describeImage(storageUrl).catch(() => "(description unavailable)") : "(no image)";
  const embedding = await computeEmbedding(
    [args.name, args.prompt, desc, (args.tags || []).join(" ")].join(" "),
  );

  const row = {
    name: args.name,
    storage_url: storageUrl,
    storage_path: storagePath,
    aspect_ratio: args.aspectRatio,
    brand_slug: args.brandSlug || null,
    product_slug: args.productSlug || null,
    tags: args.tags || [],
    ai_description: desc,
    custom_variables: args.customVariables || {},
    source: "ai-generated" as const,
    source_prompt: args.prompt,
    created_by_email: args.createdByEmail || null,
  };

  const { data, error } = await supa.from("image_bank_items").insert(row).select("*").single();
  if (error || !data) throw new Error(`bank insert failed: ${error?.message || "no row"}`);
  await persistEmbedding(supa, data.id, embedding);
  return data as BankItem;
}

async function persistEmbedding(
  supa: ReturnType<typeof tryGetServiceClient> & {},
  id: string,
  embedding: number[],
): Promise<void> {
  if (!supa) return;
  // Drizzle doesn't ship a vector column type; we write via raw SQL RPC.
  // The schema migration adds the column and an ivfflat index.
  const { error } = await supa.rpc("set_image_bank_embedding", {
    p_id: id,
    p_embedding: embedding,
  });
  if (error) {
    // Don't crash if the RPC isn't installed yet — search still works on
    // tags + name even when embeddings are missing.
    console.warn(`[image-bank] embedding persist skipped: ${error.message}`);
  }
}

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
