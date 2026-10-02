#!/usr/bin/env tsx
/**
 * Smoke test: generate a full lander end-to-end against the proposed
 * doctor-conspiracy-discovery-device template + ledisa-glp1-patches.
 * Exercises: skeleton generation → lander generation (copy) → image
 * generation per slot → HTML rendering.
 *
 * Run: `npx tsx scripts/test_lander.ts`
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { generateSkeleton } from "../server/skeletonGenerator.js";
import { generateLander, renderLanderHtml } from "../server/landerGenerator.js";
import { getProposedTemplate } from "../server/templateLoader.js";
import fs from "node:fs";

(async () => {
  const t0 = Date.now();

  console.log("---generating skeleton---");
  const sk = await generateSkeleton({
    templateSlug: "doctor-conspiracy-discovery-device",
    productSlug: "ledisa-glp1-patches",
    directionPrompt:
      "A 52-year-old high-school teacher in Albuquerque tried the GLP-1 shots for 9 months and gained back 14 pounds the moment she stopped. " +
      "Her endocrinologist tells her about an off-prescription patch he started recommending — and explains why the injection lobby is fighting it.",
    allowProposed: true,
  });
  console.log(`  skeleton OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  console.log("---generating lander---");
  const tL = Date.now();
  const { lander, imageResults } = await generateLander({
    productSlug: "ledisa-glp1-patches",
    skeleton: sk,
    allowProposed: true,
  });
  console.log(`  lander copy + images OK (${((Date.now() - tL) / 1000).toFixed(1)}s)`);

  console.log("---rendering HTML---");
  const template = getProposedTemplate(sk.template_slug)!;
  const html = renderLanderHtml(lander, template);
  const outPath = "/tmp/test_lander.html";
  fs.writeFileSync(outPath, html);
  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("");
  console.log("=== RESULTS ===");
  console.log(`Total time:    ${totalSec}s`);
  console.log(`Title:         ${lander.title}`);
  console.log(`Sections:      ${lander.section_model.length}`);
  console.log(`Image slots:   ${Object.keys(lander.image_urls).length}`);
  const placeholders = Object.keys(lander.image_placeholders).length;
  console.log(`Real images:   ${Object.keys(lander.image_urls).length - placeholders} (placeholders: ${placeholders})`);
  console.log(`HTML size:     ${html.length} bytes`);
  console.log(`HTML written:  ${outPath}`);
  console.log("");
  console.log("---First 3 sections (id / type / 80 chars)---");
  lander.section_model.slice(0, 3).forEach((s) => {
    console.log(`  [${s.id}] ${s.type}: ${(s.content || "").slice(0, 80).replace(/\n/g, " ")}`);
  });
  console.log("");
  console.log("---image-gen results (per slot)---");
  for (const [k, r] of Object.entries(imageResults)) {
    console.log(`  ${k}: ok=${r.ok} placeholder=${r.placeholder} ${r.error || ""}`);
  }
})().catch((err) => {
  console.error("[test_lander] FAILED:", err);
  process.exit(1);
});
