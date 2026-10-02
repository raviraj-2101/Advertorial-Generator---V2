import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import path from "node:path";
import fs from "node:fs";

/**
 * Production build script — mirrors NEW-UGC-Scripts/script/build.ts.
 *
 * 1. Build the client with Vite (output → dist/client).
 * 2. Bundle the server with esbuild (output → dist/index.cjs).
 * 3. Copy advertorials-skill/ alongside the bundle so the server can
 *    read skill.md + templates/ at runtime.
 */

async function main(): Promise<void> {
  const root = process.cwd();
  const dist = path.join(root, "dist");

  console.log("[build] vite client → dist/client");
  await viteBuild({
    root: path.join(root, "client"),
    build: {
      outDir: path.join(dist, "client"),
      emptyOutDir: true,
    },
  });

  console.log("[build] esbuild server → dist/index.cjs");
  await esbuild({
    entryPoints: [path.join(root, "server", "index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: path.join(dist, "index.cjs"),
    // The server source derives `__dirname` from `import.meta.url` (so it works
    // in dev under tsx/ESM). In this CJS bundle `import.meta.url` would compile
    // to empty and warn, so map it to a `__filename`-based file URL instead.
    // `__IMPORT_META_URL__` is defined once in the banner; `define` rewrites
    // every `import.meta.url` reference to it.
    banner: { js: "const __IMPORT_META_URL__ = require('node:url').pathToFileURL(__filename).href;" },
    define: { "import.meta.url": "__IMPORT_META_URL__" },
    // `vite` is dev-only (server/vite.ts dynamically imports it for middleware
    // mode). Keep it external so esbuild doesn't bundle Vite — and its optional
    // `lightningcss` native dep — into the production server bundle.
    external: ["express", "@anthropic-ai/sdk", "@supabase/supabase-js", "drizzle-orm", "postgres", "dotenv", "vite", "lightningcss"],
    logLevel: "info",
  });

  console.log("[build] copy advertorials-skill/ → dist/advertorials-skill");
  copyDir(path.join(root, "advertorials-skill"), path.join(dist, "advertorials-skill"));

  console.log("[build] done.");
}

function copyDir(src: string, dst: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

main().catch((err) => {
  console.error("[build] failed:", err);
  process.exit(1);
});
