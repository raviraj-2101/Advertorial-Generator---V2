import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * Publishing — Phase 8.
 *
 * Deploys a compiled lander (HTML + image assets cached locally or remote
 * URLs preserved) to the dedicated landers VPS at `VPS_LANDERS_HOST`.
 * The VPS runs nginx with per-domain server blocks; the deploy command is
 * an `ssh ... mkdir -p <docroot>/<path>` followed by an SFTP-style upload
 * via stdin to write `index.html`.
 *
 * Auth: SSH key when `VPS_LANDERS_SSH_KEY_PATH` is set; otherwise
 * password-based via `sshpass` when `VPS_LANDERS_ROOT_PASSWORD` is set.
 * If neither is available the deploy returns an explicit error to the UI.
 *
 * Note on safety: per Section 0.5 of the brief, the production VPS for
 * the existing tools (rebill-dashboard, approval-rates-historical, etc.)
 * is OFF LIMITS. This module deploys only to the dedicated landers VPS
 * at 187.77.29.59 — a different machine.
 */

const VPS_HOST = process.env.VPS_LANDERS_HOST || "";
const VPS_USER = process.env.VPS_LANDERS_USER || "root";
const VPS_KEY = process.env.VPS_LANDERS_SSH_KEY_PATH || "";
const VPS_PASS = process.env.VPS_LANDERS_ROOT_PASSWORD || "";

export interface PublishArgs {
  domain: string;
  publishPath: string;
  html: string;
  /** Inline image assets to write alongside index.html. Optional — landers
   *  whose images all live on remote CDNs (Supabase Storage, Nano Banana
   *  Pro) won't have any. */
  assets?: Record<string, Buffer>;
}

export interface PublishResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function sanitizePath(p: string): string {
  // Allow only [a-z0-9-/_], strip leading/trailing slashes; reject any
  // suspicious traversal. The published path is appended directly to a
  // remote docroot — strict whitelisting is the safe move.
  const cleaned = p.replace(/[^a-zA-Z0-9_\-/]/g, "").replace(/^\/+|\/+$/g, "");
  if (cleaned.includes("..")) throw new Error(`Invalid publish path: ${p}`);
  return cleaned;
}

function sanitizeDomain(d: string): string {
  const cleaned = d.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleaned)) {
    throw new Error(`Invalid domain: ${d}`);
  }
  return cleaned;
}

function sshCmd(): string[] {
  if (VPS_KEY) {
    return ["ssh", "-i", VPS_KEY, "-o", "StrictHostKeyChecking=accept-new", `${VPS_USER}@${VPS_HOST}`];
  }
  if (VPS_PASS) {
    return ["sshpass", "-p", VPS_PASS, "ssh", "-o", "StrictHostKeyChecking=accept-new", `${VPS_USER}@${VPS_HOST}`];
  }
  return [];
}

function runRemote(cmd: string, stdin?: Buffer): Promise<{ code: number; stdout: string; stderr: string }> {
  const baseCmd = sshCmd();
  if (!baseCmd.length) {
    return Promise.resolve({
      code: 1,
      stdout: "",
      stderr: "Landers VPS credentials not configured (VPS_LANDERS_SSH_KEY_PATH or VPS_LANDERS_ROOT_PASSWORD).",
    });
  }
  const argv = [...baseCmd, cmd];
  return new Promise((resolve) => {
    const child = spawn(argv[0]!, argv.slice(1));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => { stdout += b.toString(); });
    child.stderr.on("data", (b) => { stderr += b.toString(); });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

export async function publishLander(args: PublishArgs): Promise<PublishResult> {
  if (!VPS_HOST) {
    return { ok: false, error: "Landers VPS host not configured (VPS_LANDERS_HOST)." };
  }
  let domain: string;
  let publishPath: string;
  try {
    domain = sanitizeDomain(args.domain);
    publishPath = sanitizePath(args.publishPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const docroot = `/var/www/landers/${domain}/${publishPath}`;
  const mkdir = await runRemote(`mkdir -p ${shellQuote(docroot)} && chmod 755 ${shellQuote(docroot)}`);
  if (mkdir.code !== 0) {
    return { ok: false, error: `mkdir failed: ${mkdir.stderr.slice(0, 200)}` };
  }

  const writeIndex = await runRemote(
    `cat > ${shellQuote(path.posix.join(docroot, "index.html"))}`,
    Buffer.from(args.html, "utf8"),
  );
  if (writeIndex.code !== 0) {
    return { ok: false, error: `write index.html failed: ${writeIndex.stderr.slice(0, 200)}` };
  }

  if (args.assets) {
    for (const [filename, body] of Object.entries(args.assets)) {
      const safe = sanitizePath(filename);
      const remotePath = path.posix.join(docroot, safe);
      const writeAsset = await runRemote(`cat > ${shellQuote(remotePath)}`, body);
      if (writeAsset.code !== 0) {
        return { ok: false, error: `asset upload (${safe}) failed: ${writeAsset.stderr.slice(0, 200)}` };
      }
    }
  }

  const url = `https://${domain}/${publishPath}/`;
  return { ok: true, url };
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

export function publishingConfigured(): boolean {
  return Boolean(VPS_HOST && (VPS_KEY || VPS_PASS));
}
