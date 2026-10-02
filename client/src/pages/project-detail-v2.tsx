/**
 * /projects/:id — V2-aware project detail.
 *
 * Loads /api/v2/projects/:id first. If the project exists in
 * advertorials_v2.projects (= it was created from a brief upload), this
 * page renders:
 *   - Brief metadata: headline, section header count, image count
 *   - The lander card: preview iframe + Open Preview button (opens
 *     /preview/templates/<slug>?<slot_values> in a new tab)
 *   - Image generation status: how many slots filled, which prompts ran
 *
 * If the project ISN'T in advertorials_v2.* (= it's a legacy V1 project),
 * we fall back to V1's ProjectDetailPage.
 *
 * This replaces the V1 component on the same route so V2 projects don't
 * land on a blank V1 detail page anymore.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { apiFetch, getToken } from "../lib/queryClient";
import { ExternalLink, ImageIcon, Loader2, FileText, Pencil, Send, Lock, Copy, Download } from "lucide-react";
import V1ProjectDetailPage from "./project-detail";

interface V2Lander {
  id: string;
  project_id: string;
  template_slug: string;
  internal_name: string;
  status: string;
  slot_values: Record<string, string>;
  image_urls: Record<string, string>;
  magazine_slug?: string | null;
  domain?: string | null;
  extension_path?: string | null;
  cta_url?: string | null;
  cta_preset_id?: string | null;
  voluum_status?: string | null;
  voluum_metadata?: Record<string, string> | null;
  image_gen_total?: number;
  image_gen_done?: number;
}

interface V2Project {
  id: string;
  name: string;
  template_slug: string;
  brand_slug?: string | null;
  product_slug?: string | null;
  creative_strategist?: string | null;
  copywriter?: string | null;
  image_gen_started_at?: string | null;
  image_gen_done_at?: string | null;
  parsed_brief_json: {
    headline?: string;
    sectionHeaders?: string[];
    imagePrompts?: Array<{ slotKey: string; prompt: string }>;
  } | null;
  status: string;
  created_at: string;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "v2"; project: V2Project; landers: V2Lander[] }
  | { kind: "not-v2" }
  | { kind: "error"; message: string };

export default function ProjectDetailRouter() {
  const { id } = useParams();
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let pollTimer: number | null = null;

    async function fetchOnce(): Promise<boolean> {
      // returns true if we should keep polling, false to stop.
      try {
        const res = await apiFetch<{ project: V2Project; landers: V2Lander[] }>(
          `/api/v2/projects/${id}`,
        );
        if (cancelled) return false;
        if (res?.project) {
          setState({ kind: "v2", project: res.project, landers: res.landers || [] });
          // Keep polling while images are still being generated in the
          // background (image_gen_done_at not set + at least one lander
          // has image_gen_total > image_gen_done).
          const anyPending = (res.landers || []).some(
            (l) => (l.image_gen_total || 0) > (l.image_gen_done || 0),
          );
          const inFlight = !res.project.image_gen_done_at && anyPending;
          return inFlight;
        }
        setState({ kind: "not-v2" });
        return false;
      } catch (err) {
        if (cancelled) return false;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("project not found") || msg.includes("404")) {
          setState({ kind: "not-v2" });
          return false;
        }
        setState({ kind: "error", message: msg });
        return false;
      }
    }

    async function loop() {
      const keepGoing = await fetchOnce();
      if (cancelled || !keepGoing) return;
      pollTimer = window.setTimeout(loop, 3000);
    }

    void loop();
    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearTimeout(pollTimer);
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <div className="px-8 py-12 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading project…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="px-8 py-6 text-sm text-destructive">Failed to load project: {state.message}</div>
    );
  }

  if (state.kind === "not-v2") {
    return <V1ProjectDetailPage />;
  }

  const { project, landers } = state;
  const imagePrompts = project.parsed_brief_json?.imagePrompts || [];
  const sectionHeaders = project.parsed_brief_json?.sectionHeaders || [];

  return (
    <div className="px-8 py-6 space-y-6">
      <div>
        <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground">
          ← projects
        </Link>
        <h1 className="mt-1 text-xl font-semibold leading-tight">{project.name}</h1>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono">
            template: {project.template_slug}
          </span>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">{project.status}</span>
          <ProjectBrandProductChip project={project} onUpdate={(p) => setState((s) => s.kind === "v2" ? { ...s, project: p } : s)} />
          {project.creative_strategist && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5" title="Creative strategist">
              strat: {project.creative_strategist}
            </span>
          )}
          {project.copywriter && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5" title="Copywriter">
              writer: {project.copywriter}
            </span>
          )}
          <span>{new Date(project.created_at).toLocaleString()}</span>
        </div>
        {/* Background image-gen banner — visible while images stream in */}
        {(() => {
          const totalRequested = landers.reduce((acc, l) => acc + (l.image_gen_total || 0), 0);
          const totalDone = landers.reduce((acc, l) => acc + (l.image_gen_done || 0), 0);
          const inFlight = !project.image_gen_done_at && totalRequested > totalDone;
          if (!inFlight) return null;
          const pct = totalRequested > 0 ? Math.round((totalDone / totalRequested) * 100) : 0;
          return (
            <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900 text-[12px] flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">Generating images — {totalDone}/{totalRequested} ({pct}%)</div>
                <div className="text-[10.5px] opacity-80">
                  You can edit copy + settings now. Images will populate automatically; this page polls every 3s.
                </div>
              </div>
              <div className="w-32 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                <div className="h-full bg-amber-600 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Landers in this project ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Landers ({landers.length})
          </div>
          <div className="text-[11px] text-muted-foreground">brand + product are locked at project level</div>
        </div>
        <div className="space-y-3">
          {landers.map((l) => (
            <LanderRow
              key={l.id}
              projectId={project.id}
              project={project}
              lander={l}
              onUpdate={(u) => {
                setState((s) => s.kind === "v2" ? { ...s, landers: s.landers.map((x) => x.id === u.id ? u : x) } : s);
              }}
              onDuplicated={(newLander) => {
                setState((s) => s.kind === "v2" ? { ...s, landers: [...s.landers, newLander] } : s);
              }}
            />
          ))}
        </div>
      </section>

      <div className="adv-card p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <FileText className="size-3" /> Brief detected — {sectionHeaders.length} sections, {imagePrompts.length} image prompts
          </div>
          <BriefDownloadButton projectId={project.id} />
        </div>
        <div className="text-xs">
          <strong>Headline:</strong> {project.parsed_brief_json?.headline || "(none)"}
        </div>
        {sectionHeaders.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Section list</summary>
            <ol className="mt-1 space-y-0.5">
              {sectionHeaders.map((s, i) => (
                <li key={i} className="text-[11px]"><span className="font-mono text-muted-foreground mr-1">{i + 1}.</span>{s}</li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </div>
  );
}

function ProjectBrandProductChip({
  project,
  onUpdate,
}: {
  project: V2Project;
  onUpdate: (p: V2Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [brandSlug, setBrandSlug] = useState(project.brand_slug || "");
  const [productSlug, setProductSlug] = useState(project.product_slug || "");
  const [brands, setBrands] = useState<Array<{ slug: string; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; brand_slug?: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [b, p] = await Promise.all([
        apiFetch<{ items: Array<{ slug: string; name: string }> }>("/api/brands").catch(() => ({ items: [] })),
        apiFetch<{ items: Array<{ id: string; name: string; brand_slug?: string | null }> }>("/api/products").catch(() => ({ items: [] })),
      ]);
      setBrands(b.items || []);
      setProducts(p.items || []);
    })();
  }, [open]);

  async function save(force = false) {
    setBusy(true);
    try {
      const r = await fetch(`/api/v2/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("advgen.token") || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ brand_slug: brandSlug || null, product_slug: productSlug || null, ...(force ? { force: true } : {}) }),
      });
      if (r.status === 409) {
        const data = await r.json().catch(() => ({}));
        const ok = window.confirm(
          `⚠️ ${data.live_lander_count || 0} lander(s) under this project are LIVE IN VOLUUM. Changing brand/product will break tracking. Force the change anyway?`,
        );
        if (ok) return save(true);
        return;
      }
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = await r.json();
      onUpdate(data.project);
      setOpen(false);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 font-mono hover:bg-primary/20"
        title="Click to edit brand/product (warns if any lander is LIVE IN VOLUUM)"
      >
        <Lock className="size-2.5" />
        {project.brand_slug || "no brand"} / {project.product_slug || "no product"}
        <Pencil className="size-2.5" />
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 bg-card border rounded-full pl-2 pr-1 py-0.5">
      <select className="text-[11px] bg-transparent border-0 outline-none" value={brandSlug} onChange={(e) => { setBrandSlug(e.target.value); setProductSlug(""); }}>
        <option value="">— brand —</option>
        {brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
      </select>
      <select className="text-[11px] bg-transparent border-0 outline-none" value={productSlug} onChange={(e) => setProductSlug(e.target.value)}>
        <option value="">— product —</option>
        {products.filter((p) => !brandSlug || p.brand_slug === brandSlug).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button className="adv-btn text-[10px] py-0 px-2" disabled={busy} onClick={() => void save()}>
        {busy ? "…" : "Save"}
      </button>
      <button className="text-[10px] text-muted-foreground px-1" onClick={() => { setOpen(false); setBrandSlug(project.brand_slug || ""); setProductSlug(project.product_slug || ""); }}>
        Cancel
      </button>
    </div>
  );
}

function LanderRow({
  projectId,
  project,
  lander,
  onUpdate,
  onDuplicated,
}: {
  projectId: string;
  project: V2Project;
  lander: V2Lander;
  onUpdate: (l: V2Lander) => void;
  onDuplicated: (l: V2Lander) => void;
}) {
  const previewUrl = `/preview/landers/${lander.id}`;
  const imageCount = Object.keys(lander.image_urls || {}).length;
  const isLive = lander.voluum_status && lander.voluum_status !== "not_submitted";
  const [voluumOpen, setVoluumOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const meta = (lander as { voluum_metadata?: Record<string, string> }).voluum_metadata || {};
  const voluumLanderId = meta.voluum_lander_id || "";
  const syncStatus = meta.sync_status || (isLive ? "linked" : "");

  async function duplicate() {
    setDuplicating(true);
    try {
      const r = await apiFetch<{ lander: V2Lander }>(`/api/v2/landers/${lander.id}/duplicate`, { method: "POST" });
      onDuplicated(r.lander);
    } catch (err) {
      alert(`Duplicate failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <div className="adv-card overflow-hidden">
      <div className="flex">
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="block relative w-56 shrink-0 aspect-[16/9] bg-muted/30 overflow-hidden group">
          <iframe
            src={previewUrl}
            title={lander.internal_name}
            className="absolute inset-0 w-[2200px] h-[1200px] origin-top-left pointer-events-none border-0"
            style={{ transform: "scale(0.1)", transformOrigin: "top left" }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
        </a>
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold truncate">{lander.internal_name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono">{lander.template_slug}</span>
                {(lander.image_gen_total || 0) > (lander.image_gen_done || 0) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">
                    <Loader2 className="size-2.5 animate-spin" />
                    {lander.image_gen_done || 0}/{lander.image_gen_total} imgs
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">{imageCount} imgs</span>
                )}
                {isLive && (
                  <span className="inline-flex items-center rounded-full bg-emerald-200 text-emerald-900 px-2 py-0.5 font-bold uppercase tracking-wider">
                    LIVE IN VOLUUM
                  </span>
                )}
              </div>
              {lander.magazine_slug && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  {lander.magazine_slug}
                  {lander.domain && <> · <code className="font-mono">{lander.domain}{lander.extension_path || ""}</code></>}
                </div>
              )}
              {lander.cta_url && (
                <div className="mt-1 text-[10px] text-muted-foreground inline-flex items-center gap-1 break-all">
                  <span className="uppercase tracking-wider">CTA →</span> <code className="font-mono">{lander.cta_url}</code>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <Link
                href={`/projects/${projectId}/landers/${lander.id}`}
                className="adv-btn text-xs inline-flex items-center justify-center gap-1"
              >
                <Pencil className="size-3.5" /> Edit
              </Link>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="adv-btn-secondary text-xs inline-flex items-center justify-center gap-1">
                <ExternalLink className="size-3.5" /> Preview
              </a>
              <button
                type="button"
                onClick={() => void duplicate()}
                disabled={duplicating}
                className="adv-btn-secondary text-xs inline-flex items-center justify-center gap-1"
                title="Duplicate this lander (drops extension_path + voluum status — fresh copy)"
              >
                {duplicating ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
                {duplicating ? "Duping…" : "Duplicate"}
              </button>
              {/* Submit to Voluum — only when NOT live. Once live, the
                  button disappears entirely; the operator must duplicate
                  to make foundational changes. */}
              {!isLive && (
                <button
                  type="button"
                  onClick={() => setVoluumOpen(true)}
                  className="adv-btn-secondary text-xs inline-flex items-center justify-center gap-1"
                  title="Mock-create this lander entry in Voluum"
                >
                  <Send className="size-3.5" />
                  Submit to Voluum
                </button>
              )}
            </div>
          </div>
          {/* Live-in-Voluum read-only status block — replaces the
              re-submit button per operator spec. Shows voluum lander id,
              sync status, and a hint that the lander is now immutable. */}
          {isLive && (
            <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[11px] space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                  ● LIVE IN VOLUUM
                </span>
                <SyncStatusPill status={syncStatus} />
                {voluumLanderId && (
                  <a
                    href={`https://app.voluum.com/main/lander/${voluumLanderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-medium hover:bg-emerald-700 transition-colors"
                    title="Open this lander in Voluum (opens app.voluum.com)"
                  >
                    <ExternalLink className="size-2.5" /> Open in Voluum
                  </a>
                )}
              </div>
              <div className="space-y-0.5">
                {meta.lander_name && (
                  <div className="text-emerald-900 flex items-center gap-1.5">
                    <Lock className="size-3 text-emerald-700 shrink-0" />
                    <span>Voluum name: <strong className="font-mono">{meta.lander_name}</strong></span>
                  </div>
                )}
                {voluumLanderId && (
                  <div className="text-emerald-900 flex items-center gap-1.5">
                    <Lock className="size-3 text-emerald-700 shrink-0" />
                    <span>Voluum lander ID: <code className="font-mono">{voluumLanderId}</code></span>
                  </div>
                )}
              </div>
              <div className="text-emerald-800 text-[10px] pt-1 border-t border-emerald-200">
                Name + ID are pulled from Voluum and locked here. Domain + extension path are also locked.
                To make foundational changes, click <strong>Duplicate</strong> above and edit the copy.
              </div>
            </div>
          )}
        </div>
      </div>
      {voluumOpen && (
        <VoluumSubmitModal
          lander={lander}
          project={project}
          onClose={() => setVoluumOpen(false)}
          onSubmitted={(updated) => { onUpdate(updated); setVoluumOpen(false); }}
        />
      )}
    </div>
  );
}

/**
 * VoluumSubmitModal — mock-only Voluum submission popup.
 *
 * Operator spec: "Make this mock data because I don't want you to deal
 * with connecting to Voluum now" + "the pop-up should show, taking from
 * me the variables and everything." So we collect realistic Voluum-shaped
 * variables, persist them locally as `voluum_metadata`, set
 * `voluum_status='submitted'`. No outbound HTTP to Voluum. The LIVE IN
 * VOLUUM badge + the destructive-edit guard read off voluum_status so
 * the rest of the app behaves as if it's truly live.
 */
/**
 * SyncStatusPill — small badge showing the live Voluum lander's
 * connection status. Currently mock-driven (linked / syncing / error)
 * but the field name + UI is in place so the real integration can
 * just write to voluum_metadata.sync_status.
 */
function SyncStatusPill({ status }: { status: string }) {
  if (!status) return null;
  const cls =
    status === "linked"
      ? "bg-emerald-600 text-white"
      : status === "syncing"
        ? "bg-amber-500 text-white"
        : status === "error"
          ? "bg-red-600 text-white"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}>
      {status === "linked" ? "🔒 linked" : status === "syncing" ? "↻ syncing" : status === "error" ? "⚠ error" : status}
    </span>
  );
}

function VoluumSubmitModal({
  lander,
  project,
  onClose,
  onSubmitted,
}: {
  lander: V2Lander;
  project: V2Project;
  onClose: () => void;
  onSubmitted: (l: V2Lander) => void;
}) {
  const meta = (lander as { voluum_metadata?: Record<string, string> }).voluum_metadata || {};
  // Operator: "by default it will take the project name as the Lander
  // name, but they're going to be able to edit it. ... at the end it's
  // going to append a middle line and then product name [from brand +
  // product] and then date pushed."
  const defaultName = (meta.lander_name as string) || project.name || lander.internal_name || "";
  const [landerName, setLanderName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format brand + product (operator's example: "Cleantra Lymphatic
  // Drainage Drops"). Use the product config name if we can; otherwise
  // best-effort from the slugs.
  const brandProductSuffix = useMemo(() => {
    const brand = project.brand_slug ? toTitleCase(project.brand_slug.replace(/-/g, " ")) : "";
    const product = project.product_slug ? toTitleCase(project.product_slug.replace(/-/g, " ")) : "";
    if (!brand && !product) return "";
    // Drop redundant brand prefix if product slug already includes it
    if (product && product.toLowerCase().startsWith(brand.toLowerCase())) return product;
    return [brand, product].filter(Boolean).join(" ");
  }, [project.brand_slug, project.product_slug]);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const finalLanderName = [landerName.trim() || defaultName.trim(), brandProductSuffix, today]
    .filter(Boolean)
    .join(" - ");

  async function submit() {
    if (!(landerName || defaultName).trim()) { setError("Lander name is required."); return; }
    setBusy(true);
    setError(null);
    try {
      // Mock: generate a Voluum-shaped lander id + mark sync linked.
      // The real integration will replace this with the API response.
      const mockVoluumId = `vol_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36).slice(-4)}`;
      const r = await apiFetch<{ lander: V2Lander }>(`/api/v2/landers/${lander.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          voluum_status: "submitted",
          voluum_submitted_at: new Date().toISOString(),
          voluum_metadata: {
            lander_name: finalLanderName,
            lander_name_without_product: landerName.trim() || defaultName.trim(),
            brand_product_suffix: brandProductSuffix,
            voluum_lander_id: mockVoluumId,
            sync_status: "linked",
            pushed_date: today,
          },
        }),
      });
      onSubmitted(r.lander);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="adv-card w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-sm font-semibold inline-flex items-center gap-1">
            <Send className="size-4" /> Submit to Voluum
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Mock-only for now (no outbound call). The product name + date are
            auto-appended so every Voluum lander follows the same naming
            convention. We generate a mock <code>vol_*</code> id you can see
            on the lander row.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1">
            Lander name <span className="text-muted-foreground font-normal">(without product name)</span>
          </label>
          <input
            autoFocus
            className="adv-input text-sm"
            placeholder={defaultName}
            value={landerName}
            onChange={(e) => setLanderName(e.target.value)}
          />
          <div className="mt-1 text-[10px] text-muted-foreground">
            Defaults to the project name. Edit if you want a different label in Voluum.
          </div>
        </div>
        <div className="rounded-md bg-muted/50 border px-3 py-2 text-[11px]">
          <div className="text-muted-foreground uppercase tracking-wider text-[9px] mb-1">Will be saved in Voluum as:</div>
          <code className="font-mono break-all text-foreground">{finalLanderName}</code>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="adv-btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="adv-btn text-xs inline-flex items-center gap-1" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {busy ? "Submitting…" : "Submit to Voluum"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * BriefDownloadButton — re-download the original DOCX brief the operator
 * uploaded when creating the project. Operator: "I should actually be
 * able to download the brief itself so I can review it." The server-side
 * /api/v2/projects/:id/brief endpoint streams the file with the original
 * filename.
 */
function BriefDownloadButton({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const token = getToken();
      const r = await fetch(`/api/v2/projects/${projectId}/brief`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (r.status === 404) {
        setError("No brief was uploaded for this project (created from prompt or template?)");
        return;
      }
      if (!r.ok) {
        setError(`Download failed (${r.status})`);
        return;
      }
      // Stream the blob → trigger a download in the browser.
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : "brief.docx";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename!;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      {error && <span className="text-[10px] text-amber-700" title={error}>⚠ {error}</span>}
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="adv-btn-secondary text-[11px] inline-flex items-center gap-1"
        title="Download the original DOCX brief"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
        Download brief
      </button>
    </div>
  );
}
