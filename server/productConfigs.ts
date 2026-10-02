import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * Acentecom/product-configs fetcher.
 *
 * Reads the five canonical numbered files per product from the
 * `Acentecom/product-configs` GitHub repo (or a local checkout when
 * `LOCAL_PRODUCT_CONFIGS_PATH` is set). Caches in memory for 24 hours.
 *
 * The product list is discovered dynamically by listing top-level
 * directories in the repo — there is no hard-coded slug list anywhere in
 * the codebase.
 *
 * IMPORTANT: this module is strictly READ-ONLY against the product-configs
 * repo. The brief forbids any write under any circumstance.
 */

const CONFIG_REPO_OWNER = process.env.PRODUCT_CONFIGS_OWNER || "Acentecom";
const CONFIG_REPO_NAME = process.env.PRODUCT_CONFIGS_REPO || "product-configs";
const CONFIG_REPO_BRANCH = process.env.PRODUCT_CONFIGS_BRANCH || "main";
// Token resolution: explicit env var first; the `gh auth token` keychain
// fallback runs lazily inside authHeaders() so module-load stays sync.
// Acentecom's enterprise policy caps fine-grained PAT lifetime at 366d,
// so the long-lived gh-CLI OAuth token is the practical fallback.
let GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
let GITHUB_TOKEN_GH_PROBED = false;

function resolveGithubToken(): string {
  if (GITHUB_TOKEN) return GITHUB_TOKEN;
  if (GITHUB_TOKEN_GH_PROBED) return GITHUB_TOKEN;
  GITHUB_TOKEN_GH_PROBED = true;
  try {
    GITHUB_TOKEN = execSync("gh auth token", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    GITHUB_TOKEN = "";
  }
  return GITHUB_TOKEN;
}
const LOCAL_PRODUCT_CONFIGS_PATH = process.env.LOCAL_PRODUCT_CONFIGS_PATH || "";

export const CONFIG_FILE_NAMES = [
  "01-core.md",
  "02-quiz.md",
  "03-top-scripts.md",
  "04-competitors.md",
  "05-funnels.md",
];

export type ProductInfo = { id: string; name: string };

type ProductCacheEntry = {
  files: Record<string, string>;
  fetchedAt: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const productCache = new Map<string, ProductCacheEntry>();
let productListCache: { items: ProductInfo[]; fetchedAt: number } | null = null;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "advertorials-generator",
  };
  const tok = resolveGithubToken();
  if (tok) h["Authorization"] = `Bearer ${tok}`;
  return h;
}

async function ghFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} ${res.statusText} for ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function ghFetchRaw(slug: string, filename: string): Promise<string> {
  const url = `https://api.github.com/repos/${CONFIG_REPO_OWNER}/${CONFIG_REPO_NAME}/contents/${encodeURIComponent(slug)}/${encodeURIComponent(filename)}?ref=${encodeURIComponent(CONFIG_REPO_BRANCH)}`;
  const json = (await ghFetchJson(url)) as { content?: string; encoding?: string };
  if (!json || typeof json.content !== "string") {
    throw new Error(`Unexpected response shape for ${slug}/${filename}`);
  }
  return Buffer.from(json.content, (json.encoding as BufferEncoding) || "base64").toString("utf8");
}

export function deriveDisplayNameFromCore(coreMd: string, slug: string): string {
  const lines = coreMd.split(/\r?\n/);
  for (const line of lines) {
    const h1 = line.match(/^\s*#\s+(.+?)\s*$/);
    if (h1 && h1[1] && !/product\s+config/i.test(h1[1])) {
      let name = h1[1].trim();
      name = name.replace(/\s*[—–-]\s*(core\s*db|product\s*config|knowledge\s*base|kb).*$/i, "").trim();
      return name;
    }
    const pn = line.match(/^\s*product\s*name\s*[:=]\s*(.+)$/i);
    if (pn && pn[1]) return pn[1].replace(/[*_`]/g, "").trim();
  }
  return slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function cacheFresh<T extends { fetchedAt: number }>(entry: T | null | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export async function loadProductFiles(slug: string): Promise<ProductCacheEntry> {
  const cached = productCache.get(slug);
  if (cacheFresh(cached)) return cached as ProductCacheEntry;

  const out: Record<string, string> = {};

  if (LOCAL_PRODUCT_CONFIGS_PATH) {
    const slugDir = path.join(LOCAL_PRODUCT_CONFIGS_PATH, slug);
    for (const name of CONFIG_FILE_NAMES) {
      const full = path.join(slugDir, name);
      if (fs.existsSync(full)) out[name] = fs.readFileSync(full, "utf8");
    }
  } else {
    const results = await Promise.allSettled(
      CONFIG_FILE_NAMES.map((name) => ghFetchRaw(slug, name).then((content) => ({ name, content }))),
    );
    for (const r of results) {
      if (r.status === "fulfilled") out[r.value.name] = r.value.content;
    }
  }

  if (!out["01-core.md"]) {
    throw new Error(`Product config for "${slug}" is missing 01-core.md (required).`);
  }
  const entry: ProductCacheEntry = { files: out, fetchedAt: Date.now() };
  productCache.set(slug, entry);
  return entry;
}

export async function listProducts(): Promise<ProductInfo[]> {
  if (cacheFresh(productListCache)) return productListCache!.items;

  let slugs: string[];
  if (LOCAL_PRODUCT_CONFIGS_PATH) {
    slugs = fs
      .readdirSync(LOCAL_PRODUCT_CONFIGS_PATH, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } else {
    const url = `https://api.github.com/repos/${CONFIG_REPO_OWNER}/${CONFIG_REPO_NAME}/contents/?ref=${encodeURIComponent(CONFIG_REPO_BRANCH)}`;
    const json = (await ghFetchJson(url)) as Array<{ type: string; name: string }>;
    // Exclude top-level helper directories that aren't products. A product
    // dir always contains 01-core.md — non-product dirs (`scripts/`,
    // `.github/`, etc.) don't. We filter conservatively by name here and
    // also drop anything whose 01-core.md fetch fails below.
    const NON_PRODUCT = new Set(["scripts", "node_modules", ".github", "docs"]);
    slugs = json
      .filter((entry) => entry.type === "dir" && !/^\./.test(entry.name) && !NON_PRODUCT.has(entry.name))
      .map((entry) => entry.name)
      .sort();
  }

  const settled = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const entry = await loadProductFiles(slug);
        return { id: slug, name: deriveDisplayNameFromCore(entry.files["01-core.md"] || "", slug) };
      } catch {
        return null;
      }
    }),
  );
  // Drop slugs whose 01-core.md fetch failed — they're not products.
  const items: ProductInfo[] = settled.filter((x): x is ProductInfo => x !== null);

  productListCache = { items, fetchedAt: Date.now() };
  return items;
}

export async function isValidProductSlug(slug: string): Promise<boolean> {
  if (!slug || /[^a-z0-9-]/i.test(slug)) return false;
  const items = await listProducts();
  return items.some((p) => p.id === slug);
}

export async function getProductDisplayName(slug: string): Promise<string> {
  const items = await listProducts();
  const found = items.find((p) => p.id === slug);
  return found ? found.name : slug;
}

export async function getProductCoreMd(slug: string): Promise<string> {
  const entry = await loadProductFiles(slug);
  return entry.files["01-core.md"] || "";
}

export function clearProductConfigCache(): { products: number } {
  const n = productCache.size;
  productCache.clear();
  productListCache = null;
  return { products: n };
}
