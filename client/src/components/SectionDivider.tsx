import { Plus } from "lucide-react";
import { useState } from "react";

interface SectionDividerProps {
  onInsert: (type: string) => void;
  /** The set of section types declared in the active template's
   *  frontmatter. Drives the type-picker popover. */
  availableTypes: string[];
}

/**
 * Hover-revealed `+` affordance shown above and below every section in
 * editor mode. Clicking opens a small popover so the user can pick the
 * type of new section; the default is `prose`.
 *
 * Visual: a 12px high gap. On hover the center reveals a 28x28 round
 * button with a plus icon. The popover renders below the button.
 */
export function SectionDivider({ onInsert, availableTypes }: SectionDividerProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative group h-3 my-1">
      <div className="absolute inset-x-0 top-1/2 h-px bg-transparent group-hover:bg-border transition-colors" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-6 rounded-full border bg-card shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-muted"
        aria-label="Insert section here"
      >
        <Plus className="size-3" />
      </button>
      {open && (
        <div className="absolute left-1/2 top-7 -translate-x-1/2 z-20 w-48 rounded-md border bg-popover p-1 shadow-md">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Section type</div>
          {(availableTypes.length ? availableTypes : ["prose"]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setOpen(false);
                onInsert(t);
              }}
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
