import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { apiFetch } from "../lib/queryClient";
import { SectionToolbar } from "../components/SectionToolbar";
import { SectionDivider } from "../components/SectionDivider";
import { LanderSectionView, LanderPageWrapper, type LanderDesign } from "../components/LanderRenderer";
import { Undo2, Redo2, Loader2 } from "lucide-react";

interface LanderSection {
  id: string;
  type: string;
  content: string;
  design_class?: string;
}

interface Lander {
  id: string;
  template_slug: string;
  internal_name: string;
  status: string;
  section_model: LanderSection[];
  html: string | null;
  image_urls: Record<string, string>;
  cta_url: string | null;
  published_url: string | null;
}

interface TemplateMeta {
  slug: string;
  name: string;
  sections: Array<{ id: string; type: string }>;
  design?: LanderDesign;
}

export default function LanderEditorPage() {
  const params = useParams();
  const landerId = params.landerId || "";
  const projectId = params.id || "";
  const [lander, setLander] = useState<Lander | null>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState<{ sectionId: string; prompt: string; kind: "text" | "image"; slotKey?: string; currentImageUrl?: string } | null>(null);
  const [bulkCta, setBulkCta] = useState("");
  const [busy, setBusy] = useState(false);
  // Undo/redo: snapshot the section_model every time we persist. Push the
  // PREVIOUS state to undoStack; clear redoStack on a new edit. Cmd/Ctrl-Z
  // pops undoStack onto current + pushes current onto redoStack. Shift-
  // Cmd/Ctrl-Z reverses. No risk of fucking up the lander — every state
  // mutation is reversible.
  const [undoStack, setUndoStack] = useState<LanderSection[][]>([]);
  const [redoStack, setRedoStack] = useState<LanderSection[][]>([]);
  // Reference to "current" lander for keyboard handler closure.
  const landerRef = useRef<Lander | null>(null);
  useEffect(() => { landerRef.current = lander; }, [lander]);

  useEffect(() => {
    void (async () => {
      const [proj, tmpl] = await Promise.all([
        apiFetch<{ project: { id: string }; landers: Lander[] }>(`/api/projects/${projectId}`),
        apiFetch<{ items: TemplateMeta[] }>("/api/templates"),
      ]);
      const found = proj.landers.find((l) => l.id === landerId);
      if (found) {
        setLander(found);
        if (found.cta_url) setBulkCta(found.cta_url);
      }
      setTemplates(tmpl.items);
    })();
  }, [projectId, landerId]);

  // Section 6.1 spec: "Clicking outside any section closes the toolbar
  // entirely." Global click handler resets activeSectionId when the click
  // target isn't inside any section block + isn't inside the toolbar +
  // isn't inside the AI-rewrite modal or any insertion popover.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest("[data-section-id]")) return;
      if (target.closest("[role=toolbar]")) return;
      // Allow clicks inside the AI-rewrite modal / divider popovers without
      // dismissing — they overlay on top of the document.
      if (target.closest("[data-keep-toolbar-open]")) return;
      setActiveSectionId(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const sectionTypes = useMemo(() => {
    const t = templates.find((x) => x.slug === lander?.template_slug);
    return t?.sections.map((s) => s.type) || ["prose"];
  }, [templates, lander]);

  const design = useMemo<LanderDesign>(() => {
    const t = templates.find((x) => x.slug === lander?.template_slug);
    return t?.design || {};
  }, [templates, lander]);

  async function persistSections(next: LanderSection[], opts?: { skipHistory?: boolean }) {
    if (!lander) return;
    const prev = lander.section_model;
    if (!opts?.skipHistory) {
      setUndoStack((s) => [...s.slice(-49), prev]);
      setRedoStack([]);
    }
    setLander({ ...lander, section_model: next });
    await apiFetch(`/api/landers/${landerId}/sections`, {
      method: "PATCH",
      body: JSON.stringify({ section_model: next }),
    });
  }

  function undo() {
    if (!landerRef.current || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s.slice(-49), landerRef.current!.section_model]);
    void persistSections(prev, { skipHistory: true });
  }

  function redo() {
    if (!landerRef.current || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s.slice(-49), landerRef.current!.section_model]);
    void persistSections(next, { skipHistory: true });
  }

  // Keyboard: Cmd/Ctrl-Z = undo, Shift-Cmd/Ctrl-Z = redo. MUST sit above
  // the early-return below — placing a hook after a conditional return
  // changes the hook order between renders (loading state vs loaded state)
  // and triggers React's rules-of-hooks invariant, which crashes the
  // entire component tree to a blank page. Lesson learned the hard way.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== "z") return;
      const t = e.target as Element | null;
      if (t && t.matches && (t.matches("textarea, input"))) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack]);

  if (!lander) return <div className="px-8 py-6 text-sm text-muted-foreground">Loading lander…</div>;

  function move(idx: number, dir: -1 | 1) {
    const next = [...lander!.section_model];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    void persistSections(next);
  }

  function duplicate(idx: number) {
    const next = [...lander!.section_model];
    const copy = { ...next[idx]!, id: `${next[idx]!.id}-copy-${Date.now()}` };
    next.splice(idx + 1, 0, copy);
    void persistSections(next);
  }

  function del(idx: number) {
    if (!confirm("Delete this section? This cannot be undone in this run.")) return;
    const next = [...lander!.section_model];
    next.splice(idx, 1);
    void persistSections(next);
  }

  function insert(idx: number, type: string) {
    const next = [...lander!.section_model];
    next.splice(idx, 0, {
      id: `${type}-${Date.now()}`,
      type,
      content: "",
    });
    void persistSections(next);
    setEditingId(next[idx]!.id);
    setActiveSectionId(next[idx]!.id);
  }

  async function runAiRewrite(sectionId: string, prompt: string) {
    setBusy(true);
    try {
      const r = await apiFetch<{ applied: string }>(`/api/landers/${landerId}/revise-section`, {
        method: "POST",
        body: JSON.stringify({ sectionId, prompt }),
      });
      const prev = lander!.section_model;
      setUndoStack((s) => [...s.slice(-49), prev]);
      setRedoStack([]);
      const next = lander!.section_model.map((s) => (s.id === sectionId ? { ...s, content: r.applied } : s));
      setLander({ ...lander!, section_model: next });
    } finally {
      setBusy(false);
      setAiPromptOpen(null);
    }
  }

  async function runImageRegen(slotKey: string, prompt: string) {
    setBusy(true);
    try {
      const r = await apiFetch<{ slotKey: string; url: string; placeholder: boolean; error?: string }>(
        `/api/landers/${landerId}/regenerate-image`,
        {
          method: "POST",
          body: JSON.stringify({
            slotKey,
            prompt: prompt || undefined,
            // Default: use the existing image as visual anchor so the
            // regen is an edit, not a from-scratch render. Server reads
            // the current image_urls[slot] as reference.
            useCurrentAsReference: true,
          }),
        },
      );
      if (r.url && lander) {
        setLander({ ...lander, image_urls: { ...lander.image_urls, [slotKey]: r.url } });
      }
    } finally {
      setBusy(false);
      setAiPromptOpen(null);
    }
  }

  async function setBulkCtaUrl() {
    if (!bulkCta) return;
    await apiFetch(`/api/landers/${landerId}/bulk-cta`, {
      method: "POST",
      body: JSON.stringify({ ctaUrl: bulkCta }),
    });
    setLander({ ...lander!, cta_url: bulkCta });
  }

  return (
    <div className="px-8 py-6 flex gap-6 min-w-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <Link href={`/projects/${projectId}`} className="adv-link text-xs">← project</Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={undoStack.length === 0}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
              title="Undo (⌘Z / Ctrl-Z)"
            >
              <Undo2 className="size-3.5" /> Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={redoStack.length === 0}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
              title="Redo (Shift-⌘Z / Shift-Ctrl-Z)"
            >
              <Redo2 className="size-3.5" /> Redo
            </button>
          </div>
        </div>
        <h1 className="text-xl font-semibold mt-1">{lander.internal_name}</h1>
        <div className="text-xs text-muted-foreground mb-4">{lander.template_slug} · {lander.status}</div>
        <LanderPageWrapper design={design}>
          {lander.section_model.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No sections yet. Insert one with the <code>+</code> affordance below.
            </div>
          )}
          {lander.section_model.map((s, i) => (
            <div key={s.id}>
              <SectionDivider availableTypes={sectionTypes} onInsert={(t) => insert(i, t)} />
              <div
                className={`relative group ${activeSectionId === s.id ? "ring-2 ring-primary/40 ring-inset" : ""}`}
                onClick={() => setActiveSectionId(s.id)}
                data-section-id={s.id}
                data-section-type={s.type}
              >
                <div className="absolute -top-3 left-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  {activeSectionId === s.id && (
                    <SectionToolbar
                      isImage={s.type === "image"}
                      onEdit={() => setEditingId(s.id)}
                      onAiRewrite={() => {
                        if (s.type === "image") {
                          // Branch to image regen: the section.id IS the
                          // slot key for image sections in this template
                          // (e.g. "hero_image", "demo_image"). The current
                          // URL is read from lander.image_urls so the
                          // modal can preview the existing image.
                          const slotKey = s.id;
                          setAiPromptOpen({
                            sectionId: s.id,
                            kind: "image",
                            slotKey,
                            currentImageUrl: lander.image_urls[slotKey],
                            prompt: "",
                          });
                        } else {
                          setAiPromptOpen({ sectionId: s.id, kind: "text", prompt: "" });
                        }
                      }}
                      onClassClick={() => alert("Class popover: pick from template-declared class_options")}
                      onMoveUp={() => move(i, -1)}
                      onMoveDown={() => move(i, 1)}
                      onDuplicate={() => duplicate(i)}
                      onDelete={() => del(i)}
                      isFirst={i === 0}
                      isLast={i === lander.section_model.length - 1}
                    />
                  )}
                </div>
                {editingId === s.id ? (
                  <div className="px-6 py-4">
                    <textarea
                      autoFocus
                      className="adv-textarea min-h-[160px] font-mono text-sm"
                      value={s.content}
                      onChange={(e) => {
                        const next = lander.section_model.map((x) => (x.id === s.id ? { ...x, content: e.target.value } : x));
                        setLander({ ...lander, section_model: next });
                      }}
                      onBlur={() => {
                        setEditingId(null);
                        void persistSections(lander.section_model);
                      }}
                    />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      type: <code>{s.type}</code> — blur to save
                    </div>
                  </div>
                ) : (
                  <LanderSectionView
                    section={s}
                    imageUrls={lander.image_urls}
                    design={design}
                    ctaUrl={lander.cta_url}
                  />
                )}
              </div>
            </div>
          ))}
          <SectionDivider availableTypes={sectionTypes} onInsert={(t) => insert(lander.section_model.length, t)} />
        </LanderPageWrapper>
      </div>

      <aside className="w-72 shrink-0 space-y-4">
        <div className="adv-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Bulk CTA URL</div>
          <input className="adv-input" value={bulkCta} onChange={(e) => setBulkCta(e.target.value)} placeholder="https://…" />
          <button type="button" className="adv-btn w-full mt-2" onClick={() => void setBulkCtaUrl()} disabled={!bulkCta}>
            Apply to all CTAs
          </button>
        </div>
        <div className="adv-card p-4 text-xs space-y-2">
          <div className="font-medium">Tips</div>
          <div className="text-muted-foreground">Click a section to reveal its toolbar. Drag-select prose to start a section revision.</div>
        </div>
      </aside>

      {aiPromptOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setAiPromptOpen(null)}>
          <div className="adv-card max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-medium mb-3">
              {aiPromptOpen.kind === "image" ? "AI Regenerate image" : "AI Rewrite"}
            </div>
            {aiPromptOpen.kind === "image" && aiPromptOpen.currentImageUrl && (
              <div className="mb-3 rounded-lg border bg-muted/30 p-2">
                <img
                  src={aiPromptOpen.currentImageUrl}
                  alt="current"
                  className="w-full max-h-56 object-contain rounded"
                />
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Current image — your prompt edits this image. Leave empty to re-render the slot using the template's default spec.
                </div>
              </div>
            )}
            <textarea
              autoFocus
              className="adv-textarea min-h-[120px]"
              value={aiPromptOpen.prompt}
              onChange={(e) => setAiPromptOpen({ ...aiPromptOpen, prompt: e.target.value })}
              placeholder={
                aiPromptOpen.kind === "image"
                  ? 'e.g. "change the hat to yellow instead of red" or "swap the kitchen for a clinic exam room"'
                  : "Describe what to change about this section…"
              }
            />
            <div className="flex gap-2 justify-end mt-3">
              <button className="adv-btn-secondary" onClick={() => setAiPromptOpen(null)}>Cancel</button>
              <button
                className="adv-btn"
                disabled={busy || (aiPromptOpen.kind === "text" && !aiPromptOpen.prompt)}
                onClick={() => {
                  if (aiPromptOpen.kind === "image" && aiPromptOpen.slotKey) {
                    void runImageRegen(aiPromptOpen.slotKey, aiPromptOpen.prompt);
                  } else {
                    void runAiRewrite(aiPromptOpen.sectionId, aiPromptOpen.prompt);
                  }
                }}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Regenerating…
                  </>
                ) : aiPromptOpen.kind === "image" ? (
                  "Regenerate image"
                ) : (
                  "Regenerate"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
