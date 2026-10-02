/**
 * /magazines — V2 magazines tab.
 *
 * Each magazine is a publishable "brand of brands" with its own logo,
 * domain pool, and CTA preset list. Landers pick one magazine + one of
 * its domains + one CTA preset. MyHealthyShape ships pre-configured
 * with 2 Voluum CTA URLs the operator named.
 */
import { useEffect, useRef, useState } from "react";
import { apiFetch, getToken } from "../lib/queryClient";
import { Loader2, Plus, Trash2, Check, AlertTriangle, Newspaper, Upload, Sparkles, ImageIcon, Server, Copy } from "lucide-react";

interface CtaPreset {
  id: string;
  url: string;
  label: string;
  description: string;
  funnel_shape?: string;
}
interface Domain {
  domain: string;
  is_primary?: boolean;
  dns_status?: "pending" | "live" | string;
}
interface Magazine {
  slug: string;
  name: string;
  logo_url?: string | null;
  branding?: Record<string, string | undefined>;
  domains: Domain[];
  cta_presets: CtaPreset[];
  brands?: Array<{ brand_slug: string; is_default_for_brand?: boolean }>;
}

export default function MagazinesPage() {
  const [items, setItems] = useState<Magazine[]>([]);
  const [brands, setBrands] = useState<Array<{ slug: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [m, b] = await Promise.all([
          apiFetch<{ items: Magazine[] }>("/api/v2/magazines"),
          apiFetch<{ items: Array<{ slug: string; name: string }> }>("/api/brands").catch(() => ({ items: [] })),
        ]);
        setItems(m.items || []);
        setBrands(b.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="px-8 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold inline-flex items-center gap-2">
          <Newspaper className="size-5 text-primary" /> Magazines
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Each magazine has its own logo, domain pool, and preset Voluum CTA destinations.
          Brands belong to magazines (many-to-many). Landers pick one magazine + one of its
          domains + an extension path + a CTA preset.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" /> Loading magazines…
        </div>
      ) : items.length === 0 ? (
        <div className="adv-card p-8 text-center text-sm text-muted-foreground">No magazines yet.</div>
      ) : (
        <div className="space-y-4">
          {items.map((m) => (
            <MagazineCard key={m.slug} magazine={m} allBrands={brands} onUpdate={(u) => setItems((all) => all.map((x) => x.slug === u.slug ? u : x))} />
          ))}
        </div>
      )}
    </div>
  );
}

