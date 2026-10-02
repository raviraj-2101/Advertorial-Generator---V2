#!/usr/bin/env tsx
/**
 * One-off smoke test for the image-gen client. Invokes Gemini 2.5 Flash
 * Image via the same path the lander generator uses. Prints a structured
 * status to stdout. Safe to delete after Phase 5 lands its own e2e tests.
 *
 * Run: `npx tsx scripts/test_imagegen.ts`
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { generateImage } from "../server/imageGen.js";

(async () => {
  const t0 = Date.now();
  const r = await generateImage({
    prompt:
      "A serene macro photograph of a small clear amber-glass dropper bottle on a clean cream surface, soft natural lighting from the left, shallow depth of field, editorial styling. Bottle is the central subject. No people in frame.",
    aspectRatio: "1:1",
  });
  const dt = Date.now() - t0;
  console.log(
    JSON.stringify(
      {
        ok: r.ok,
        placeholder: r.placeholder,
        isDataUrl: r.isDataUrl,
        url_kind: r.url.startsWith("data:") ? "data-url" : "http",
        url_len: r.url.length,
        url_head: r.url.slice(0, 80),
        error: r.error || null,
        ms: dt,
      },
      null,
      2,
    ),
  );
})();
