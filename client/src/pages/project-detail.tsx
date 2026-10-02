import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { apiFetch, getToken } from "../lib/queryClient";
import { Loader2, Sparkles, FileText } from "lucide-react";

interface Project {
  id: string;
  name: string;
  product_slug: string;
  direction_prompt: string;
  selected_template_slugs: string[];
}

interface Skeleton {
  id: string;
  template_slug: string;
  title_candidates: string[];
  title_chosen: string | null;
  body: { sections: Array<{ id: string; type: string; summary: string }>; offer_strategy: string };
  status: string;
}

interface Lander {
  id: string;
  template_slug: string;
  internal_name: string;
  status: string;
}

// Plain-English labels for the internal section type codes. The card UI
// shows the friendly label to the copywriter; the code is exposed only as
// a small mono caption.
const SECTION_LABEL: Record<string, string> = {
  trust_bar: "Editorial masthead",
  byline: "Byline",
  headline: "Headline",
  subhead: "Sub-headline",
  dek: "Sub-headline",
  prose: "Opening prose",
  lede: "Opening prose",
  personal_story: "The night everything changed",
  night_everything_changed: "The night everything changed",
  mind_blowing_discovery: "The mind-blowing discovery",
  mechanism: "How it works (mechanism)",
  real_root_cause: "The real root cause",
  mechanism_detail: "How it works (detail)",
  how_it_works: "How it works",
  fifteen_minute_miracle: "The 15-minute breakthrough",
  solution_reveal: "Solution reveal",
  conspiracy: "Industry pushback",
  industry_pushback: "Industry pushback",
  product_intro: "Product intro",
  pricing: "Price comparison",
  price_comparison: "Price comparison",
  offer_reveal: "Today's offer",
  scarcity: "Scarcity",
  guarantee: "Risk-free guarantee",
  choice: "Your choice",
  choice_framing: "Your choice",
  social_proof: "Real results",
  results_section: "Real results",
  testimonials_widget: "Customer testimonials",
  cta_instructions: "How to order",
  cta: "Order now",
  cta_block_repeat: "Order now (repeat)",
  legal: "Disclaimer",
  legal_disclaimer: "Disclaimer",
  image: "Image",
  ps: "P.S.",
  pps: "P.P.S.",
  ppps: "P.P.P.S.",
};

