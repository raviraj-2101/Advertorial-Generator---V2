/**
 * templateRenderer.ts — turn a `templates-source/<slug>/template.html` +
 * a slot-value dict into a finished, ready-to-publish HTML page.
 *
 * The reference template HTML is a verbatim clone of the production
 * advertorial (e.g. smarthealthpractices.com/adv-rc-sm-lg-us-5) with text
 * + image URLs replaced by `{{SLOT_KEY}}` placeholders. The renderer's job
 * is the simplest possible substitution: find every `{{KEY}}` and replace
 * with `values[KEY]`. Unknown / missing slots are left as the placeholder
 * (so the operator can see what's still empty in the editor preview).
 *
 * Slot values can be:
 *   - plain text → substituted as-is, HTML-escaped if `escape` is true
 *   - HTML fragment → substituted raw (for body sections that contain
 *     paragraph splits, line breaks, optional inline emphasis)
 *   - image URL → substituted into the existing `<img src="...">`
 *     attributes verbatim
 *
 * No markdown parsing here — V2's contract is that the BRIEF carries the
 * formatting (Heading 1/2 styles, `[IMAGE PLACEHOLDER]` markers) and the
 * brief parser pre-converts those into safe HTML fragments before the
 * renderer gets called.
 */

import fs from "node:fs";
import path from "node:path";

export interface SlotValues {
  [key: string]: string;
}

export interface RenderOptions {
  /** When true, leave unfilled `{{KEY}}` placeholders intact instead of
   *  blanking them. Useful for the editor preview where the copywriter
   *  is still working through slots. Default: true. */
  keepPlaceholders?: boolean;
  /** When true, wrap every substituted slot value with a
   *  `data-slot-key="KEY"` marker (text/html → wrapped span/div;
   *  image → attribute injected on the surrounding img). Pair with the
   *  injected editor script (see `editorBootstrapScript`) to make the
   *  preview iframe directly editable. Default: false. */
  editMode?: boolean;
}

export interface SlotManifestEntry {
  key: string;
  type: "text" | "image" | "html";
  required?: boolean;
  description?: string;
  default?: string;
  aspect_ratio?: string;
}

export interface TemplateManifest {
  slug: string;
  name: string;
  reference_url: string;
  section_headers_count: number;
  image_slot_count: number;
  slots: SlotManifestEntry[];
}

const TEMPLATES_DIR = path.join(process.cwd(), "templates-source");

export function listTemplates(): TemplateManifest[] {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  const slugs = fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(TEMPLATES_DIR, d.name, "slots.json")))
    .map((d) => d.name);
  return slugs.map(loadManifest).filter((x): x is TemplateManifest => !!x);
}

