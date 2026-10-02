import { useState } from "react";
import { apiFetch } from "../lib/queryClient";

export default function SettingsPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await apiFetch<{ cleared: { products: number } }>("/api/refresh-configs", { method: "POST" });
      setRefreshMsg(`Cleared ${res.cleared.products} product config entries + template cache.`);
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : "refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="px-8 py-6 space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="adv-card p-5 space-y-2">
        <div className="text-sm font-medium">Model</div>
        <div className="text-xs text-muted-foreground">
          The active Anthropic model is configured server-side via <code className="bg-muted px-1 rounded">ANTHROPIC_MODEL</code>. Default: <code className="bg-muted px-1 rounded">claude-opus-4-7</code>.
        </div>
      </section>

      <section className="adv-card p-5 space-y-2">
        <div className="text-sm font-medium">Product-configs cache</div>
        <div className="text-xs text-muted-foreground">
          Product configs are fetched from <code className="bg-muted px-1 rounded">Acentecom/product-configs</code> over the GitHub Contents API and cached in memory for 24 hours. Clear the cache manually to pick up edits immediately.
        </div>
        <button className="adv-btn-secondary mt-1" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh product configs"}
        </button>
        {refreshMsg && <div className="text-xs text-muted-foreground mt-1">{refreshMsg}</div>}
      </section>

      <section className="adv-card p-5 space-y-2">
        <div className="text-sm font-medium">Version</div>
        <div className="text-xs text-muted-foreground">advertorials-generator 0.1.0 · live</div>
      </section>
    </div>
  );
}