function labelFor(type: string): string {
  return SECTION_LABEL[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id || "";
  const [project, setProject] = useState<Project | null>(null);
  const [skeletons, setSkeletons] = useState<Skeleton[]>([]);
  const [landers, setLanders] = useState<Lander[]>([]);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  // Loading state model. Each phase gets a label that's shown in the
  // progress card so the user knows the tool isn't stuck.
  type Phase =
    | { kind: "idle" }
    | { kind: "skeleton"; status: string; done: number; total: number }
    | { kind: "lander"; status: string; done: number; total: number };
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    void (async () => {
      await load();
      // Auto-flow: if ?autostart=1 is present in EITHER the hash query OR
      // the document search (wouter with hash routing tends to write it to
      // location.search rather than after the hash) AND this project has
      // no skeletons yet, immediately fire skeleton generation. One-click
      // create → skeleton.
      const fromHash = new URLSearchParams(window.location.hash.split("?")[1] || "");
      const fromSearch = new URLSearchParams(window.location.search);
      const autostart = fromHash.get("autostart") === "1" || fromSearch.get("autostart") === "1";
      if (autostart) {
        // Strip both query surfaces so a reload doesn't re-trigger.
        const hashBase = window.location.hash.split("?")[0];
        window.history.replaceState(null, "", window.location.pathname + hashBase);
        const fresh = await apiFetch<{ skeletons: Array<{ id: string }> }>(
          `/api/projects/${projectId}`,
        );
        if (!fresh.skeletons.length) void runSkeletonGeneration();
      }
    })();
  }, [projectId]);

  async function load() {
    const res = await apiFetch<{ project: Project; skeletons: Skeleton[]; landers: Lander[] }>(`/api/projects/${projectId}`);
    setProject(res.project);
    setSkeletons(res.skeletons);
    setLanders(res.landers);
  }

  async function runSkeletonGeneration() {
    setBusy(true);
    setStreamLog([]);
    const total = project?.selected_template_slugs?.length || 1;
    setPhase({ kind: "skeleton", status: "Reading skill + template + product configs…", done: 0, total });
    try {
      const tok = getToken();
      const res = await fetch(`/api/projects/${projectId}/generate-skeletons`, {
        method: "POST",
        headers: { Authorization: tok ? `Bearer ${tok}` : "" },
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = 0;
      while (reader) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const messages = buf.split("\n\n");
        buf = messages.pop() || "";
        for (const m of messages) {
          const eventLine = m.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = m.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice("event:".length).trim();
          const data = JSON.parse(dataLine.slice("data:".length).trim());
          setStreamLog((l) => [...l, `[${event}] ${JSON.stringify(data).slice(0, 160)}`]);
          if (event === "skeleton") {
            setSkeletons((s) => [...s, data.skeleton]);
            done += 1;
            setPhase({ kind: "skeleton", status: `Skeleton ${done}/${total} ready`, done, total });
          } else if (event === "start" || event === "template") {
            setPhase({ kind: "skeleton", status: `Generating skeleton ${done + 1}/${total} — 20 candidates → top 5…`, done, total });
          }
        }
      }
    } finally {
      setBusy(false);
      setPhase({ kind: "idle" });
      await load();
    }
  }

  async function runLanderGeneration() {
    if (approved.size === 0) return;
    setBusy(true);
    const total = approved.size;
    setPhase({ kind: "lander", status: "Compiling section-level prompts from skeleton…", done: 0, total });
    try {
      const tok = getToken();
      const res = await fetch(`/api/projects/${projectId}/generate-landers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: tok ? `Bearer ${tok}` : "" },
        body: JSON.stringify({ skeletonIds: Array.from(approved) }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = 0;
      while (reader) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const messages = buf.split("\n\n");
        buf = messages.pop() || "";
        for (const m of messages) {
          const eventLine = m.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = m.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice("event:".length).trim();
          const data = JSON.parse(dataLine.slice("data:".length).trim());
          setStreamLog((l) => [...l, `[${event}] ${JSON.stringify(data).slice(0, 160)}`]);
          if (event === "section") {
            const sid = (data?.section_id || data?.id || "?") as string;
            setPhase((p) =>
              p.kind === "lander"
                ? { ...p, status: `Lander ${done + 1}/${total} — writing section "${sid}"…` }
                : p,
            );
          } else if (event === "image") {
            const slot = (data?.slot || data?.image_slot || "?") as string;
            setPhase((p) =>
              p.kind === "lander"
                ? { ...p, status: `Lander ${done + 1}/${total} — rendering image slot "${slot}"…` }
                : p,
            );
          } else if (event === "lander") {
            done += 1;
            setPhase({ kind: "lander", status: `Lander ${done}/${total} ready`, done, total });
          } else if (event === "start") {
            setPhase({ kind: "lander", status: `Lander ${done + 1}/${total} — building…`, done, total });
          }
        }
      }
    } finally {
      setBusy(false);
      setPhase({ kind: "idle" });
      await load();
    }
  }

  if (!project) {
    return <div className="px-8 py-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="px-8 py-6 space-y-6">
      <div>
        <Link href="/projects" className="adv-link text-xs">← projects</Link>
        <h1 className="text-xl font-semibold mt-1">{project.name}</h1>
        <div className="text-xs text-muted-foreground">
          {project.product_slug} · templates: {project.selected_template_slugs.join(", ") || "(none)"}
        </div>
        <p className="text-sm mt-2 max-w-3xl whitespace-pre-wrap">{project.direction_prompt}</p>
      </div>

      <div className="flex gap-2">
        <button className="adv-btn" disabled={busy} onClick={() => void runSkeletonGeneration()}>
          {busy && phase.kind === "skeleton" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Building skeleton…
            </>
          ) : skeletons.length ? (
            "Regenerate skeletons"
          ) : (
            <>
              <Sparkles className="size-3.5" /> Generate skeletons
            </>
          )}
        </button>
        <button
          className="adv-btn-secondary"
          disabled={busy || approved.size === 0}
          onClick={() => void runLanderGeneration()}
        >
          {busy && phase.kind === "lander" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Rendering lander…
            </>
          ) : (
            <>
              <FileText className="size-3.5" />
              Generate {approved.size || ""} lander{approved.size === 1 ? "" : "s"} from approved skeletons
            </>
          )}
        </button>
      </div>

      {/* Progress card — visible while a generation phase is running. */}
      {phase.kind !== "idle" && (
        <div className="adv-card border-primary/30 bg-primary/[0.03] p-5">
          <div className="flex items-start gap-4">
            <div className="relative mt-1">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {phase.kind === "skeleton" ? "Building skeleton" : "Rendering lander"}
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {phase.done}/{phase.total}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{phase.status}</div>
              {/* Progress bar */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{
                    width: `${Math.max(8, Math.min(100, (phase.done / Math.max(1, phase.total)) * 100))}%`,
                  }}
                />
              </div>
              <div className="mt-3 text-[10px] text-muted-foreground">
                This can take 60-180 seconds per item — the LLM is reading the skill, the template,
                and the product config, then writing 20 title candidates, scoring them, and
                expanding the full section model.
              </div>
            </div>
          </div>
        </div>
      )}

      {skeletons.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Skeletons ({skeletons.length})</div>
            <div className="text-[11px] text-muted-foreground">{approved.size} approved · click a title alternative to pick it</div>
          </div>
          <div className={skeletons.length > 1 ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : "max-w-3xl"}>
            {skeletons.map((sk) => {
              const isApproved = approved.has(sk.id);
              const chosen = sk.title_chosen || sk.title_candidates[0] || "(no title)";
              return (
                <div
                  key={sk.id}
                  className={`adv-card overflow-hidden ${isApproved ? "ring-2 ring-primary" : ""}`}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {sk.template_slug}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{sk.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Discard this skeleton? This cannot be undone.")) return;
                          await apiFetch(`/api/skeletons/${sk.id}`, { method: "DELETE" });
                          setSkeletons((s) => s.filter((x) => x.id !== sk.id));
                          setApproved((a) => {
                            const n = new Set(a);
                            n.delete(sk.id);
                            return n;
                          });
                        }}
                        className="rounded-md border border-transparent px-2.5 py-1 text-[11px] text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        title="Discard this skeleton"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(approved);
                          if (next.has(sk.id)) next.delete(sk.id);
                          else next.add(sk.id);
                          setApproved(next);
                        }}
                        className={
                          isApproved
                            ? "rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground"
                            : "rounded-md border border-primary/40 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
                        }
                      >
                        {isApproved ? "✓ Approved" : "Approve"}
                      </button>
                    </div>
                  </div>

                  {/* Headline + alternatives */}
                  <div className="border-b px-5 py-4">
                    <div className="font-serif text-xl font-bold leading-tight text-slate-900">{chosen}</div>
                    {sk.title_candidates.length > 1 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                          {sk.title_candidates.length} title alternatives — pick one
                        </summary>
                        <div className="mt-2 space-y-1">
                          {sk.title_candidates.map((t, i) => {
                            const picked = chosen === t;
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/skeletons/${sk.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ title_chosen: t }),
                                  });
                                  setSkeletons((all) => all.map((x) => (x.id === sk.id ? { ...x, title_chosen: t } : x)));
                                }}
                                className={
                                  "block w-full rounded-md border px-3 py-2 text-left text-sm leading-snug transition-colors " +
                                  (picked
                                    ? "border-primary bg-primary/5 text-foreground"
                                    : "border-transparent hover:border-border hover:bg-muted/40 text-muted-foreground")
                                }
                              >
                                <span className="font-mono text-[10px] text-muted-foreground mr-2">{i + 1}.</span>
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>

                  {/* Section model */}
                  <div className="px-5 py-4">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
                      {sk.body.sections.length} sections planned
                    </div>
                    <ol className="space-y-3">
                      {sk.body.sections.map((s, i) => (
                        <li key={s.id} className="rounded-lg border bg-card p-3">
                          <div className="mb-1 flex items-baseline gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                            <span className="text-[12px] font-semibold text-foreground">{labelFor(s.type)}</span>
                            <span
                              className="font-mono text-[9px] text-muted-foreground/60"
                              title="internal section id"
                            >
                              {s.id}
                            </span>
                          </div>
                          <div className="text-sm leading-relaxed text-foreground">{s.summary}</div>
                          {/* Per-section revise input */}
                          <SectionReviseInput skeletonId={sk.id} sectionId={s.id} onApplied={(updated) => {
                            setSkeletons((all) => all.map((x) => (x.id === sk.id ? updated : x)));
                          }} />
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Whole-skeleton revise prompt */}
                  <SkeletonReviseBar skeletonId={sk.id} onApplied={(updated) => {
                    setSkeletons((all) => all.map((x) => (x.id === sk.id ? updated : x)));
                  }} />

                  {/* Offer strategy footer */}
                  {sk.body.offer_strategy && (
                    <div className="border-t bg-amber-50/60 px-5 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
                        Offer strategy
                      </div>
                      <div className="text-xs leading-relaxed text-slate-700">{sk.body.offer_strategy}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {landers.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Landers</div>
          <ul className="space-y-2">
            {landers.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/projects/${project.id}/landers/${l.id}`}
                  className="adv-card block p-3 hover:bg-muted/60 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{l.internal_name}</div>
                      <div className="text-xs text-muted-foreground">{l.template_slug}</div>
                    </div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{l.status}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {streamLog.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Generation log ({streamLog.length} events)</summary>
          <pre className="mt-1 text-[10px] bg-muted/40 p-2 rounded overflow-x-auto">
            {streamLog.join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

// Per-section revision input. Collapsed by default to keep the card scannable;
// expand → type the change → submit. Hits POST /api/skeletons/:id/revise with
// target_section_id set to this section's id. The backend rewrites just this
// section's summary and returns the updated skeleton.
function SectionReviseInput({
  skeletonId,
  sectionId,
  onApplied,
}: {
  skeletonId: string;
  sectionId: string;
  onApplied: (sk: Skeleton) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Sparkles className="size-3" /> revise this section
      </button>
    );
  }
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          const res = await apiFetch<{ skeleton: Skeleton }>(`/api/skeletons/${skeletonId}/revise`, {
            method: "POST",
            body: JSON.stringify({ revision_prompt: text.trim(), target_section_id: sectionId }),
          });
          onApplied(res.skeleton);
          setText("");
          setOpen(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        autoFocus
        className="adv-input flex-1 text-xs"
        placeholder="What should this section say instead?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />
      <button type="submit" className="adv-btn-secondary text-[11px]" disabled={busy || !text.trim()}>
        {busy ? <Loader2 className="size-3 animate-spin" /> : "Apply"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setText("");
        }}
        className="text-[11px] text-muted-foreground hover:text-foreground"
        disabled={busy}
      >
        cancel
      </button>
    </form>
  );
}

// Whole-skeleton revise prompt bar — pinned to the bottom of the card.
function SkeletonReviseBar({
  skeletonId,
  onApplied,
}: {
  skeletonId: string;
  onApplied: (sk: Skeleton) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="border-t bg-muted/30 px-5 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          const res = await apiFetch<{ skeleton: Skeleton }>(`/api/skeletons/${skeletonId}/revise`, {
            method: "POST",
            body: JSON.stringify({ revision_prompt: text.trim() }),
          });
          onApplied(res.skeleton);
          setText("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
        Revise the whole skeleton
      </div>
      <div className="flex gap-2">
        <input
          className="adv-input flex-1 text-xs"
          placeholder='e.g. "Lead the headline with the visible postpartum bloat, not lymphatic" or "Make the personal story a single parent at a kids’ birthday party"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="adv-btn text-xs" disabled={busy || !text.trim()}>
          {busy ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Applying…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" /> Apply to all
            </>
          )}
        </button>
      </div>
    </form>
  );
}