export function loadManifest(slug: string): TemplateManifest | null {
  const p = path.join(TEMPLATES_DIR, slug, "slots.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as TemplateManifest;
}

export function loadTemplateHtml(slug: string): string | null {
  const p = path.join(TEMPLATES_DIR, slug, "template.html");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function renderTemplate(slug: string, values: SlotValues, opts: RenderOptions = {}): string {
  const html = loadTemplateHtml(slug);
  if (!html) throw new Error(`Template '${slug}' not found`);
  const manifest = loadManifest(slug);
  // Apply defaults from manifest first so a brief with missing values
  // still produces a recognizable page.
  const merged: SlotValues = {};
  if (manifest) {
    for (const s of manifest.slots) {
      if (s.default) merged[s.key] = s.default;
    }
  }
  Object.assign(merged, values);
  const keepPlaceholders = opts.keepPlaceholders ?? true;
  const editMode = opts.editMode ?? false;
  // Build a key→type map for edit-mode wrapping decisions.
  const slotType = new Map<string, "text" | "image" | "html">();
  if (manifest) {
    for (const s of manifest.slots) slotType.set(s.key, s.type);
  }
  let out = html;

  if (editMode) {
    // Step 1 — for IMAGE slots (always referenced as src="{{KEY}}"),
    // tag the surrounding <img> with data-slot-key so the in-iframe
    // editor knows it's clickable. The substitution itself happens in
    // the main loop below.
    out = out.replace(/(<img\b[^>]*\bsrc=")\{\{([A-Z0-9_]+)\}\}([^"]*"[^>]*)>/g, (m, prefix, key, rest) => {
      if (slotType.get(key) !== "image") return m;
      // Strip any pre-existing data-slot-key to avoid double-tagging.
      const cleaned = rest.replace(/\s+data-slot-key="[^"]*"/g, "");
      return `${prefix}{{${key}}}${cleaned} data-slot-key="${key}" data-slot-type="image">`;
    });
  }

  // Detect whether a {{KEY}} occurrence is inside an HTML attribute
  // (i.e. between `="` and the next `"` inside a tag). If yes, we MUST
  // substitute raw — wrapping with a <span> would inject ">" inside the
  // attribute value and shatter the parent tag. This was the cause of
  // the "raw attribute syntax visible on the page" bug for CTA_URL /
  // PRIVACY_POLICY_URL / TERMS_URL.
  function isInsideAttribute(haystack: string, offset: number): boolean {
    // Walk backwards from offset. Find the nearest unmatched `<` or `>`.
    // If we find `<` first AND there's an `="` between it and `offset`
    // (with no closing `"` before us), we're inside an attribute.
    const lastLt = haystack.lastIndexOf("<", offset);
    const lastGt = haystack.lastIndexOf(">", offset);
    if (lastLt <= lastGt) return false; // not even inside a tag
    const tagSlice = haystack.slice(lastLt, offset);
    // Count unescaped quotes in the tag-slice. Odd count = we're inside
    // an attribute value (between the opening `"` and the closing one).
    let inQuote = false;
    for (let i = 0; i < tagSlice.length; i++) {
      if (tagSlice[i] === '"') inQuote = !inQuote;
    }
    return inQuote;
  }

  // Multi-pass: a slot value (e.g. SECTION_n_BODY produced by the brief
  // parser) may itself contain inline {{IMG_N_URL}} references. Loop
  // until no more substitutions happen, bounded to 5 iterations to
  // defend against pathological self-referencing values.
  for (let i = 0; i < 5; i++) {
    let didReplace = false;
    out = out.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key, offset, full) => {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) {
        return keepPlaceholders ? match : "";
      }
      const v = merged[key];
      const raw = v == null ? "" : String(v);
      // If we're inside an HTML attribute, NEVER wrap — always substitute
      // raw, even in edit mode.
      const insideAttr = isInsideAttribute(full, offset);
      if (!editMode || insideAttr) {
        if (raw !== match) didReplace = true;
        return raw;
      }
      // Edit mode wrap: text → contenteditable span; html → div; image
      // values are not wrapped (the data-slot-key already lives on the
      // surrounding <img> via step 1 above).
      const t = slotType.get(key) || "text";
      let wrapped: string;
      if (t === "image") {
        wrapped = raw;
      } else if (t === "html") {
        wrapped = `<div data-slot-key="${key}" data-slot-type="html" class="adv-edit-html" contenteditable="true">${raw}</div>`;
      } else {
        wrapped = `<span data-slot-key="${key}" data-slot-type="text" class="adv-edit-text" contenteditable="true">${raw}</span>`;
      }
      if (wrapped !== match) didReplace = true;
      return wrapped;
    });
    if (!didReplace) break;
  }

  if (editMode) {
    // Append the bootstrap CSS + script. Both run inside the iframe
    // and postMessage changes back to the parent window. See the
    // editorBootstrapScript function below for the contract.
    out = out.replace(/<\/body>/i, `${EDITOR_BOOTSTRAP}\n</body>`);
  }
  return out;
}

/**
 * Bootstrap CSS + script injected into edit-mode renders.
 *
 * Contract with the parent (lander-editor-v2.tsx):
 *   - PARENT → IFRAME (none for now; could send "save-ok" later)
 *   - IFRAME → PARENT:
 *       {type:"slot-change", key, value}      on blur of a text/html span/div
 *       {type:"image-click", key, currentUrl} on click of an image
 *       {type:"section-move", n, dir}         on ↑/↓ button inside a section header
 *       {type:"ready"}                        on DOMContentLoaded (so parent can dismiss the loader)
 *
 * The script:
 *   - Highlights editable regions on hover (dashed outline)
 *   - Suppresses link navigation when a text node inside an <a> is being
 *     edited (so clicking the CTA inside the iframe doesn't navigate away)
 *   - Adds floating ↑/↓ controls next to each SECTION_n_HEADER element
 *   - Adds a "click to regen" hint over each tagged image
 */
