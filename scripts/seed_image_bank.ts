#!/usr/bin/env tsx
/**
 * seed_image_bank.ts — Phase 7 image-bank seed.
 *
 * Generates ~200 images per MVP product via Gemini 2.5 Flash Image
 * (a.k.a. "Nano Banana Pro"), uploads each to Supabase Storage, and
 * persists an `image_bank_items` row with name, tags, brand_slug,
 * product_slug, AI description, and embedding.
 *
 * Run: `npx tsx scripts/seed_image_bank.ts [--product=<slug>] [--count=<n>] [--dry-run]`
 *
 * Idempotency: each generated row is named with a deterministic
 * "{product}-{archetype}-{kebab-variant}-{NN}" pattern. The seed will
 * SKIP a (product, archetype, NN) it has already generated. Re-running
 * after a failure picks up where it stopped.
 *
 * Prerequisites:
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
 *   - The `image_bank_items` table exists (apply drizzle/manual/0000_initial_schema.sql).
 *   - The `image-bank` storage bucket exists in Supabase Storage
 *     (public, 25 MB limit per file is sane).
 *   - NANO_BANANA_PRO_API_KEY (or GEMINI_API_KEY) in .env.
 *
 * Cost note: Gemini 2.5 Flash Image is ~$0.039 per image (model-card price
 * as of 2026). 200 images × 2 products = 400 images ≈ $15.60 of API spend
 * per full seed. Re-runs of just-failed images are far cheaper.
 */
import "dotenv/config";
import { generateImage } from "../server/imageGen.js";
import { tryGetServiceClient } from "../server/supabase.js";
import { describeImage, computeEmbedding } from "../server/imageBank.js";
import { Buffer } from "node:buffer";

// ─── Archetypes — the visual kinds each product needs ───────────────────
// Each archetype carries: tag set, default aspect ratio, prompt template.
// The prompt template uses {productName} which the runner substitutes.

interface Archetype {
  key: string;
  aspectRatio: string;
  tags: string[];
  prompt: (productName: string, variant: string) => string;
  variants: string[]; // each variant = one image. count = variants.length.
}

const COMMON_VARIANTS = [
  "kitchen-morning", "bathroom-soft", "office-desk", "outdoor-park",
  "bedroom-evening", "living-room", "porch-afternoon", "cafe-window",
  "garden-bench", "gym-locker", "spa-shelf", "studio-clean",
  "wood-table", "marble-counter", "linen-bedsheet", "stone-tile",
  "neutral-cream", "soft-blue", "warm-amber", "cool-grey",
  "library-shelf", "hotel-nightstand", "vanity-counter", "kitchen-island",
  "breakfast-tray", "windowsill-light", "coffee-table", "ceramic-tray",
  "wicker-basket", "stone-counter", "leather-desk", "fabric-cushion",
];

const DEMOGRAPHIC_VARIANTS = [
  "woman-50s-kitchen", "woman-40s-park", "woman-60s-porch",
  "woman-50s-bathroom", "woman-40s-cafe", "woman-50s-bedroom",
  "couple-50s-kitchen", "woman-60s-garden", "woman-40s-office",
  "woman-50s-spa", "woman-60s-living-room", "woman-40s-bedroom",
  "woman-50s-outdoor", "woman-60s-kitchen", "woman-50s-cafe",
  "woman-40s-bathroom", "woman-60s-cafe", "woman-50s-garden",
  "woman-40s-living-room", "woman-60s-bedroom", "woman-50s-porch",
  "woman-40s-spa", "woman-60s-office", "woman-50s-park",
  "woman-40s-bedroom-soft", "woman-50s-balcony", "woman-60s-library",
  "woman-40s-yoga", "woman-50s-walk", "woman-60s-knitting",
];

const DOCTOR_VARIANTS = [
  "white-coat-clinic", "stethoscope-portrait", "office-bookshelf",
  "exam-room", "scrubs-clinic", "laptop-research",
  "writing-notes", "white-coat-side", "lab-room", "consultation",
  "tablet-rounds", "diagnostic-bench", "research-notes", "lecture-hall",
  "patient-chart", "microscope-side", "phone-call-office", "white-coat-portrait",
  "blackboard-formula", "model-skeleton",
];

