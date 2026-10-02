import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, getToken, setToken } from "./queryClient";

interface AuthState {
  email: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tok = getToken();
      if (!tok) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await apiFetch<{ email: string }>("/api/me");
        if (!cancelled) setEmail(me.email);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (e: string, p: string) => {
    const res = await apiFetch<{ token: string; email: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: e, password: p }),
    });
    setToken(res.token);
    setEmail(res.email);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } catch {
      /* logout best-effort */
    }
    setToken(null);
    setEmail(null);
  }, []);

  return <Ctx.Provider value={{ email, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
