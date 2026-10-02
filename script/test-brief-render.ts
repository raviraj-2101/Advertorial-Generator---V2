/**
 * test-brief-render.ts — CLI smoke test for the V2 brief → template pipeline.
 *
 * Usage:
 *   npx tsx script/test-brief-render.ts <brief.docx> <template-slug> <out.html>
 *
 * Example:
 *   npx tsx script/test-brief-render.ts \
 *     /Users/liamfuerst/Downloads/Nervalley_Advertorial_Brief.docx \
 *     rejuvacare-doctor-discovery \
 *     /tmp/nervalley-rendered.html
 *
 * This script does NOT generate images — it leaves the {{HERO_IMAGE_URL}}
 * and {{IMG_n_URL}} slots filled with `data:image/png;base64,...` 1×1
 * placeholders so the render is visually navigable even before the
 * image pipeline runs. The full server flow swaps those out with real
 * generated URLs at /api/v2/projects/from-brief time.
 */

import { parseBriefFile } from "../server/briefParser.js";
import { renderTemplate, loadManifest } from "../server/templateRenderer.js";
import fs from "node:fs";

const PLACEHOLDER_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

async function main() {
  const [briefPath, slug, outPath] = process.argv.slice(2);
  if (!briefPath || !slug || !outPath) {
    console.error("Usage: tsx test-brief-render.ts <brief.docx> <template-slug> <out.html>");
    process.exit(1);
  }

  const parsed = await parseBriefFile(briefPath);
  const manifest = loadManifest(slug);
  if (!manifest) throw new Error(`Template '${slug}' not found`);

  // Fill image slots with placeholders so the render is intact even
  // before real images exist.
  const values: Record<string, string> = { ...parsed.slotValues };
  for (const s of manifest.slots) {
    if (s.type === "image" && !values[s.key]) values[s.key] = PLACEHOLDER_1X1;
  }

  const html = renderTemplate(slug, values, { keepPlaceholders: true });
  fs.writeFileSync(outPath, html, "utf8");

  console.log("\n=== Brief parsed ===");
  console.log(`Paragraphs:      ${parsed.paragraphs.length}`);
  console.log(`Headline:        ${parsed.headline?.slice(0, 80) ?? "(none detected)"}`);
  console.log(`Section headers: ${parsed.sectionHeaders.length}`);
  parsed.sectionHeaders.slice(0, 8).forEach((h, i) => console.log(`  ${i + 1}. ${h.slice(0, 80)}`));
  if (parsed.sectionHeaders.length > 8) console.log(`  ... (${parsed.sectionHeaders.length - 8} more)`);
  console.log(`Image prompts:   ${parsed.imagePrompts.length}`);
  parsed.imagePrompts.slice(0, 5).forEach((p) => console.log(`  ${p.slotKey}: ${p.prompt.slice(0, 80)}`));

  console.log("\n=== Slot fill ===");
  console.log(`Total slots filled: ${Object.keys(values).length}`);
  const expected = manifest.slots.map((s) => s.key);
  const missing = expected.filter((k) => !values[k]);
  console.log(`Slots not filled by brief (will fall back to defaults): ${missing.length}`);
  missing.slice(0, 10).forEach((k) => console.log(`  - ${k}`));

  console.log(`\n=== Render ===`);
  console.log(`Wrote: ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
  console.log(`Open in a browser to verify the visual is intact:`);
  console.log(`  file://${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
