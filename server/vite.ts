import type { Express } from "express";
import type { Server } from "node:http";
import path from "node:path";
import fs from "node:fs";

/**
 * Vite middleware for dev mode. Runs Vite in middleware mode so the Express
 * server can serve both API routes and the React SPA on the same port,
 * preserving the auth bearer-token flow without CORS gymnastics.
 */
export async function setupVite(httpServer: Server, app: Express): Promise<void> {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: path.resolve(process.cwd(), "client"),
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
      // Vite's DNS-rebinding guard rejects any Host header that isn't
      // localhost by default. The tool is reachable in production over
      // `https://adv-generator.acentecom.com/`, so we allow that host
      // plus the `.acentecom.com` wildcard for future subdomains.
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        "adv-generator.acentecom.com",
        ".acentecom.com",
      ],
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
  // SPA-shell fallthrough — but NOT for /api/ (real API routes) and NOT
  // for /preview/ (server-rendered V2 template HTML, served straight by
  // Express below).
  app.use(/^(?!\/api)(?!\/preview).*/, async (req, res, next) => {
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/preview")) return next();
    const indexPath = path.resolve(process.cwd(), "client", "index.html");
    if (!fs.existsSync(indexPath)) {
      res.status(500).send("client/index.html missing");
      return;
    }
    try {
      let html = fs.readFileSync(indexPath, "utf8");
      html = await vite.transformIndexHtml(req.originalUrl, html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });
}
