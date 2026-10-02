import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/queryClient";
import { Check, X } from "lucide-react";

interface BankItem {
  id: string;
  name: string;
  storage_url: string;
  aspect_ratio?: string;
  tags: string[];
  ai_description?: string;
  brand_slug?: string;
  product_slug?: string;
  source: string;
}

const PERSON_TAGS = new Set([
  "person",
  "people",
  "portrait",
  "testimonial",
  "doctor",
  "nurse",
  "patient",
  "before-after",
]);

function parseFiltersFromHash(): {
  brand: Set<string>;
  product: Set<string>;
  archetype: Set<string>;
  hasPerson: "yes" | "no" | "any";
  tag: Set<string>;
} {
  const url = new URL(window.location.href);
  const sp = new URLSearchParams(url.hash.includes("?") ? url.hash.split("?")[1] : "");
  return {
    brand: new Set(sp.getAll("brand")),
    product: new Set(sp.getAll("product")),
    archetype: new Set(sp.getAll("archetype")),
    hasPerson: (sp.get("hasPerson") as "yes" | "no" | "any") || "any",
    tag: new Set(sp.getAll("tag")),
  };
}

function writeFiltersToHash(f: ReturnType<typeof parseFiltersFromHash>) {
  const url = new URL(window.location.href);
  const [base, _existing] = url.hash.split("?");
  const sp = new URLSearchParams();
  for (const v of f.brand) sp.append("brand", v);
  for (const v of f.product) sp.append("product", v);
  for (const v of f.archetype) sp.append("archetype", v);
  if (f.hasPerson !== "any") sp.set("hasPerson", f.hasPerson);
  for (const v of f.tag) sp.append("tag", v);
  const search = sp.toString();
  window.history.replaceState(null, "", base + (search ? "?" + search : ""));
}

