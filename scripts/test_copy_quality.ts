#!/usr/bin/env tsx
/**
 * Copy-quality round: generate one fresh skeleton against the V2 skill
 * (with the meta-rotation-output ban, title-shape diversification, and
 * LLM-tell ban list added). Scan the output for whether the V2
 * tightening actually changes the model's behaviour.
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
      "A 38-year-old NYC bartender with metabolic syndrome who learned about Ledisa from a regular customer " +
      "who's a sleep doctor. He's been a night-shift drinker for 12 years and his liver enzymes are climbing.",
  });
  const allText = [
    ...sk.title_candidates,
    ...sk.title_top5,
    sk.body.offer_strategy,
    ...sk.body.sections.map((s) => s.summary),
  ].join(" \n ");

  const metaLeaks = [
    "Rotation away from", "Rotated name", "Rotated time", "Rotated event",
    "Rotated citation", "Avoiding ", "not 2:47", "not Sarah", "not 21,500",
    "not Phoenix", "not the 1987",
  ].filter((s) => allText.includes(s));

  const fingerprintLeaks = [
    "Sarah", "2:47 AM", "21,500", "Phoenix, AZ", "Detroit, MI", "Tampa, FL",
    "Rejuvacare", "Triple Method", "In Your Face",
    "$73 billion", "$76 billion", "$82 billion",
  ].filter((s) => allText.includes(s));

  const llmTells = [
    "In today's fast-paced world", "It's no surprise that", "Look no further",
    "Game-changer", "Mother Nature", "Big Pharma doesn",
    "Backed by science",
  ].filter((s) => allText.includes(s));

  const top5 = sk.title_top5;
  const topPrefixed = top5.filter((t) => t.startsWith("Top "));

  console.log(JSON.stringify({
    seconds: ((Date.now() - t0) / 1000).toFixed(1),
    section_count: sk.body.sections.length,
    title_top5_count: top5.length,
    titles_starting_with_Top: topPrefixed.length,
    title_shape_diverse: topPrefixed.length <= 3,
    meta_rotation_leaks: metaLeaks,
    fingerprint_leaks: fingerprintLeaks,
    llm_tell_leaks: llmTells,
    top5_titles: top5,
    sample_summaries: sk.body.sections.slice(0, 4).map((s) => ({
      id: s.id, len: s.summary.length, head: s.summary.slice(0, 110),
    })),
  }, null, 2));
})().catch((err) => {
  console.error("[test_copy_quality] FAILED:", err);
  process.exit(1);
});