const ARCHETYPES_DEVICE_GLP1: Archetype[] = [
  {
    key: "hero-environmental",
    aspectRatio: "16:9",
    tags: ["hero", "environmental", "wide"],
    variants: COMMON_VARIANTS,
    prompt: (p, v) =>
      `Editorial wide-angle photograph of ${p} sitting on a ${v.replace(/-/g, " ")} setting. ` +
      `Natural light from the left. Slightly desaturated. No people in frame. Composition: ` +
      `product slightly off-center, generous negative space on the right for headline overlay. ` +
      `Aspect 16:9. Photo-realistic, magazine-quality.`,
  },
  {
    key: "product-hand-held",
    aspectRatio: "1:1",
    tags: ["product", "hand-held", "macro"],
    variants: COMMON_VARIANTS,
    prompt: (p, v) =>
      `Close-up macro photograph of ${p} held in a hand, against a ${v.replace(/-/g, " ")} background. ` +
      `Soft natural light. Shallow depth of field. Skin tone realistic and neutral. ` +
      `No face visible. Aspect 1:1. Product packaging proportions and label must remain exactly as specified.`,
  },
  {
    key: "demographic-lifestyle",
    aspectRatio: "4:5",
    tags: ["lifestyle", "demographic", "wellness"],
    variants: DEMOGRAPHIC_VARIANTS,
    prompt: (p, v) =>
      `Lifestyle photograph of ${v.replace(/-/g, " ")}. Genuine expression. Warm soft light. ` +
      `Wardrobe simple and realistic. ${p} subtly visible in the scene (held casually, on a nearby surface, ` +
      `or implied by context). Aspect 4:5. Photo-realistic, not stock-photo cliché.`,
  },
  {
    key: "doctor-authority",
    aspectRatio: "1:1",
    tags: ["doctor", "authority", "clinic"],
    variants: DOCTOR_VARIANTS,
    prompt: (p, v) =>
      `Portrait photograph of a doctor in a ${v.replace(/-/g, " ")} setting. ` +
      `Genuine professional expression. Warm authentic light. ` +
      `Wardrobe age-appropriate, not stock-photo cliché. Aspect 1:1.`,
  },
  {
    key: "mechanism-diagram",
    aspectRatio: "1:1",
    tags: ["diagram", "mechanism", "infographic"],
    variants: ["clean-anatomy", "minimal-arrows", "callout-labels", "cross-section",
               "absorption-curve", "before-after-cell", "side-view", "isometric",
               "transparent-layers", "phase-sequence", "comparison-grid", "data-curve"],
    prompt: (p, v) =>
      `Clean medical infographic illustrating the mechanism of ${p}. Style: ${v.replace(/-/g, " ")}. ` +
      `Soft neutral palette, minimal text, no real brand logos. Aspect 1:1. ` +
      `Editorial magazine-quality illustration.`,
  },
  {
    key: "scarcity-stock",
    aspectRatio: "4:5",
    tags: ["scarcity", "stock", "warehouse"],
    variants: ["box-stack", "warehouse-shelf", "fulfillment-belt", "packaging-line",
               "inventory-light", "shipping-table", "stockroom-aisle", "labeled-bins",
               "factory-line", "boxed-pallet", "shipping-truck", "dispatch-counter"],
    prompt: (p, v) =>
      `Editorial photograph of ${p} packaging in a ${v.replace(/-/g, " ")} context. ` +
      `Subtle motion blur suggesting active fulfillment. Soft warm lighting. Aspect 4:5. ` +
      `Implies scarcity / limited stock without explicit signage.`,
  },
  {
    key: "before-after",
    aspectRatio: "1:1",
    tags: ["before-after", "testimonial", "lifestyle"],
    variants: ["mirror-light", "side-by-side", "outdoor-pair", "kitchen-pair",
               "weight-scale", "tape-measure", "jeans-fit", "bathroom-mirror",
               "park-pair", "office-pair", "shopping-pair", "garden-pair",
               "vacation-pair", "family-pair", "morning-evening", "weeks-comparison"],
    prompt: (p, v) =>
      `Split-frame lifestyle photograph: left side a woman 45-60 looking weary and pre-result, ` +
      `right side the same demographic looking energetic and rested. Context: ${v.replace(/-/g, " ")}. ` +
      `Realistic, not exaggerated. No text overlay. Aspect 1:1.`,
  },
];

interface SeedProduct {
  slug: string;
  displayName: string;
  brandSlug: string;
  archetypes: Archetype[];
}

