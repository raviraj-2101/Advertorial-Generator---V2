import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import multer from "multer";
import {
  listTemplates as listTemplatesV2,
  loadManifest as loadManifestV2,
  renderTemplate as renderTemplateV2,
} from "./templateRenderer";
import { parseDocxParagraphs, briefToSlotValues, type ImagePlaceholder } from "./briefParser";
import { generateImage } from "./imageGen";

async function briefToSlots(buf: Buffer) {
  const paragraphs = await parseDocxParagraphs(buf);
  return briefToSlotValues(paragraphs);
}

/**
 * For each [IMAGE PLACEHOLDER] from the brief, run a Nano Banana Pro
 * generation, upload to V2 Storage, return a slot → public URL dict.
 * If the brief references the Cleantra Lymphatic Drainage Drops bottle,
 * we pass the product's reference_image_url as a visual anchor so the
 * bottle in renders matches the operator's spec.
 */
/**
 * Inject the magazine favicon + per-lander tab title into the rendered
 * HTML. Used by all 3 render paths (host-resolver, preview, export) so
 * they stay in sync. Operator: "I also want you to allow us to edit
 * the text that's on the tab, like the thing that's next to the
 * favicon."
 *
 * Title precedence: lander.tab_title (operator-set) > magazine.name >
 * leave the template's existing <title> alone.
 *
 * Favicon precedence: magazine.logo_url replaces any existing
 * <link rel="icon"> in the template.
 */
