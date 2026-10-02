import { useState } from "react";
import { useAuth } from "../lib/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="adv-card w-full max-w-md p-8">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Acentecom internal</div>
        <h1 className="text-2xl font-semibold mb-1">Advertorials Generator</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sign in with your @acentecom.com email and the shared team password.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Email</label>
            <input
              type="email"
              autoComplete="email"
              className="adv-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@acentecom.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              className="adv-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <button type="submit" className="adv-btn w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
