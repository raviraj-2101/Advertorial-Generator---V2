import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// supabase-js's realtime transport assumes a native WebSocket global, which
// Node.js 18-21 don't have. Without this, createClient() throws on first
// call with "Node.js 20 detected without native WebSocket support." Node 22+
// has the global natively — the shim is harmless there.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WebSocket;
}

// Read env LAZILY on every call. ESM module-load hoisting can run the
// const-capture before dotenv populates process.env when other modules
// (routes.ts importing imageBank.ts, etc.) trigger supabase.ts to load
// from a sibling import chain. Lazy reads avoid the trap entirely —
// process.env is always read fresh at the call site, after dotenv has
// definitely run via server/index.ts's top-level config call.
export function envSupabaseUrl(): string { return process.env.SUPABASE_URL || ""; }
export function envSupabaseServiceKey(): string { return process.env.SUPABASE_SERVICE_ROLE_KEY || ""; }
function envSupabaseAnonKey(): string { return process.env.SUPABASE_ANON_KEY || ""; }
function envSupabaseSchema(): string { return process.env.SUPABASE_SCHEMA || "advertorials"; }

// supabase-js's strict generics resolve `.from('x')` to `never[]` when the
// schema parameter is `string` rather than a literal. Cast through unknown
// to the default-typed SupabaseClient so existing routes.ts call sites stay
// ergonomic. Practical loss: no row-shape inference. Practical win: works.

let _serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  const url = envSupabaseUrl();
  const key = envSupabaseServiceKey();
  if (!url || !key) {
    throw new Error(
      "Supabase service-role client unavailable: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env",
    );
  }
  if (!_serviceClient) {
    _serviceClient = createClient(url, key, {
      auth: { persistSession: false },
      db: { schema: envSupabaseSchema() },
    }) as unknown as SupabaseClient;
  }
  return _serviceClient;
}

export function getAnonClient(): SupabaseClient {
  const url = envSupabaseUrl();
  const anon = envSupabaseAnonKey();
  if (!url || !anon) {
    throw new Error(
      "Supabase anon client unavailable: SUPABASE_URL and SUPABASE_ANON_KEY must both be set in .env",
    );
  }
  return createClient(url, anon, {
    auth: { persistSession: false },
    db: { schema: envSupabaseSchema() },
  }) as unknown as SupabaseClient;
}

export function supabaseConfigured(): boolean {
  return Boolean(envSupabaseUrl() && envSupabaseServiceKey());
}

/**
 * Tiny convenience for callers that want to short-circuit instead of throw
 * — useful in Phase-1 routes that need to render the UI even before the
 * database is provisioned.
 */
export function tryGetServiceClient(): SupabaseClient | null {
  try {
    return getServiceClient();
  } catch {
    return null;
  }
}
