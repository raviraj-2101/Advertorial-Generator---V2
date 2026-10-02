import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { tryGetServiceClient } from "./supabase";

/**
 * Auth — copy of the NEW-UGC-Scripts pattern, adapted for Supabase Postgres
 * persistence instead of SQLite.
 *
 * Domain gate: only `@acentecom.com` emails may log in. The shared
 * password is in `SHARED_PASSWORD` (default `Acent123`).
 * Tokens: 32-byte hex, persisted in the `sessions` table.
 *
 * In-memory fallback: when Supabase isn't reachable (e.g. during Phase-1
 * smoke testing before the DB is provisioned), tokens live in-process so
 * the login flow still works for local dev. A server restart logs everyone
 * out in that mode — which is acceptable for a dev tool.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EMAIL_DOMAIN = "@acentecom.com";
const SHARED_PASSWORD = process.env.SHARED_PASSWORD || "Acent123";

const memorySessions = new Map<string, { email: string; createdAt: number }>();

// ── Per-IP login rate limit ─────────────────────────────────────────────
const loginAttempts = new Map<string, number[]>();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20;

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (loginAttempts.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    loginAttempts.set(ip, arr);
    return false;
  }
  arr.push(now);
  loginAttempts.set(ip, arr);
  return true;
}

export function validateLogin(email: string, password: string): boolean {
  if (!email || typeof email !== "string") return false;
  if (!email.toLowerCase().endsWith(EMAIL_DOMAIN)) return false;
  if (password !== SHARED_PASSWORD) return false;
  return true;
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(token: string, email: string): Promise<void> {
  memorySessions.set(token, { email, createdAt: Date.now() });
  const supa = tryGetServiceClient();
  if (!supa) return;
  await supa.from("sessions").upsert({ token, email });
}

export async function getSessionEmail(token: string): Promise<string | null> {
  const mem = memorySessions.get(token);
  if (mem) {
    if (Date.now() - mem.createdAt > SESSION_TTL_MS) {
      memorySessions.delete(token);
    } else {
      return mem.email;
    }
  }
  const supa = tryGetServiceClient();
  if (!supa) return null;
  const { data } = await supa
    .from("sessions")
    .select("email, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const createdMs = Date.parse(data.created_at as string);
  if (Number.isFinite(createdMs) && Date.now() - createdMs > SESSION_TTL_MS) {
    await supa.from("sessions").delete().eq("token", token);
    return null;
  }
  memorySessions.set(token, { email: data.email as string, createdAt: createdMs });
  return data.email as string;
}

export async function deleteSession(token: string): Promise<void> {
  memorySessions.delete(token);
  const supa = tryGetServiceClient();
  if (!supa) return;
  await supa.from("sessions").delete().eq("token", token);
}

export function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== "string") return null;
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length).trim() || null;
}

/**
 * Express middleware: requires a valid bearer token; attaches the email to
 * `req.userEmail` for downstream handlers.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const email = await getSessionEmail(token);
  if (!email) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  (req as Request & { userEmail?: string }).userEmail = email;
  next();
}

/**
 * Periodic GC for the in-memory session map. The DB-backed sessions are
 * pruned lazily in `getSessionEmail`.
 */
export function startSessionGc(): void {
  setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [tok, sess] of memorySessions) {
      if (sess.createdAt < cutoff) memorySessions.delete(tok);
    }
  }, 60 * 60 * 1000).unref?.();
}
