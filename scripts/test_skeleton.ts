#!/usr/bin/env tsx
/**
 * Smoke test: generate a skeleton against the proposed
 * `doctor-conspiracy-discovery-device` template + `ledisa-glp1-patches`
 * product. Proves Phase 4 end-to-end against real Anthropic. Does NOT
 * violate Section 0.7 because it explicitly passes `allowProposed: true`
 * — a dev-only flag that the user-facing route never sets.
 *
 * Run: `npx tsx scripts/test_skeleton.ts`
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { generateSkeleton } from "../server/skeletonGenerator.js";

(async () => {
  const t0 = Date.now();
  const sk = await generateSkeleton({
    templateSlug: "doctor-conspiracy-discovery-device",
    productSlug: "ledisa-glp1-patches",
    directionPrompt:
      "A woman in her 50s, after a midnight bathroom mirror moment, decides she's done with the GLP-1 injection ecosystem. " +
      "She finds a patch that quietly does the same thing without the jab — and the doctor who developed it explains the conspiracy.",
    allowProposed: true,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("---skeleton generated in", dt, "s---");
  console.log("template_slug:", sk.template_slug);
  console.log("title_candidates count:", sk.title_candidates.length);
  console.log("title_top5 count:", sk.title_top5.length);
  console.log("body.sections count:", sk.body.sections.length);
  console.log("");
  console.log("---top 5 titles---");
  sk.title_top5.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log("");
  console.log("---first 5 sections---");
  sk.body.sections.slice(0, 5).forEach((s) => console.log(`  [${s.id}] ${s.type} (${s.target_words || "-"}): ${s.summary.slice(0, 120)}`));
  console.log("");
  console.log("---offer_strategy---");
  console.log("  " + sk.body.offer_strategy.slice(0, 240));
})().catch((err) => {
  console.error("[test_skeleton] FAILED:", err);
  process.exit(1);
});
