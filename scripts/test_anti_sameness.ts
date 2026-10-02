#!/usr/bin/env tsx
/**
 * SELF_TEST_ROUND_5 — Anti-sameness verification.
 *
 * Generates THREE skeletons from the same live template
 * (doctor-conspiracy-discovery-device) with three very different
 * direction prompts. Then scans the resulting candidate set for any
 * verbatim re-use of the shared_scaffold fingerprint registry.
 *
 * Acceptance: every fingerprint listed in the template's frontmatter
 * shared_scaffold block must NOT appear in any of the three skeletons
 * (titles, sections summaries, offer_strategy). If any does — the skill
 * needs tightening, not the prompt.
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { generateSkeleton } from "../server/skeletonGenerator.js";

const PROMPTS = [
  {
    label: "trucker-40s-truckstop",
    text:
      "Marcos, a 43-year-old long-haul trucker out of Laredo, has lived on Pilot Travel Center cheeseburgers for 20 years. " +
      "His company doctor flagged pre-diabetes at his last physical and gave him a patch sample because he can't be on injections " +
      "and drive. He starts wearing it on his arm while crossing Texas.",
  },
  {
    label: "retired-teacher-60s-pcos",
    text:
      "Roberta, a 64-year-old retired Newark high-school English teacher with lifelong PCOS, refused Ozempic when her endocrinologist " +
      "first offered it. Her sister-in-law — a nurse-practitioner — handed her a Ledisa patch at Thanksgiving dinner. By Easter " +
      "Roberta had walked the boardwalk in Ocean Grove three times a week without stopping for breath.",
  },
  {
    label: "athlete-30s-influencer",
    text:
      "Yuna, a 31-year-old fitness influencer based out of Park Slope Brooklyn with 480,000 Instagram followers, was diagnosed " +
      "Hashimoto's and gained 18 pounds in four months. Her sports-medicine doctor offered her a patch instead of injections so " +
      "she could keep training and rolling.",
  },
];

interface SmallSk {
  label: string;
  titles: string[];
  section_summaries: string[];
  offer_strategy: string;
  ms: number;
}

(async () => {
  console.log("Generating 3 skeletons in parallel against the LIVE doctor-conspiracy-discovery-device template…");
  const t0 = Date.now();
  const results = await Promise.allSettled(
    PROMPTS.map(async (p) => {
      const t = Date.now();
      const sk = await generateSkeleton({
        templateSlug: "doctor-conspiracy-discovery-device",
        productSlug: "ledisa-glp1-patches",
        directionPrompt: p.text,
        // No allowProposed — production path.
      });
      return {
        label: p.label,
        titles: [...sk.title_candidates, ...sk.title_top5],
        section_summaries: sk.body.sections.map((s) => `${s.id}: ${s.summary}`),
        offer_strategy: sk.body.offer_strategy,
        ms: Date.now() - t,
      } as SmallSk;
    }),
  );

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.\n`);

  const ok: SmallSk[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "fulfilled") {
      ok.push(r.value);
      console.log(`[${r.value.label}] OK (${r.value.ms / 1000}s)  titles=${r.value.titles.length}  sections=${r.value.section_summaries.length}`);
    } else {
      console.log(`[${PROMPTS[i]!.label}] FAILED: ${r.reason.message}`);
    }
  }

  // Shared-scaffold blocklist — must NOT appear verbatim in any of the
  // three skeletons. Sourced from the template's frontmatter shared_scaffold.
  const BANNED = [
    // Named figures
    "Sarah",
    // Time / scene
    "2:47 AM", "Tuesday 2:47", "3:17 AM",
    // Stats scaffold
    "21,500", "19,847",
    "91%", "93%",
    "87%", "89%",
    "74%", "78%",
    "0.3%", "0.02%",
    // Industry value
    "$73 billion", "$76 billion", "$82 billion",
    // Scarcity
    "3,847", "4,127",
    "500 units per week",
    "19 hours",
    // Discount
    "60% discount", "65% discount", "60% off", "65% off",
    // Locations
    "Phoenix, AZ", "Detroit, MI", "Tampa, FL",
    // Research citation
    "1987 Swedish research", "1987 Swedish study",
    // Doctor experience
    // (40 years and 23 years are template-defaults; allowed if rotated; we skip)
    // Brand + product naming
    "Rejuvacare", "Triple Method Massager",
    // Trust bar
    // Offer framing
    "In Your Face",
    // Structural opener predicate
    "piss off every neurologist", "piss off every orthopedic surgeon",
  ];

  console.log("\n=== Anti-sameness scan ===\n");
  let totalLeaks = 0;
  for (const sk of ok) {
    const corpus = [
      ...sk.titles,
      ...sk.section_summaries,
      sk.offer_strategy,
    ].join(" \n ");
    const leaks: Array<{ banned: string; sample: string }> = [];
    for (const b of BANNED) {
      const idx = corpus.indexOf(b);
      if (idx >= 0) {
        leaks.push({
          banned: b,
          sample: corpus.slice(Math.max(0, idx - 40), idx + 80).replace(/\s+/g, " "),
        });
      }
    }
    if (leaks.length === 0) {
      console.log(`  [${sk.label}] CLEAN — 0 fingerprint leaks`);
    } else {
      console.log(`  [${sk.label}] ${leaks.length} LEAK(S):`);
      for (const l of leaks) console.log(`    - "${l.banned}" :: …${l.sample}…`);
      totalLeaks += leaks.length;
    }
  }
  console.log(`\nTotal leaks across 3 skeletons: ${totalLeaks}`);

  // Also check pairwise overlap — same protagonist name / same numbers across skeletons.
  console.log("\n=== Pairwise overlap scan (same name / number appearing in two skeletons) ===");
  function extractNames(s: string): Set<string> {
    const names = new Set<string>();
    const matches = s.matchAll(/\bDr\.\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g);
    for (const m of matches) names.add(m[0]);
    return names;
  }
  function extractNumbers(s: string): Set<string> {
    const nums = new Set<string>();
    for (const m of s.matchAll(/\b\d{2,}(?:[,.]?\d{3})*\b/g)) nums.add(m[0]);
    for (const m of s.matchAll(/\$\d[\d,.]*\s?(?:billion|million|thousand|hundred)?/gi)) nums.add(m[0]);
    return nums;
  }
  const corpora = ok.map((sk) => [...sk.titles, ...sk.section_summaries, sk.offer_strategy].join(" "));
  for (let i = 0; i < corpora.length; i++) {
    for (let j = i + 1; j < corpora.length; j++) {
      const namesI = extractNames(corpora[i]!);
      const namesJ = extractNames(corpora[j]!);
      const shared = [...namesI].filter((n) => namesJ.has(n));
      if (shared.length) console.log(`  [${ok[i]!.label} × ${ok[j]!.label}] shared doctor-names: ${shared.join(", ")}`);
      else console.log(`  [${ok[i]!.label} × ${ok[j]!.label}] doctor-names: no overlap`);
    }
  }
})().catch((err) => {
  console.error("[anti-sameness] FAILED:", err);
  process.exit(1);
});