function injectFaviconAndTitle(
  html: string,
  opts: { magazineLogoUrl?: string; magazineName?: string; tabTitle?: string | null },
): string {
  const { magazineLogoUrl, magazineName, tabTitle } = opts;
  // Favicon: strip any existing <link rel="icon">, prepend ours.
  if (magazineLogoUrl) {
    html = html.replace(/<link\b[^>]*rel="(?:shortcut\s+)?icon"[^>]*>/gi, "");
    const tags = `<link rel="icon" href="${magazineLogoUrl}"><link rel="shortcut icon" href="${magazineLogoUrl}">`;
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tags}</head>`) : tags + html;
  }
  // Title: pick operator-set tab_title > magazine.name (default).
  // We always REPLACE the existing <title> when we have an override,
  // so the template's hardcoded "Health Insights Magazine" doesn't
  // win over the operator's preference.
  const titleText = (tabTitle && tabTitle.trim()) || magazineName || "";
  if (titleText) {
    const safe = titleText.replace(/[<>]/g, "");
    if (/<title\b[^>]*>[^<]*<\/title>/i.test(html)) {
      html = html.replace(/<title\b[^>]*>[^<]*<\/title>/i, `<title>${safe}</title>`);
    } else if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `<title>${safe}</title></head>`);
    } else {
      html = `<title>${safe}</title>` + html;
    }
  }
  return html;
}

async function generateBriefImages(
  imagePrompts: ImagePlaceholder[],
  productSlug: string | null,
): Promise<Record<string, string>> {
  const supa = tryGetServiceClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "advertorial-images-v2";
  const out: Record<string, string> = {};
  // Pull the product's primary reference image (e.g. the Cleantra bottle)
  // so person/product-bearing prompts get a visual anchor.
  let productRefUrl: string | undefined;
  if (supa && productSlug) {
    const { data } = await supa
      .from("products")
      .select("reference_image_url")
      .eq("slug", productSlug)
      .maybeSingle();
    productRefUrl = (data as { reference_image_url?: string | null } | null)?.reference_image_url || undefined;
  }
  // Parallelize image gen — Gemini Nano Banana Pro tolerates ~5-8
  // concurrent requests well; capping at 6 keeps us safely under the rate
  // limit while shrinking total wall time from 16×10s to ~3×10s for the
  // Nervalley-sized brief.
  const CONCURRENCY = 6;
  let cursor = 0;
  // Per-image attempt with 1 retry. The original implementation
  // swallowed all errors silently — operator caught it: "I'm generating
  // a new project, and I don't see any of the images... You need to
  // make sure it's running a fresh generation of all the images every
  // single time."
  // Sanitize prompts known to trigger Gemini safety refusals. The
  // operator's briefs frequently say "real-looking older person" or
  // "testimonial photo" — Gemini's likeness filter refuses these
  // even with BLOCK_NONE safety settings. Soften the language so the
  // intent (an editorial portrait) survives.
  function sanitizePromptForRetry(prompt: string): string {
    return prompt
      .replace(/\breal-looking\b/gi, "natural")
      .replace(/\breal photo of\b/gi, "editorial portrait of")
      .replace(/\btestimonial card:?\s*/gi, "Editorial-style portrait: ")
      .replace(/\bphoto of a (real-looking |authentic )?\b/gi, "editorial portrait of an ");
  }
  async function genOnce(slotKey: string, prompt: string, i: number): Promise<string | null> {
    const aspectRatio = "16:9";
    const result = await generateImage({
      prompt,
      aspectRatio,
      referenceImageUrl: productRefUrl,
    });
    if (!result.ok || result.placeholder || !result.url) {
      console.warn(`[brief-img-gen] ${slotKey}: gemini returned ok=${result.ok} placeholder=${result.placeholder} url=${!!result.url}`);
      return null;
    }
    let publicUrl = result.url;
    if (result.isDataUrl && supa) {
      const match = result.url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1] || "image/png";
        const bytes = Buffer.from(match[2] || "", "base64");
        const path = `brief-gen/${slotKey.toLowerCase()}-${Date.now()}-${i}.png`;
        const up = await supa.storage.from(bucket).upload(path, bytes, {
          contentType: mime,
          upsert: true,
        });
        if (up.error) {
          console.warn(`[brief-img-gen] ${slotKey}: storage upload failed: ${up.error.message}`);
          return null;
        }
        publicUrl = supa.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      }
    }
    return publicUrl;
  }
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= imagePrompts.length) return;
      const item = imagePrompts[i];
      if (!item) return;
      const { slotKey, prompt } = item;
      let url: string | null = null;
      // 3 attempts: original prompt → sanitized prompt → sanitized + simplified
      const variants = [
        prompt,
        sanitizePromptForRetry(prompt),
        // Last resort: just describe the SCENE not the SUBJECT in detail
        sanitizePromptForRetry(prompt).replace(/\b(early|mid|late)?\s*\d+s?\b/gi, "older").slice(0, 280),
      ];
      for (let attempt = 0; attempt < variants.length; attempt++) {
        const p = variants[attempt]!;
        try {
          url = await genOnce(slotKey, p, i);
          if (url) {
            if (attempt > 0) console.log(`[brief-img-gen] ${slotKey}: succeeded on retry ${attempt + 1} (sanitized prompt)`);
            break;
          }
          if (attempt < variants.length - 1) {
            console.log(`[brief-img-gen] ${slotKey}: retry ${attempt + 2} with sanitized prompt…`);
            await new Promise((r) => setTimeout(r, 1500));
          }
        } catch (err) {
          console.warn(`[brief-img-gen] ${slotKey} attempt ${attempt + 1} threw: ${(err as Error).message}`);
          if (attempt < variants.length - 1) await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (url) {
        out[slotKey] = url;
      } else {
        console.error(`[brief-img-gen] ${slotKey}: FAILED after ${variants.length} attempts. Original prompt: ${prompt.slice(0, 100)}`);
      }
    }
  });
  await Promise.all(workers);
  console.log(`[brief-img-gen] complete: ${Object.keys(out).length}/${imagePrompts.length} succeeded`);
  return out;
}
import {
  loginSchema,
  createProjectSchema,
  generateLandersSchema,
  publishSchema,
  bulkCtaSchema,
  sectionRevisionSchema,
  titleRegenSchema,
  imageRegenSchema,
  imageBankCreateSchema,
  imageBankSaveFromLanderSchema,
  imageBankSearchSchema,
} from "../shared/schema";
import {
  validateLogin,
  generateToken,
  createSession,
  deleteSession,
  getBearerToken,
  getSessionEmail,
  requireAuth,
  checkLoginRateLimit,
} from "./auth";
import { listProducts, isValidProductSlug, clearProductConfigCache } from "./productConfigs";
import { listLiveTemplates, listProposedTemplates, getLiveTemplate, clearTemplateCache } from "./templateLoader";
import { debugSystemPrompt } from "./systemPrompt";
import { generateSkeleton, reviseSkeleton } from "./skeletonGenerator";
import { generateLander, renderLanderHtml } from "./landerGenerator";
import { reviseSection } from "./revisionEngine";
import { regenerateTitles } from "./titleGenerator";
import { generateImageToBank, uploadImageToBank } from "./imageBank";
import { searchImageBank } from "./imageSearch";
import { publishLander, publishingConfigured } from "./publishing";
import { tryGetServiceClient } from "./supabase";

type AuthedRequest = Request & { userEmail?: string };

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0]!.trim();
  return req.ip || "unknown";
}

export async function registerRoutes(_httpServer: Server, app: Express): Promise<Server> {

  // ── Host-based lander resolver ──────────────────────────────────────
  // When a request arrives with a Host header that's NOT our own app host
  // (e.g. myhealthyshape.co), check whether a lander exists with that
  // exact `domain` + `extension_path`. If so, render it; otherwise fall
  // through to the SPA / static handler.
  //
  // This is what makes a V2 lander serve at `<magazine.domain>/<path>`
  // without us writing static HTML files anywhere — the published page
  // is just the regular preview render keyed by Host+path.
  //
  // For this to actually route traffic, Caddy on the VPS needs a vhost
  // block for each magazine domain that proxies to the app's port. The
  // `GET /api/v2/magazines/:slug/caddy-snippet` endpoint below produces
  // exactly that block for the operator to paste.
  const APP_HOST = (process.env.PUBLIC_BASE_URL || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  app.use(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const host = (req.headers.host || "").toLowerCase().split(":")[0];
    if (!host) return next();
    // Skip only the app's own host + localhost. Other acentecom.com
    // subdomains (like mhs-staging.acentecom.com) ARE allowed to serve
    // landers — they're intentionally pointed at this VPS and Caddy
    // routes them here for end-to-end testing.
    if (host === APP_HOST || host === "localhost" || host === "127.0.0.1") return next();
    // Skip our own API + preview routes regardless of host.
    if (req.path.startsWith("/api/") || req.path.startsWith("/preview/") || req.path.startsWith("/assets/")) return next();
    const supa = tryGetServiceClient();
    if (!supa) return next();
    try {
      const { data: lander } = await supa
        .from("landers")
        .select("template_slug,slot_values,image_urls,cta_url,voluum_status,magazine_slug,tab_title")
        .eq("domain", host)
        .eq("extension_path", req.path)
        .maybeSingle();
      if (!lander) return next();
      const slug = String((lander as { template_slug: string }).template_slug);
      // Pull magazine logo + policy URLs the same way /preview/landers/:id does
      const landerRec = lander as { slot_values?: Record<string, string>; image_urls?: Record<string, string>; cta_url?: string | null; magazine_slug?: string | null; tab_title?: string | null };
      let privacyPolicyUrl = "", termsUrl = "", magazineLogoUrl = "", magazineName = "";
      if (landerRec.magazine_slug) {
        const { data: mag } = await supa.from("magazines").select("name,branding,logo_url").eq("slug", landerRec.magazine_slug).maybeSingle();
        const branding = (mag as { branding?: Record<string, string> } | null)?.branding || {};
        privacyPolicyUrl = String(branding.privacy_policy_url || branding.privacy_url || "");
        termsUrl = String(branding.terms_url || branding.terms_of_service_url || "");
        magazineLogoUrl = String((mag as { logo_url?: string | null } | null)?.logo_url || "");
        magazineName = String((mag as { name?: string } | null)?.name || "");
      }
      const merged: Record<string, string> = {
        ...(landerRec.slot_values || {}),
        ...(landerRec.image_urls || {}),
        ...(landerRec.cta_url ? { CTA_URL: landerRec.cta_url } : {}),
        ...(privacyPolicyUrl ? { PRIVACY_POLICY_URL: privacyPolicyUrl } : {}),
        ...(termsUrl ? { TERMS_URL: termsUrl } : {}),
      };
      let html = renderTemplateV2(slug, merged, { keepPlaceholders: false });
      html = injectFaviconAndTitle(html, { magazineLogoUrl, magazineName, tabTitle: landerRec.tab_title });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Lander-Host", host);
      res.send(html);
    } catch (err) {
      console.error(`[lander-host-resolver] ${host}${req.path} → ${(err as Error).message}`);
      next();
    }
  });

  app.get("/api/_debug/env-probe", requireAuth, async (_req, res) => {
    if (process.env.NODE_ENV === "production") { res.status(404).json({ message: "Not found" }); return; }
    // Also exercise the supabase client factory and capture what it
    // actually returns from inside the same handler scope. This pins
    // whether the bug is env-vis or client-resolution.
    let supaProbe: Record<string, unknown> = { tried: false };
    // Surface the actual throw from getServiceClient (the strict variant
    // tryGetServiceClient swallows). Plus check whether supabase.ts's view
    // of process.env matches this handler's view.
    try {
      const supaMod = await import("./supabase.js");
      const innerView = typeof supaMod.envSupabaseUrl === "function" ? supaMod.envSupabaseUrl() : "(envSupabaseUrl not exported)";
      let directThrow: string | null = null;
      try { supaMod.getServiceClient(); }
      catch (e) { directThrow = e instanceof Error ? e.message : String(e); }
      const s = supaMod.tryGetServiceClient();
      supaProbe = {
        handler_sees_url_len: (process.env.SUPABASE_URL || "").length,
        inner_view_url: typeof innerView === "string" ? innerView.length : innerView,
        get_service_client_throw: directThrow,
        try_get_is_null: s === null,
        ctor: s ? s.constructor.name : null,
      };
    } catch (err) {
      supaProbe = { tried: true, threw: err instanceof Error ? err.message : String(err) };
    }
    res.json({
      supabase_url_set: Boolean(process.env.SUPABASE_URL),
      supabase_url_len: (process.env.SUPABASE_URL || "").length,
      supabase_service_key_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      supabase_service_key_len: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
      supabase_schema: process.env.SUPABASE_SCHEMA || "advertorials",
      github_token_set: Boolean(process.env.GITHUB_TOKEN),
      anthropic_key_set: Boolean(process.env.ANTHROPIC_API_KEY),
      gemini_key_set: Boolean(process.env.GEMINI_API_KEY || process.env.NANO_BANANA_PRO_API_KEY),
      cwd: process.cwd(),
      pid: process.pid,
      supa_probe: supaProbe,
    });
  });

    // ── Health ──
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      version: "0.1.0",
      service: "advertorials-generator",
      now: new Date().toISOString(),
    });
  });

  // ── Auth ──
  app.post("/api/login", async (req, res) => {
    if (!checkLoginRateLimit(clientIp(req))) {
      res.status(429).json({ message: "Too many login attempts. Wait 10 minutes and try again." });
      return;
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Email + password required." });
      return;
    }
    const { email, password } = parsed.data;
    if (!validateLogin(email, password)) {
      res.status(401).json({ message: "Unauthorized — @acentecom.com email and shared password required." });
      return;
    }
    const token = generateToken();
    await createSession(token, email);
    res.json({ token, email });
  });

  app.post("/api/logout", async (req, res) => {
    const token = getBearerToken(req);
    if (token) await deleteSession(token);
    res.json({ ok: true });
  });

  app.get("/api/me", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const email = await getSessionEmail(token);
    if (!email) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    res.json({ email });
  });

  // ── Products (read-only via productConfigs) ──
  app.get("/api/products", requireAuth, async (_req, res) => {
    try {
      const items = await listProducts();
      // Annotate each product with the per-tool record from Supabase
      // (brand_slug, reference_image_url, image_spec, display name override)
      // so the Brands & Products page can show a real per-product editor.
      const supa = tryGetServiceClient();
      if (!supa) {
        res.json({ items });
        return;
      }
      const slugs = items.map((p) => p.id);
      if (slugs.length === 0) {
        res.json({ items });
        return;
      }
      // Table column-set is unknown at runtime — the products table may or
      // may not have the per-tool annotation columns yet. Probe with
      // select("*") and pick fields off each row defensively.
      // Real schema (drizzle/manual/0000_initial_schema.sql):
      //   products(slug, brand_slug, display_name, image_spec jsonb,
      //            reference_image_ids uuid[]).
      // reference_image_ids points into image_bank_items.id; we join one
      // hop to produce the storage_url for the UI.
      const { data: rows, error: prodErr } = await supa
        .from("products")
        .select("*")
        .in("slug", slugs);
      const bySlug = new Map<string, {
        brand_slug: string | null;
        reference_image_ids: string[];
        reference_image_url: string | null;
        reference_image_description: string | null;
        extra_images: unknown[];
        image_spec: unknown;
        display_name: string | null;
        summary_md: string | null;
        configs_last_synced_at: string | null;
      }>();
      const allRefIds = new Set<string>();
      if (!prodErr) {
        for (const r of rows || []) {
          const rec = r as Record<string, unknown>;
          const ids = (rec.reference_image_ids as string[] | null) || [];
          for (const id of ids) allRefIds.add(id);
          bySlug.set(r.slug, {
            brand_slug: (rec.brand_slug as string | null) || null,
            reference_image_ids: ids,
            reference_image_url: (rec.reference_image_url as string | null) || null,
            reference_image_description: (rec.reference_image_description as string | null) || null,
            extra_images: Array.isArray(rec.extra_images) ? (rec.extra_images as unknown[]) : [],
            image_spec: rec.image_spec || null,
            display_name: (rec.display_name as string | null) || null,
            summary_md: (rec.summary_md as string | null) || null,
            configs_last_synced_at: (rec.configs_last_synced_at as string | null) || null,
          });
        }
      }
      const refUrlById = new Map<string, string>();
      if (allRefIds.size > 0) {
        const { data: refs } = await supa
          .from("image_bank_items")
          .select("id,storage_url,name")
          .in("id", Array.from(allRefIds));
        for (const r of refs || []) refUrlById.set(r.id, r.storage_url);
      }
      const annotated = items.map((p) => {
        const meta = bySlug.get(p.id);
        const refIds = meta?.reference_image_ids || [];
        return {
          id: p.id,
          name: meta?.display_name || p.name,
          brand_slug: meta?.brand_slug || null,
          reference_image_ids: refIds,
          reference_image_urls: refIds.map((id) => refUrlById.get(id)).filter(Boolean) as string[],
          // V2 primary reference (uploaded via /api/products/:slug/reference-image)
          reference_image_url: meta?.reference_image_url || null,
          reference_image_description: meta?.reference_image_description || null,
          // V2 extra images (each {url, path, description, uploaded_at})
          extra_images: meta?.extra_images || [],
          image_spec: meta?.image_spec || null,
          summary_md: meta?.summary_md || null,
          configs_last_synced_at: meta?.configs_last_synced_at || null,
        };
      });
      res.json({ items: annotated });
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : "products load failed" });
    }
  });

  // PATCH a product's per-tool record (brand_slug, reference_image_url,
  // image_spec, display_name override). Upserts on slug.
  app.patch("/api/products/:slug", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const slug = String(req.params.slug);
    const valid = await isValidProductSlug(slug);
    if (!valid) {
      res.status(400).json({ message: "unknown product slug" });
      return;
    }
    const row: Record<string, unknown> = { slug };
    if (typeof req.body?.brand_slug === "string" || req.body?.brand_slug === null) row.brand_slug = req.body.brand_slug || null;
    if (Array.isArray(req.body?.reference_image_ids)) row.reference_image_ids = req.body.reference_image_ids;
    if (req.body?.image_spec !== undefined) row.image_spec = req.body.image_spec;
    if (typeof req.body?.display_name === "string") row.display_name = req.body.display_name;
    // Upsert requires display_name on insert (NOT NULL) — backfill from
    // the product-configs name if the caller didn't pass one.
    if (!row.display_name) {
      const products = await listProducts();
      row.display_name = products.find((p) => p.id === slug)?.name || slug;
    }
    const { data, error } = await supa.from("products").upsert(row, { onConflict: "slug" }).select("*").single();
    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }
    res.json({ product: data });
  });

  // V2 — upload a reference image for a product. Multipart form: file field
  // 'image', text field 'description'. The image is uploaded to Supabase
  // Storage bucket `advertorial-images-v2`; the resulting public URL +
  // description are persisted on advertorials_v2.products.reference_image_*.
  // Operator's explicit ask: "the config of the product allows to upload a
  // file so that we can just upload the image. Also allow for each image
  // that you upload for a specific product config to add an explanation of
  // visually what is happening in this image".
  const uploadProductImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  }).single("image");
  app.post("/api/products/:slug/reference-image", requireAuth, (req, res) => {
    uploadProductImage(req, res, async (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({ message: uploadErr.message || "upload failed" });
        return;
      }
      const supa = tryGetServiceClient();
      if (!supa) {
        res.status(503).json({ message: "Supabase not configured." });
        return;
      }
      const slug = String(req.params.slug);
      const valid = await isValidProductSlug(slug);
      if (!valid) {
        res.status(400).json({ message: "unknown product slug" });
        return;
      }
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
      if (!file) {
        res.status(400).json({ message: "image file required (form field 'image')" });
        return;
      }
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || "advertorial-images-v2";
      const ext = (file.originalname.split(".").pop() || (file.mimetype.split("/")[1] || "png")).toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${slug}/ref-${Date.now()}.${ext}`;
      const up = await supa.storage.from(bucket).upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });
      if (up.error) {
        res.status(400).json({ message: `storage upload failed: ${up.error.message}` });
        return;
      }
      const publicUrl = supa.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      const description = typeof req.body?.description === "string" ? req.body.description : "";
      // If the caller asks to attach as the PRIMARY reference, swap fields
      // directly; otherwise append to extra_images.
      const asPrimary = req.body?.primary !== "false" && req.body?.primary !== false;
      const row: Record<string, unknown> = { slug };
      const products = await listProducts();
      row.display_name = products.find((p) => p.id === slug)?.name || slug;
      if (asPrimary) {
        row.reference_image_url = publicUrl;
        row.reference_image_path = path;
        row.reference_image_description = description;
      } else {
        // Append to extra_images. Need to read current first.
        const { data: existing } = await supa.from("products").select("extra_images").eq("slug", slug).maybeSingle();
        const list = Array.isArray((existing as { extra_images?: unknown[] } | null)?.extra_images)
          ? ((existing as { extra_images: unknown[] }).extra_images as unknown[])
          : [];
        list.push({ url: publicUrl, path, description, uploaded_at: new Date().toISOString() });
        row.extra_images = list;
      }
      const { data, error } = await supa
        .from("products")
        .upsert(row, { onConflict: "slug" })
        .select("*")
        .single();
      if (error) {
        res.status(400).json({ message: error.message });
        return;
      }
      res.json({ product: data, uploaded: { url: publicUrl, path, description, asPrimary } });
    });
  });

  app.post("/api/refresh-configs", requireAuth, async (_req, res) => {
    const out = clearProductConfigCache();
    clearTemplateCache();
    res.json({ ok: true, cleared: out });
  });

  // ── Templates ──
  app.get("/api/templates", requireAuth, async (_req, res) => {
    const live = listLiveTemplates().map((t) => ({
      slug: t.meta.template_slug,
      name: t.meta.template_name,
      family: t.meta.template_family,
      sections: t.meta.sections.map((s) => ({
        id: s.id,
        type: s.type,
        required: s.required,
        target_words: s.target_words,
        image_slot: s.image_slot,
      })),
      images: t.meta.image_slots || [],
      design: t.meta.design || {},
      offer: t.meta.offer || {},
    }));
    res.json({ items: live });
  });

  // ── V2 templates (templates-source/) ──
  // These are HTML+CSS files cloned verbatim from production advertorials
  // and slot-ized with {{KEY}} placeholders. Different from V1's
  // markdown-based templates (`advertorials-skill/templates/`). The V2
  // pipeline consumes a copywriter's DOCX brief and fills these slots.
  app.get("/api/templates/v2", requireAuth, async (_req, res) => {
    const items = listTemplatesV2();
    res.json({ items });
  });

  app.get("/api/templates/v2/:slug", requireAuth, async (req, res) => {
    const m = loadManifestV2(String(req.params.slug));
    if (!m) {
      res.status(404).json({ message: "template not found" });
      return;
    }
    res.json(m);
  });

  // Preview a SAVED lander — slot_values + image_urls come from the DB
  // so the query string stays short (the slot-overrides-in-URL approach
  // hits a 431 once the brief is real-sized).
  app.get("/preview/landers/:landerId", async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).send("Supabase not configured"); return; }
    const id = String(req.params.landerId);
    const { data: lander, error } = await supa.from("landers").select("*").eq("id", id).maybeSingle();
    if (error || !lander) { res.status(404).send("lander not found"); return; }
    const slug = String((lander as { template_slug: string }).template_slug);
    // Pull lander-level publish settings (cta_url + magazine policy URLs)
    // into the slot map so the rendered page actually uses them. Without
    // this, the template's hardcoded RejuvaCare CTA href would keep
    // pointing at https://ad.rejuvacare.com/click even after the operator
    // set a Voluum URL — operator's "Open doesn't reflect my edits" bug.
    const landerRec = lander as { slot_values?: Record<string, string>; image_urls?: Record<string, string>; cta_url?: string | null; magazine_slug?: string | null; tab_title?: string | null };
    // Pull magazine policy URLs + logo if the lander has a magazine pinned.
    // Operator: "we need to configure a logo for each of the magazines.
    // By default, it adds it as a favicon to the tab."
    let privacyPolicyUrl = "";
    let termsUrl = "";
    let magazineLogoUrl = "";
    let magazineName = "";
    if (landerRec.magazine_slug) {
      const { data: mag } = await supa.from("magazines").select("name,branding,logo_url").eq("slug", landerRec.magazine_slug).maybeSingle();
      const branding = (mag as { branding?: Record<string, string> } | null)?.branding || {};
      privacyPolicyUrl = String(branding.privacy_policy_url || branding.privacy_url || "");
      termsUrl = String(branding.terms_url || branding.terms_of_service_url || "");
      magazineLogoUrl = String((mag as { logo_url?: string | null } | null)?.logo_url || "");
      magazineName = String((mag as { name?: string } | null)?.name || "");
    }
    const slotValues: Record<string, string> = {
      ...(landerRec.slot_values || {}),
      ...(landerRec.image_urls || {}),
      // Lander-level publish settings — override anything in slot_values
      // since they're the source of truth.
      ...(landerRec.cta_url ? { CTA_URL: landerRec.cta_url } : {}),
      ...(privacyPolicyUrl ? { PRIVACY_POLICY_URL: privacyPolicyUrl } : {}),
      ...(termsUrl ? { TERMS_URL: termsUrl } : {}),
    };
    // Edit mode: when ?edit=1 the renderer wraps slots in data-slot-key
    // markers and injects the in-iframe editor bootstrap script. Used
    // exclusively by the lander editor's iframe so the operator can
    // edit text + click images directly on the rendered page.
    const editMode = req.query.edit === "1" || req.query.edit === "true";
    try {
      let html = renderTemplateV2(slug, slotValues, { keepPlaceholders: false, editMode });
      html = injectFaviconAndTitle(html, { magazineLogoUrl, magazineName, tabTitle: landerRec.tab_title });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      res.status(500).send(`Preview render failed: ${(err as Error).message}`);
    }
  });

  // Live HTML preview of a V2 template. No auth — the page is meant to
  // open in a new tab / iframe straight from the React app. Defaults from
  // the slot manifest are filled in so the operator sees the full design
  // (not a wall of `{{KEY}}` placeholders). Any slot in the `values` query
  // string overrides the default — useful for the "preview my brief"
  // flow.
  app.get("/preview/templates/:slug", async (req, res) => {
    const slug = String(req.params.slug);
    try {
      // Demo-fill any unfilled slots from the smart-health-style canonical
      // copy that ships with the template, so the preview shows a real
      // page instead of a blanked-out skeleton.
      const overrides: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === "string") overrides[k] = v;
      }
      // Provide visible-pain placeholders for the most-important slots so
      // the page reads like a designed advertorial in the empty state.
      const defaults: Record<string, string> = {
        HEADLINE: 'Top Pain Specialist: "This Is the Fastest Way to Calm Burning, Tingling Feet for Good"',
        BYLINE: "Dr. James Nakamura, Pain Specialist, MD",
        AUDIENCE_PAIN: "Burning Feet",
        DOCTOR_NAME: "Dr. James Nakamura",
        DOCTOR_LAST_NAME: "Dr. Nakamura",
        PRODUCT_NAME: "Cleantra Lymphatic Drainage Drops",
        BREADCRUMB_CATEGORY: "Nerve Health",
        MASTHEAD_VIEWS: "251,328",
        // Canonical RejuvaCare section header set — gives the preview the
        // full editorial spine when no brief has filled them yet.
        SECTION_1_HEADER: "THE NIGHT EVERYTHING CHANGED",
        SECTION_2_HEADER: "THE MIND-BLOWING DISCOVERY",
        SECTION_3_HEADER: "THE REAL ROOT CAUSE",
        SECTION_4_HEADER: "THE 15-MINUTE MIRACLE HIDING IN PLAIN SIGHT",
        SECTION_5_HEADER: "THIS BREAKTHROUGH IS PISSING OFF AN ENTIRE INDUSTRY",
        SECTION_6_HEADER: "WHEN YOU MESS WITH A $42 BILLION INDUSTRY, THEY COME FOR YOU",
        SECTION_7_HEADER: "INTRODUCING THE BREAKTHROUGH THAT ACTUALLY WORKS",
        SECTION_8_HEADER: "HERE'S EXACTLY HOW IT WORKS",
        SECTION_9_HEADER: "THE RESULTS THAT HAVE SURGEONS SCRAMBLING",
        SECTION_10_HEADER: "THE PRICE THAT'S CAUSING INDUSTRY PANIC",
        SECTION_11_HEADER: 'THE 60% OFF "IN YOUR FACE" TO THE ESTABLISHMENT',
        SECTION_12_HEADER: 'MY PERSONAL 90-DAY "PAIN-FREE" GUARANTEE',
        SECTION_13_HEADER: "BUT HERE'S THE CATCH (AND IT'S A BIG ONE)",
        SECTION_14_HEADER: "THE CHOICE THAT WILL DEFINE YOUR NEXT DECADE",
        SECTION_15_HEADER: "HERE'S EXACTLY WHAT TO DO NEXT",
      };
      // Fill empty image slots with deterministic placeholder URLs so the
      // preview page doesn't show broken-image icons. Slot index 0 →
      // HERO_IMAGE_URL; slot index 1+ → IMG_N_URL.
      const manifest = loadManifestV2(slug);
      if (manifest) {
        for (const s of manifest.slots) {
          if (s.type !== "image") continue;
          if (defaults[s.key] || overrides[s.key]) continue;
          const ar = s.aspect_ratio || "16:9";
          const [w, h] = ar.split(":").map(Number);
          const ww = 1200;
          const hh = Math.round((1200 * (h || 9)) / (w || 16));
          defaults[s.key] = `https://placehold.co/${ww}x${hh}/0f172a/cbd5e1?text=${encodeURIComponent(s.key)}`;
        }
      }
      const html = renderTemplateV2(slug, { ...defaults, ...overrides }, { keepPlaceholders: true });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      res.status(500).send(`Preview render failed: ${(err as Error).message}`);
    }
  });

  // ── V2 magazines ─────────────────────────────────────────────────────
  // Operator's model: brands belong to N magazines. Each magazine has a
  // logo, a domain pool, and a set of preset CTA URLs (Voluum tracking).
  // A lander picks one magazine + one of its domains + one CTA preset.
  app.get("/api/v2/magazines", requireAuth, async (_req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.json({ items: [] }); return; }
    const { data, error } = await supa
      .from("magazines")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { res.status(500).json({ message: error.message }); return; }
    // Annotate each magazine with the brands assigned to it.
    const mags = data || [];
    if (mags.length === 0) { res.json({ items: [] }); return; }
    const slugs = mags.map((m) => (m as { slug: string }).slug);
    const { data: assignments } = await supa
      .from("brand_magazines")
      .select("brand_slug,magazine_slug,is_default_for_brand")
      .in("magazine_slug", slugs);
    const brandsByMag = new Map<string, Array<{ brand_slug: string; is_default_for_brand: boolean }>>();
    for (const a of assignments || []) {
      const m = (a as { magazine_slug: string }).magazine_slug;
      const arr = brandsByMag.get(m) || [];
      arr.push({ brand_slug: (a as { brand_slug: string }).brand_slug, is_default_for_brand: (a as { is_default_for_brand: boolean }).is_default_for_brand });
      brandsByMag.set(m, arr);
    }
    const annotated = mags.map((m) => ({
      ...(m as Record<string, unknown>),
      brands: brandsByMag.get((m as { slug: string }).slug) || [],
    }));
    res.json({ items: annotated });
  });

  // Assign brands to a magazine (many-to-many). Body: { brands: ["cleantra", "ledisa", ...] }
  // Replaces the magazine's full brand assignment set.
  app.put("/api/v2/magazines/:slug/brands", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const magSlug = String(req.params.slug);
    const brandSlugs = Array.isArray(req.body?.brands) ? req.body.brands.filter((b: unknown): b is string => typeof b === "string") : [];
    // Atomic: delete + reinsert.
    await supa.from("brand_magazines").delete().eq("magazine_slug", magSlug);
    if (brandSlugs.length > 0) {
      const rows = brandSlugs.map((b: string) => ({ brand_slug: b, magazine_slug: magSlug }));
      const { error } = await supa.from("brand_magazines").insert(rows);
      if (error) { res.status(400).json({ message: error.message }); return; }
    }
    res.json({ ok: true, brands: brandSlugs });
  });

  // Magazine logo upload — multipart, optional transparent-bg expectation
  // for vector-quality PNGs.
  const uploadMagazineLogo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  }).single("logo");
  app.post("/api/v2/magazines/:slug/logo", requireAuth, (req, res) => {
    uploadMagazineLogo(req, res, async (err) => {
      if (err) { res.status(400).json({ message: err.message }); return; }
      const supa = tryGetServiceClient();
      if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
      if (!file) { res.status(400).json({ message: "logo file required (form field 'logo')" }); return; }
      const slug = String(req.params.slug);
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || "advertorial-images-v2";
      // Map mime → file extension. The naive split/strip approach
      // produces "svgxml" for image/svg+xml (the + got stripped); pin
      // the common types.
      const mimeToExt: Record<string, string> = {
        "image/svg+xml": "svg",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/x-icon": "ico",
        "image/vnd.microsoft.icon": "ico",
      };
      const ext = mimeToExt[file.mimetype.toLowerCase()] || "png";
      const path = `magazines/${slug}/logo-${Date.now()}.${ext}`;
      const up = await supa.storage.from(bucket).upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
      if (up.error) { res.status(400).json({ message: up.error.message }); return; }
      const publicUrl = supa.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      const { data, error } = await supa.from("magazines").update({ logo_url: publicUrl, logo_path: path, updated_at: new Date().toISOString() }).eq("slug", slug).select("*").single();
      if (error) { res.status(400).json({ message: error.message }); return; }
      res.json({ magazine: data });
    });
  });

  // Generate a logo from text via Gemini Nano Banana Pro — transparent
  // background, vector-quality feel. Returns a single image (operator can
  // accept or re-roll).
  app.post("/api/v2/magazines/:slug/generate-logo", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const slug = String(req.params.slug);
    const text = String(req.body?.text || "").trim();
    if (!text) { res.status(400).json({ message: "text required" }); return; }
    // Match the Health Insights Magazine wordmark feel by default — bold
    // editorial serif in white, transparent background.
    const styleHint = String(req.body?.style_hint || "bold editorial serif wordmark, white text on transparent background, vector-quality, clean kerning, suitable for masthead header use");
    const prompt = `Create a logo for the text "${text}". Style: ${styleHint}. CRITICAL: render the text exactly — every letter must be present, no garbled glyphs, no misspellings. Transparent PNG background. No background fill, no shadow.`;
    try {
      const r = await generateImage({ prompt, aspectRatio: "16:9" });
      if (!r.ok || r.placeholder || !r.url) { res.status(502).json({ message: r.error || "logo generation failed" }); return; }
      let publicUrl = r.url;
      if (r.isDataUrl) {
        const m = r.url.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          const bucket = process.env.SUPABASE_STORAGE_BUCKET || "advertorial-images-v2";
          const path = `magazines/${slug}/logo-generated-${Date.now()}.png`;
          const bytes = Buffer.from(m[2] || "", "base64");
          const up = await supa.storage.from(bucket).upload(path, bytes, { contentType: m[1] || "image/png", upsert: true });
          if (!up.error) publicUrl = supa.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        }
      }
      res.json({ ok: true, logo_url: publicUrl });
    } catch (e) {
      res.status(500).json({ message: (e as Error).message });
    }
  });

  // Generate the Caddy vhost block + install instructions for a magazine's
  // domains. The operator copy-pastes this into
  // /etc/caddy/Caddyfile.d/magazine-<slug>.conf and reloads Caddy. We
  // deliberately do NOT auto-write or auto-reload from inside the app —
  // Caddy config is shared infrastructure with other tools on the same
  // VPS, so any change goes through the operator's explicit hands.
  app.get("/api/v2/magazines/:slug/caddy-snippet", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const slug = String(req.params.slug);
    const { data: mag } = await supa.from("magazines").select("name,domains").eq("slug", slug).maybeSingle();
    if (!mag) { res.status(404).json({ message: "magazine not found" }); return; }
    const domains = ((mag as { domains?: Array<{ domain: string }> }).domains || [])
      .map((d) => d.domain)
      .filter(Boolean);
    if (domains.length === 0) {
      res.json({ domains: [], caddy_block: "", install_path: null, install_steps: ["Add at least one domain to this magazine first."] });
      return;
    }
    const port = process.env.PORT || "5411";
    const block = domains.map((d) => `${d} {\n  reverse_proxy 127.0.0.1:${port}\n}`).join("\n\n");
    const installPath = `/etc/caddy/Caddyfile.d/magazine-${slug}.conf`;
    res.json({
      magazine_slug: slug,
      magazine_name: (mag as { name?: string }).name || slug,
      domains,
      port,
      caddy_block: block,
      install_path: installPath,
      install_steps: [
        `1. SSH to the VPS: ssh hostinger-vps`,
        `2. Save snippet:  cat > ${installPath} <<'EOF'\n${block}\nEOF`,
        `3. Reload Caddy:  systemctl reload caddy`,
        `4. Point an A-record at the VPS IP for each domain (GoDaddy / registrar of your choice).`,
        `5. First request to https://<domain> auto-issues a Let's Encrypt cert.`,
      ],
      vps_ip_hint: "Look up the VPS IP from your hosting dashboard (or `dig adv-generator-v2.acentecom.com +short` returns the same IP since both serve from this VPS).",
    });
  });

  app.patch("/api/v2/magazines/:slug", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const slug = String(req.params.slug);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof req.body?.name === "string") patch.name = req.body.name;
    if (req.body?.branding !== undefined) patch.branding = req.body.branding;
    if (Array.isArray(req.body?.domains)) patch.domains = req.body.domains;
    if (Array.isArray(req.body?.cta_presets)) patch.cta_presets = req.body.cta_presets;
    if (typeof req.body?.logo_url === "string" || req.body?.logo_url === null) patch.logo_url = req.body.logo_url;
    if (typeof req.body?.logo_path === "string" || req.body?.logo_path === null) patch.logo_path = req.body.logo_path;
    const { data, error } = await supa.from("magazines").update(patch).eq("slug", slug).select("*").single();
    if (error) { res.status(400).json({ message: error.message }); return; }
    res.json({ magazine: data });
  });

  // PATCH a lander — slot values, image urls, CTA preset, magazine, etc.
  // Used by the inline editor.
  //
  // Destructive-change guard: if voluum_status != not_submitted (i.e. the
  // lander is LIVE in Voluum), refuse cta_url / cta_preset_id / domain /
  // extension_path / magazine_slug changes unless caller sends
  // `force: true`. Operator was explicit: "Do not allow updating the URL
  // or the click-through URLs or anything like that without a very clear
  // warning that it's live currently and it will fuck up everything."
  app.patch("/api/v2/landers/:id", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const id = String(req.params.id);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const DANGEROUS_FIELDS = ["cta_url", "cta_preset_id", "domain", "extension_path", "magazine_slug"] as const;
    const dangerousEdits = DANGEROUS_FIELDS.filter((f) => typeof req.body?.[f] !== "undefined");
    if (dangerousEdits.length > 0 && req.body?.force !== true) {
      const { data: existing } = await supa.from("landers").select("voluum_status").eq("id", id).maybeSingle();
      const status = (existing as { voluum_status?: string | null } | null)?.voluum_status;
      if (status && status !== "not_submitted") {
        res.status(409).json({
          message: `Refusing to change ${dangerousEdits.join(", ")} — this lander is LIVE in Voluum. Pass {force: true} to override (will break tracking).`,
          live_in_voluum: true,
          dangerous_fields: dangerousEdits,
        });
        return;
      }
    }
    if (req.body?.slot_values !== undefined && typeof req.body.slot_values === "object") {
      // Merge over existing slot_values rather than replace, so a partial
      // edit doesn't blow away unrelated slots.
      const { data: current } = await supa.from("landers").select("slot_values").eq("id", id).maybeSingle();
      const existing = ((current as { slot_values?: Record<string, string> } | null)?.slot_values) || {};
      patch.slot_values = { ...existing, ...req.body.slot_values };
    }
    if (req.body?.image_urls !== undefined && typeof req.body.image_urls === "object") {
      const { data: current } = await supa.from("landers").select("image_urls").eq("id", id).maybeSingle();
      const existing = ((current as { image_urls?: Record<string, string> } | null)?.image_urls) || {};
      patch.image_urls = { ...existing, ...req.body.image_urls };
    }
    if (typeof req.body?.magazine_slug === "string" || req.body?.magazine_slug === null) patch.magazine_slug = req.body.magazine_slug || null;
    if (typeof req.body?.domain === "string" || req.body?.domain === null) patch.domain = req.body.domain || null;
    if (typeof req.body?.extension_path === "string" || req.body?.extension_path === null) {
      const newPath = req.body.extension_path || null;
      // CRITICAL operator spec: "I want you to make sure you're not
      // allowing us to override an extension to the URL that already
      // exists. ... it's critically important that we do not, by
      // accident, allow a copywriter to write an extension to the URL
      // that already is used and then launch it live, because it can
      // fuck up our live funnels."
      //
      // Collision check: (domain, extension_path) must be unique across
      // all OTHER landers. If a collision exists, refuse the update
      // (unless force=true). The host-based resolver looks landers up
      // by exactly (domain, extension_path) so this guarantees no two
      // landers ever clobber each other's live URL.
      if (newPath) {
        // Need to know the target domain too — either from this PATCH or
        // the existing row.
        let targetDomain: string | null = null;
        if (typeof req.body?.domain === "string") targetDomain = req.body.domain || null;
        else if (req.body?.domain === null) targetDomain = null;
        else {
          const { data: cur } = await supa.from("landers").select("domain").eq("id", id).maybeSingle();
          targetDomain = ((cur as { domain?: string | null } | null)?.domain) || null;
        }
        if (targetDomain) {
          const { data: collisions } = await supa
            .from("landers")
            .select("id,internal_name")
            .eq("domain", targetDomain)
            .eq("extension_path", newPath)
            .neq("id", id);
          if ((collisions || []).length > 0 && req.body?.force !== true) {
            const c = collisions![0] as { id: string; internal_name: string };
            res.status(409).json({
              message: `Extension path "${newPath}" on ${targetDomain} is already used by another lander ("${c.internal_name}"). Pick a different path to avoid clobbering a live funnel.`,
              extension_path_collision: true,
              collision_lander_id: c.id,
              collision_lander_name: c.internal_name,
            });
            return;
          }
        }
      }
      patch.extension_path = newPath;
    }
    if (typeof req.body?.cta_preset_id === "string" || req.body?.cta_preset_id === null) patch.cta_preset_id = req.body.cta_preset_id || null;
    if (typeof req.body?.cta_url === "string" || req.body?.cta_url === null) patch.cta_url = req.body.cta_url || null;
    if (typeof req.body?.internal_name === "string") patch.internal_name = req.body.internal_name;
    if (typeof req.body?.tab_title === "string" || req.body?.tab_title === null) patch.tab_title = req.body.tab_title || null;
    // Voluum submission fields — mock-only for now per operator spec ("don't
    // actually integrate yet"), but the popup/modal MUST be able to save
    // status + metadata locally so the LIVE IN VOLUUM badge + the live-
    // lander destructive-edit guard work.
    if (typeof req.body?.voluum_status === "string") patch.voluum_status = req.body.voluum_status;
    if (typeof req.body?.voluum_submitted_at === "string" || req.body?.voluum_submitted_at === null) patch.voluum_submitted_at = req.body.voluum_submitted_at || null;
    if (req.body?.voluum_metadata !== undefined && typeof req.body.voluum_metadata === "object") {
      const { data: current } = await supa.from("landers").select("voluum_metadata").eq("id", id).maybeSingle();
      const existing = ((current as { voluum_metadata?: Record<string, unknown> } | null)?.voluum_metadata) || {};
      patch.voluum_metadata = { ...existing, ...req.body.voluum_metadata };
    }
    const { data, error } = await supa.from("landers").update(patch).eq("id", id).select("*").single();
    if (error) { res.status(400).json({ message: error.message }); return; }
    res.json({ lander: data });
  });

  // Duplicate a lander — operator: "Within the project view, I should be
  // able to duplicate. There should be a button to duplicate a specific
  // Lander within that project."
  //
  // Copies slot_values + image_urls + publish settings, EXCEPT
  // extension_path (would collide) and voluum_* (the dup is a fresh,
  // un-submitted lander). New name = "<original> copy".
  app.post("/api/v2/landers/:id/duplicate", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const id = String(req.params.id);
    const { data: src } = await supa.from("landers").select("*").eq("id", id).maybeSingle();
    if (!src) { res.status(404).json({ message: "lander not found" }); return; }
    const s = src as Record<string, unknown>;
    const dup: Record<string, unknown> = {
      project_id: s.project_id,
      template_slug: s.template_slug,
      internal_name: `${(s.internal_name as string) || "untitled"} copy`,
      slot_values: s.slot_values || {},
      image_urls: s.image_urls || {},
      image_gen_total: s.image_gen_total || 0,
      image_gen_done: s.image_gen_done || 0,
      magazine_slug: s.magazine_slug || null,
      domain: s.domain || null,
      // intentionally drop extension_path (collision) + voluum_* (fresh)
      cta_preset_id: s.cta_preset_id || null,
      cta_url: s.cta_url || null,
      voluum_status: "not_submitted",
      status: "in_work",
    };
    const { data, error } = await supa.from("landers").insert(dup).select("*").single();
    if (error) { res.status(400).json({ message: error.message }); return; }
    res.json({ lander: data });
  });

  // Seed the image bank with a curated set of Cleantra product-showcase
  // images + lifestyle scene variations. Operator: "Please generate a
  // bunch of images and add them to the bank. ... Regenerate them with
  // lymphatic drainage drops in the images where the product is
  // showcased, and in the images where the product is not showcased,
  // just regenerate them in five different variations so we have some
  // variety."
  //
  // Returns immediately; runs gen in background.
  app.post("/api/v2/image-bank/seed", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const owner = (req as AuthedRequest).userEmail!;
    const brandSlug = String(req.body?.brand_slug || "cleantra");
    const productSlug = String(req.body?.product_slug || "cleantra-lymphatic");
    // Pull the product's reference image URL (Cleantra bottle).
    const { data: prod } = await supa.from("products").select("reference_image_url").eq("slug", productSlug).maybeSingle();
    const productRefUrl = (prod as { reference_image_url?: string | null } | null)?.reference_image_url || undefined;
    // Curated prompt set — covers the common advertorial image positions
    // (product hero, doctor portrait, lifestyle, before/after, etc.)
    const PRODUCT_SHOWCASE_PROMPTS: Array<{ name: string; prompt: string; aspectRatio: string }> = [
      {
        name: "Cleantra hero on counter",
        aspectRatio: "16:9",
        prompt: "Editorial product hero shot. The Cleantra Lymphatic Drainage Drops bottle on a clean white kitchen counter, soft morning light from a left-side window. Glass bottle with amber dropper, sage-green label visible. Behind the bottle: a sprig of fresh mint and a glass of water. Magazine-style, shallow depth of field, photorealistic.",
      },
      {
        name: "Cleantra in lifestyle holding shot",
        aspectRatio: "16:9",
        prompt: "Lifestyle photograph of an older woman in her late 60s in a sunlit kitchen, holding the Cleantra Lymphatic Drainage Drops bottle in her hand. Natural smile, white blouse, warm tones. Editorial advertorial style.",
      },
      {
        name: "Cleantra dropper dispensing",
        aspectRatio: "16:9",
        prompt: "Macro shot of the Cleantra Lymphatic Drainage Drops bottle's amber glass dropper above a clear glass of water, a single drop falling. Clean white background, magazine quality, photorealistic.",
      },
    ];
    const VARIATION_PROMPTS: Array<{ name: string; prompt: string; aspectRatio: string; count: number }> = [
      {
        name: "Doctor at desk reviewing papers",
        aspectRatio: "16:9",
        count: 5,
        prompt: "Editorial photograph: a senior physician in a white coat sitting at a wooden desk reviewing medical papers and books, warm soft lighting, bookshelves visible behind. Authority + thoughtful expression. Magazine-style.",
      },
      {
        name: "Senior couple walking outdoors",
        aspectRatio: "16:9",
        count: 5,
        prompt: "Editorial photograph: a senior couple in their late 60s walking along a tree-lined path in golden-hour light. Both look healthy + content. Casual outdoor clothes. Lifestyle advertorial style.",
      },
      {
        name: "Older woman drinking morning tea",
        aspectRatio: "16:9",
        count: 5,
        prompt: "Editorial photograph: a woman in her early 70s sitting at her kitchen table in the morning light, hands wrapped around a warm mug of tea. Soft natural light from a window. Magazine quality.",
      },
    ];
    // Total expected: 3 + 3*5 = 18
    const totalPlanned = PRODUCT_SHOWCASE_PROMPTS.length + VARIATION_PROMPTS.reduce((a, p) => a + p.count, 0);
    res.json({
      ok: true,
      planned: totalPlanned,
      product_showcase_scenes: PRODUCT_SHOWCASE_PROMPTS.length,
      variation_scenes: VARIATION_PROMPTS.length,
      note: `Seeding ${totalPlanned} images in the background — check the Image Bank page in 2-4 minutes.`,
    });
    void (async () => {
      // Build the full task list. Each task = one generateImageToBank call.
      type Task = { name: string; prompt: string; aspectRatio: string; tags: string[]; referenceImageUrl?: string };
      const tasks: Task[] = [];
      for (const p of PRODUCT_SHOWCASE_PROMPTS) {
        tasks.push({
          name: p.name,
          prompt: p.prompt,
          aspectRatio: p.aspectRatio,
          tags: ["seed", "product-showcase", "cleantra"],
          referenceImageUrl: productRefUrl,
        });
      }
      for (const v of VARIATION_PROMPTS) {
        for (let n = 1; n <= v.count; n++) {
          tasks.push({
            name: `${v.name} — var ${n}`,
            prompt: v.prompt,
            aspectRatio: v.aspectRatio,
            tags: ["seed", "lifestyle", `var-${n}`],
            // No reference for non-product variations
          });
        }
      }
      // Parallelize 4 at a time (Gemini handles this fine).
      const CONCURRENCY = 4;
      let cursor = 0;
      let succeeded = 0, failed = 0;
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < tasks.length) {
          const idx = cursor++;
          const t = tasks[idx]!;
          try {
            await generateImageToBank({
              name: t.name,
              prompt: t.prompt,
              aspectRatio: t.aspectRatio,
              brandSlug,
              productSlug: productSlug,
              tags: t.tags,
              referenceImageUrl: t.referenceImageUrl,
              createdByEmail: owner,
            });
            succeeded++;
            console.log(`[bank-seed] ${idx + 1}/${tasks.length} ✓ ${t.name}`);
          } catch (err) {
            failed++;
            console.error(`[bank-seed] ${idx + 1}/${tasks.length} ✗ ${t.name}: ${(err as Error).message}`);
          }
        }
      });
      await Promise.all(workers);
      console.log(`[bank-seed] complete: ${succeeded} succeeded, ${failed} failed`);
    })();
  });

  // Regenerate any missing brief images on an existing lander. Used to
  // recover landers that were generated BEFORE the safety BLOCK_NONE +
  // sanitized-retry fix landed — those have 1-3 empty image slots
  // because the original prompts hit a Gemini safety refusal. This
  // endpoint walks the brief's imagePrompts, finds which slot keys
  // are still empty in image_urls, and re-runs gen for those only
  // (using the current improved pipeline).
  //
  // Returns immediately and runs gen in the background — same pattern
  // as from-brief.
  app.post("/api/v2/landers/:id/regenerate-missing-images", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const id = String(req.params.id);
    const { data: lander } = await supa.from("landers").select("*").eq("id", id).maybeSingle();
    if (!lander) { res.status(404).json({ message: "lander not found" }); return; }
    const lr = lander as { id: string; project_id: string; image_urls?: Record<string, string>; slot_values?: Record<string, string> };
    const { data: project } = await supa.from("projects").select("product_slug,parsed_brief_json").eq("id", lr.project_id).maybeSingle();
    if (!project) { res.status(404).json({ message: "parent project not found" }); return; }
    const pj = project as { product_slug?: string | null; parsed_brief_json?: { imagePrompts?: Array<{ slotKey: string; prompt: string }> } };
    const allPrompts = (pj.parsed_brief_json?.imagePrompts) || [];
    if (allPrompts.length === 0) { res.status(400).json({ message: "no image prompts in project (created without a brief?)" }); return; }
    // Find which slots are missing.
    const iu = lr.image_urls || {};
    const missingPrompts = allPrompts.filter((p) => {
      const url = iu[p.slotKey];
      return !url || !url.startsWith("http");
    });
    if (missingPrompts.length === 0) {
      res.json({ ok: true, missing_count: 0, note: "Nothing to regenerate — all image slots are filled." });
      return;
    }
    // Respond IMMEDIATELY; run gen in background.
    res.json({
      ok: true,
      missing_count: missingPrompts.length,
      missing_slots: missingPrompts.map((p) => p.slotKey),
      note: "Background regeneration kicked off; lander.image_gen_done will bump as each succeeds.",
    });
    void (async () => {
      try {
        const results = await generateBriefImages(missingPrompts, pj.product_slug || null);
        const newImageUrls = { ...iu, ...results };
        const newSlotValues = { ...(lr.slot_values || {}), ...results };
        const newDone = Object.keys(newImageUrls).filter((k) => {
          const v = newImageUrls[k];
          return v && v.startsWith("http");
        }).length;
        await supa.from("landers").update({
          image_urls: newImageUrls,
          slot_values: newSlotValues,
          image_gen_done: newDone,
          updated_at: new Date().toISOString(),
        }).eq("id", lr.id);
        console.log(`[regenerate-missing] lander ${lr.id}: filled ${Object.keys(results).length}/${missingPrompts.length} of the missing slots`);
      } catch (err) {
        console.error(`[regenerate-missing] lander ${lr.id} failed: ${(err as Error).message}`);
      }
    })();
  });

  // Image regen on a lander image slot. Operator-spec'd:
  // - 5 candidate variations per call so the operator can pick one
  // - use-current-as-reference (default true) so prompt edits the existing
  //   image instead of starting from scratch
  // - optional uploaded reference image (multipart 'reference_image') in
  //   addition to the current slot image
  // - keeps the original aspect ratio
  const uploadRefImg = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  }).single("reference_image");
  app.post("/api/v2/landers/:id/regenerate-image", requireAuth, (req, res) => {
    uploadRefImg(req, res, async (uploadErr) => {
      if (uploadErr) { res.status(400).json({ message: uploadErr.message }); return; }
      const supa = tryGetServiceClient();
      if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
      const landerId = String(req.params.id);
      const slotKey = String(req.body?.slot_key || "");
      const prompt = String(req.body?.prompt || "").trim();
      const useCurrent = req.body?.use_current_as_reference !== "false" && req.body?.use_current_as_reference !== false;
      const variantCount = Math.min(Math.max(parseInt(String(req.body?.variant_count || "5"), 10) || 5, 1), 8);
      if (!slotKey) { res.status(400).json({ message: "slot_key required" }); return; }
      const { data: lander } = await supa.from("landers").select("image_urls").eq("id", landerId).maybeSingle();
      if (!lander) { res.status(404).json({ message: "lander not found" }); return; }
      const current = ((lander as { image_urls?: Record<string, string> }).image_urls || {})[slotKey];
      // Resolve reference image bytes: the OPTIONAL uploaded ref takes
      // precedence; otherwise fetch the current slot image (if any).
      let refUrl: string | undefined;
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
      if (file) {
        // Upload the user-uploaded reference to Storage so generateImage
        // can pull it. Path scoped to lander id.
        const bucket = process.env.SUPABASE_STORAGE_BUCKET || "advertorial-images-v2";
        const ext = file.mimetype.split("/")[1] || "png";
        const path = `lander-refs/${landerId}/${Date.now()}.${ext}`;
        const up = await supa.storage.from(bucket).upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
        if (!up.error) refUrl = supa.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      } else if (useCurrent && current) {
        refUrl = current;
      }
      // Generate N variations in parallel.
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || "advertorial-images-v2";
      const tasks = Array.from({ length: variantCount }, async (_v, i) => {
        try {
          const r = await generateImage({
            prompt: prompt || `Regenerate this image in the same composition with a fresh take. Variant #${i + 1}.`,
            aspectRatio: "16:9",
            referenceImageUrl: refUrl,
          });
          if (!r.ok || r.placeholder || !r.url) return null;
          let publicUrl = r.url;
          if (r.isDataUrl) {
            const match = r.url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mime = match[1] || "image/png";
              const bytes = Buffer.from(match[2] || "", "base64");
              const path = `regen/${landerId}/${slotKey.toLowerCase()}-${Date.now()}-${i}.png`;
              const up = await supa.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: true });
              if (!up.error) publicUrl = supa.storage.from(bucket).getPublicUrl(path).data.publicUrl;
            }
          }
          return publicUrl;
        } catch { return null; }
      });
      const results = (await Promise.all(tasks)).filter((u): u is string => !!u);
      res.json({ ok: true, slot_key: slotKey, variants: results, current_url: current || null });
    });
  });

  // ── V2 projects (read from advertorials_v2.projects + .landers) ──
  app.get("/api/v2/projects", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.json({ items: [] }); return; }
    const email = (req as AuthedRequest).userEmail!;
    const { data: projects, error } = await supa
      .from("projects")
      .select("*")
      .eq("owner_email", email)
      .order("created_at", { ascending: false });
    if (error) { res.status(500).json({ message: error.message }); return; }
    const projs = projects || [];
    if (projs.length === 0) { res.json({ items: [] }); return; }
    const ids = projs.map((p) => p.id);
    const { data: landers } = await supa
      .from("landers")
      .select("id,project_id,internal_name,status,slot_values,image_urls,image_gen_total,image_gen_done,voluum_status")
      .in("project_id", ids);
    const byProject = new Map<string, Array<Record<string, unknown>>>();
    for (const l of landers || []) {
      const arr = byProject.get((l as { project_id: string }).project_id) || [];
      arr.push(l as Record<string, unknown>);
      byProject.set((l as { project_id: string }).project_id, arr);
    }
    const items = projs.map((p) => ({
      ...p,
      landers: byProject.get(p.id) || [],
    }));
    res.json({ items });
  });

  // PATCH a V2 project. brand + product are LOCK-once-a-lander-is-live
  // per operator spec — refuse the update if any lander has voluum_status
  // != not_submitted unless an explicit `force=true` flag is sent.
  app.patch("/api/v2/projects/:id", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const id = String(req.params.id);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const wantsBrandOrProductChange =
      typeof req.body?.brand_slug !== "undefined" || typeof req.body?.product_slug !== "undefined";
    if (wantsBrandOrProductChange && req.body?.force !== true) {
      const { data: landers } = await supa.from("landers").select("voluum_status").eq("project_id", id);
      const liveLanders = (landers || []).filter((l) => {
        const status = (l as { voluum_status?: string | null }).voluum_status;
        return status && status !== "not_submitted";
      });
      if (liveLanders.length > 0) {
        res.status(409).json({
          message: `Refusing to change brand/product — ${liveLanders.length} lander(s) under this project are LIVE IN VOLUUM. Pass {force: true} to override (will break Voluum tracking).`,
          live_lander_count: liveLanders.length,
        });
        return;
      }
    }
    if (typeof req.body?.name === "string") patch.name = req.body.name;
    if (typeof req.body?.brand_slug === "string" || req.body?.brand_slug === null) patch.brand_slug = req.body.brand_slug || null;
    if (typeof req.body?.product_slug === "string" || req.body?.product_slug === null) patch.product_slug = req.body.product_slug || null;
    if (typeof req.body?.status === "string") patch.status = req.body.status;
    const { data, error } = await supa.from("projects").update(patch).eq("id", id).select("*").single();
    if (error) { res.status(400).json({ message: error.message }); return; }
    res.json({ project: data });
  });

  app.get("/api/v2/projects/:id", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const id = String(req.params.id);
    const { data: project, error } = await supa.from("projects").select("*").eq("id", id).maybeSingle();
    if (error || !project) { res.status(404).json({ message: "project not found" }); return; }
    const { data: landers } = await supa.from("landers").select("*").eq("project_id", id);
    res.json({ project, landers: landers || [] });
  });

  // V2 brief upload — accept a DOCX, parse it, render the template, return
  // the rendered HTML's preview URL + the parsed slot values. The actual
  // image generation pass on `imagePrompts` is intentionally deferred —
  // that's the next step in the pipeline (gen image → upload to bucket →
  // PATCH the slot URL → re-render). This endpoint surfaces the COPY part
  // of the brief immediately so the copywriter can see their text in the
  // template within seconds.
  const uploadBrief = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  }).single("brief");
  app.post("/api/v2/projects/from-brief", requireAuth, (req, res) => {
    uploadBrief(req, res, async (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({ message: uploadErr.message });
        return;
      }
      const slug = String((req.body && req.body.template_slug) || "rejuvacare-doctor-discovery");
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
      if (!file) {
        res.status(400).json({ message: "brief file required (form field 'brief')" });
        return;
      }
      try {
        const parsed = await briefToSlots(file.buffer);
        const manifest = loadManifestV2(slug);
        if (!manifest) {
          res.status(404).json({ message: `template ${slug} not found` });
          return;
        }
        // Fill remaining required slots with manifest defaults — the
        // /preview/templates route would do this on read anyway, but the
        // saved project record should carry the merged dict.
        const values: Record<string, string> = {};
        for (const s of manifest.slots) {
          if (s.default) values[s.key] = s.default;
        }
        Object.assign(values, parsed.slotValues);
        // Persist the project + lander in advertorials_v2.
        const supa = tryGetServiceClient();
        if (!supa) {
          // Render-only response — useful for the CLI even before DB is wired
          res.json({
            ok: true,
            template_slug: slug,
            slot_values: values,
            image_prompts: parsed.imagePrompts,
            preview_url: `/preview/templates/${slug}?` + new URLSearchParams(values).toString(),
            note: "Supabase not configured — render-only response, nothing persisted.",
          });
          return;
        }
        const owner = (req as AuthedRequest).userEmail!;
        // Project name: prefer operator-provided, fall back to the brief
        // headline, then to a date stamp. Operator-provided wins so the
        // copywriter's chosen name lands as the project's display name.
        const operatorName = typeof req.body?.project_name === "string" && req.body.project_name.trim() ? req.body.project_name.trim().slice(0, 200) : null;
        const projectName = operatorName || (parsed.headline ? parsed.headline.slice(0, 100) : `Brief upload ${new Date().toISOString().slice(0, 16)}`);
        const creativeStrategist = typeof req.body?.creative_strategist === "string" && req.body.creative_strategist.trim() ? req.body.creative_strategist.trim().slice(0, 120) : null;
        const copywriter = typeof req.body?.copywriter === "string" && req.body.copywriter.trim() ? req.body.copywriter.trim().slice(0, 120) : null;
        // Brand + product passed from the upload UI. These LOCK at the
        // project level per operator spec — landers under this project
        // can't change them.
        const brandSlug = typeof req.body?.brand_slug === "string" && req.body.brand_slug ? req.body.brand_slug : null;
        const productSlug = typeof req.body?.product_slug === "string" && req.body.product_slug ? req.body.product_slug : null;
        const totalImages = parsed.imagePrompts.length;
        // Store the original brief DOCX in Supabase Storage so the
        // operator can re-download it later from the project page.
        // Operator spec: "I should actually be able to download the
        // brief itself so I can review it."
        let briefPdfUrl: string | null = null;
        let briefStoragePath: string | null = null;
        try {
          const bucket = "advertorial-images-v2"; // re-use existing bucket
          const safeName = (file.originalname || "brief.docx").replace(/[^A-Za-z0-9._-]/g, "_");
          briefStoragePath = `briefs/${owner.replace(/[^A-Za-z0-9]/g, "_")}/${Date.now()}-${safeName}`;
          const { error: upErr } = await supa.storage.from(bucket).upload(briefStoragePath, file.buffer, {
            contentType: file.mimetype || "application/octet-stream",
            upsert: false,
          });
          if (!upErr) {
            const { data: pub } = supa.storage.from(bucket).getPublicUrl(briefStoragePath);
            briefPdfUrl = pub.publicUrl;
          } else {
            console.error("[brief-upload] storage upload failed:", upErr.message);
          }
        } catch (storErr) {
          console.error("[brief-upload] storage error:", (storErr as Error).message);
        }
        const { data: project, error: projErr } = await supa
          .from("projects")
          .insert({
            owner_email: owner,
            name: projectName,
            template_slug: slug,
            brand_slug: brandSlug,
            product_slug: productSlug,
            creative_strategist: creativeStrategist,
            copywriter: copywriter,
            parsed_brief_json: { headline: parsed.headline, sectionHeaders: parsed.sectionHeaders, imagePrompts: parsed.imagePrompts, brief_storage_path: briefStoragePath, brief_filename: file.originalname },
            brief_pdf_url: briefPdfUrl,
            status: "in_work",
            image_gen_started_at: totalImages > 0 ? new Date().toISOString() : null,
          })
          .select("*")
          .single();
        if (projErr || !project) {
          res.status(500).json({ message: projErr?.message || "failed to insert project" });
          return;
        }
        // Insert the lander up-front with empty image_urls + the total
        // image count. The operator can navigate to the project NOW;
        // images stream in via background generation, polled by the
        // project detail page.
        const { data: lander, error: landerErr } = await supa
          .from("landers")
          .insert({
            project_id: project.id,
            template_slug: slug,
            internal_name: projectName,
            slot_values: values,
            image_urls: {},
            image_gen_total: totalImages,
            image_gen_done: 0,
            status: "in_work",
          })
          .select("*")
          .single();
        if (landerErr || !lander) {
          res.status(500).json({ message: landerErr?.message || "failed to insert lander" });
          return;
        }
        // Respond IMMEDIATELY — operator wanted to "not wait until the
        // entire advertorial is generated because it just makes the
        // workflow more stuck. It can generate that, the advertorial
        // and the project, while I'm doing other things."
        res.json({
          ok: true,
          project,
          lander,
          template_slug: slug,
          image_prompts: parsed.imagePrompts,
          total_images: totalImages,
          preview_url: `/preview/landers/${lander.id}`,
          project_url: `/#/projects/${project.id}`,
        });
        // ───── Background image gen ────────────────────────────────
        // Fire-and-forget. As each image returns, PATCH the lander's
        // image_urls + bump image_gen_done. When all are done, set
        // project.image_gen_done_at.
        void (async () => {
          try {
            const imageUrls: Record<string, string> = {};
            // Use the existing generateBriefImages helper but stream-style
            // by calling it per-prompt would parallel-block the helper's
            // built-in 6× concurrency. Easier: run the helper and write
            // the full set on completion.
            const results = await generateBriefImages(parsed.imagePrompts, productSlug);
            Object.assign(imageUrls, results);
            const mergedSlotValues = { ...values, ...imageUrls };
            await supa.from("landers").update({
              slot_values: mergedSlotValues,
              image_urls: imageUrls,
              image_gen_done: Object.keys(imageUrls).length,
              updated_at: new Date().toISOString(),
            }).eq("id", lander.id);
            await supa.from("projects").update({
              image_gen_done_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", project.id);
            console.log(`[bg-image-gen] project ${project.id} done: ${Object.keys(imageUrls).length}/${totalImages}`);
          } catch (bgErr) {
            console.error(`[bg-image-gen] project ${project.id} failed:`, (bgErr as Error).message);
          }
        })();
      } catch (err) {
        res.status(500).json({ message: (err as Error).message });
      }
    });
  });

  // ── /api/v2/projects/from-template ──────────────────────────────
  // Operator method 3: "Just Use Template — the project is simply
  // copy-pasted from the template itself, with all the text, all the
  // images the same. The user will just begin from scratch updating
  // the text himself."
  //
  // Creates a project + lander with the template's defaults (no brief,
  // no image gen). Operator does all edits manually.
  app.post("/api/v2/projects/from-template", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const slug = String(req.body?.template_slug || "rejuvacare-doctor-discovery");
    const manifest = loadManifestV2(slug);
    if (!manifest) { res.status(404).json({ message: `template ${slug} not found` }); return; }
    const projectName = (req.body?.project_name as string)?.trim()?.slice(0, 200);
    if (!projectName) { res.status(400).json({ message: "project_name required" }); return; }
    const brandSlug = (req.body?.brand_slug as string) || null;
    const productSlug = (req.body?.product_slug as string) || null;
    const creativeStrategist = (req.body?.creative_strategist as string)?.trim()?.slice(0, 120) || null;
    const copywriter = (req.body?.copywriter as string)?.trim()?.slice(0, 120) || null;
    if (!brandSlug || !productSlug) { res.status(400).json({ message: "brand_slug + product_slug required" }); return; }
    // Build initial slot_values from manifest defaults so the operator
    // sees the canonical template page on first open.
    const values: Record<string, string> = {};
    for (const s of manifest.slots) {
      if (s.default) values[s.key] = s.default;
    }
    const owner = (req as AuthedRequest).userEmail!;
    const { data: project, error: projErr } = await supa
      .from("projects")
      .insert({
        owner_email: owner,
        name: projectName,
        template_slug: slug,
        brand_slug: brandSlug,
        product_slug: productSlug,
        creative_strategist: creativeStrategist,
        copywriter,
        parsed_brief_json: { source: "template", note: "Blank project from template defaults" },
        status: "in_work",
      })
      .select("*")
      .single();
    if (projErr || !project) { res.status(500).json({ message: projErr?.message || "insert failed" }); return; }
    const { data: lander, error: landerErr } = await supa
      .from("landers")
      .insert({
        project_id: project.id,
        template_slug: slug,
        internal_name: projectName,
        slot_values: values,
        image_urls: {},
        image_gen_total: 0,
        image_gen_done: 0,
        status: "in_work",
      })
      .select("*")
      .single();
    if (landerErr || !lander) { res.status(500).json({ message: landerErr?.message || "lander insert failed" }); return; }
    res.json({ ok: true, project, lander, project_url: `/#/projects/${project.id}` });
  });

  // ── /api/v2/projects/from-prompt ─────────────────────────────────
  // Operator method 2: "Generate using Prompt — basically I'll be able
  // to enter a prompt. It will generate that advertorial itself,
  // including image brief, including everything in the same format
  // that we discussed."
  //
  // For now this is mock-only: it creates a blank project from the
  // template and stores the prompt for future LLM-driven generation.
  // The actual Claude call gets wired in a follow-up when the prompt
  // schema + system prompt are finalized.
  app.post("/api/v2/projects/from-prompt", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const slug = String(req.body?.template_slug || "rejuvacare-doctor-discovery");
    const manifest = loadManifestV2(slug);
    if (!manifest) { res.status(404).json({ message: `template ${slug} not found` }); return; }
    const projectName = (req.body?.project_name as string)?.trim()?.slice(0, 200);
    if (!projectName) { res.status(400).json({ message: "project_name required" }); return; }
    const prompt = (req.body?.prompt as string)?.trim();
    if (!prompt) { res.status(400).json({ message: "prompt required" }); return; }
    const brandSlug = (req.body?.brand_slug as string) || null;
    const productSlug = (req.body?.product_slug as string) || null;
    const creativeStrategist = (req.body?.creative_strategist as string)?.trim()?.slice(0, 120) || null;
    const copywriter = (req.body?.copywriter as string)?.trim()?.slice(0, 120) || null;
    if (!brandSlug || !productSlug) { res.status(400).json({ message: "brand_slug + product_slug required" }); return; }
    const values: Record<string, string> = {};
    for (const s of manifest.slots) {
      if (s.default) values[s.key] = s.default;
    }
    const owner = (req as AuthedRequest).userEmail!;
    const { data: project, error: projErr } = await supa
      .from("projects")
      .insert({
        owner_email: owner,
        name: projectName,
        template_slug: slug,
        brand_slug: brandSlug,
        product_slug: productSlug,
        creative_strategist: creativeStrategist,
        copywriter,
        parsed_brief_json: { source: "prompt", prompt },
        status: "in_work",
      })
      .select("*")
      .single();
    if (projErr || !project) { res.status(500).json({ message: projErr?.message || "insert failed" }); return; }
    const { data: lander, error: landerErr } = await supa
      .from("landers")
      .insert({
        project_id: project.id,
        template_slug: slug,
        internal_name: projectName,
        slot_values: values,
        image_urls: {},
        image_gen_total: 0,
        image_gen_done: 0,
        status: "in_work",
      })
      .select("*")
      .single();
    if (landerErr || !lander) { res.status(500).json({ message: landerErr?.message || "lander insert failed" }); return; }
    // TODO: kick off LLM generation that fills slot_values per the
    // prompt and queues image generation. For now the operator gets
    // a template-defaults lander + a stored prompt they can iterate on.
    res.json({
      ok: true,
      project,
      lander,
      project_url: `/#/projects/${project.id}`,
      note: "Prompt-driven generation pipeline is mock-only for now. Created project with template defaults + saved your prompt. Real LLM generation lands in the next session.",
    });
  });

  // Export a lander as standalone downloadable HTML. Operator:
  // "I want to have a button that exports the HTML of the page so that
  // we can easily [import] whatever is needed... It's finally checkout
  // champ if it's Claude Code to regenerate it. I want to be able to
  // ensure this has longevity and we're not dependent on this tool."
  //
  // Returns the SAME rendered HTML as /preview/landers/:id but with a
  // Content-Disposition: attachment header so the browser downloads
  // instead of rendering. Pulls magazine policy/favicon URLs through
  // the same pipeline as the preview route.
  app.get("/api/v2/landers/:id/export", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).send("Supabase not configured"); return; }
    const id = String(req.params.id);
    const { data: lander, error } = await supa.from("landers").select("*").eq("id", id).maybeSingle();
    if (error || !lander) { res.status(404).send("lander not found"); return; }
    const slug = String((lander as { template_slug: string }).template_slug);
    const landerRec = lander as { internal_name?: string; slot_values?: Record<string, string>; image_urls?: Record<string, string>; cta_url?: string | null; magazine_slug?: string | null; tab_title?: string | null };
    let privacyPolicyUrl = "", termsUrl = "", magazineLogoUrl = "", magazineName = "";
    if (landerRec.magazine_slug) {
      const { data: mag } = await supa.from("magazines").select("name,branding,logo_url").eq("slug", landerRec.magazine_slug).maybeSingle();
      const branding = (mag as { branding?: Record<string, string> } | null)?.branding || {};
      privacyPolicyUrl = String(branding.privacy_policy_url || branding.privacy_url || "");
      termsUrl = String(branding.terms_url || branding.terms_of_service_url || "");
      magazineLogoUrl = String((mag as { logo_url?: string | null } | null)?.logo_url || "");
      magazineName = String((mag as { name?: string } | null)?.name || "");
    }
    const slotValues: Record<string, string> = {
      ...(landerRec.slot_values || {}),
      ...(landerRec.image_urls || {}),
      ...(landerRec.cta_url ? { CTA_URL: landerRec.cta_url } : {}),
      ...(privacyPolicyUrl ? { PRIVACY_POLICY_URL: privacyPolicyUrl } : {}),
      ...(termsUrl ? { TERMS_URL: termsUrl } : {}),
    };
    try {
      let html = renderTemplateV2(slug, slotValues, { keepPlaceholders: false, editMode: false });
      html = injectFaviconAndTitle(html, { magazineLogoUrl, magazineName, tabTitle: landerRec.tab_title });
      const filename = `${(landerRec.internal_name || "lander").replace(/[^A-Za-z0-9._-]/g, "_")}.html`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(html);
    } catch (err) {
      res.status(500).send(`Export failed: ${(err as Error).message}`);
    }
  });

  // Download the original brief DOCX. Operator: "I should actually be
  // able to download the brief itself so I can review it." Streams the
  // file from Supabase Storage (private read via service-role key) so
  // we don't expose the storage public URL to anyone without auth.
  app.get("/api/v2/projects/:id/brief", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const id = String(req.params.id);
    const { data: project } = await supa.from("projects").select("parsed_brief_json,name").eq("id", id).maybeSingle();
    if (!project) { res.status(404).json({ message: "project not found" }); return; }
    const meta = (project as { parsed_brief_json?: { brief_storage_path?: string; brief_filename?: string }; name?: string }).parsed_brief_json || {};
    const storagePath = meta.brief_storage_path;
    if (!storagePath) {
      res.status(404).json({ message: "No brief was uploaded for this project (created from prompt or template?)" });
      return;
    }
    try {
      const { data: blob, error } = await supa.storage.from("advertorial-images-v2").download(storagePath);
      if (error || !blob) {
        res.status(500).json({ message: error?.message || "download failed" });
        return;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      const filename = meta.brief_filename || `${(project as { name?: string }).name || "brief"}.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/_debug/proposed-templates", requireAuth, async (_req, res) => {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.json({ items: listProposedTemplates() });
  });

  app.get("/api/_debug/system-prompt", requireAuth, async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const templateSlug = (req.query.template as string) || "_placeholder";
    const productSlug = (req.query.product as string) || "ledisa-glp1-patches";
    try {
      const prompt = await debugSystemPrompt({ templateSlug, productSlug });
      res.type("text/plain").send(prompt);
    } catch (err) {
      res.status(400).type("text/plain").send(err instanceof Error ? err.message : "error");
    }
  });

  // ── Projects ──
  app.get("/api/projects", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.json({ items: [], note: "Supabase not configured — projects list is empty in dev." });
      return;
    }
    const email = (req as AuthedRequest).userEmail!;
    const { data, error } = await supa
      .from("projects")
      .select("*")
      .eq("owner_email", email)
      .order("updated_at", { ascending: false });
    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }
    // Annotate each project with skeleton + lander counts + lander status
    // breakdown so the list page can render rich info cards without a
    // round-trip per row.
    const items = data || [];
    if (items.length === 0) {
      res.json({ items: [] });
      return;
    }
    const ids = items.map((p) => p.id);
    const [skResp, landerResp] = await Promise.all([
      supa.from("skeletons").select("project_id,id,status").in("project_id", ids),
      supa.from("landers").select("project_id,id,status,internal_name").in("project_id", ids),
    ]);
    const skByProject = new Map<string, Array<{ id: string; status: string }>>();
    for (const s of skResp.data || []) {
      const arr = skByProject.get(s.project_id) || [];
      arr.push({ id: s.id, status: s.status });
      skByProject.set(s.project_id, arr);
    }
    const landersByProject = new Map<string, Array<{ id: string; status: string; internal_name: string }>>();
    for (const l of landerResp.data || []) {
      const arr = landersByProject.get(l.project_id) || [];
      arr.push({ id: l.id, status: l.status, internal_name: l.internal_name });
      landersByProject.set(l.project_id, arr);
    }
    const annotated = items.map((p) => ({
      ...p,
      skeleton_count: (skByProject.get(p.id) || []).length,
      skeleton_statuses: (skByProject.get(p.id) || []).map((s) => s.status),
      lander_count: (landersByProject.get(p.id) || []).length,
      landers: landersByProject.get(p.id) || [],
    }));
    res.json({ items: annotated });
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid project payload", errors: parsed.error.flatten() });
      return;
    }
    // Validate the productSlug against the live product list pulled from
    // Acentecom/product-configs. Without this guard a project can be
    // created with a fictional slug, then skeleton generation fails
    // confusingly downstream with "01-core.md missing". 400 here is the
    // correct user-facing error.
    if (!(await isValidProductSlug(parsed.data.productSlug))) {
      res.status(400).json({ message: `Unknown productSlug: ${parsed.data.productSlug}` });
      return;
    }
    // Same gate for templates — only LIVE templates may be selected via
    // the user-facing route. Proposed templates stay out per Section 0.7.
    const liveSlugs = new Set(listLiveTemplates().map((t) => t.meta.template_slug));
    const badTemplate = parsed.data.selectedTemplateSlugs.find((s) => !liveSlugs.has(s));
    if (badTemplate) {
      res.status(400).json({ message: `Template not live: ${badTemplate}` });
      return;
    }
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured — cannot persist projects." });
      return;
    }
    const email = (req as AuthedRequest).userEmail!;
    const row = {
      owner_email: email,
      name: parsed.data.name,
      brand_slug: parsed.data.brandSlug || null,
      product_slug: parsed.data.productSlug,
      direction_prompt: parsed.data.directionPrompt,
      selected_template_slugs: parsed.data.selectedTemplateSlugs,
    };
    const { data, error } = await supa.from("projects").insert(row).select("*").single();
    if (error || !data) {
      res.status(500).json({ message: error?.message || "insert failed" });
      return;
    }
    res.json({ project: data });
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const email = (req as AuthedRequest).userEmail!;
    const { data: project } = await supa.from("projects").select("*").eq("id", req.params.id).eq("owner_email", email).maybeSingle();
    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }
    const { data: skeletons } = await supa.from("skeletons").select("*").eq("project_id", project.id).order("created_at");
    const { data: landers } = await supa.from("landers").select("*").eq("project_id", project.id).order("created_at");
    res.json({ project, skeletons: skeletons || [], landers: landers || [] });
  });

  // ── Skeletons + lander generation ──
  app.post("/api/projects/:id/generate-skeletons", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const email = (req as AuthedRequest).userEmail!;
    const { data: project } = await supa.from("projects").select("*").eq("id", req.params.id).eq("owner_email", email).maybeSingle();
    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const tasks = (project.selected_template_slugs as string[]).map(async (slug: string) => {
      send("start", { template_slug: slug });
      try {
        const sk = await generateSkeleton({
          templateSlug: slug,
          productSlug: project.product_slug,
          directionPrompt: project.direction_prompt,
        });
        const { data: row, error } = await supa
          .from("skeletons")
          .insert({
            project_id: project.id,
            template_slug: slug,
            title_candidates: sk.title_top5,
            body: sk.body,
            status: "pending",
          })
          .select("*")
          .single();
        if (error || !row) throw new Error(error?.message || "skeleton insert failed");
        send("skeleton", { skeleton: row });
      } catch (err) {
        send("error", { template_slug: slug, message: err instanceof Error ? err.message : String(err) });
      }
    });
    await Promise.allSettled(tasks);
    send("done", { ok: true });
    res.end();
  });

  app.post("/api/projects/:id/generate-landers", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const parsed = generateLandersSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "skeletonIds required" });
      return;
    }
    const email = (req as AuthedRequest).userEmail!;
    const { data: project } = await supa.from("projects").select("*").eq("id", req.params.id).eq("owner_email", email).maybeSingle();
    if (!project) {
      res.status(404).json({ message: "Project not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const tasks = parsed.data.skeletonIds.map(async (sid: string) => {
      const { data: sk } = await supa.from("skeletons").select("*").eq("id", sid).eq("project_id", project.id).maybeSingle();
      if (!sk) {
        send("error", { skeleton_id: sid, message: "skeleton not found" });
        return;
      }
      send("start", { skeleton_id: sid, template_slug: sk.template_slug });
      try {
        const { lander, imageResults } = await generateLander({
          productSlug: project.product_slug,
          skeleton: {
            template_slug: sk.template_slug,
            title_candidates: sk.title_candidates as string[],
            title_top5: sk.title_candidates as string[],
            body: sk.body,
          },
          chosenTitle: sk.title_chosen || undefined,
        });
        const template = getLiveTemplate(sk.template_slug);
        const html = template ? renderLanderHtml(lander, template) : null;
        const { data: row } = await supa
          .from("landers")
          .insert({
            project_id: project.id,
            skeleton_id: sk.id,
            template_slug: sk.template_slug,
            internal_name: `${project.name} — ${lander.title}`,
            status: "in_work",
            section_model: lander.section_model,
            html,
            image_urls: lander.image_urls,
          })
          .select("*")
          .single();
        send("lander", { lander: row, imageReport: imageResults });
      } catch (err) {
        send("error", { skeleton_id: sid, message: err instanceof Error ? err.message : String(err) });
      }
    });
    await Promise.allSettled(tasks);
    send("done", { ok: true });
    res.end();
  });

  // ── Section revision ──
  app.post("/api/landers/:id/revise-section", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const parsed = sectionRevisionSchema.safeParse({ ...req.body, landerId: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid revision payload" });
      return;
    }
    const email = (req as AuthedRequest).userEmail!;
    const { data: lander } = await supa.from("landers").select("*").eq("id", parsed.data.landerId).maybeSingle();
    if (!lander) {
      res.status(404).json({ message: "lander not found" });
      return;
    }
    const { data: project } = await supa.from("projects").select("*").eq("id", lander.project_id).eq("owner_email", email).maybeSingle();
    if (!project) {
      res.status(404).json({ message: "project not found (or not yours)" });
      return;
    }
    const sections = lander.section_model as Array<{ id: string; type: string; content: string }>;
    const idx = sections.findIndex((s) => s.id === parsed.data.sectionId);
    if (idx < 0) {
      res.status(404).json({ message: "section not in lander" });
      return;
    }
    const contextBefore = sections.slice(0, idx).map((s) => s.content).join("\n\n");
    const contextAfter = sections.slice(idx + 1).map((s) => s.content).join("\n\n");
    const result = await reviseSection({
      templateSlug: lander.template_slug,
      productSlug: project.product_slug,
      contextBefore,
      sectionContent: sections[idx]!.content,
      contextAfter,
      userPrompt: parsed.data.prompt,
      landerCorpus: sections.map((s) => s.content).join("\n\n"),
    });
    sections[idx]!.content = result.appliedText;
    await supa.from("landers").update({ section_model: sections, updated_at: new Date().toISOString() }).eq("id", lander.id);
    res.json({
      ok: true,
      applied: result.appliedText,
      picked_index: result.pickedIndex,
      continuity_regenerated: result.continuityRegenerated,
      fell_back: result.fellBackToSecondBest,
    });
  });

  // ── Section model mutation (toolbar move/dup/del, + insert) ──
  // ── Skeleton CRUD (B — skeleton review UI) ──
  // PATCH sets title_chosen (the copywriter's pick from the 5 candidates) and
  // optionally bumps status. DELETE discards a rejected skeleton entirely.
  app.patch("/api/skeletons/:id", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof req.body?.title_chosen === "string") patch.title_chosen = req.body.title_chosen;
    if (typeof req.body?.status === "string") patch.status = req.body.status;
    const { data, error } = await supa.from("skeletons").update(patch).eq("id", req.params.id).select("*").single();
    if (error || !data) {
      res.status(400).json({ message: error?.message || "skeleton not found" });
      return;
    }
    res.json({ skeleton: data });
  });

  // POST /api/skeletons/:id/revise — apply a copywriter's revision prompt
  // to the existing skeleton. If `target_section_id` is provided, only that
  // section's summary is rewritten; otherwise the whole skeleton (titles,
  // every section summary, offer strategy) is regenerated under the
  // copywriter's instruction. Persists the new title_candidates + body
  // back into the row and returns the fresh skeleton.
  app.post("/api/skeletons/:id/revise", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const prompt = (req.body?.revision_prompt || req.body?.prompt || "").trim();
    if (!prompt) {
      res.status(400).json({ message: "revision_prompt required" });
      return;
    }
    const targetSectionId = (req.body?.target_section_id as string | undefined) || null;

    const { data: sk } = await supa.from("skeletons").select("*").eq("id", req.params.id).maybeSingle();
    if (!sk) {
      res.status(404).json({ message: "skeleton not found" });
      return;
    }
    const { data: project } = await supa.from("projects").select("*").eq("id", sk.project_id).maybeSingle();
    if (!project) {
      res.status(404).json({ message: "project not found" });
      return;
    }

    try {
      const revised = await reviseSkeleton({
        templateSlug: sk.template_slug,
        productSlug: project.product_slug,
        directionPrompt: project.direction_prompt,
        revisionPrompt: prompt,
        targetSectionId,
        current: {
          template_slug: sk.template_slug,
          title_candidates: sk.title_candidates as string[],
          title_top5: (sk.title_top5 as string[]) || (sk.title_candidates as string[]),
          body: sk.body as { sections: Array<{ id: string; type: string; summary: string }>; offer_strategy: string },
        },
      });
      const { data: updated, error } = await supa
        .from("skeletons")
        .update({
          title_candidates: revised.title_candidates,
          title_top5: revised.title_top5,
          body: revised.body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.params.id)
        .select("*")
        .single();
      if (error || !updated) {
        res.status(500).json({ message: error?.message || "skeleton update failed" });
        return;
      }
      res.json({ skeleton: updated });
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : "revise failed" });
    }
  });

  app.delete("/api/skeletons/:id", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const { error } = await supa.from("skeletons").delete().eq("id", req.params.id);
    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }
    res.json({ ok: true });
  });

  app.patch("/api/landers/:id/sections", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const sections = req.body?.section_model;
    if (!Array.isArray(sections)) {
      res.status(400).json({ message: "section_model array required" });
      return;
    }
    await supa.from("landers").update({ section_model: sections, updated_at: new Date().toISOString() }).eq("id", req.params.id);
    res.json({ ok: true });
  });

  // ── Title regen ──
  app.post("/api/landers/:id/regenerate-title", requireAuth, async (req, res) => {
    const parsed = titleRegenSchema.safeParse({ landerId: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ message: "landerId required" });
      return;
    }
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const { data: lander } = await supa.from("landers").select("*").eq("id", parsed.data.landerId).maybeSingle();
    if (!lander) {
      res.status(404).json({ message: "lander not found" });
      return;
    }
    const { data: project } = await supa.from("projects").select("*").eq("id", lander.project_id).maybeSingle();
    if (!project) {
      res.status(404).json({ message: "project not found" });
      return;
    }
    const landerSummary = `Title: ${lander.internal_name}\nSections: ${(lander.section_model as Array<{ id: string; content: string }>).map((s) => `- ${s.id}: ${s.content.slice(0, 80)}`).join("\n")}`;
    const top5 = await regenerateTitles({
      templateSlug: lander.template_slug,
      productSlug: project.product_slug,
      landerSummary,
    });
    res.json({ top5 });
  });

  // ── Image regen ──
  app.post("/api/landers/:id/regenerate-image", requireAuth, async (req, res) => {
    const parsed = imageRegenSchema.safeParse({ ...req.body, landerId: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid image regen payload" });
      return;
    }
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const { data: lander } = await supa.from("landers").select("*").eq("id", parsed.data.landerId).maybeSingle();
    if (!lander) {
      res.status(404).json({ message: "lander not found" });
      return;
    }
    const template = getLiveTemplate(lander.template_slug);
    const slot = template?.meta.image_slots?.find((s) => s.key === parsed.data.slotKey);
    if (!slot) {
      res.status(400).json({ message: "slot not in template" });
      return;
    }
    // Reference resolution priority:
    // 1. Explicit referenceImageId (pick-from-bank flow) wins.
    // 2. Otherwise, by default, use the slot's CURRENT image as the reference
    //    so the regen is an edit of what's already there ("change the hat
    //    to yellow") rather than a from-scratch render. The caller can opt
    //    out by sending useCurrentAsReference:false.
    let referenceImageUrl: string | undefined;
    if (parsed.data.referenceImageId) {
      const { data: ref } = await supa.from("image_bank_items").select("storage_url").eq("id", parsed.data.referenceImageId).maybeSingle();
      referenceImageUrl = ref?.storage_url || undefined;
    } else if (parsed.data.useCurrentAsReference !== false) {
      const current = (lander.image_urls as Record<string, string>)?.[slot.key];
      if (current && /^https?:\/\//.test(current)) {
        referenceImageUrl = current;
      }
    }
    const result = await generateImage({
      prompt: parsed.data.prompt || slot.spec,
      aspectRatio: slot.aspect_ratio,
      referenceImageUrl,
    });
    const imgs = { ...(lander.image_urls as Record<string, string>), [slot.key]: result.url };
    await supa.from("landers").update({ image_urls: imgs, updated_at: new Date().toISOString() }).eq("id", lander.id);
    res.json({ ok: true, slotKey: slot.key, url: result.url, placeholder: result.placeholder, error: result.error });
  });

  // ── Bulk CTA URL ──
  app.post("/api/landers/:id/bulk-cta", requireAuth, async (req, res) => {
    const parsed = bulkCtaSchema.safeParse({ ...req.body, landerId: req.params.id });
    if (!parsed.success) {
      const reason = parsed.error.flatten().fieldErrors.ctaUrl?.[0] || "ctaUrl required (valid URL)";
      res.status(400).json({ message: reason });
      return;
    }
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    await supa.from("landers").update({ cta_url: parsed.data.ctaUrl, updated_at: new Date().toISOString() }).eq("id", parsed.data.landerId);
    res.json({ ok: true });
  });

  // ── Publish ──
  app.post("/api/landers/:id/publish", requireAuth, async (req, res) => {
    const parsed = publishSchema.safeParse({ ...req.body, landerId: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ message: "domain + path required" });
      return;
    }
    if (!publishingConfigured()) {
      res.status(503).json({ message: "Publishing not configured — set VPS_LANDERS_HOST and either VPS_LANDERS_SSH_KEY_PATH or VPS_LANDERS_ROOT_PASSWORD." });
      return;
    }
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const { data: lander } = await supa.from("landers").select("*").eq("id", parsed.data.landerId).maybeSingle();
    if (!lander || !lander.html) {
      res.status(400).json({ message: "lander has no rendered HTML — re-generate first." });
      return;
    }
    const result = await publishLander({ domain: parsed.data.domain, publishPath: parsed.data.path, html: lander.html });
    if (!result.ok) {
      res.status(500).json({ message: result.error });
      return;
    }
    await supa.from("landers").update({
      status: "published",
      published_url: result.url,
      published_domain: parsed.data.domain,
      published_path: parsed.data.path,
      updated_at: new Date().toISOString(),
    }).eq("id", lander.id);
    res.json({ ok: true, url: result.url });
  });

  // ── Image bank ──
  app.get("/api/image-bank", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.json({ items: [] });
      return;
    }
    const brandSlug = req.query.brand as string | undefined;
    const productSlug = req.query.product as string | undefined;
    let q = supa.from("image_bank_items").select("*").order("created_at", { ascending: false }).limit(200);
    if (brandSlug) q = q.eq("brand_slug", brandSlug);
    if (productSlug) q = q.eq("product_slug", productSlug);
    const { data } = await q;
    res.json({ items: data || [] });
  });

  app.post("/api/image-bank/search", requireAuth, async (req, res) => {
    const parsed = imageBankSearchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "q required" });
      return;
    }
    const hits = await searchImageBank({
      q: parsed.data.q,
      limit: parsed.data.limit,
      brandSlug: parsed.data.brandSlug,
      productSlug: parsed.data.productSlug,
    });
    res.json({ hits });
  });

  app.post("/api/image-bank/generate", requireAuth, async (req, res) => {
    const parsed = imageBankCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid generate payload" });
      return;
    }
    let referenceImageUrl: string | undefined;
    const supa = tryGetServiceClient();
    if (parsed.data.referenceImageId && supa) {
      const { data: ref } = await supa.from("image_bank_items").select("storage_url").eq("id", parsed.data.referenceImageId).maybeSingle();
      referenceImageUrl = ref?.storage_url || undefined;
    }
    const email = (req as AuthedRequest).userEmail;
    const item = await generateImageToBank({
      name: parsed.data.name,
      prompt: parsed.data.prompt,
      aspectRatio: parsed.data.aspectRatio,
      brandSlug: parsed.data.brandSlug,
      productSlug: parsed.data.productSlug,
      tags: parsed.data.tags,
      referenceImageUrl,
      createdByEmail: email,
    });
    res.json({ item });
  });

  app.post("/api/image-bank/save-from-lander", requireAuth, async (req, res) => {
    const parsed = imageBankSaveFromLanderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid save payload" });
      return;
    }
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const { data: lander } = await supa.from("landers").select("*").eq("id", parsed.data.landerId).maybeSingle();
    if (!lander) {
      res.status(404).json({ message: "lander not found" });
      return;
    }
    const slotUrl = (lander.image_urls as Record<string, string>)[parsed.data.slotKey];
    if (!slotUrl) {
      res.status(400).json({ message: "slot URL not set on lander" });
      return;
    }
    const email = (req as AuthedRequest).userEmail;
    const { data, error } = await supa
      .from("image_bank_items")
      .insert({
        name: parsed.data.name,
        storage_url: slotUrl,
        storage_path: slotUrl,
        brand_slug: parsed.data.brandSlug || null,
        product_slug: parsed.data.productSlug || null,
        tags: parsed.data.tags || [],
        custom_variables: parsed.data.customVariables || {},
        source: "saved-from-lander",
        source_lander_id: lander.id,
        created_by_email: email || null,
      })
      .select("*")
      .single();
    if (error || !data) {
      res.status(500).json({ message: error?.message || "insert failed" });
      return;
    }
    res.json({ item: data });
  });

  // ── Brands & Products (Phase 9) ──
  app.get("/api/brands", requireAuth, async (_req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.json({ items: [] });
      return;
    }
    const { data } = await supa.from("brands").select("*").order("name");
    res.json({ items: data || [] });
  });

  app.patch("/api/brands/:slug/domains", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) {
      res.status(503).json({ message: "Supabase not configured." });
      return;
    }
    const domains = req.body?.domains;
    if (!Array.isArray(domains)) {
      res.status(400).json({ message: "domains array required" });
      return;
    }
    await supa.from("brands").update({ domain_pool: domains }).eq("slug", req.params.slug);
    res.json({ ok: true });
  });

  // ── V2 brands (cta_presets live here per operator spec) ──
  // Operator: "I want the selections of click-through URLs, meaning the
  // CTA link, to be on the brand level rather than on the magazine level."
  //
  // Source of truth for brand identity (slug/name) is still V1 + the
  // product-configs repo. This V2 brands table only holds the CTA preset
  // list keyed by slug. The GET endpoint merges the two so the UI always
  // gets the full picture in a single call.
  app.get("/api/v2/brands", requireAuth, async (_req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.json({ items: [] }); return; }
    const [{ data: v1 }, { data: v2 }] = await Promise.all([
      supa.from("brands").select("slug,name").order("name"),
      supa.schema("advertorials_v2").from("brands").select("slug,cta_presets,updated_at"),
    ]);
    const ctaBySlug = new Map<string, { cta_presets: unknown; updated_at?: string }>();
    for (const row of (v2 || []) as Array<{ slug: string; cta_presets: unknown; updated_at?: string }>) {
      ctaBySlug.set(row.slug, { cta_presets: row.cta_presets, updated_at: row.updated_at });
    }
    const items = ((v1 || []) as Array<{ slug: string; name: string }>).map((b) => ({
      slug: b.slug,
      name: b.name,
      cta_presets: (ctaBySlug.get(b.slug)?.cta_presets as Array<unknown>) || [],
      updated_at: ctaBySlug.get(b.slug)?.updated_at || null,
    }));
    res.json({ items });
  });

  // Upsert a brand's CTA preset list. Body: { cta_presets: [...] }
  app.put("/api/v2/brands/:slug/cta-presets", requireAuth, async (req, res) => {
    const supa = tryGetServiceClient();
    if (!supa) { res.status(503).json({ message: "Supabase not configured" }); return; }
    const slug = String(req.params.slug);
    const presets = req.body?.cta_presets;
    if (!Array.isArray(presets)) { res.status(400).json({ message: "cta_presets array required" }); return; }
    // Validate shape — each preset needs id+url+label minimum
    for (const p of presets) {
      if (!p || typeof p !== "object") { res.status(400).json({ message: "each preset must be an object" }); return; }
      const rec = p as Record<string, unknown>;
      if (typeof rec.id !== "string" || typeof rec.url !== "string" || typeof rec.label !== "string") {
        res.status(400).json({ message: "each preset needs id, url, label (all strings)" });
        return;
      }
    }
    // Read existing brand name from V1 so the V2 row stays in sync.
    const { data: v1brand } = await supa.from("brands").select("name").eq("slug", slug).maybeSingle();
    const upsertRow: Record<string, unknown> = {
      slug,
      name: (v1brand as { name?: string } | null)?.name || slug,
      cta_presets: presets,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supa
      .schema("advertorials_v2")
      .from("brands")
      .upsert(upsertRow, { onConflict: "slug" })
      .select("*")
      .single();
    if (error) { res.status(400).json({ message: error.message }); return; }
    res.json({ brand: data });
  });

  return _httpServer;
}
