/**
 * Smart router for /projects/:id/landers/:landerId — tries V2 first
 * (advertorials_v2.landers) and falls back to V1 if not found.
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { apiFetch } from "../lib/queryClient";
import { Loader2 } from "lucide-react";
import V1LanderEditor from "./lander-editor";
import V2LanderEditor from "./lander-editor-v2";

export default function LanderEditorRouter() {
  const { id, landerId } = useParams();
  const [kind, setKind] = useState<"loading" | "v2" | "v1">("loading");

  useEffect(() => {
    if (!id || !landerId) return;
    void (async () => {
      try {
        const res = await apiFetch<{ project: unknown; landers: Array<{ id: string }> }>(`/api/v2/projects/${id}`);
        if (res?.landers?.some((l) => l.id === landerId)) {
          setKind("v2");
          return;
        }
      } catch {
        // ignore, fall through to V1
      }
      setKind("v1");
    })();
  }, [id, landerId]);

  if (kind === "loading") {
    return (
      <div className="px-8 py-12 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading editor…
      </div>
    );
  }
  if (kind === "v2") return <V2LanderEditor />;
  return <V1LanderEditor />;
}