const SEED: SeedProduct[] = [
  {
    slug: "ledisa-glp1-patches",
    displayName: "Ledisa GLP-1 Patches",
    brandSlug: "ledisa",
    archetypes: ARCHETYPES_DEVICE_GLP1,
  },
  {
    slug: "cleantra-lymphatic",
    displayName: "Cleantra Lymphatic Drainage Drops",
    brandSlug: "cleantra",
    archetypes: ARCHETYPES_DEVICE_GLP1,
  },
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supa = tryGetServiceClient();
  if (!supa && !args.dryRun) {
    console.error("[seed] Supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env, or pass --dry-run.");
    process.exit(2);
  }

  const productsToRun = args.product ? SEED.filter((p) => p.slug === args.product) : SEED;
  if (productsToRun.length === 0) {
    console.error(`[seed] no product matches '${args.product}'. Known: ${SEED.map((p) => p.slug).join(", ")}`);
    process.exit(2);
  }

  let ok = 0;
  let fail = 0;
  let skipped = 0;

  for (const product of productsToRun) {
    console.log(`\n[seed] product: ${product.slug} — ${sumVariants(product.archetypes)} candidate images`);
    for (const arch of product.archetypes) {
      for (let i = 0; i < arch.variants.length; i++) {
        const variant = arch.variants[i]!;
        const nn = String(i + 1).padStart(2, "0");
        const name = `${product.slug}-${arch.key}-${variant}-${nn}`;

        if (supa && !args.dryRun) {
          const existing = await supa
            .from("image_bank_items")
            .select("id")
            .eq("name", name)
            .maybeSingle();
          if (existing.data) {
            skipped++;
            if (args.verbose) console.log(`  [skip] ${name}`);
            continue;
          }
        }

        const prompt = arch.prompt(product.displayName, variant);
        if (args.dryRun) {
          console.log(`  [dry] ${name}  (${arch.aspectRatio})  prompt[0..120]: ${prompt.slice(0, 120)}`);
          continue;
        }
        const t0 = Date.now();
        const gen = await generateImage({ prompt, aspectRatio: arch.aspectRatio });
        if (!gen.ok || !gen.isDataUrl) {
          console.log(`  [fail] ${name}  err=${gen.error}`);
          fail++;
          continue;
        }
        try {
          const bytes = Buffer.from(gen.url.split(",")[1]!, "base64");
          const storagePath = `${product.slug}/${name}.png`;
          // upsert:true so an orphaned storage object from a previous
          // mid-flight crash (file uploaded, row not inserted) gets
          // overwritten cleanly. The DB-row idempotency check above is
          // still the per-logical-image guard.
          const up = await supa!.storage.from(process.env.SUPABASE_STORAGE_BUCKET || "image-bank").upload(storagePath, bytes, {
            contentType: "image/png",
            upsert: true,
          });
          if (up.error) throw new Error(up.error.message);
          const pub = supa!.storage.from(process.env.SUPABASE_STORAGE_BUCKET || "image-bank").getPublicUrl(storagePath);
          const publicUrl = pub.data.publicUrl;

          const desc = await describeImage(publicUrl).catch(() => "(description unavailable)");
          const embedding = await computeEmbedding([name, desc, arch.tags.join(" ")].join(" "));

          const insert = await supa!
            .from("image_bank_items")
            .insert({
              name,
              storage_url: publicUrl,
              storage_path: storagePath,
              aspect_ratio: arch.aspectRatio,
              brand_slug: product.brandSlug,
              product_slug: product.slug,
              tags: [...arch.tags, variant],
              ai_description: desc,
              custom_variables: { archetype: arch.key, variant },
              source: "ai-generated",
              source_prompt: prompt,
            })
            .select("id")
            .single();
          if (insert.error) throw new Error(insert.error.message);
          try { await supa!.rpc("set_image_bank_embedding", { p_id: insert.data!.id, p_embedding: embedding }); } catch { /* embedding upsert is best-effort */ }

          console.log(`  [ok]   ${name}  (${(Date.now() - t0) / 1000}s)`);
          ok++;
        } catch (err) {
          console.log(`  [fail] ${name}  upload-err=${err instanceof Error ? err.message : err}`);
          fail++;
        }

        if (args.count && ok + fail >= args.count) {
          console.log(`\n[seed] reached --count=${args.count} ceiling, stopping.`);
          break;
        }
      }
      if (args.count && ok + fail >= args.count) break;
    }
    if (args.count && ok + fail >= args.count) break;
  }

  console.log(`\n[seed] done. ok=${ok} fail=${fail} skipped=${skipped}`);
  if (fail > 0) process.exit(1);
}

function sumVariants(arches: Archetype[]): number {
  return arches.reduce((a, b) => a + b.variants.length, 0);
}

function parseArgs(argv: string[]): { product?: string; count?: number; dryRun: boolean; verbose: boolean } {
  const out: { product?: string; count?: number; dryRun: boolean; verbose: boolean } = { dryRun: false, verbose: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--verbose") out.verbose = true;
    else if (a.startsWith("--product=")) out.product = a.slice("--product=".length);
    else if (a.startsWith("--count=")) out.count = parseInt(a.slice("--count=".length), 10);
  }
  return out;
}

main().catch((err) => {
  console.error("[seed] crashed:", err);
  process.exit(1);
});
