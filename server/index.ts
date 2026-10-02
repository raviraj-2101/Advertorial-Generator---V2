import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { startSessionGc } from "./auth";
import { clearProductConfigCache, listProducts } from "./productConfigs";

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express"): void {
  const t = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${t} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error("Error:", err);
    if (res.headersSent) return next(err);
    res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
  });

  startSessionGc();

  // V2: refresh product-configs from GitHub every 6 hours. Operator's
  // explicit ask in the V2 brief — "I want an automated refresh every six
  // hours." Drops the in-memory cache and re-fetches list+contents on the
  // next /api/products call.
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  // Warm the cache on boot so the first request after a deploy isn't slow.
  void listProducts()
    .then((items) => log(`product-configs warm: ${items.length} products`, "v2-sync"))
    .catch((err) => log(`product-configs warm failed: ${(err as Error).message}`, "v2-sync"));
  setInterval(() => {
    try {
      const cleared = clearProductConfigCache();
      log(`product-configs refresh — cleared ${cleared.products} cached entries`, "v2-sync");
      void listProducts()
        .then((items) => log(`product-configs refresh complete: ${items.length} products`, "v2-sync"))
        .catch((err) => log(`product-configs refresh failed: ${(err as Error).message}`, "v2-sync"));
    } catch (err) {
      log(`product-configs refresh tick error: ${(err as Error).message}`, "v2-sync");
    }
  }, SIX_HOURS_MS).unref();
})();
