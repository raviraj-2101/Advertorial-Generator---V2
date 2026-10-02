import { Fragment, type CSSProperties, type ReactNode } from "react";

// ─── Inline markdown helpers ──────────────────────────────────────────
// The LLM frequently emits markdown emphasis (**bold**, *italic*, __bold__)
// and section/header markers (#, ##, ###) inside section content. The
// renderer's job is to surface clean editorial typography — so we strip
// the header markers (the section TYPE already provides the structure)
// and convert ** and __ to real <strong> spans.

/** Strip leading markdown header marks like "# ", "## " etc. */
function stripLeadingHashes(s: string): string {
  return s.replace(/^\s*#{1,6}\s+/, "");
}

/** Strip any markdown header marks anywhere in the string (used inside
 *  prose paragraphs to avoid orphan "## " or "### " fragments after the
 *  LLM wrote pseudo-sub-headers we don't want). */
function stripAllHashes(s: string): string {
  return s.replace(/(^|\n)\s*#{1,6}\s+/g, "$1");
}

/** Convert **bold** / __bold__ inline emphasis to JSX with <strong>.
 *  Returns a Fragment of mixed text + <strong> nodes. Single-pass; if
 *  the asterisks are unbalanced we leave them as plain text. */
function formatInline(s: string): ReactNode {
  const cleaned = stripAllHashes(s);
  const parts: ReactNode[] = [];
  const re = /(\*\*|__)([^*_\n]+?)\1/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(cleaned)) !== null) {
    if (m.index > last) parts.push(cleaned.slice(last, m.index));
    parts.push(<strong key={key++}>{m[2]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) parts.push(cleaned.slice(last));
  return <Fragment>{parts}</Fragment>;
}


export interface LanderSection {
  id: string;
  type: string;
  content: string;
  design_class?: string;
}

export interface LanderDesign {
  font_family_headline?: string;
  font_family_body?: string;
  color_accent?: string;
  cta_button_style?: string;
  divider_style?: string;
  layout_density?: string;
}

interface SectionProps {
  section: LanderSection;
  imageUrls: Record<string, string>;
  design: LanderDesign;
  ctaUrl?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  trust_bar: "Editorial masthead",
  byline: "Byline",
  headline: "Headline",
  subhead: "Sub-headline",
  dek: "Sub-headline",
  prose: "Body",
  lede: "Lede",
  personal_story: "The night everything changed",
  night_everything_changed: "The night everything changed",
  mind_blowing_discovery: "The mind-blowing discovery",
  mechanism: "The mechanism",
  real_root_cause: "The real root cause",
  mechanism_detail: "How it works",
  how_it_works: "How it works",
  fifteen_minute_miracle: "The 15-minute miracle",
  solution_reveal: "The solution",
  conspiracy: "The industry pushback",
  industry_pushback: "The industry pushback",
  product_intro: "The product",
  pricing: "The price comparison",
  price_comparison: "The price comparison",
  offer_reveal: "Today's offer",
  scarcity: "Scarcity",
  guarantee: "Risk-free guarantee",
  choice: "Your choice",
  choice_framing: "Your choice",
  social_proof: "Real results",
  results_section: "Real results",
  testimonials_widget: "What people are saying",
  cta_instructions: "How to order",
  cta: "Order now",
  cta_block_repeat: "Order now",
  legal: "Disclaimer",
  legal_disclaimer: "Disclaimer",
  image: "",
  ps: "P.S.",
  pps: "P.P.S.",
  ppps: "P.P.P.S.",
};

const STAT_RE = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*%?)/g;

function renderImage(section: LanderSection, imageUrls: Record<string, string>): ReactNode {
  const match = section.content.match(/\[\[image:([a-z0-9_-]+)\]\]/i);
  const slot = match?.[1] || section.id;
  const url = imageUrls[slot];
  if (!url) {
    return (
      <div className="my-6 rounded border-2 border-dashed border-slate-300 bg-slate-50 py-12 text-center text-xs text-slate-500">
        image slot <code>{slot}</code> — not yet generated
      </div>
    );
  }
  return (
    <figure className="my-6">
      <img src={url} alt={slot} className="w-full rounded-lg shadow-sm" />
    </figure>
  );
}

function renderTrustBar(section: LanderSection): ReactNode {
  const lines = section.content.split("\n").filter((l) => l.trim().length);
  const masthead = lines[0] || "Health Insights Magazine";
  const meta = lines.slice(1).join(" • ");
  return (
    <header className="border-b border-slate-200 bg-slate-50 px-6 py-3 text-center">
      <div className="font-serif text-base font-semibold tracking-tight text-slate-700">{masthead}</div>
      {meta && <div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-slate-500">{meta}</div>}
      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">Home › Health</div>
    </header>
  );
}

function renderByline(section: LanderSection): ReactNode {
  return (
    <div className="border-b border-slate-200 px-6 py-3 text-sm italic text-slate-600">
      {section.content ? formatInline(section.content) : "By Dr. [Author Name], [Specialty]"}
    </div>
  );
}

function renderHeadline(section: LanderSection, design: LanderDesign): ReactNode {
  // LLM often emits "# Headline text" — strip the leading markdown header
  // marks since this section already renders as an <h1>.
  const text = section.content ? stripLeadingHashes(section.content) : "";
  return (
    <h1
      className="px-6 pt-8 pb-2 text-center text-3xl font-bold leading-tight tracking-tight text-slate-900 md:text-4xl"
      style={{ fontFamily: design.font_family_headline || "'Source Serif Pro', Georgia, serif" }}
    >
      {text || "(headline pending — pick from candidates)"}
    </h1>
  );
}

function renderDek(section: LanderSection, design: LanderDesign): ReactNode {
  return (
    <p
      className="px-6 pb-6 text-center text-lg italic leading-relaxed text-slate-700 border-b border-slate-200"
      style={{ fontFamily: design.font_family_body || "system-ui, sans-serif" }}
    >
      {formatInline(section.content || "")}
    </p>
  );
}

function renderMiniHeader(label: string, design: LanderDesign): ReactNode {
  if (!label) return null;
  return (
    <div
      className="mb-3 border-t border-slate-200 pt-6 text-[11px] font-bold uppercase tracking-[0.18em]"
      style={{ color: design.color_accent || "#B91C1C" }}
    >
      {label}
    </div>
  );
}

function renderProseSection(section: LanderSection, design: LanderDesign): ReactNode {
  const label = TYPE_LABELS[section.type] ?? "";
  const paragraphs = section.content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="px-6 py-6" style={{ fontFamily: design.font_family_body || "system-ui, sans-serif" }}>
      {renderMiniHeader(label, design)}
      <div className="space-y-4 text-[17px] leading-[1.75] text-slate-800">
        {paragraphs.length > 0
          ? paragraphs.map((p, i) => <p key={i}>{formatInline(p)}</p>)
          : (
              <p className="italic text-slate-400">(empty {section.type} section — click Edit to write)</p>
            )}
      </div>
    </div>
  );
}

function renderMechanismDetail(section: LanderSection, design: LanderDesign): ReactNode {
  const label = TYPE_LABELS[section.type] || "How it works";
  const phaseRe = /^\s*(?:Phase\s*\d+[:.]?|\d+[.)])\s*(.+)/gim;
  const matches = Array.from(section.content.matchAll(phaseRe));
  if (matches.length >= 2) {
    return (
      <div className="px-6 py-6" style={{ fontFamily: design.font_family_body || "system-ui, sans-serif" }}>
        {renderMiniHeader(label, design)}
        <ol className="space-y-4">
          {matches.map((m, i) => (
            <li key={i} className="flex gap-4">
              <span
                className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: design.color_accent || "#B91C1C" }}
              >
                {i + 1}
              </span>
              <span className="text-[17px] leading-[1.75] text-slate-800">{m[1]}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return renderProseSection(section, design);
}

function renderStatBox(section: LanderSection, design: LanderDesign): ReactNode {
  const label = TYPE_LABELS[section.type] || "Real results";
  const stats: string[] = [];
  const text = section.content;
  const percentRe = /(\d{1,3}(?:\.\d+)?\s*%)/g;
  let m: RegExpExecArray | null;
  while ((m = percentRe.exec(text)) !== null) {
    stats.push(m[1]);
    if (stats.length >= 4) break;
  }
  if (stats.length >= 2) {
    return (
      <div className="px-6 py-6">
        {renderMiniHeader(label, design)}
        <div className="my-2 grid grid-cols-2 gap-3 md:grid-cols-3">
          {stats.slice(0, 3).map((s, i) => (
            <div
              key={i}
              className="rounded-lg border-2 p-4 text-center"
              style={{ borderColor: design.color_accent || "#B91C1C" }}
            >
              <div
                className="text-3xl font-bold leading-none"
                style={{ color: design.color_accent || "#B91C1C", fontFamily: design.font_family_headline }}
              >
                {s}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">verified result</div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-4 text-[17px] leading-[1.75] text-slate-800" style={{ fontFamily: design.font_family_body }}>
          {section.content.split(/\n{2,}/).filter(Boolean).map((p, i) => <p key={i}>{formatInline(p)}</p>)}
        </div>
      </div>
    );
  }
  return renderProseSection(section, design);
}

function renderTestimonials(section: LanderSection, design: LanderDesign): ReactNode {
  const label = TYPE_LABELS[section.type] || "What people are saying";
  // Try to detect testimonial-shaped lines: "Name (Age, City): quote" or "Name — City — quote"
  const blocks: Array<{ name: string; meta: string; quote: string }> = [];
  const candidates = section.content.split(/\n\n|\n/).filter((l) => l.trim().length > 10);
  for (const c of candidates) {
    const m = c.match(/^([A-Z][a-z]+(?:\s[A-Z]\.?)?)\s*[\(\—,]\s*([^):]+?)\s*[\):]\s*(.+)$/);
    if (m) {
      blocks.push({ name: m[1] || "", meta: m[2] || "", quote: m[3] || "" });
    }
  }
  if (blocks.length >= 2) {
    return (
      <div className="px-6 py-6">
        {renderMiniHeader(label, design)}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {blocks.slice(0, 4).map((b, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="size-10 rounded-full bg-slate-200 text-center text-sm font-bold leading-10 text-slate-500">
                  {(b.name[0] || "?").toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{b.name}</div>
                  <div className="text-[11px] text-slate-500">{b.meta}</div>
                </div>
              </div>
              <div className="mt-1 text-amber-500" aria-label="5 star rating">★★★★★</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{b.quote}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return renderProseSection(section, design);
}

function renderPriceComparison(section: LanderSection, design: LanderDesign): ReactNode {
  const label = TYPE_LABELS[section.type] || "How it compares";
  const lines = section.content.split("\n").filter((l) => l.trim().length);
  const rows: Array<{ name: string; price: string }> = [];
  for (const l of lines) {
    const m = l.match(/^[•\-\*]?\s*([A-Za-z][A-Za-z\s&\-]+?)[\s:—-]+(\$[\d,]+(?:\.\d{2})?(?:\s*\/?(?:month|year|session))?[+]?[^.]*)/);
    if (m) rows.push({ name: m[1].trim(), price: m[2].trim() });
  }
  if (rows.length >= 2) {
    return (
      <div className="bg-slate-50 px-6 py-6">
        {renderMiniHeader(label, design)}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {rows.slice(0, 6).map((r, i) => (
            <div key={i} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0">
              <div className="text-sm text-slate-800">{r.name}</div>
              <div className="font-mono text-sm font-bold text-slate-900">{r.price}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return renderProseSection(section, design);
}

function renderOfferReveal(section: LanderSection, design: LanderDesign): ReactNode {
  const discountMatch = section.content.match(/(\d{2,3})\s*%\s*(?:off|discount)/i);
  const discount = discountMatch?.[1];
  return (
    <div
      className="px-6 py-10 text-center text-white"
      style={{ background: design.color_accent || "#B91C1C", fontFamily: design.font_family_body }}
    >
      {discount && (
        <div
          className="mx-auto mb-4 inline-flex size-24 items-center justify-center rounded-full border-4 border-white font-bold leading-tight"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          <div>
            <div className="text-3xl">{discount}%</div>
            <div className="text-[11px] uppercase tracking-wider">OFF</div>
          </div>
        </div>
      )}
      <div className="space-y-3 text-lg leading-relaxed">
        {section.content.split(/\n{2,}/).filter((p) => p.trim()).map((p, i) => (
          <p key={i}>{formatInline(p)}</p>
        ))}
      </div>
    </div>
  );
}

function renderScarcity(section: LanderSection, design: LanderDesign): ReactNode {
  const numberMatch = section.content.match(/(\d{1,3}(?:,\d{3})+)\s*(?:units?|left|remaining)/i);
  const units = numberMatch?.[1];
  return (
    <div
      className="border-y-2 px-6 py-6 text-center"
      style={{ borderColor: design.color_accent || "#B91C1C", background: "#fff7ed", fontFamily: design.font_family_body }}
    >
      {renderMiniHeader("Limited inventory", design)}
      {units && (
        <div
          className="my-2 font-mono text-3xl font-bold"
          style={{ color: design.color_accent || "#B91C1C" }}
        >
          {units} <span className="text-base font-normal text-slate-600">units left</span>
        </div>
      )}
      <p className="mt-2 text-base leading-relaxed text-slate-800">{formatInline(section.content)}</p>
    </div>
  );
}

function renderGuarantee(section: LanderSection, design: LanderDesign): ReactNode {
  return (
    <div className="border-y border-amber-200 bg-amber-50 px-6 py-6 text-center" style={{ fontFamily: design.font_family_body }}>
      <div
        className="mx-auto mb-3 inline-flex size-16 items-center justify-center rounded-full bg-amber-400 text-white"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-8">
          <path d="M9 12l2 2 4-4M12 2l3 1 3-1 1 3 3 1-1 3 2 3-2 3 1 3-3 1-1 3-3-1-3 1-3-1-1-3-3-1 1-3-2-3 2-3-1-3 3-1 1-3 3 1z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-base leading-relaxed text-slate-800">{formatInline(section.content)}</p>
    </div>
  );
}

function renderCta(section: LanderSection, design: LanderDesign, ctaUrl?: string | null): ReactNode {
  // Strip markdown junk (#, ##, ###, **, __) before extracting the CTA
  // label so "## 👉 CLAIM MY 50% DISCOUNT" surfaces "CLAIM MY 50% DISCOUNT".
  const cleanedContent = section.content
    .replace(/[#*_]+/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .trim();
  // \s would include newlines and greedily eat the secondary CTA;
  // [ \t] keeps the match on a single line.
  const labelMatch = cleanedContent.match(/(?:^|\n)\s*([A-Z][A-Z \t\d%']{4,})/);
  const label = labelMatch?.[1]?.trim() || "ORDER NOW";
  const hasCta = !!ctaUrl;
  // In the editor preview the CTA must NOT navigate — clicking the link
  // shouldn't take the user away to the projects page or anywhere else
  // unintentionally. Until a CTA URL is set via the Bulk CTA panel the
  // button is rendered as a non-interactive <button type="button"> that
  // preventDefaults; once a URL is set it becomes a real <a>.
  const inner = (
    <span className="inline-block rounded-full px-10 py-4 text-base font-bold uppercase tracking-[0.08em] text-white shadow-md transition-transform hover:scale-105"
          style={{ background: design.color_accent || "#B91C1C" }}>
      {label}
    </span>
  );
  return (
    <div className="px-6 py-8 text-center" style={{ fontFamily: design.font_family_body }}>
      {hasCta ? (
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block"
        >
          {inner}
        </a>
      ) : (
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className="inline-block"
          title="CTA URL not set — apply one in the right panel to make this clickable"
        >
          {inner}
        </button>
      )}
      {cleanedContent.length > label.length + 5 && (
        <p className="mx-auto mt-4 max-w-prose text-sm leading-relaxed text-slate-700">
          {formatInline(cleanedContent.replace(label, "").trim())}
        </p>
      )}
      {!hasCta && (
        <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          CTA URL not set
        </div>
      )}
    </div>
  );
}

function renderInstructions(section: LanderSection, design: LanderDesign): ReactNode {
  const label = TYPE_LABELS[section.type] || "How to order";
  const stepRe = /^\s*(?:\d+[.)]|Step\s*\d+:?)\s*(.+)/gim;
  const matches = Array.from(section.content.matchAll(stepRe));
  if (matches.length >= 2) {
    return (
      <div className="bg-slate-50 px-6 py-6">
        {renderMiniHeader(label, design)}
        <ol className="space-y-3">
          {matches.map((m, i) => (
            <li key={i} className="flex gap-3 text-[15px] text-slate-800">
              <span className="font-bold text-slate-500">{i + 1}.</span>
              <span>{formatInline(m[1] || "")}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return renderProseSection(section, design);
}

function renderLegal(section: LanderSection, design: LanderDesign): ReactNode {
  return (
    <div className="px-6 py-6 text-[11px] leading-[1.6] text-slate-400" style={{ fontFamily: design.font_family_body || "system-ui, sans-serif" }}>
      <div className="border-t border-slate-200 pt-4">{formatInline(section.content)}</div>
    </div>
  );
}

function renderPs(section: LanderSection, design: LanderDesign): ReactNode {
  const label = TYPE_LABELS[section.type] || "P.S.";
  return (
    <div className="px-6 py-3 text-[15px] italic leading-[1.7] text-slate-700" style={{ fontFamily: design.font_family_body }}>
      <span className="font-bold not-italic mr-2">{label}</span>
      {formatInline(section.content)}
    </div>
  );
}

export function LanderSectionView({ section, imageUrls, design, ctaUrl }: SectionProps): ReactNode {
  switch (section.type) {
    case "trust_bar":
      return renderTrustBar(section);
    case "byline":
      return renderByline(section);
    case "headline":
      return renderHeadline(section, design);
    case "subhead":
    case "dek":
      return renderDek(section, design);
    case "image":
      return renderImage(section, imageUrls);
    case "mechanism_detail":
    case "how_it_works":
      return renderMechanismDetail(section, design);
    case "social_proof":
    case "results_section":
      return renderStatBox(section, design);
    case "testimonials_widget":
      return renderTestimonials(section, design);
    case "pricing":
    case "price_comparison":
      return renderPriceComparison(section, design);
    case "offer_reveal":
      return renderOfferReveal(section, design);
    case "scarcity":
      return renderScarcity(section, design);
    case "guarantee":
      return renderGuarantee(section, design);
    case "cta":
    case "cta_block_repeat":
      return renderCta(section, design, ctaUrl);
    case "cta_instructions":
      return renderInstructions(section, design);
    case "legal":
    case "legal_disclaimer":
      return renderLegal(section, design);
    case "ps":
    case "pps":
    case "ppps":
      return renderPs(section, design);
    default:
      return renderProseSection(section, design);
  }
}

export function LanderPageWrapper({
  children,
  design,
}: {
  children: ReactNode;
  design: LanderDesign;
}): ReactNode {
  const style: CSSProperties = {
    fontFamily: design.font_family_body || "system-ui, sans-serif",
  };
  return (
    <div className="mx-auto max-w-3xl bg-white shadow-sm" style={style}>
      {children}
    </div>
  );
}