const EDITOR_BOOTSTRAP = `
<style id="adv-edit-styles">
  .adv-edit-text, .adv-edit-html { outline: 1px dashed transparent; transition: outline-color 120ms ease-out; cursor: text; min-width: 4ch; }
  .adv-edit-text:hover, .adv-edit-html:hover { outline-color: rgb(59 130 246 / 0.6); }
  .adv-edit-text:focus, .adv-edit-html:focus { outline: 2px solid rgb(59 130 246); outline-offset: 1px; }
  [data-slot-type="image"] { outline: 1px dashed transparent; transition: outline-color 120ms ease-out; cursor: pointer; }
  [data-slot-type="image"]:hover { outline-color: rgb(217 119 6 / 0.7); box-shadow: 0 0 0 3px rgb(254 215 170 / 0.5); }
  .adv-section-controls { position: absolute; top: -8px; right: -8px; display: flex; gap: 2px; background: white; border: 1px solid rgb(229 231 235); border-radius: 999px; padding: 2px; box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); z-index: 100; opacity: 0; transition: opacity 120ms; }
  [data-section-wrapper]:hover .adv-section-controls { opacity: 1; }
  .adv-section-controls button { width: 22px; height: 22px; border: 0; background: transparent; cursor: pointer; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1; color: rgb(75 85 99); }
  .adv-section-controls button:hover { background: rgb(243 244 246); color: black; }
  .adv-section-controls button:disabled { opacity: 0.3; cursor: not-allowed; }
  body.adv-edit-mode a { pointer-events: none; }
  body.adv-edit-mode [data-slot-type="image"], body.adv-edit-mode [data-slot-key] { pointer-events: auto; }
  /* + Add section affordance between sections + at the end */
  .adv-add-section { position: relative; margin: 4px 0; padding: 12px 0; text-align: center; }
  .adv-add-section .adv-add-line { position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgb(59 130 246 / 0); transition: background 120ms; }
  .adv-add-section:hover .adv-add-line { background: rgb(59 130 246 / 0.4); }
  .adv-add-section .adv-add-btn {
    position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px;
    background: white; color: rgb(59 130 246); border: 1px dashed rgb(59 130 246 / 0.5);
    padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 500; cursor: pointer;
    opacity: 0.3; transition: all 150ms; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .adv-add-section:hover .adv-add-btn { opacity: 1; background: rgb(59 130 246); color: white; border-color: rgb(59 130 246); }
  .adv-add-menu {
    position: absolute; z-index: 200; background: white; border: 1px solid rgb(229 231 235);
    border-radius: 10px; box-shadow: 0 10px 25px rgb(0 0 0 / 0.12);
    padding: 4px; min-width: 180px;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .adv-add-menu .adv-add-menu-item {
    display: block; width: 100%; text-align: left; padding: 8px 12px; border: 0; background: transparent;
    border-radius: 6px; font-size: 12.5px; color: rgb(31 41 55); cursor: pointer; line-height: 1.3;
  }
  .adv-add-menu .adv-add-menu-item:hover { background: rgb(243 244 246); }
  .adv-add-menu .adv-add-menu-section { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: rgb(107 114 128); padding: 8px 12px 4px; font-weight: 600; }
  .adv-add-menu .adv-add-menu-sub { color: rgb(107 114 128); font-size: 10.5px; margin-left: 6px; }
</style>
<script>
(function(){
  document.body.classList.add('adv-edit-mode');
  function post(msg){ try { parent.postMessage(msg, '*'); } catch(e){} }

  // Text/html: postMessage on blur with the current innerText/innerHTML.
  document.querySelectorAll('[data-slot-key]').forEach(function(el){
    var type = el.getAttribute('data-slot-type');
    if (type === 'image') {
      el.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        post({ type: 'image-click', key: el.getAttribute('data-slot-key'), currentUrl: el.getAttribute('src') || '' });
      });
    } else {
      var lastSent = type === 'html' ? el.innerHTML : el.innerText;
      el.addEventListener('blur', function(){
        var v = type === 'html' ? el.innerHTML : el.innerText;
        if (v === lastSent) return;
        lastSent = v;
        post({ type: 'slot-change', key: el.getAttribute('data-slot-key'), value: v });
      });
      // Prevent Enter from inserting a div/br in text spans (single-line by default).
      if (type === 'text') {
        el.addEventListener('keydown', function(ev){
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
        });
      }
    }
  });

  // Find each SECTION_n header and wrap with up/down controls.
  var sectionHeaders = [];
  document.querySelectorAll('[data-slot-key]').forEach(function(el){
    var k = el.getAttribute('data-slot-key') || '';
    var m = k.match(/^SECTION_(\\d+)_HEADER$/);
    if (m) sectionHeaders.push({ el: el, n: parseInt(m[1], 10) });
  });
  sectionHeaders.sort(function(a, b){ return a.n - b.n; });
  // Find the closest block-level ancestor that contains the BODY too so
  // the ↑/↓ controls float relative to the whole section block.
  sectionHeaders.forEach(function(s, idx){
    var anchor = s.el;
    for (var i = 0; i < 4; i++) {
      if (anchor.parentElement) anchor = anchor.parentElement;
    }
    if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';
    anchor.setAttribute('data-section-wrapper', String(s.n));
    var box = document.createElement('div');
    box.className = 'adv-section-controls';
    var up = document.createElement('button');
    up.type = 'button'; up.title = 'Move section up'; up.textContent = '↑';
    up.disabled = idx === 0;
    up.addEventListener('click', function(ev){
      ev.preventDefault(); ev.stopPropagation();
      post({ type: 'section-move', n: s.n, dir: -1 });
    });
    var dn = document.createElement('button');
    dn.type = 'button'; dn.title = 'Move section down'; dn.textContent = '↓';
    dn.disabled = idx === sectionHeaders.length - 1;
    dn.addEventListener('click', function(ev){
      ev.preventDefault(); ev.stopPropagation();
      post({ type: 'section-move', n: s.n, dir: 1 });
    });
    box.appendChild(up); box.appendChild(dn);
    anchor.appendChild(box);
  });

  // ─── "+ Add section" affordance ─────────────────────────────────────
  // Inserts a "+" button after each section's body block AND at the end
  // of the article. Clicking opens a small popover menu with options:
  //   - Add text section
  //   - Add image (16:9)
  //   - Add image (1:1)
  //   - Add image (9:16)
  // postMessages back to parent: {type:"insert-section", afterN, kind, aspectRatio}.
  function closeAnyOpenMenu(){ document.querySelectorAll('.adv-add-menu').forEach(function(m){ m.remove(); }); }
  document.addEventListener('click', function(ev){
    var t = ev.target;
    if (t && t.closest && !t.closest('.adv-add-menu') && !t.closest('.adv-add-btn')) closeAnyOpenMenu();
  });
  function openAddMenu(afterN, anchorEl){
    closeAnyOpenMenu();
    var menu = document.createElement('div');
    menu.className = 'adv-add-menu';
    var rect = anchorEl.getBoundingClientRect();
    menu.style.top = (window.scrollY + rect.bottom + 6) + 'px';
    menu.style.left = (window.scrollX + rect.left) + 'px';
    function item(label, sub, kind, ar){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'adv-add-menu-item';
      b.innerHTML = label + '<span class="adv-add-menu-sub">' + (sub || '') + '</span>';
      b.addEventListener('click', function(ev){
        ev.preventDefault(); ev.stopPropagation();
        closeAnyOpenMenu();
        post({ type: 'insert-section', afterN: afterN, kind: kind, aspectRatio: ar || null });
      });
      menu.appendChild(b);
    }
    var hdr = document.createElement('div');
    hdr.className = 'adv-add-menu-section';
    hdr.textContent = 'Insert ' + (afterN === 0 ? 'at top' : ('after section ' + afterN));
    menu.appendChild(hdr);
    item('Text section', '', 'text');
    var imgHdr = document.createElement('div');
    imgHdr.className = 'adv-add-menu-section';
    imgHdr.textContent = 'Image (choose aspect)';
    menu.appendChild(imgHdr);
    item('Horizontal', '16:9', 'image', '16:9');
    item('Square', '1:1', 'image', '1:1');
    item('Vertical', '9:16', 'image', '9:16');
    document.body.appendChild(menu);
  }
  function makePlusBtn(afterN){
    var wrap = document.createElement('div');
    wrap.className = 'adv-add-section';
    wrap.setAttribute('data-add-after', String(afterN));
    wrap.innerHTML = '<div class="adv-add-line"></div><button type="button" class="adv-add-btn">＋ Add section</button>';
    var btn = wrap.querySelector('button');
    btn.addEventListener('click', function(ev){
      ev.preventDefault(); ev.stopPropagation();
      openAddMenu(afterN, btn);
    });
    return wrap;
  }
  // Insert + button after each section block (anchor = the wrapper element
  // we set earlier). Skip empty sections so we don't crowd the page.
  sectionHeaders.forEach(function(s){
    var wrapper = document.querySelector('[data-section-wrapper="' + s.n + '"]');
    if (!wrapper) return;
    var hdrVal = (s.el.innerText || '').trim();
    var bodyEl = document.querySelector('[data-slot-key="SECTION_' + s.n + '_BODY"]');
    var bodyVal = bodyEl ? (bodyEl.innerText || '').trim() : '';
    if (!hdrVal && !bodyVal) return; // empty — skip
    var plus = makePlusBtn(s.n);
    if (wrapper.parentNode) wrapper.parentNode.insertBefore(plus, wrapper.nextSibling);
  });
  // Also at the very top (afterN=0)
  if (sectionHeaders.length > 0) {
    var first = document.querySelector('[data-section-wrapper="' + sectionHeaders[0].n + '"]');
    if (first && first.parentNode) {
      var topPlus = makePlusBtn(0);
      first.parentNode.insertBefore(topPlus, first);
    }
  }

  post({ type: 'ready' });
})();
</script>
`;

/** Produce the empty/preview render — every slot left as `{{KEY}}` so
 *  the operator can see the unfilled state. */
export function renderEmpty(slug: string): string {
  return renderTemplate(slug, {}, { keepPlaceholders: true });
}