export default function ImageBankPage() {
  const [items, setItems] = useState<BankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [searchHits, setSearchHits] = useState<BankItem[] | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genName, setGenName] = useState("");
  const [genPrompt, setGenPrompt] = useState("");
  const [genAspect, setGenAspect] = useState("16:9");
  const [genBusy, setGenBusy] = useState(false);
  const [filters, setFilters] = useState(parseFiltersFromHash());

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    writeFiltersToHash(filters);
  }, [filters]);

  async function reload() {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: BankItem[] }>("/api/image-bank?limit=500");
      setItems(res.items);
      setSearchHits(null);
    } finally {
      setLoading(false);
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q) {
      setSearchHits(null);
      return;
    }
    const res = await apiFetch<{ hits: Array<{ item: BankItem; score: number }> }>("/api/image-bank/search", {
      method: "POST",
      body: JSON.stringify({ q, limit: 60 }),
    });
    setSearchHits(res.hits.map((h) => h.item));
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setGenBusy(true);
    try {
      await apiFetch("/api/image-bank/generate", {
        method: "POST",
        body: JSON.stringify({ name: genName, prompt: genPrompt, aspectRatio: genAspect }),
      });
      setGenOpen(false);
      setGenName("");
      setGenPrompt("");
      await reload();
    } finally {
      setGenBusy(false);
    }
  }

  // Derive filter option lists from the actual data so the chips only
  // show options that have at least one matching row.
  const facets = useMemo(() => {
    const brands = new Map<string, number>();
    const products = new Map<string, number>();
    const archetypes = new Map<string, number>();
    const tags = new Map<string, number>();
    for (const it of items) {
      if (it.brand_slug) brands.set(it.brand_slug, (brands.get(it.brand_slug) || 0) + 1);
      if (it.product_slug) products.set(it.product_slug, (products.get(it.product_slug) || 0) + 1);
      for (const t of it.tags || []) {
        tags.set(t, (tags.get(t) || 0) + 1);
        // archetype tag namespace: anything tagged "hero", "lifestyle",
        // "in-action", "scarcity-stock", "testimonial", "packaging-detail",
        // "mechanism-diagram", "trust-bar-logo", "before-after",
        // "demographic-closeup". Stored as a flat tag for now.
        if (
          [
            "hero",
            "in-action",
            "lifestyle",
            "scarcity-stock",
            "testimonial",
            "packaging-detail",
            "mechanism-diagram",
            "trust-bar-logo",
            "before-after",
            "demographic-closeup",
          ].includes(t)
        ) {
          archetypes.set(t, (archetypes.get(t) || 0) + 1);
        }
      }
    }
    return {
      brands: Array.from(brands.entries()).sort(),
      products: Array.from(products.entries()).sort(),
      archetypes: Array.from(archetypes.entries()).sort(),
      tags: Array.from(tags.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20),
    };
  }, [items]);

  // Apply filters on top of either the search hits or the full list.
  const filtered = useMemo(() => {
    const base = searchHits ?? items;
    return base.filter((it) => {
      if (filters.brand.size && (!it.brand_slug || !filters.brand.has(it.brand_slug))) return false;
      if (filters.product.size && (!it.product_slug || !filters.product.has(it.product_slug))) return false;
      if (filters.archetype.size && !(it.tags || []).some((t) => filters.archetype.has(t))) return false;
      if (filters.tag.size && !(it.tags || []).some((t) => filters.tag.has(t))) return false;
      if (filters.hasPerson !== "any") {
        const hasP = (it.tags || []).some((t) => PERSON_TAGS.has(t));
        if (filters.hasPerson === "yes" && !hasP) return false;
        if (filters.hasPerson === "no" && hasP) return false;
      }
      return true;
    });
  }, [items, searchHits, filters]);

  function toggleSet(key: "brand" | "product" | "archetype" | "tag", value: string) {
    setFilters((f) => {
      const next = { ...f, [key]: new Set(f[key]) };
      if (next[key].has(value)) next[key].delete(value);
      else next[key].add(value);
      return next;
    });
  }

  function setPerson(value: "yes" | "no" | "any") {
    setFilters((f) => ({ ...f, hasPerson: value }));
  }

  function clearFilters() {
    setFilters({
      brand: new Set(),
      product: new Set(),
      archetype: new Set(),
      hasPerson: "any",
      tag: new Set(),
    });
  }

  const activeFilterCount =
    filters.brand.size +
    filters.product.size +
    filters.archetype.size +
    filters.tag.size +
    (filters.hasPerson !== "any" ? 1 : 0);

  return (
    <div className="px-8 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Image Bank</h1>
        <button className="adv-btn" onClick={() => setGenOpen((v) => !v)}>
          {genOpen ? "Cancel" : "+ Generate new image"}
        </button>
      </div>

      <form onSubmit={runSearch} className="flex gap-2">
        <input
          className="adv-input flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Natural-language search… e.g. "close-up amber dropper bottle" or "brand:Ledisa product:patches"'
        />
        <button type="submit" className="adv-btn-secondary">Search</button>
        {searchHits && (
          <button type="button" className="adv-btn-secondary" onClick={() => { setSearchHits(null); setQ(""); }}>
            Clear
          </button>
        )}
      </form>

      {/* Filter chips — only render rows that have facet values */}
      <div className="adv-card p-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Filters {activeFilterCount > 0 ? `(${activeFilterCount} active)` : ""}
          </div>
          {activeFilterCount > 0 && (
            <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={clearFilters}>
              clear all
            </button>
          )}
        </div>
        {facets.brands.length > 0 && (
          <ChipRow label="Brand">
            {facets.brands.map(([k, n]) => (
              <Chip key={k} active={filters.brand.has(k)} onClick={() => toggleSet("brand", k)}>
                {k} <span className="opacity-50">({n})</span>
              </Chip>
            ))}
          </ChipRow>
        )}
        {facets.products.length > 0 && (
          <ChipRow label="Product">
            {facets.products.map(([k, n]) => (
              <Chip key={k} active={filters.product.has(k)} onClick={() => toggleSet("product", k)}>
                {k} <span className="opacity-50">({n})</span>
              </Chip>
            ))}
          </ChipRow>
        )}
        {facets.archetypes.length > 0 && (
          <ChipRow label="Archetype">
            {facets.archetypes.map(([k, n]) => (
              <Chip key={k} active={filters.archetype.has(k)} onClick={() => toggleSet("archetype", k)}>
                {k} <span className="opacity-50">({n})</span>
              </Chip>
            ))}
          </ChipRow>
        )}
        <ChipRow label="Has person">
          {(["any", "yes", "no"] as const).map((v) => (
            <Chip key={v} active={filters.hasPerson === v} onClick={() => setPerson(v)}>
              {v}
            </Chip>
          ))}
        </ChipRow>
        {facets.tags.length > 0 && (
          <ChipRow label="Tags">
            {facets.tags.map(([k, n]) => (
              <Chip key={k} active={filters.tag.has(k)} onClick={() => toggleSet("tag", k)}>
                {k} <span className="opacity-50">({n})</span>
              </Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {genOpen && (
        <form onSubmit={generate} className="adv-card p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Name</label>
            <input className="adv-input" value={genName} onChange={(e) => setGenName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Prompt</label>
            <textarea className="adv-textarea" value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Aspect ratio</label>
            <select className="adv-input" value={genAspect} onChange={(e) => setGenAspect(e.target.value)}>
              <option>16:9</option>
              <option>1:1</option>
              <option>4:5</option>
              <option>9:16</option>
            </select>
          </div>
          <button type="submit" className="adv-btn" disabled={genBusy}>
            {genBusy ? "Generating…" : "Generate into bank"}
          </button>
        </form>
      )}

      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {items.length} {searchHits ? "(after AI search)" : ""}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="adv-card p-8 text-center text-sm text-muted-foreground">
          {activeFilterCount > 0 ? (
            <>
              No images match the active filters.{" "}
              <button className="underline" onClick={clearFilters}>clear filters</button>
            </>
          ) : searchHits ? (
            "No results for that query."
          ) : (
            "Bank is empty — generate or upload to seed it."
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((it) => (
            <div key={it.id} className="adv-card overflow-hidden">
              <img src={it.storage_url} alt={it.ai_description || it.name} className="w-full aspect-square object-cover" />
              <div className="p-2">
                <div className="text-xs font-medium truncate" title={it.name}>{it.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {it.brand_slug || "—"} · {it.product_slug || "—"} · {it.source}
                </div>
                {it.tags && it.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {it.tags.slice(0, 4).map((t) => (
                      <span key={t} className="text-[9px] bg-muted px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted")
      }
    >
      {active && <Check className="size-3" />}
      {children}
      {active && <X className="size-3 opacity-70" />}
    </button>
  );
}