function MagazineCard({ magazine, allBrands, onUpdate }: { magazine: Magazine; allBrands: Array<{ slug: string; name: string }>; onUpdate: (m: Magazine) => void }) {
  const [open, setOpen] = useState(true);
  const [domains, setDomains] = useState<Domain[]>(magazine.domains);
  const [assignedBrandSet, setAssignedBrandSet] = useState<Set<string>>(
    new Set((magazine.brands || []).map((b) => b.brand_slug)),
  );
  const [newDomain, setNewDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  async function save() {
    setBusy(true);
    try {
      // Save magazine fields + brand assignment in parallel.
      const [r] = await Promise.all([
        apiFetch<{ magazine: Magazine }>(`/api/v2/magazines/${magazine.slug}`, {
          method: "PATCH",
          body: JSON.stringify({ domains }),
        }),
        apiFetch<{ ok: boolean }>(`/api/v2/magazines/${magazine.slug}/brands`, {
          method: "PUT",
          body: JSON.stringify({ brands: Array.from(assignedBrandSet) }),
        }),
      ]);
      // Refresh the brands prop reflected on the row.
      onUpdate({
        ...r.magazine,
        brands: Array.from(assignedBrandSet).map((b) => ({ brand_slug: b })),
      });
      setSavedAt(Date.now());
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const token = getToken();
      const r = await fetch(`/api/v2/magazines/${magazine.slug}/logo`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
        body: form,
      });
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = await r.json();
      onUpdate(data.magazine);
    } catch (err) {
      alert(`Logo upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  // generateLogo() removed — operator: "it shouldn't say 'generate' if
  // it's just a button to upload the file."

  return (
    <div className="adv-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {magazine.logo_url ? (
            <img src={magazine.logo_url} alt={magazine.name} className="size-12 rounded border bg-white object-contain" />
          ) : (
            <div className="size-12 rounded border bg-muted/40 grid place-items-center text-[10px] text-muted-foreground">no logo</div>
          )}
          <div>
            <div className="font-semibold leading-tight">{magazine.name}</div>
            <div className="text-[11px] text-muted-foreground font-mono">{magazine.slug}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {(magazine.brands || []).length} brands · {domains.length} domains
            </div>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
          {open ? "▴ collapse" : "▾ edit"}
        </button>
      </div>

      {open && (
        <>
          {/* Logo */}
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1">
              <ImageIcon className="size-3" /> Logo
            </div>
            <div className="flex items-start gap-3">
              <div className="size-20 shrink-0 rounded border bg-white grid place-items-center overflow-hidden">
                {magazine.logo_url ? (
                  <img src={magazine.logo_url} alt={magazine.name} className="size-full object-contain" />
                ) : (
                  <span className="text-[9px] uppercase text-muted-foreground">no logo</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/svg+xml,image/webp,image/jpeg"
                    className="text-[11px]"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadLogo(f);
                    }}
                  />
                  {logoBusy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Upload a transparent-bg PNG/SVG/WEBP. The logo is used as the favicon on every published lander pinned to this magazine.
                </div>
              </div>
            </div>
          </div>

          {/* Brand assignment */}
          {allBrands.length > 0 && (
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Brands assigned ({assignedBrandSet.size}/{allBrands.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allBrands.map((b) => {
                  const on = assignedBrandSet.has(b.slug);
                  return (
                    <button
                      key={b.slug}
                      type="button"
                      onClick={() => setAssignedBrandSet((prev) => {
                        const next = new Set(prev);
                        if (next.has(b.slug)) next.delete(b.slug); else next.add(b.slug);
                        return next;
                      })}
                      className={
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] transition-colors " +
                        (on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70 hover:bg-muted-foreground/10")
                      }
                    >
                      {on ? <Check className="size-3" /> : <Plus className="size-3" />}
                      {b.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Each project pinned to one of these brands can pick this magazine.
              </div>
            </div>
          )}

          {/* Domains */}
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Domains ({domains.length})
            </div>
            <div className="space-y-1.5">
              {domains.map((d, i) => (
                <div key={d.domain + i} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                  <code className="flex-1 font-mono text-foreground">{d.domain}</code>
                  {d.is_primary && (
                    <span className="text-[9px] uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded">primary</span>
                  )}
                  <span className={
                    "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded " +
                    (d.dns_status === "live" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
                  }>
                    {d.dns_status || "pending"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDomains((dd) => dd.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    title={`Remove ${d.domain}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = newDomain.trim().toLowerCase();
                if (!v || domains.find((d) => d.domain === v)) return;
                setDomains((dd) => [...dd, { domain: v, dns_status: "pending" }]);
                setNewDomain("");
              }}
            >
              <input
                type="text"
                className="adv-input flex-1 text-xs"
                placeholder="myhealthyshape.co"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
              <button type="submit" className="adv-btn-secondary text-xs inline-flex items-center gap-1">
                <Plus className="size-3.5" /> Add
              </button>
            </form>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-[10px] text-amber-700 inline-flex items-center gap-1">
                <AlertTriangle className="size-3" /> Adding a domain in this UI doesn't auto-provision Caddy/DNS. Click "Caddy snippet" for the exact block to paste on the VPS.
              </div>
              <CaddySnippetButton magazineSlug={magazine.slug} />
            </div>
          </div>

          {/* CTA presets moved to brand level per operator:
              "I want to remove the CTA configurations from the magazine
              config because it should only be on the brand level." */}

          {/* Save */}
          <div className="flex items-center gap-2 pt-2">
            <button className="adv-btn text-xs" disabled={busy} onClick={() => void save()}>
              {busy ? <><Loader2 className="size-3.5 animate-spin inline mr-1" /> Saving…</> : "Save magazine"}
            </button>
            {savedAt && Date.now() - savedAt < 4000 && (
              <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                <Check className="size-3.5" /> Saved
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * CaddySnippetButton — opens a modal showing the exact Caddyfile.d block
 * the operator needs to paste on the VPS to make this magazine's domains
 * route to the app. No auto-write — Caddy config is shared infra.
 */
function CaddySnippetButton({ magazineSlug }: { magazineSlug: string }) {
  const [open, setOpen] = useState(false);
  const [snippet, setSnippet] = useState<{
    caddy_block: string;
    install_path: string | null;
    install_steps: string[];
    domains: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await apiFetch<{
        caddy_block: string;
        install_path: string | null;
        install_steps: string[];
        domains: string[];
      }>(`/api/v2/magazines/${magazineSlug}/caddy-snippet`);
      setSnippet(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="adv-btn-secondary text-[11px] inline-flex items-center gap-1"
        onClick={() => { setOpen(true); void load(); }}
        title="Show the exact Caddyfile.d block to paste on the VPS so these domains serve landers"
      >
        <Server className="size-3" /> Caddy snippet
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="adv-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold inline-flex items-center gap-1">
                  <Server className="size-4" /> Caddy snippet
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Paste this on the VPS to make {snippet?.domains.length ?? "the"} domain(s) route landers from this magazine.
                </div>
              </div>
              <button className="text-muted-foreground hover:text-foreground text-xs" onClick={() => setOpen(false)}>✕</button>
            </div>
            {busy ? (
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Generating…</div>
            ) : snippet ? (
              <>
                {snippet.domains.length === 0 ? (
                  <div className="text-xs text-amber-700">Add at least one domain to this magazine first.</div>
                ) : (
                  <>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Caddy block · save to <code className="text-[10px] bg-muted px-1 rounded">{snippet.install_path}</code>
                      </div>
                      <pre className="bg-muted/70 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre">
{snippet.caddy_block}
                      </pre>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(snippet.caddy_block).then(() => {
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1800);
                          });
                        }}
                        className="adv-btn-secondary text-[11px] inline-flex items-center gap-1 mt-2"
                      >
                        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                        {copied ? "Copied!" : "Copy snippet"}
                      </button>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Install steps</div>
                      <ol className="text-[11px] space-y-1 list-decimal list-inside">
                        {snippet.install_steps.map((s, i) => (
                          <li key={i} className="leading-snug">
                            <pre className="inline whitespace-pre-wrap font-mono text-[10.5px]">{s.replace(/^\d+\.\s*/, "")}</pre>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="text-[10px] text-amber-700 inline-flex items-start gap-1 leading-snug">
                      <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                      Reloading Caddy affects every tool on the VPS. Don't run this casually.
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
