/**
 * /templates — V2 templates tab.
 *
 * Lists every template under templates-source/ (HTML+CSS files cloned 1:1
 * from production advertorials and slot-ized with {{KEY}} placeholders).
 * Each card lets you:
 *   1. "Open preview" — opens the live rendered template HTML in a new
 *      tab (the real 1:1 page, exactly as it'll look when a brief
 *      replaces the placeholder copy).
 *   2. "Use this template — upload brief" — opens the DOCX upload
 *      dialog; on submit, posts to /api/v2/projects/from-brief and
 *      redirects to the resulting project view.
 *
 * Notes:
 *   - These are the V2 templates. The legacy V1 markdown-skeleton
 *     templates (advertorials-skill/templates/) are NOT shown here —
 *     they live under /api/templates (no suffix) and feed V1's
 *     AI-generation flow which V2 doesn't use.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { apiFetch, getToken } from "../lib/queryClient";
import { Upload, ExternalLink, ImageIcon, Loader2, Sparkles } from "lucide-react";

interface SlotEntry {
  key: string;
  type: "text" | "image" | "html";
  required?: boolean;
  description?: string;
  default?: string;
  aspect_ratio?: string;
}

interface TemplateManifestV2 {
  slug: string;
  name: string;
  reference_url?: string;
  section_headers_count?: number;
  image_slot_count?: number;
  slots: SlotEntry[];
}

export default function TemplatesPage() {
  const [items, setItems] = useState<TemplateManifestV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState<TemplateManifestV2 | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ items: TemplateManifestV2[] }>("/api/templates/v2");
        setItems(res.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="size-5 text-primary" /> Templates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Each template is a production advertorial cloned 1:1 from a live page. Open the preview
          to see exactly what your finished lander will look like — same fonts, same layout, same
          design. To build a new advertorial, click <strong>Use this template</strong> and upload
          your copywriter's DOCX brief. The brief's headings + paragraphs + <code>[IMAGE
          PLACEHOLDER]</code> markers fill the template slots verbatim — no AI rewriting.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading templates…</div>
      ) : items.length === 0 ? (
        <div className="adv-card p-8 text-center text-sm text-muted-foreground">
          No templates yet. Drop a folder under <code>templates-source/&lt;slug&gt;/</code>
          containing <code>reference.html</code>, <code>template.html</code>, and{" "}
          <code>slots.json</code> to add one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((t) => (
            <TemplateCard key={t.slug} template={t} onUseTemplate={() => setUploadOpen(t)} />
          ))}
        </div>
      )}

      {uploadOpen && (
        <BriefUploadDialog
          template={uploadOpen}
          onClose={() => setUploadOpen(null)}
          onSuccess={(projectId) => {
            setUploadOpen(null);
            navigate(`/projects/${projectId}`);
          }}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onUseTemplate,
}: {
  template: TemplateManifestV2;
  onUseTemplate: () => void;
}) {
  const previewUrl = `/preview/templates/${template.slug}`;
  const imageSlots = template.slots.filter((s) => s.type === "image").length;
  const textSlots = template.slots.filter((s) => s.type === "text").length;
  return (
    <div className="adv-card overflow-hidden flex flex-col">
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative aspect-[16/9] bg-muted/30 overflow-hidden group"
        title="Open live preview in a new tab"
      >
        {/* Inline-rendered preview iframe so the operator sees the actual
            page chrome on the card, not a guessed mock. The iframe is
            scaled down to fit the card aspect ratio. */}
        <iframe
          src={previewUrl}
          title={`${template.name} preview`}
          className="absolute inset-0 w-[2200px] h-[1200px] origin-top-left pointer-events-none border-0"
          style={{ transform: "scale(0.18)", transformOrigin: "top left" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <div className="text-[11px] text-white inline-flex items-center gap-1">
            <ExternalLink className="size-3" /> Click to open the full preview
          </div>
        </div>
      </a>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="font-semibold leading-tight">{template.name}</div>
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{template.slug}</div>
        </div>
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
            {imageSlots} image slots
          </span>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
            {textSlots} text slots
          </span>
          {template.section_headers_count != null && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
              {template.section_headers_count} sections
            </span>
          )}
        </div>
        {template.reference_url && (
          <a
            href={template.reference_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground hover:text-foreground underline inline-flex items-center gap-1"
          >
            <ImageIcon className="size-3" /> Source page
          </a>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="adv-btn-secondary inline-flex items-center justify-center gap-1 text-xs"
          >
            <ExternalLink className="size-3.5" /> Open preview
          </a>
          <button
            onClick={onUseTemplate}
            className="adv-btn inline-flex items-center justify-center gap-1 text-xs"
          >
            <Upload className="size-3.5" /> Use this template
          </button>
        </div>
      </div>
    </div>
  );
}

type CreateMethod = "brief" | "prompt" | "blank";

function BriefUploadDialog({
  template,
  onClose,
  onSuccess,
}: {
  template: TemplateManifestV2;
  onClose: () => void;
  onSuccess: (projectId: string) => void;
}) {
  const [method, setMethod] = useState<CreateMethod>("brief");
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brandSlug, setBrandSlug] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [projectName, setProjectName] = useState("");
  // Single "Copywriter" field per operator spec — the same name fills
  // both creative_strategist + copywriter columns on the server so the
  // existing schema still gets populated.
  const [copywriter, setCopywriter] = useState("");
  const [brands, setBrands] = useState<Array<{ slug: string; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; brand_slug?: string | null }>>([]);
  const [pastCss, setPastCss] = useState<string[]>([]);
  const [pastCopywriters, setPastCopywriters] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void (async () => {
      const [b, p, projs] = await Promise.all([
        apiFetch<{ items: Array<{ slug: string; name: string }> }>("/api/brands").catch(() => ({ items: [] })),
        apiFetch<{ items: Array<{ id: string; name: string; brand_slug?: string | null }> }>("/api/products").catch(() => ({ items: [] })),
        apiFetch<{ items: Array<{ creative_strategist?: string | null; copywriter?: string | null; brand_slug?: string | null }> }>("/api/v2/projects").catch(() => ({ items: [] })),
      ]);
      setBrands(b.items || []);
      setProducts(p.items || []);
      const cs = new Set<string>();
      const cw = new Set<string>();
      for (const proj of projs.items || []) {
        if (proj.creative_strategist) cs.add(proj.creative_strategist);
        if (proj.copywriter) cw.add(proj.copywriter);
      }
      setPastCss(Array.from(cs).sort());
      setPastCopywriters(Array.from(cw).sort());
    })();
  }, []);

  const filteredProducts = brandSlug ? products.filter((p) => p.brand_slug === brandSlug) : products;
  const stepBrand = !!brandSlug;
  const stepProduct = stepBrand && !!productSlug;
  const stepName = stepProduct && !!projectName.trim();
  const stepMethodReady =
    stepName &&
    (method === "blank" || (method === "brief" && !!file) || (method === "prompt" && prompt.trim().length > 10));

  async function submit() {
    if (!stepName) { setError("Fill brand, product, and project name first."); return; }
    setBusy(true);
    setError(null);
    try {
      const token = getToken() || "";
      const auth = { Authorization: `Bearer ${token}` };
      if (method === "brief") {
        if (!file) { setError("Pick a DOCX file first."); setBusy(false); return; }
        const form = new FormData();
        form.append("brief", file);
        form.append("template_slug", template.slug);
        form.append("project_name", projectName.trim());
        if (copywriter.trim()) form.append("creative_strategist", copywriter.trim());
        if (copywriter.trim()) form.append("copywriter", copywriter.trim());
        form.append("brand_slug", brandSlug);
        form.append("product_slug", productSlug);
        const r = await fetch("/api/v2/projects/from-brief", { method: "POST", headers: auth, body: form });
        if (!r.ok) throw new Error(`upload failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
        const data = await r.json();
        if (data?.project?.id) { onSuccess(data.project.id); return; }
      } else if (method === "blank") {
        const r = await fetch("/api/v2/projects/from-template", {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            template_slug: template.slug,
            project_name: projectName.trim(),
            brand_slug: brandSlug,
            product_slug: productSlug,
            creative_strategist: copywriter.trim() || null,
            copywriter: copywriter.trim() || null,
          }),
        });
        if (!r.ok) throw new Error(`create failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
        const data = await r.json();
        if (data?.project?.id) { onSuccess(data.project.id); return; }
      } else if (method === "prompt") {
        const r = await fetch("/api/v2/projects/from-prompt", {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            template_slug: template.slug,
            project_name: projectName.trim(),
            brand_slug: brandSlug,
            product_slug: productSlug,
            creative_strategist: copywriter.trim() || null,
            copywriter: copywriter.trim() || null,
            prompt: prompt.trim(),
          }),
        });
        if (!r.ok) throw new Error(`create failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
        const data = await r.json();
        if (data?.project?.id) { onSuccess(data.project.id); return; }
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="adv-card w-full max-w-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-sm font-medium">New project → {template.name}</div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Fill the steps in order. We return as soon as the project + lander
            are created. Images for the brief method stream in the background.
          </p>
        </div>

        {/* Step 1: Brand */}
        <StepBlock n={1} done={stepBrand} label="Brand">
          <select
            className="adv-input text-sm"
            value={brandSlug}
            onChange={(e) => { setBrandSlug(e.target.value); setProductSlug(""); }}
            autoFocus
          >
            <option value="">— pick brand —</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>{b.name}</option>
            ))}
          </select>
        </StepBlock>

        {/* Step 2: Product (filtered by brand) */}
        {stepBrand && (
          <StepBlock n={2} done={stepProduct} label="Product">
            <select
              className="adv-input text-sm"
              value={productSlug}
              onChange={(e) => setProductSlug(e.target.value)}
            >
              <option value="">— pick product —</option>
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {filteredProducts.length === 0 && (
              <div className="mt-1 text-[10px] text-amber-700">
                No products configured for this brand. Add one in product-configs first.
              </div>
            )}
          </StepBlock>
        )}

        {/* Step 3: Copywriter — single dropdown per operator: "It should
            just be one saying 'Copywriters', and it will include all the
            CSs from the backend. And if I select custom on the selection,
            it should not change the selection into a text bar. It should
            just open a new text bar below so I can revert back to
            selecting one of the existing ones if I want." */}
        {stepProduct && (
          <StepBlock n={3} done={true} label="Copywriter">
            <NamePicker
              label="Copywriter"
              placeholder="who wrote the brief"
              options={Array.from(new Set([...pastCss, ...pastCopywriters])).sort()}
              value={copywriter}
              onChange={setCopywriter}
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              Pick from past credits or choose <strong>+ Custom…</strong> — a text input appears below the dropdown without replacing it.
            </div>
          </StepBlock>
        )}

        {/* Step 4: Project name */}
        {stepProduct && (
          <StepBlock n={4} done={stepName} label="Project name">
            <input
              type="text"
              className="adv-input text-sm"
              placeholder="cleantra-magnesium-doctor-discovery-q2"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </StepBlock>
        )}

        {/* Step 5: Method picker + per-method input */}
        {stepName && (
          <StepBlock n={5} done={stepMethodReady} label="Creation method">
            <div className="grid grid-cols-3 gap-2">
              <MethodCard active={method === "brief"} onClick={() => setMethod("brief")} title="Import brief" desc="Upload a copywriter's DOCX. The brief's headings + paragraphs fill slots verbatim and images generate from the brief's IMAGE PLACEHOLDER markers." />
              <MethodCard active={method === "prompt"} onClick={() => setMethod("prompt")} title="Generate from prompt" desc="Describe the angle in plain English. We adapt the template + generate images from the prompt." badge="Beta" />
              <MethodCard active={method === "blank"} onClick={() => setMethod("blank")} title="Blank from template" desc="Start with the template's canonical copy + images. Edit everything manually." />
            </div>

            {method === "brief" && (
              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
                  </div>
                )}
              </div>
            )}

            {method === "prompt" && (
              <div className="mt-3 space-y-1.5">
                <textarea
                  className="adv-textarea text-sm min-h-[100px]"
                  placeholder="e.g. A long-form editorial about how women over 50 can reverse lymphatic congestion with Cleantra Drops, told through the story of a personal trainer's mother…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="text-[10px] text-amber-700">
                  ⚠ Prompt-driven generation is currently mock-only. We create the project + save your prompt; real LLM-driven slot fill + image gen lands in the next session.
                </div>
              </div>
            )}

            {method === "blank" && (
              <div className="mt-3 text-[11px] text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
                Project will be created with the template's canonical text + 10 default images. You'll edit everything in the lander editor.
              </div>
            )}
          </StepBlock>
        )}

        <div className="text-[10px] text-amber-700 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5">
          ⚠ Brand + product LOCK at the project level. You can't change them after creating this project.
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="adv-btn-secondary text-xs" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="adv-btn text-xs inline-flex items-center gap-1"
            onClick={() => void submit()}
            disabled={busy || !stepMethodReady}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {busy ? "Creating…" : method === "brief" ? "Upload + build" : method === "prompt" ? "Generate + create" : "Create blank project"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * NamePicker — dropdown of past credits + a "Custom…" affordance that
 * opens a text input BELOW the dropdown (doesn't replace it). Operator
 * spec: "If I select custom on the selection, it should not change the
 * selection into a text bar. It should just open a new text bar below
 * so I can revert back to selecting one of the existing ones if I want."
 */
function NamePicker({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  // "Custom mode" = the operator clicked the Custom option. Stays open
  // until the operator picks an option from the dropdown again. The
  // dropdown itself stays visible the entire time.
  const isCustomValue = !!value && !options.includes(value);
  const [customOpen, setCustomOpen] = useState<boolean>(isCustomValue);
  // The dropdown's <select> value reflects (a) the chosen option if the
  // operator picked one, (b) "__custom__" when in custom mode, (c) ""
  // when nothing is selected yet.
  const selectValue = customOpen ? "__custom__" : (options.includes(value) ? value : "");
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-medium mb-1 uppercase tracking-wider text-muted-foreground">{label}</label>
      <select
        className="adv-input text-xs"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            setCustomOpen(true);
            // Don't wipe the existing custom value if there was one.
            if (options.includes(value)) onChange("");
          } else {
            setCustomOpen(false);
            onChange(v);
          }
        }}
      >
        <option value="">— pick —</option>
        {options.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
        <option value="__custom__">+ Custom…</option>
      </select>
      {customOpen && (
        <input
          type="text"
          autoFocus
          className="adv-input text-xs"
          placeholder={placeholder}
          value={options.includes(value) ? "" : value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * MethodCard — radio-style card for picking creation method.
 */
function MethodCard({
  active,
  onClick,
  title,
  desc,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-left rounded-lg border p-2.5 transition-all hover:shadow-sm " +
        (active
          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
          : "border-input bg-card hover:border-primary/40")
      }
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div className={"size-3 rounded-full border-2 " + (active ? "border-primary bg-primary" : "border-muted-foreground/40")} />
        <div className="text-xs font-semibold">{title}</div>
        {badge && (
          <span className="ml-auto text-[8px] uppercase tracking-wider bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full font-bold">{badge}</span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground leading-snug">{desc}</div>
    </button>
  );
}

/**
 * StepBlock — sequential reveal block for the project-creation wizard.
 * Operator spec mandated this exact ordering: brand → product → CS →
 * project name → brief file. Each step appears only after the previous
 * one is filled (or unconditionally for optional steps).
 */
function StepBlock({
  n,
  done,
  label,
  children,
}: {
  n: number;
  done: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${done ? "bg-card border-emerald-200" : "bg-muted/30 border-input"} p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`inline-flex items-center justify-center size-5 rounded-full text-[10px] font-semibold ${done ? "bg-emerald-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"}`}>
          {done ? "✓" : n}
        </div>
        <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</div>
      </div>
      {children}
    </div>
  );
}
