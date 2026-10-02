#!/usr/bin/env tsx
/**
 * Phase 8 smoke test: drive publishLander() against the real landers
 * VPS. Uses the most recently created lander row from Supabase, pushes
 * its rendered HTML to /var/www/landers/test.local/demo/, and reports
 * the resulting nginx-served path.
 *
 * Run: `npx tsx scripts/test_publish.ts`
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { publishLander } from "../server/publishing.js";
import { tryGetServiceClient } from "../server/supabase.js";

(async () => {
  const supa = tryGetServiceClient();
  if (!supa) {
    console.error("Supabase not configured");
    process.exit(2);
  }
  const { data: lander, error } = await supa
    .from("landers")
    .select("id, internal_name, html")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !lander) {
    console.error("no lander row in advertorials.landers:", error?.message);
    process.exit(2);
  }
  console.log("lander:", (lander as { id: string }).id, "html bytes:", ((lander as { html: string }).html || "").length);
  const t0 = Date.now();
  const result = await publishLander({
    domain: "test.local",
    publishPath: "demo",
    html: (lander as { html: string }).html,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`publishLander done in ${dt}s:`, JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error("[test_publish] FAILED:", err);
  process.exit(1);
});
