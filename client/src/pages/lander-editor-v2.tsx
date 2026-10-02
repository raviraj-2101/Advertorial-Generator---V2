/**
 * /projects/:id/landers/:landerId — V2 lander editor.
 *
 * Operator's blocker: "I am not able to edit the pages." This editor
 * unblocks that. Layout:
 *   - LEFT: slot-value editor (per-slot text inputs / textareas — headline,
 *     section headers, body prose, dek, byline, masthead text, CTA prefs)
 *     plus per-IMAGE-slot tile with "Regenerate this image" affordance.
 *   - RIGHT: live preview iframe of /preview/landers/:id — re-fetched after
 *     every save.
 *
 * Every text edit batches into a debounced PATCH /api/v2/landers/:id.
 * Image regen pops a modal: 5 candidate variations, default "use current
 * as reference", optional uploaded reference, pick winner.
 *
 * The brand + product fields are READ-ONLY here per operator's explicit
 * spec: "I don't want to be able to update product or brand within a
 * specific Lander. It should only be on the project level, and it should
 * be locked as soon as you create the project."
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { apiFetch, getToken } from "../lib/queryClient";
import { Loader2, ExternalLink, RefreshCw, Check, Upload, Monitor, Tablet, Smartphone, Settings as SettingsIcon, PanelRightClose, PanelRightOpen, Save, X, Undo2, Redo2, Lock, Download } from "lucide-react";

type DeviceWidth = "desktop" | "tablet" | "mobile";
const DEVICE_PX: Record<DeviceWidth, number> = { desktop: 1280, tablet: 768, mobile: 390 };

// Fields we put in undo/redo history (page-content edits only —
// settings edits are explicitly excluded per operator spec).
type EditableContent = { slot_values: Record<string, string>; image_urls: Record<string, string> };
const HISTORY_LIMIT = 50;

interface V2Lander {
  id: string;
  project_id: string;
  template_slug: string;
  internal_name: string;
  tab_title?: string | null;
  status: string;
  slot_values: Record<string, string>;
  image_urls: Record<string, string>;
  magazine_slug?: string | null;
  domain?: string | null;
  extension_path?: string | null;
  cta_preset_id?: string | null;
  cta_url?: string | null;
  voluum_status?: string | null;
  image_gen_total?: number;
  image_gen_done?: number;
}

interface V2Project {
  id: string;
  name: string;
  template_slug: string;
  brand_slug?: string | null;
  product_slug?: string | null;
  parsed_brief_json?: {
    headline?: string;
    sectionHeaders?: string[];
    imagePrompts?: Array<{ slotKey: string; prompt: string }>;
  } | null;
}

interface SlotEntry {
  key: string;
  type: "text" | "html" | "image";
  required?: boolean;
  description?: string;
  default?: string;
  aspect_ratio?: string;
}

interface TemplateManifest {
  slug: string;
  name: string;
  slots: SlotEntry[];
}

interface MagazineCtaPreset {
  id: string;
  url: string;
  label: string;
  description: string;
  funnel_shape: string;
}
interface Magazine {
  slug: string;
  name: string;
  logo_url?: string | null;
  domains: Array<{ domain: string; is_primary?: boolean; dns_status?: string }>;
  cta_presets: MagazineCtaPreset[];
  brands?: Array<{ brand_slug: string; is_default_for_brand?: boolean }>;
}

interface V2Brand {
  slug: string;
  name: string;
  cta_presets?: MagazineCtaPreset[];
}

export default function LanderEditorV2Page() {
  const { id, landerId } = useParams();
  const [project, setProject] = useState<V2Project | null>(null);
  // savedLander = the last server-confirmed state. The "Cancel" button
  // restores this. lander = the local edit buffer; "Save Changes" pushes
  // it to the server. isDirty compares the two.
  const [savedLander, setSavedLander] = useState<V2Lander | null>(null);
  const [lander, setLander] = useState<V2Lander | null>(null);
  const [manifest, setManifest] = useState<TemplateManifest | null>(null);
  const [magazines, setMagazines] = useState<Magazine[]>([]);
  const [brands, setBrands] = useState<V2Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [regenSlot, setRegenSlot] = useState<string | null>(null);
  // Undo/redo stacks — page-content edits only (slot_values + image_urls).
  // Operator spec: "I want this back and forward button to only be on the
  // editor of the page itself. It won't affect the settings that we touch
  // on the right side."
  const [history, setHistory] = useState<EditableContent[]>([]);
  const [redoStack, setRedoStack] = useState<EditableContent[]>([]);
  // In-iframe WYSIWYG editor + chrome state
  const [device, setDevice] = useState<DeviceWidth>("desktop");
  const [panelOpen, setPanelOpen] = useState(true);
  const [iframeReady, setIframeReady] = useState(false);

  useEffect(() => {
    if (!id || !landerId) return;
    void (async () => {
      try {
        const [proj, mags, brs] = await Promise.all([
          apiFetch<{ project: V2Project; landers: V2Lander[] }>(`/api/v2/projects/${id}`),
          apiFetch<{ items: Magazine[] }>(`/api/v2/magazines`).catch(() => ({ items: [] as Magazine[] })),
          apiFetch<{ items: V2Brand[] }>(`/api/v2/brands`).catch(() => ({ items: [] as V2Brand[] })),
        ]);
        const me = proj.landers.find((l) => l.id === landerId);
        setProject(proj.project);
        if (me) {
          setSavedLander(me);
          setLander(me);
        }
        setMagazines(mags.items || []);
        setBrands(brs.items || []);
        if (me) {
          const tmpl = await apiFetch<TemplateManifest>(`/api/templates/v2/${me.template_slug}`).catch(() => null);
          if (tmpl) setManifest(tmpl);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, landerId]);

  // Compute isDirty — any meaningful field changed locally vs the
  // server-confirmed snapshot.
  const isDirty = useMemo(() => {
    if (!lander || !savedLander) return false;
    const fields: (keyof V2Lander)[] = [
      "slot_values", "image_urls", "magazine_slug", "domain", "extension_path",
      "cta_preset_id", "cta_url", "internal_name", "tab_title",
    ];
    for (const f of fields) {
      if (JSON.stringify(lander[f]) !== JSON.stringify(savedLander[f])) return true;
    }
    return false;
  }, [lander, savedLander]);

  // Snapshot current page content into history before mutating. Page-
  // content = slot_values + image_urls.
  function pushHistory(prev: V2Lander) {
    setHistory((h) => {
      const next = [...h, { slot_values: { ...prev.slot_values }, image_urls: { ...prev.image_urls } }];
      return next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next;
    });
    setRedoStack([]);
  }

  function undo() {
    if (!lander || history.length === 0) return;
    const last = history[history.length - 1]!;
    setRedoStack((r) => [...r, { slot_values: { ...lander.slot_values }, image_urls: { ...lander.image_urls } }]);
    setHistory((h) => h.slice(0, -1));
    setLander({ ...lander, slot_values: last.slot_values, image_urls: last.image_urls });
    // Bump iframeKey so the in-iframe view re-renders to the undone state.
    setIframeKey((k) => k + 1);
    setIframeReady(false);
  }

  function redo() {
    if (!lander || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    setHistory((h) => [...h, { slot_values: { ...lander.slot_values }, image_urls: { ...lander.image_urls } }]);
    setRedoStack((r) => r.slice(0, -1));
    setLander({ ...lander, slot_values: next.slot_values, image_urls: next.image_urls });
    setIframeKey((k) => k + 1);
    setIframeReady(false);
  }

  // Save Changes — explicit commit. PATCH the full edited lander to the
  // server; on success, savedLander becomes the new baseline.
  async function saveChanges(force = false) {
    if (!lander || !savedLander) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      slot_values: lander.slot_values,
      image_urls: lander.image_urls,
      magazine_slug: lander.magazine_slug ?? null,
      domain: lander.domain ?? null,
      extension_path: lander.extension_path ?? null,
      cta_preset_id: lander.cta_preset_id ?? null,
      cta_url: lander.cta_url ?? null,
      internal_name: lander.internal_name,
      tab_title: lander.tab_title ?? null,
    };
    if (force) body.force = true;
    try {
      const token = getToken();
      const res = await fetch(`/api/v2/landers/${lander.id}`, {
        method: "PATCH",
        headers: { Authorization: token ? `Bearer ${token}` : "", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data?.extension_path_collision) {
          setError(`URL collision — "${lander.extension_path}" on ${lander.domain} is already used by lander "${data.collision_lander_name}". Pick a different extension path or duplicate that lander instead.`);
          setSaving(false);
          return;
        }
        if (data?.live_in_voluum) {
          const fields = (data.dangerous_fields || []).join(", ");
          const ok = window.confirm(
            `⚠️ THIS LANDER IS LIVE IN VOLUUM.\n\nChanging ${fields} will break tracking on the live funnel. Force the save?\n\nOK = force. Cancel = abort.`,
          );
          if (ok) { void saveChanges(true); }
          else setSaving(false);
          return;
        }
        setError(data?.message || "Save refused");
        setSaving(false);
        return;
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status}: ${txt.slice(0, 300)}`);
      }
      const data = await res.json();
      setSavedLander(data.lander);
      setLander(data.lander);
      setHistory([]);
      setRedoStack([]);
      setSavedAt(Date.now());
      // Refresh the iframe so the saved (and any server-normalized) state
      // is what the operator sees.
      setIframeKey((k) => k + 1);
      setIframeReady(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function cancelChanges() {
    if (!savedLander) return;
    if (isDirty && !window.confirm("Discard all unsaved changes?")) return;
    setLander(savedLander);
    setHistory([]);
    setRedoStack([]);
    setError(null);
    setIframeKey((k) => k + 1);
    setIframeReady(false);
  }

  // Listen for postMessage events from the in-iframe editor bootstrap.
  // Edits go into the local lander buffer + history; no auto-save.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; key?: string; value?: string; currentUrl?: string; n?: number; dir?: -1 | 1; afterN?: number; kind?: "text" | "image"; aspectRatio?: string | null } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "ready") {
        setIframeReady(true);
        return;
      }
      if (data.type === "slot-change" && data.key && lander) {
        // Only push to history if the value actually changed.
        if (lander.slot_values[data.key] !== (data.value || "")) {
          pushHistory(lander);
          setLander({ ...lander, slot_values: { ...lander.slot_values, [data.key]: data.value || "" } });
          // Do NOT bump iframeKey — the operator just typed there.
        }
        return;
      }
      if (data.type === "image-click" && data.key) {
        setRegenSlot(data.key);
        return;
      }
      if (data.type === "section-move" && typeof data.n === "number" && (data.dir === -1 || data.dir === 1)) {
        moveSection(data.n, data.dir);
        return;
      }
      if (data.type === "insert-section" && typeof data.afterN === "number" && (data.kind === "text" || data.kind === "image")) {
        insertSection(data.afterN, data.kind, data.aspectRatio || null);
        return;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lander, history, redoStack, manifest]);

  // Cmd/Ctrl-Z / Cmd-Shift-Z keybinding for undo/redo (skips when typing
  // in a text input/textarea OUTSIDE the iframe; the iframe handles its
  // own Cmd-Z via the browser default inside contenteditable).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== "z") return;
      const t = e.target as Element | null;
      if (t && t.matches && t.matches("textarea, input")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, redoStack, lander]);

  function updateSlot(key: string, value: string) {
    if (!lander) return;
    if (lander.slot_values[key] === value) return;
    pushHistory(lander);
    setLander({ ...lander, slot_values: { ...lander.slot_values, [key]: value } });
  }

  function updateSlots(patch: Record<string, string>) {
    if (!lander) return;
    pushHistory(lander);
    setLander({ ...lander, slot_values: { ...lander.slot_values, ...patch } });
  }

  function moveSection(n: number, dir: -1 | 1) {
    if (!lander || !manifest) return;
    const target = n + dir;
    const sectionIndices = manifest.slots
      .map((s) => s.key.match(/^SECTION_(\d+)_(HEADER|BODY)$/))
      .filter(Boolean)
      .map((m) => parseInt((m as RegExpMatchArray)[1], 10));
    const maxN = sectionIndices.length ? Math.max(...sectionIndices) : 0;
    if (target < 1 || target > maxN) return;
    const v = lander.slot_values;
    const swap: Record<string, string> = {
      [`SECTION_${n}_HEADER`]: v[`SECTION_${target}_HEADER`] || "",
      [`SECTION_${target}_HEADER`]: v[`SECTION_${n}_HEADER`] || "",
      [`SECTION_${n}_BODY`]: v[`SECTION_${target}_BODY`] || "",
      [`SECTION_${target}_BODY`]: v[`SECTION_${n}_BODY`] || "",
    };
    updateSlots(swap);
    // Section reorder needs an iframe refresh so the visual order updates.
    setIframeKey((k) => k + 1);
    setIframeReady(false);
  }

  /**
   * insertSection — operator-requested ability to add a new section
   * after section #afterN (or at the top if afterN=0). Two kinds:
   *  - "text": new section with a header + placeholder body
   *  - "image": new section with an inline <img> at the chosen aspect
   *             ratio, using a dynamic slot key. The placeholder image
   *             is clickable in-iframe to open the regen modal.
   *
   * Mechanics:
   *  - Find the LAST currently-empty SECTION_n slot.
   *  - Shift all section content from afterN+1..emptyN-1 forward by one
   *    (cascade copy from the back so we don't clobber).
   *  - Write the new content at afterN+1.
   *  - Push history, mark dirty, refresh iframe.
   */
  function insertSection(afterN: number, kind: "text" | "image", aspectRatio: string | null) {
    if (!lander || !manifest) return;
    const sectionIndices = manifest.slots
      .map((s) => s.key.match(/^SECTION_(\d+)_(HEADER|BODY)$/))
      .filter(Boolean)
      .map((m) => parseInt((m as RegExpMatchArray)[1], 10));
    const maxN = sectionIndices.length ? Math.max(...sectionIndices) : 0;
    if (maxN === 0) {
      setError("Template has no section slots.");
      return;
    }
    const newN = afterN + 1;
    if (newN < 1 || newN > maxN) {
      setError(`Can't insert here — out of range (template max is section ${maxN}).`);
      return;
    }
    // Find the highest empty section slot we can shift INTO.
    const sv = { ...lander.slot_values };
    const iu = { ...lander.image_urls };
    let emptyN = -1;
    for (let n = maxN; n >= newN; n--) {
      const h = (sv[`SECTION_${n}_HEADER`] || "").trim();
      const b = (sv[`SECTION_${n}_BODY`] || "").trim();
      if (!h && !b) { emptyN = n; break; }
    }
    if (emptyN === -1) {
      setError(`No empty section slot available — template supports ${maxN} sections max. Delete an existing section first.`);
      return;
    }
    pushHistory(lander);
    // Shift content: section X → section X+1 for X = newN..emptyN-1
    // Walk backwards so we don't overwrite.
    for (let n = emptyN; n > newN; n--) {
      sv[`SECTION_${n}_HEADER`] = sv[`SECTION_${n - 1}_HEADER`] || "";
      sv[`SECTION_${n}_BODY`] = sv[`SECTION_${n - 1}_BODY`] || "";
    }
    // Insert at newN
    if (kind === "text") {
      sv[`SECTION_${newN}_HEADER`] = "NEW SECTION";
      sv[`SECTION_${newN}_BODY`] = "<p>Click here to edit this section.</p>";
    } else {
      // Image: dynamic slot key, placeholder URL, inline <img> in body
      const ar = aspectRatio || "16:9";
      const [aw, ah] = ar.split(":").map(Number);
      const w = (aw || 16) * 80;
      const h = (ah || 9) * 80;
      const newImageKey = `INSERTED_IMG_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}_URL`;
      const placeholder = `https://placehold.co/${w}x${h}/dbeafe/1d4ed8?text=Click+to+regenerate`;
      iu[newImageKey] = placeholder;
      sv[newImageKey] = placeholder;
      sv[`SECTION_${newN}_HEADER`] = "";
      sv[`SECTION_${newN}_BODY`] = `<div style="text-align:center; margin: 12px 0;"><img src="{{${newImageKey}}}" data-slot-key="${newImageKey}" data-slot-type="image" alt="" style="max-width:100%; height:auto; border-radius:8px;" /></div>`;
    }
    setLander({ ...lander, slot_values: sv, image_urls: iu });
    setIframeKey((k) => k + 1);
    setIframeReady(false);
  }

  // updateMeta — side-panel/settings changes. DOES NOT go into undo
  // history per operator spec. Marks the lander dirty.
  function updateMeta(field: "magazine_slug" | "domain" | "extension_path" | "cta_preset_id" | "cta_url" | "internal_name" | "tab_title", value: string | null) {
    if (!lander) return;
    setLander({ ...lander, [field]: value });
  }

  // Image regen result — push to history + update local state. Save
  // happens when the operator clicks Save Changes (orphan images in
  // storage are cheap; we'd rather give the operator the explicit-save
  // pattern).
  function applyImageRegen(slotKey: string, url: string) {
    if (!lander) return;
    pushHistory(lander);
    setLander({
      ...lander,
      slot_values: { ...lander.slot_values, [slotKey]: url },
      image_urls: { ...lander.image_urls, [slotKey]: url },
    });
    setIframeKey((k) => k + 1);
    setIframeReady(false);
  }

  const currentMagazine = useMemo(
    () => magazines.find((m) => m.slug === lander?.magazine_slug),
    [magazines, lander?.magazine_slug],
  );

  // Filter the magazine dropdown to magazines this project's brand can
  // actually use. Operator spec: "We should see, on the magazine level,
  // what brands are approved to use it. When we edit the landers and
  // the projects, we are able to have a drop-down of what magazine we
  // want to use out of the ones that we can use." If the project has
  // no brand pinned yet, fall back to ALL magazines (better than
  // hiding them all).
  const availableMagazines = useMemo(() => {
    const bs = project?.brand_slug;
    if (!bs) return magazines;
    const allowed = magazines.filter((m) => (m.brands || []).some((b) => b.brand_slug === bs));
    return allowed.length > 0 ? allowed : magazines;
  }, [magazines, project?.brand_slug]);

  // CTA presets live on the brand now (operator's spec). Fall back to
  // the magazine's cta_presets list only if the brand has none yet —
  // covers the migration window where brand CTAs haven't been entered.
  const ctaPresets = useMemo(() => {
    const brandSlug = project?.brand_slug;
    const brand = brandSlug ? brands.find((b) => b.slug === brandSlug) : undefined;
    if (brand && (brand.cta_presets || []).length > 0) return brand.cta_presets || [];
    return currentMagazine?.cta_presets || [];
  }, [brands, project?.brand_slug, currentMagazine]);

  if (loading) {
    return (
      <div className="px-8 py-12 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading editor…
      </div>
    );
  }
  if (error || !lander || !project) {
    return (
      <div className="px-8 py-6 text-sm text-destructive">
        {error || "Lander not found"}
      </div>
    );
  }

  // Separate manifest slots into edit groups.
  // Sections (SECTION_n_HEADER + SECTION_n_BODY) get grouped + reorderable
  // so the operator can move a section up/down without retyping. Everything
  // else (HEADLINE, BYLINE, masthead, LEDE_BODY, etc.) renders as a flat
  // list above the sections.
  const allText = manifest?.slots.filter((s) => s.type === "text") || [];
  const allHtml = manifest?.slots.filter((s) => s.type === "html") || [];
  const imageSlots = manifest?.slots.filter((s) => s.type === "image") || [];
  const sectionRe = /^SECTION_(\d+)_(HEADER|BODY)$/;
  const sectionNumbers = Array.from(
    new Set(
      [...allText, ...allHtml]
        .map((s) => s.key.match(sectionRe))
        .filter(Boolean)
        .map((m) => parseInt((m as RegExpMatchArray)[1], 10)),
    ),
  ).sort((a, b) => a - b);

  const previewUrl = `/preview/landers/${lander.id}`;
  const editUrl = `/preview/landers/${lander.id}?edit=1`;
  const deviceWidthPx = DEVICE_PX[device];

  return (
    <div className="flex flex-col h-[calc(100vh-1px)] min-h-0 bg-muted/20">
      {/* ── TOP BAR ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/projects/${project.id}`} className="text-xs text-muted-foreground hover:text-foreground shrink-0">
            ← project
          </Link>
          <div className="text-sm font-semibold leading-tight truncate">{project.name}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-mono">{lander.template_slug}</span>
            <span>·</span>
            <span className="font-mono">brand: {project.brand_slug || "—"}</span>
            <span>·</span>
            <span className="font-mono">product: {project.product_slug || "—"}</span>
          </div>
          {savedAt && Date.now() - savedAt < 4000 && (
            <div className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
              <Check className="size-3" /> Saved
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo / Redo — page-content history only */}
          <div className="flex items-center rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => undo()}
              disabled={history.length === 0}
              className="inline-flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              title={history.length > 0 ? `Undo (⌘Z) — ${history.length} steps available` : "Nothing to undo"}
            >
              <Undo2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => redo()}
              disabled={redoStack.length === 0}
              className="inline-flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              title={redoStack.length > 0 ? `Redo (⌘⇧Z) — ${redoStack.length} steps available` : "Nothing to redo"}
            >
              <Redo2 className="size-3.5" />
            </button>
          </div>

          {/* Device-width picker */}
          <div className="flex items-center rounded-md border bg-background p-0.5">
            {(["desktop", "tablet", "mobile"] as const).map((d) => {
              const Icon = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={
                    "inline-flex items-center justify-center w-7 h-7 rounded " +
                    (device === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")
                  }
                  title={`${d} (${DEVICE_PX[d]}px)`}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>

          {/* Cancel / Save — only appear when dirty */}
          {isDirty && (
            <>
              <button
                type="button"
                onClick={cancelChanges}
                disabled={saving}
                className="adv-btn-secondary text-[11px] inline-flex items-center gap-1"
                title="Revert all unsaved changes"
              >
                <X className="size-3.5" /> Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveChanges()}
                disabled={saving}
                className="adv-btn text-[11px] inline-flex items-center gap-1"
                title="Save changes to the live page"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="adv-btn-secondary text-[11px] inline-flex items-center gap-1" title="Open the saved live preview in a new tab">
            <ExternalLink className="size-3" /> Open
          </a>
          <button
            type="button"
            onClick={async () => {
              // Operator: "I want to have a button that exports the HTML
              // of the page so that we can easily, whatever is needed."
              // Fetches /api/v2/landers/:id/export with auth, returns
              // fully-substituted standalone HTML, triggers blob download.
              const token = getToken() || "";
              const r = await fetch(`/api/v2/landers/${lander.id}/export`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!r.ok) {
                setError(`Export failed: ${r.status}`);
                return;
              }
              const blob = await r.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${(lander.internal_name || "lander").replace(/[^A-Za-z0-9._-]/g, "_")}.html`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(a.href);
            }}
            className="adv-btn-secondary text-[11px] inline-flex items-center gap-1"
            title="Download the lander as a standalone HTML file (importable to any builder — CheckoutChamp, etc.)"
          >
            <Download className="size-3" /> Export HTML
          </button>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="adv-btn-secondary text-[11px] inline-flex items-center gap-1"
            title={panelOpen ? "Hide settings panel" : "Show settings panel"}
          >
            {panelOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
            {panelOpen ? "Hide" : "Settings"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
          <span><strong>Save error:</strong> {error}</span>
          <button onClick={() => setError(null)} className="text-amber-900 hover:underline">dismiss</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── CENTER: WYSIWYG iframe (edit mode) ───────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-auto">
          <div className="flex-1 grid place-items-start justify-center py-4 px-4">
            <div className="relative" style={{ width: deviceWidthPx, maxWidth: "100%" }}>
              {!iframeReady && (
                <div className="absolute inset-0 grid place-items-center bg-white/80 z-10 rounded">
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> Loading editor…
                  </div>
                </div>
              )}
              <iframe
                key={iframeKey}
                src={editUrl}
                className="w-full bg-white border rounded shadow-sm"
                style={{ height: "calc(100vh - 80px)" }}
                title="Lander WYSIWYG editor"
              />
            </div>
          </div>
        </div>

        {/* ── RIGHT: collapsible settings panel ────────────────────── */}
        {panelOpen && (
        <div className="w-[360px] shrink-0 border-l bg-card overflow-y-auto">
          <div className="px-4 py-3 border-b sticky top-0 bg-card z-10 inline-flex items-center gap-2 w-full">
            <SettingsIcon className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Settings</span>
          </div>

        {/* Magazine + domain + CTA */}
        <div className="p-4 space-y-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Publish settings</div>
            {lander.voluum_status && lander.voluum_status !== "not_submitted" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                ● LIVE
              </span>
            )}
          </div>
          {/* Live-in-Voluum lock notice — domain + path are READ-ONLY,
              CTA edits require a foundational-change warning */}
          {lander.voluum_status && lander.voluum_status !== "not_submitted" && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[10.5px] text-amber-900 leading-snug">
              <strong>Locked.</strong> Domain + extension path can't be changed on a live lander.
              To make foundational changes, click <strong>Duplicate</strong> on the project page and edit the copy.
              CTA changes are still allowed — but you'll see a confirmation first.
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium mb-1">Magazine</label>
            <select
              className="adv-input"
              value={lander.magazine_slug || ""}
              onChange={(e) => updateMeta("magazine_slug", e.target.value || null)}
              disabled={!!(lander.voluum_status && lander.voluum_status !== "not_submitted")}
            >
              <option value="">— no magazine —</option>
              {availableMagazines.map((m) => (
                <option key={m.slug} value={m.slug}>{m.name}</option>
              ))}
            </select>
            {project.brand_slug && availableMagazines.length < magazines.length && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                Showing {availableMagazines.length} of {magazines.length} magazines — filtered to those approved for brand <code className="font-mono">{project.brand_slug}</code>.
              </div>
            )}
          </div>
          {currentMagazine && (
            <>
              <div>
                <label className="block text-[11px] font-medium mb-1">
                  Domain {lander.voluum_status && lander.voluum_status !== "not_submitted" && <Lock className="size-2.5 inline ml-1 text-amber-700" />}
                </label>
                <select
                  className="adv-input"
                  value={lander.domain || ""}
                  onChange={(e) => updateMeta("domain", e.target.value || null)}
                  disabled={!!(lander.voluum_status && lander.voluum_status !== "not_submitted")}
                >
                  <option value="">— pick a domain —</option>
                  {currentMagazine.domains.map((d) => (
                    <option key={d.domain} value={d.domain}>{d.domain}{d.dns_status === "pending" ? " (DNS pending)" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">
                  Extension path {lander.voluum_status && lander.voluum_status !== "not_submitted" && <Lock className="size-2.5 inline ml-1 text-amber-700" />}
                </label>
                <input
                  type="text"
                  className="adv-input font-mono text-[11px]"
                  placeholder="/pages/top-5-magnesium-creams"
                  value={lander.extension_path || ""}
                  onChange={(e) => updateMeta("extension_path", e.target.value || null)}
                  disabled={!!(lander.voluum_status && lander.voluum_status !== "not_submitted")}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">
                  CTA destination
                  <span className="ml-1 text-[9px] text-muted-foreground font-normal">
                    from brand <code className="font-mono">{project.brand_slug || "—"}</code>
                  </span>
                </label>
                <select
                  className="adv-input"
                  value={lander.cta_preset_id || ""}
                  onChange={(e) => {
                    // No iframe-side confirmation. The server-side
                    // live-Voluum guard at save time provides a single
                    // clear warning + force option; double-prompting
                    // here was confusing operators who clicked OK on
                    // the first dialog then thought the change saved
                    // without ever clicking Save Changes.
                    const id = e.target.value;
                    const preset = ctaPresets.find((p) => p.id === id);
                    updateMeta("cta_preset_id", id || null);
                    if (preset) updateMeta("cta_url", preset.url);
                  }}
                >
                  <option value="">— pick a funnel —</option>
                  {ctaPresets.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                {ctaPresets.length === 0 && (
                  <div className="mt-1 text-[10px] text-amber-700">
                    No CTAs configured for this brand yet. Add some in <Link href="/brands-products" className="underline">Brands &amp; Products</Link>.
                  </div>
                )}
                {lander.cta_preset_id && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {ctaPresets.find((p) => p.id === lander.cta_preset_id)?.description}
                  </div>
                )}
                {lander.cta_url && (
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">→ {lander.cta_url}</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Internal lander name — operator clarification: rename this
            so it doesn't get confused with the Voluum lander name
            (which is locked once submitted). */}
        <div className="p-4 space-y-3 border-b">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Internal lander name</label>
            <input
              type="text"
              className="adv-input text-sm mt-1"
              value={lander.internal_name}
              onChange={(e) => updateMeta("internal_name", e.target.value)}
              placeholder="cleantra-magnesium-v3"
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              Only for organizing inside this tool. Doesn't push to Voluum.
            </div>
          </div>

          {/* Browser tab title — operator: "I also want you to allow us
              to edit the text that's on the tab, like the thing that's
              next to the favicon." */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Browser tab title</label>
            <input
              type="text"
              className="adv-input text-sm mt-1"
              value={lander.tab_title || ""}
              onChange={(e) => updateMeta("tab_title", e.target.value || null)}
              placeholder={currentMagazine?.name || "Health Insights Magazine"}
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              Shows next to the favicon in the browser tab. Leave blank to fall back to the magazine name.
            </div>
          </div>
        </div>

        {/* Missing-images banner — appears when bg image gen didn't
            fill every slot. Single button kicks off a re-run of the
            missing slots only (using the BLOCK_NONE + sanitized-retry
            pipeline, which lands far more reliably than older landers
            that were generated before that fix). */}
        {(lander.image_gen_total || 0) > (lander.image_gen_done || 0) && (
          <MissingImagesBanner
            landerId={lander.id}
            done={lander.image_gen_done || 0}
            total={lander.image_gen_total || 0}
            onRegenerated={() => { setIframeKey((k) => k + 1); setIframeReady(false); }}
          />
        )}

        {/* Sections panel removed per operator: not useful — reorder
            happens in-iframe via the floating ↑/↓ controls. */}

        {/* "Other text slots" + "Lede / non-section HTML" collapsibles
            removed per operator: "no need for 'Other text slots (17) —
            click to expand' section we should just be able to update
            it straight on the page itself." All text editing happens
            in the iframe now. */}
        </div>
        )}
      </div>

      {regenSlot && (
        <ImageRegenModal
          lander={lander}
          slotKey={regenSlot}
          onClose={() => setRegenSlot(null)}
          onPick={(url) => {
            applyImageRegen(regenSlot, url);
            setRegenSlot(null);
          }}
        />
      )}
    </div>
  );
}

function SlotEditor({
  slotKey,
  value,
  onChange,
  multiline,
  isHtml,
}: {
  slotKey: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  isHtml?: boolean;
}) {
  // HTML slots: show a textarea with the raw HTML. Multiline. The brief
  // parser emits <p>…</p>-wrapped paragraphs so the operator edits a
  // single block per section.
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
        {slotKey}
        {isHtml && <span className="ml-2 normal-case font-sans text-[9px] opacity-60">html — wrap paragraphs in &lt;p&gt;</span>}
      </label>
      {multiline ? (
        <textarea
          className="adv-textarea text-[12px] min-h-[80px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="adv-input text-[12px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function ImageRegenModal({
  lander,
  slotKey,
  onClose,
  onPick,
}: {
  lander: V2Lander;
  slotKey: string;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [useCurrent, setUseCurrent] = useState(true);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUrl = lander.image_urls[slotKey];

  async function submit() {
    setBusy(true);
    setError(null);
    setVariants([]);
    try {
      const form = new FormData();
      form.append("slot_key", slotKey);
      form.append("prompt", prompt);
      form.append("use_current_as_reference", useCurrent ? "true" : "false");
      form.append("variant_count", "5");
      if (refFile) form.append("reference_image", refFile);
      const token = getToken();
      const r = await fetch(`/api/v2/landers/${lander.id}/regenerate-image`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
        body: form,
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`${r.status}: ${txt.slice(0, 200)}`);
      }
      const data = await r.json();
      setVariants(data.variants || []);
      if ((data.variants || []).length === 0) setError("All 5 variations failed to generate — try a different prompt.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image regen failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="adv-card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Regenerate image</div>
            <div className="text-[11px] font-mono text-muted-foreground">{slotKey}</div>
          </div>
          {currentUrl && (
            <img src={currentUrl} alt="current" className="size-20 object-cover rounded border" />
          )}
        </div>

        <div>
          <label className="block text-[11px] font-medium mb-1">Prompt</label>
          <textarea
            autoFocus
            className="adv-textarea min-h-[80px]"
            placeholder='e.g. "make the bottle face left instead of right" or "swap the kitchen for a clinic exam room"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={useCurrent}
            onChange={(e) => setUseCurrent(e.target.checked)}
          />
          <span>
            <strong>Use current image as reference.</strong>{" "}
            <span className="text-muted-foreground">Edits the existing image per your prompt instead of starting fresh. Uncheck for a fully new composition.</span>
          </span>
        </label>
        <div>
          <label className="block text-[11px] font-medium mb-1 inline-flex items-center gap-1">
            <Upload className="size-3" /> Optional extra reference image
          </label>
          <input
            type="file"
            accept="image/*"
            className="text-xs"
            onChange={(e) => setRefFile(e.target.files?.[0] || null)}
          />
          {refFile && <div className="text-[10px] text-muted-foreground mt-1">{refFile.name}</div>}
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="adv-btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="adv-btn text-xs inline-flex items-center gap-1" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {busy ? "Generating 5 variations…" : variants.length ? "Regenerate" : "Generate 5 variations"}
          </button>
        </div>
        {variants.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Pick one ({variants.length})
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {variants.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPick(url)}
                  className="relative aspect-[16/9] rounded border overflow-hidden hover:ring-2 hover:ring-primary group"
                >
                  <img src={url} alt={`variant ${i + 1}`} className="size-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-center p-1">
                    <div className="opacity-0 group-hover:opacity-100 text-[10px] text-white font-semibold inline-flex items-center gap-1">
                      <Check className="size-3" /> Pick
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MissingImagesBanner — shows when image_gen_done < image_gen_total
 * (i.e. the original bg job left some slots empty, usually because they
 * were generated before the BLOCK_NONE + sanitized-retry fix landed).
 *
 * Single click kicks off /api/v2/landers/:id/regenerate-missing-images
 * which walks the project's imagePrompts, finds empty slots, and re-runs
 * Gemini for those specific ones using the current improved pipeline.
 */
function MissingImagesBanner({
  landerId,
  done,
  total,
  onRegenerated,
}: {
  landerId: string;
  done: number;
  total: number;
  onRegenerated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function regen() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch(`/api/v2/landers/${landerId}/regenerate-missing-images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() || ""}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await r.json();
      if (!r.ok) {
        setResult(`Failed: ${data?.message || r.status}`);
        return;
      }
      setResult(`Re-running ${data.missing_count} missing slots (${(data.missing_slots || []).join(", ")}). Page will refresh in 60s — or click Save changes after.`);
      // Auto-refresh the iframe after a delay to surface the new images
      window.setTimeout(() => { onRegenerated(); }, 60_000);
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const missing = total - done;
  return (
    <div className="p-4 border-b bg-amber-50">
      <div className="text-[11px] font-medium text-amber-900 mb-1.5">
        ⚠ {missing} image{missing === 1 ? "" : "s"} missing ({done}/{total} filled)
      </div>
      <div className="text-[10px] text-amber-800 leading-snug mb-2">
        Some image slots are empty — usually because they failed in the original generation. Click to re-run just the missing ones using the latest gen pipeline.
      </div>
      <button
        type="button"
        onClick={() => void regen()}
        disabled={busy}
        className="adv-btn text-[11px] inline-flex items-center gap-1"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
        {busy ? "Kicking off…" : `Regenerate ${missing} missing image${missing === 1 ? "" : "s"}`}
      </button>
      {result && (
        <div className="mt-2 text-[10px] text-amber-900 leading-snug">
          {result}
        </div>
      )}
    </div>
  );
}
