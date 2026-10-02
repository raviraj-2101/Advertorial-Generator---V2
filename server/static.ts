import type { Express } from "express";
import express from "express";
import path from "node:path";
import fs from "node:fs";

/**
 * Production static serving — mirrors NEW-UGC-Scripts/static.ts.
 * Serves the Vite build output from `dist/client/` and falls back to
 * `index.html` for SPA routes (anything that isn't an /api/* request and
 * isn't a real file in dist/client).
 */
export function serveStatic(app: Express): void {
  const dist = path.resolve(process.cwd(), "dist", "client");
  if (!fs.existsSync(dist)) {
    console.warn(`[static] dist/client missing — did you run \`npm run build\`?`);
  }
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}
