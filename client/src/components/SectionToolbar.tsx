import { Pencil, Sparkles, ImageIcon, LayoutTemplate, ChevronUp, ChevronDown, Copy, Trash2 } from "lucide-react";

interface SectionToolbarProps {
  onEdit: () => void;
  onAiRewrite: () => void;
  onClassClick: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
  /** When the active section is an image, the toolbar swaps "AI Rewrite"
   *  for "AI Regenerate" and the parent wires it to the image-regen flow
   *  instead of the text-rewrite flow. */
  isImage?: boolean;
}

/**
 * Phase 6.1 spec. Hover-pill toolbar that floats above the active section
 * in editor mode. Dark rounded pill, white labels, green accent on the
 * primary Edit button. Match `docs/reference/section-toolbar-target.png`.
 *
 * Layout left → right:
 *   Edit (primary, green)  | AI Rewrite | Class | ↑ | ↓ | Dup | Del
 *
 * Behavioural rules per Section 6.1:
 *   - Only one toolbar visible at a time (handled by the parent editor).
 *   - Click into a different section closes the previous toolbar.
 *   - All actions persist immediately via PATCH /api/landers/:id/sections.
 *   - Move Up / Move Down are disabled on first / last.
 *   - Delete prompts confirm before persisting (handled in parent).
 */
export function SectionToolbar(props: SectionToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Section actions"
      className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-slate-100 shadow-lg px-1 py-1 text-xs"
    >
      <button
        type="button"
        onClick={props.onEdit}
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 bg-emerald-500 text-emerald-50 hover:bg-emerald-400"
        title="Edit (E) — inline edit this section"
      >
        <Pencil className="size-3.5" /> Edit
      </button>
      <button
        type="button"
        onClick={props.onAiRewrite}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-slate-700"
        title={props.isImage ? "AI Regenerate — edit this image with a prompt" : "AI Rewrite — describe what to change"}
      >
        {props.isImage ? (
          <>
            <ImageIcon className="size-3.5" /> AI Regenerate
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" /> AI Rewrite
          </>
        )}
      </button>
      {/* Class popover is a Phase-9 feature — hidden per §13.2
          (full-stack functional or not shipped). Re-enable when the
          template-declared class_options picker UI lands. */}
      <button
        type="button"
        onClick={props.onMoveUp}
        disabled={props.isFirst}
        className="inline-flex items-center px-2 py-1.5 rounded-full hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
        title="Move up (↑)"
        aria-label="Move section up"
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={props.onMoveDown}
        disabled={props.isLast}
        className="inline-flex items-center px-2 py-1.5 rounded-full hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
        title="Move down (↓)"
        aria-label="Move section down"
      >
        <ChevronDown className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={props.onDuplicate}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-slate-700"
        title="Duplicate"
      >
        <Copy className="size-3.5" /> Dup
      </button>
      <button
        type="button"
        onClick={props.onDelete}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-rose-700"
        title="Delete (Del — confirmation required)"
      >
        <Trash2 className="size-3.5" /> Del
      </button>
    </div>
  );
}
