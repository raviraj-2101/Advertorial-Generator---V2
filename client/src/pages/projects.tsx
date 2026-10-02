import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { apiFetch } from "../lib/queryClient";
import { Loader2 } from "lucide-react";

interface ProjectRow {
  id: string;
  name: string;
  product_slug: string;
  brand_slug: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  direction_prompt?: string;
  selected_template_slugs?: string[];
  skeleton_count?: number;
  skeleton_statuses?: string[];
  lander_count?: number;
  landers?: Array<{ id: string; status: string; internal_name: string; image_urls?: Record<string, string>; image_gen_total?: number; image_gen_done?: number }>;
  template_slug?: string;
  is_v2?: boolean;
  image_count?: number;
  image_gen_total?: number;
  image_gen_done?: number;
  image_gen_done_at?: string | null;
  creative_strategist?: string | null;
  copywriter?: string | null;
}

interface ProductRow {
  id: string;
  name: string;
}

interface TemplateRow {
  slug: string;
  name: string;
  family?: string;
}

export default function ProjectsPage() {
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [directionPrompt, setDirectionPrompt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Pull V1 (legacy AI-generated) AND V2 (brief-upload) projects in
        // parallel, merge them so the operator sees everything in one
        // list. V2 projects are tagged is_v2=true so the UI can show a
        // small chip + image-count + clicking routes to the V2 detail.
        const [v1, v2, prod, tmpl] = await Promise.all([
          apiFetch<{ items: ProjectRow[] }>("/api/projects").catch(() => ({ items: [] })),
          apiFetch<{ items: Array<ProjectRow & { template_slug?: string; parsed_brief_json?: unknown; landers?: Array<{ image_urls?: Record<string, string> }> }> }>("/api/v2/projects").catch(() => ({ items: [] })),
          apiFetch<{ items: ProductRow[] }>("/api/products"),
          apiFetch<{ items: TemplateRow[] }>("/api/templates"),
        ]);
        const v2items: ProjectRow[] = (v2.items || []).map((p) => {
          const totalReq = (p.landers || []).reduce((acc: number, l) => acc + ((l as { image_gen_total?: number }).image_gen_total || 0), 0);
          const totalDone = (p.landers || []).reduce((acc: number, l) => acc + ((l as { image_gen_done?: number }).image_gen_done || 0), 0);
          return {
            ...p,
            // Treat the brief's headline as the project name; mark as V2.
            is_v2: true,
            lander_count: (p.landers || []).length,
            // For the UI: "imgs N/M" hint
            image_count: (p.landers && p.landers[0]?.image_urls) ? Object.keys(p.landers[0].image_urls!).length : 0,
            image_gen_total: totalReq,
            image_gen_done: totalDone,
          } as ProjectRow;
        });
        // De-dupe by id: prefer V2 if both surface the same project (shouldn't
        // happen because they're in different schemas, but defensive).
        const seen = new Set<string>();
        const merged: ProjectRow[] = [];
        for (const p of [...v2items, ...(v1.items || [])]) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          merged.push(p);
        }
        merged.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        setProjects(merged);
        setProducts(prod.items);
        setTemplates(tmpl.items);
        if (prod.items[0]) setProductSlug(prod.items[0].id);
      } catch (err) {
        console.warn("projects load:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await apiFetch<{ project: ProjectRow }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          productSlug,
          directionPrompt,
          selectedTemplateSlugs: Array.from(selected),
        }),
      });
      setProjects([res.project, ...projects]);
      setCreateOpen(false);
      setName("");
      setDirectionPrompt("");
      setSelected(new Set());
      // Auto-flow: jump straight into the project detail page and tell it
      // to fire the skeleton generation immediately. No extra click.
      setLocation(`/projects/${res.project.id}?autostart=1`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Projects</h1>
        <button type="button" className="adv-btn" onClick={() => setCreateOpen((v) => !v)}>
          {createOpen ? "Cancel" : "+ New project"}
        </button>
      </div>

      {createOpen && (
        <form onSubmit={createProject} className="adv-card p-5 mb-6 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Project name</label>
            <input className="adv-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Product</label>
            <select className="adv-input" value={productSlug} onChange={(e) => setProductSlug(e.target.value)} required>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Direction (the angle / story / pain point)</label>
            <textarea
              className="adv-textarea min-h-[120px]"
              value={directionPrompt}
              onChange={(e) => setDirectionPrompt(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Templates (pick one or more)</label>
            <div className="grid grid-cols-2 gap-2">
              {templates.length === 0 && (
                <div className="text-xs text-muted-foreground col-span-2">
                  No live templates yet. Proposed templates land in `_proposed/` and need explicit Liam approval before going live.
                </div>
              )}
              {templates.map((t) => {
                const isSelected = selected.has(t.slug);
                return (
                  <label
                    key={t.slug}
                    className={`flex items-start gap-2 rounded border p-2 cursor-pointer ${
                      isSelected ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(t.slug);
                        else next.delete(t.slug);
                        setSelected(next);
                      }}
                    />
                    <div>
                      <div className="text-sm font-medium">{t.name}</div>
                      {t.family && <div className="text-xs text-muted-foreground">{t.family}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          {createError && <div className="text-xs text-destructive">{createError}</div>}
          <button type="submit" className="adv-btn" disabled={creating || selected.size === 0}>
            {creating ? "Creating…" : "Create project"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="adv-card p-8 text-center text-sm text-muted-foreground">
          No projects yet. Start one with the button above.
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => {
            const skn = p.skeleton_count ?? 0;
            const ldn = p.lander_count ?? 0;
            const templates = p.selected_template_slugs || [];
            const lastUpdated = p.updated_at ? new Date(p.updated_at) : null;
            const updatedLabel = lastUpdated
              ? new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(lastUpdated)
              : "";
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="adv-card block p-5 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-foreground truncate">{p.name}</div>
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {p.status}
                        </span>
                        {p.is_v2 && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                            v2 brief
                          </span>
                        )}
                        {p.is_v2 && (p.image_gen_total || 0) > (p.image_gen_done || 0) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                            <Loader2 className="size-2.5 animate-spin" />
                            generating {p.image_gen_done || 0}/{p.image_gen_total}
                          </span>
                        ) : p.is_v2 && typeof p.image_count === "number" ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-semibold">
                            {p.image_count} imgs
                          </span>
                        ) : null}
                        {p.is_v2 && p.creative_strategist && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px]" title="Creative strategist">
                            strat: {p.creative_strategist}
                          </span>
                        )}
                        {p.is_v2 && p.copywriter && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px]" title="Copywriter">
                            writer: {p.copywriter}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {p.is_v2 && p.template_slug ? (
                          <span className="font-mono">{p.template_slug}</span>
                        ) : (
                          <>
                            <span className="font-mono">{p.product_slug}</span>
                            {p.brand_slug ? <span> · {p.brand_slug}</span> : null}
                          </>
                        )}
                      </div>
                      {p.direction_prompt && (
                        <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {p.direction_prompt}
                        </div>
                      )}
                    </div>
                    {updatedLabel && (
                      <div className="shrink-0 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                        updated
                        <div className="font-mono text-[10px] text-foreground">{updatedLabel}</div>
                      </div>
                    )}
                  </div>

                  {/* Info strip */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    {templates.length > 0 ? (
                      templates.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary"
                          title={`Template: ${t}`}
                        >
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-muted-foreground">no template</span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>
                        <strong className="text-foreground">{skn}</strong> skeleton{skn === 1 ? "" : "s"}
                      </span>
                      <span>·</span>
                      <span>
                        <strong className="text-foreground">{ldn}</strong> lander{ldn === 1 ? "" : "s"}
                      </span>
                    </span>
                  </div>

                  {/* Lander breakdown — show small status pills if any landers exist */}
                  {p.landers && p.landers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.landers.slice(0, 4).map((l) => (
                        <span
                          key={l.id}
                          className={
                            "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] " +
                            (l.status === "published"
                              ? "bg-emerald-100 text-emerald-700"
                              : l.status === "in_work"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-muted text-muted-foreground")
                          }
                          title={l.internal_name}
                        >
                          <span className="mr-1 font-mono text-[9px] opacity-70">
                            {l.internal_name?.slice(0, 14)}
                          </span>
                          {l.status}
                        </span>
                      ))}
                      {p.landers.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">+{p.landers.length - 4} more</span>
                      )}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
