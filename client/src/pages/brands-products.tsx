import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/queryClient";
import { X, Plus, Check, Upload, Image as ImageIcon, Link as LinkIcon, Loader2 } from "lucide-react";

interface CtaPreset {
  id: string;
  url: string;
  label: string;
  description?: string;
  funnel_shape?: string;
}
interface Brand {
  // From V1: id (uuid) + slug + name
  // From V2: cta_presets
  id?: string;
  slug: string;
  name: string;
  domain_pool?: string[]; // legacy V1 — unused in V2 UI but kept on the type for backward shape compat
  cta_presets?: CtaPreset[];
}

interface Product {
  id: string;
  name: string;
  brand_slug?: string | null;
  reference_image_ids?: string[];
  reference_image_urls?: string[];
  // V2 fields
  reference_image_url?: string | null;
  reference_image_description?: string | null;
  extra_images?: Array<{ url: string; path: string; description?: string; uploaded_at?: string }>;
  image_spec?: unknown;
  summary_md?: string | null;
  configs_last_synced_at?: string | null;
}

interface BankItem {
  id: string;
  name: string;
  storage_url: string;
  product_slug?: string | null;
  brand_slug?: string | null;
}

export default function BrandsProductsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void (async () => {
      try {
        // /api/v2/brands returns V1's slug+name AND V2's cta_presets in
        // one merged response. Operator: "I want the selections of click-
        // through URLs, meaning the CTA link, to be on the brand level
        // rather than on the magazine level."
        const [b, p] = await Promise.all([
          apiFetch<{ items: Brand[] }>("/api/v2/brands"),
          apiFetch<{ items: Product[] }>("/api/products"),
        ]);
        setBrands(b.items);
        setProducts(p.items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persistCtaPresets(slug: string, presets: CtaPreset[]) {
    setBusy((s) => ({ ...s, [slug]: true }));
    try {
      await apiFetch(`/api/v2/brands/${slug}/cta-presets`, {
        method: "PUT",
        body: JSON.stringify({ cta_presets: presets }),
      });
      setBrands((bs) => bs.map((b) => (b.slug === slug ? { ...b, cta_presets: presets } : b)));
      setSavedAt((s) => ({ ...s, [slug]: Date.now() }));
    } finally {
      setBusy((s) => ({ ...s, [slug]: false }));
    }
  }

  return (
    <div className="px-8 py-6 space-y-8">
      <h1 className="text-xl font-semibold">Brands & Products</h1>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Brands ({brands.length})</div>
              <div className="text-[11px] text-muted-foreground">
                CTAs are managed per-brand — landers under a project on this brand pick from this list.
              </div>
            </div>
            {brands.length === 0 ? (
              <div className="adv-card p-4 text-sm text-muted-foreground">
                No brands configured yet. Add one via the Supabase <code>brands</code> table (slug, name).
              </div>
            ) : (
              <ul className="space-y-3">
                {brands.map((b) => {
                  const isBusy = !!busy[b.slug];
                  const justSaved = (Date.now() - (savedAt[b.slug] || 0)) < 3000;
                  return (
                    <li key={b.slug} className="adv-card p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{b.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{b.slug}</div>
                        </div>
                        {isBusy && <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Saving…</div>}
                        {!isBusy && justSaved && (
                          <div className="flex items-center gap-1 text-xs text-emerald-600">
                            <Check className="size-3.5" /> Saved
                          </div>
                        )}
                      </div>

                      <BrandCtaEditor
                        brand={b}
                        busy={isBusy}
                        onSave={(presets) => void persistCtaPresets(b.slug, presets)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Products ({products.length})</div>
              <div className="text-[11px] text-muted-foreground">
                Click any product to edit its brand link, reference images, and image spec.
              </div>
            </div>
            <ul className="space-y-3">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  brands={brands}
                  onUpdate={(updated) => setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...updated } : x)))}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function ProductCard({
  product,
  brands,
  onUpdate,
}: {
  product: Product;
  brands: Brand[];
  onUpdate: (next: Partial<Product>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [brandSlug, setBrandSlug] = useState<string>(product.brand_slug || "");
  const [spec, setSpec] = useState<string>(
    product.image_spec ? JSON.stringify(product.image_spec, null, 2) : "",
  );
  const [refIds, setRefIds] = useState<string[]>(product.reference_image_ids || []);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankItems, setBankItems] = useState<BankItem[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const refUrls = product.reference_image_urls || [];
  // V2 prefers the uploaded primary reference; legacy bank-pointer URLs
  // fall through if it isn't set.
  const heroRef = product.reference_image_url || refUrls[0];
  const heroDesc = product.reference_image_description || "";
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadDesc, setUploadDesc] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadReferenceImage(file: File, description: string, asPrimary: boolean) {
    setUploadBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("description", description);
      form.append("primary", asPrimary ? "true" : "false");
      const token = localStorage.getItem("advgen.token");
      const r = await fetch(`/api/products/${product.id}/reference-image`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
        body: form,
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`upload failed (${r.status}): ${txt.slice(0, 200)}`);
      }
      const fresh = await apiFetch<{ items: Product[] }>("/api/products");
      const me = fresh.items.find((x) => x.id === product.id);
      if (me) onUpdate(me);
      setUploadDesc("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  async function loadBankForProduct() {
    setBankLoading(true);
    try {
      const r = await apiFetch<{ items: BankItem[] }>(
        `/api/image-bank?limit=200`,
      );
      // Prefer items already scoped to this product, then this brand, then all.
      const scoped = r.items.filter((it) => it.product_slug === product.id);
      const brand = r.items.filter((it) => it.product_slug !== product.id && it.brand_slug === product.brand_slug);
      const rest = r.items.filter((it) => !scoped.includes(it) && !brand.includes(it));
      setBankItems([...scoped, ...brand, ...rest].slice(0, 60));
    } finally {
      setBankLoading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    let parsedSpec: unknown = product.image_spec || null;
    if (spec.trim()) {
      try {
        parsedSpec = JSON.parse(spec);
      } catch (e) {
        setError(`Image spec must be valid JSON: ${e instanceof Error ? e.message : "parse error"}`);
        setBusy(false);
        return;
      }
    }
    try {
      const r = await apiFetch<{ product: { brand_slug: string | null; image_spec: unknown; reference_image_ids: string[] } }>(
        `/api/products/${product.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            brand_slug: brandSlug || null,
            image_spec: parsedSpec,
            reference_image_ids: refIds,
          }),
        },
      );
      // Re-fetch the product list snapshot for fresh reference_image_urls.
      const fresh = await apiFetch<{ items: Product[] }>("/api/products");
      const me = fresh.items.find((x) => x.id === product.id);
      if (me) onUpdate(me);
      else onUpdate({ brand_slug: r.product.brand_slug, image_spec: r.product.image_spec, reference_image_ids: r.product.reference_image_ids });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="adv-card overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && bankItems.length === 0) void loadBankForProduct();
        }}
        className="flex w-full items-center gap-4 p-3 text-left hover:bg-muted/40"
      >
        <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted/40">
          {heroRef ? (
            <img src={heroRef} alt={product.name} className="size-full object-contain bg-white" />
          ) : (
            <div className="grid size-full place-items-center text-[9px] uppercase tracking-wider text-muted-foreground">
              no img
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{product.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <code className="font-mono">{product.id}</code>
            {product.brand_slug ? (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {product.brand_slug}
              </span>
            ) : (
              <span className="text-amber-700">no brand linked</span>
            )}
            <span>·</span>
            <span>{refUrls.length} reference image{refUrls.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">{open ? "▴ close" : "▾ edit"}</div>
      </button>

      {open && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {/* Brand link */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Brand
            </label>
            <select
              className="adv-input"
              value={brandSlug}
              onChange={(e) => setBrandSlug(e.target.value)}
            >
              <option value="">— no brand —</option>
              {brands.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name} ({b.slug})
                </option>
              ))}
            </select>
          </div>

          {/* V2 — Primary product image (uploaded directly) + description */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Primary product image
            </label>
            <div className="flex gap-3">
              <div className="size-32 shrink-0 overflow-hidden rounded-md border bg-muted/40">
                {heroRef ? (
                  <img src={heroRef} alt={product.name} className="size-full object-contain bg-white" />
                ) : (
                  <div className="grid size-full place-items-center text-[10px] uppercase tracking-wider text-muted-foreground">
                    <div className="text-center">
                      <ImageIcon className="size-5 mx-auto mb-1 opacity-60" />
                      no image
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <textarea
                  className="adv-textarea text-[12px] min-h-[60px]"
                  placeholder='Description of what the image shows — e.g. "amber-glass dropper bottle with white CLEANTRA label on transparent background". Used by the AI when picking the right reference.'
                  value={heroDesc}
                  readOnly={true}
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="text-[11px]"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const desc = uploadDesc.trim() ||
                        prompt("Add a one-line description for this image (what it shows visually):", "") ||
                        "";
                      void uploadReferenceImage(f, desc, true);
                    }}
                  />
                  <input
                    className="adv-input flex-1 text-[12px]"
                    placeholder="(optional) description for the next upload"
                    value={uploadDesc}
                    onChange={(e) => setUploadDesc(e.target.value)}
                  />
                </div>
                {uploadBusy && <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Upload className="size-3 animate-pulse" /> Uploading…</div>}
              </div>
            </div>
          </div>

          {/* Extra reference images (transparent-bg variants, lifestyle, etc.) */}
          {(product.extra_images && product.extra_images.length > 0) ? (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Extra images ({product.extra_images.length})
              </label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {product.extra_images.map((ex, i) => (
                  <div key={i} className="rounded-md border bg-white overflow-hidden">
                    <img src={ex.url} alt={ex.description || ""} className="aspect-square w-full object-contain bg-white" />
                    <div className="p-1.5 text-[10px] text-muted-foreground line-clamp-3" title={ex.description || ""}>
                      {ex.description || "(no description)"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Legacy: bank-pointer references kept for V1-imported data */}
          <div>
            <div className="flex items-baseline justify-between">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Bank references ({refIds.length})
              </label>
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={() => setBankPickerOpen((v) => !v)}
              >
                {bankPickerOpen ? "close picker" : "+ add from bank"}
              </button>
            </div>
            {refIds.length === 0 ? (
              <div className="rounded-md border border-dashed bg-card p-3 text-xs text-muted-foreground">
                No reference images yet. The image generator falls back to the
                template's image spec when none are set, which is why renders
                drift from the real product. Add at least one to lock the
                product visual.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {refIds.map((id, i) => {
                  const url = product.reference_image_urls?.[i];
                  return (
                    <div key={id} className="relative group rounded-md border bg-white overflow-hidden">
                      {url ? (
                        <img src={url} alt="ref" className="aspect-square w-full object-contain bg-white" />
                      ) : (
                        <div className="aspect-square grid place-items-center text-[9px] text-muted-foreground">
                          (missing)
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setRefIds((ids) => ids.filter((x) => x !== id))}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100"
                        aria-label="remove reference"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {bankPickerOpen && (
              <div className="mt-2 rounded-md border bg-card p-2">
                <div className="text-[11px] text-muted-foreground mb-2">
                  Pick from image bank — items scoped to this product first, then this brand, then everything else.
                </div>
                {bankLoading ? (
                  <div className="text-[11px] text-muted-foreground">Loading…</div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 max-h-72 overflow-y-auto">
                    {bankItems.map((b) => {
                      const picked = refIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            if (picked) setRefIds((ids) => ids.filter((x) => x !== b.id));
                            else setRefIds((ids) => [...ids, b.id]);
                          }}
                          className={
                            "relative aspect-square overflow-hidden rounded-md border bg-white " +
                            (picked ? "ring-2 ring-primary" : "")
                          }
                          title={b.name}
                        >
                          <img src={b.storage_url} alt={b.name} className="size-full object-contain" />
                          {picked && (
                            <div className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                              <Check className="size-3" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Image spec */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Image spec (JSON)
            </label>
            <textarea
              className="adv-textarea font-mono text-[11px] min-h-[120px]"
              placeholder='{ "bottle_silhouette": "amber dropper bottle", "label_color_palette": "white + black + blue", "do_not_change": ["wordmark", "cap proportions"] }'
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              Free-form JSON the image generator is told to obey. Use it to lock packaging, wordmark, color, "do not change" lists.
            </div>
          </div>

          {error && <div className="text-xs text-destructive">{error}</div>}

          <div className="flex items-center gap-2 pt-1">
            <button className="adv-btn" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </button>
            {savedAt && Date.now() - savedAt < 4000 && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <Check className="size-3.5" /> Saved
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * BrandCtaEditor — per-brand CTA preset editor.
 *
 * Operator spec: "I want the selections of click-through URLs, meaning
 * the CTA link, to be on the brand level rather than on the magazine
 * level."
 *
 * Each preset has: id (slug-style), label (human-readable, picked from
 * the lander editor dropdown), url (the actual Voluum tracking link),
 * description (optional context). The list is replaced atomically on
 * Save; no inline auto-save (operator can iterate without firing
 * partial updates).
 */
function BrandCtaEditor({
  brand,
  busy,
  onSave,
}: {
  brand: Brand;
  busy: boolean;
  onSave: (presets: CtaPreset[]) => void;
}) {
  const [presets, setPresets] = useState<CtaPreset[]>(brand.cta_presets || []);
  // When the prop comes back with a fresh value (e.g. after save), sync.
  useEffect(() => {
    setPresets(brand.cta_presets || []);
  }, [brand.cta_presets]);

  function add() {
    setPresets((p) => [
      ...p,
      {
        id: `cta-${Date.now()}`,
        label: `New CTA ${p.length + 1}`,
        url: "",
        description: "",
      },
    ]);
  }
  function remove(i: number) {
    setPresets((p) => p.filter((_, j) => j !== i));
  }
  function update(i: number, patch: Partial<CtaPreset>) {
    setPresets((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  const dirty = JSON.stringify(presets) !== JSON.stringify(brand.cta_presets || []);

  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
        <LinkIcon className="size-3" /> CTA presets ({presets.length})
      </div>
      {presets.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
          No CTAs yet — landers under this brand have no funnel destinations until you add one.
        </div>
      ) : (
        <div className="space-y-2">
          {presets.map((p, i) => (
            <div key={i} className="rounded-md border bg-card p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium mb-1 uppercase tracking-wider text-muted-foreground">Label</label>
                  <input
                    type="text"
                    className="adv-input text-xs"
                    placeholder="e.g. GLP-1 Magnesium quiz funnel"
                    value={p.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1 uppercase tracking-wider text-muted-foreground">Funnel shape (optional)</label>
                  <input
                    type="text"
                    className="adv-input text-xs"
                    placeholder="vsl, quiz, longform, …"
                    value={p.funnel_shape || ""}
                    onChange={(e) => update(i, { funnel_shape: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium mb-1 uppercase tracking-wider text-muted-foreground">URL (Voluum tracking link)</label>
                <input
                  type="url"
                  className="adv-input text-xs font-mono"
                  placeholder="https://track.voluum.com/…"
                  value={p.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium mb-1 uppercase tracking-wider text-muted-foreground">Description (optional)</label>
                <input
                  type="text"
                  className="adv-input text-[11px]"
                  placeholder="anything the copywriter needs to know"
                  value={p.description || ""}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                >
                  <X className="size-3" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="adv-btn-secondary text-xs inline-flex items-center gap-1" onClick={add}>
          <Plus className="size-3.5" /> Add CTA
        </button>
        {dirty && (
          <button
            type="button"
            className="adv-btn text-xs inline-flex items-center gap-1"
            disabled={busy}
            onClick={() => onSave(presets)}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save CTAs
          </button>
        )}
      </div>
    </div>
  );
}
