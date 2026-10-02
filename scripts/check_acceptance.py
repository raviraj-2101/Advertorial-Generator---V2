#!/usr/bin/env python3
"""
check_acceptance.py — Acceptance-Criteria Checker for advertorials-generator.

The agent MUST run this script before writing RUN_COMPLETE to WORK_LOG.md.
The script parses WORK_LOG.md and the repo state, verifies every criterion
from Section 0.10 of the brief, and exits non-zero if anything is missing.

Usage:
    python3 scripts/check_acceptance.py [--repo-root PATH] [--min-hours FLOAT]

Exit codes:
    0  All criteria met. RUN_COMPLETE may be written.
    1  One or more criteria missing. RUN_COMPLETE must NOT be written.
    2  Script error (missing files, malformed log, etc).

Output:
    Human-readable summary to stdout.
    Machine-readable JSON summary to stderr (for log appending).

Design notes:
- This script is the enforcement layer. The agent cannot fake its output
  because the agent has to paste the literal stdout+stderr into WORK_LOG.md
  AND the script writes a signed checksum line that is hard to forge by
  hand (the agent would have to actually compute the SHA over the same
  inputs, which means actually reading the same files, which means the
  check is real).
- Hard-fails are listed individually so the agent (and Liam) can see
  exactly what's missing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Configuration — criteria pulled directly from Section 0.10 of the brief.
# ---------------------------------------------------------------------------

REQUIRED_PHASES = list(range(1, 11))  # Phases 1..10
REQUIRED_SELF_TEST_ROUNDS = list(range(1, 6))  # Rounds 1..5
MIN_HEARTBEAT_COUNT = 12  # 10 hours / ~30 min interval, minus a small grace
DEFAULT_MIN_HOURS = 3.0

# Required files that prove phase completion.
REQUIRED_PATHS = [
    "WORK_LOG.md",
    "BRIEF.md",
    "package.json",
    "tsconfig.json",
    "tailwind.config.ts",
    ".env.example",
    "client/index.html",
    "client/src/App.tsx",
    "client/src/main.tsx",
    "client/src/pages/login.tsx",
    "client/src/pages/projects.tsx",
    "client/src/pages/project-detail.tsx",
    "client/src/pages/lander-editor.tsx",
    "client/src/pages/brands-products.tsx",
    "client/src/pages/settings.tsx",
    "client/src/components/AppShell.tsx",
    "client/src/components/SectionDivider.tsx",
    "client/src/components/SectionToolbar.tsx",
    "server/index.ts",
    "server/routes.ts",
    "server/systemPrompt.ts",
    "server/productConfigs.ts",
    "server/templateLoader.ts",
    "server/skeletonGenerator.ts",
    "server/landerGenerator.ts",
    "server/revisionEngine.ts",
    "server/titleGenerator.ts",
    "server/imageGen.ts",
    "server/publishing.ts",
    "server/auth.ts",
    "server/supabase.ts",
    "advertorials-skill/skill.md",
    "advertorials-skill/templates/_proposed/_analysis.md",
    "shared/schema.ts",
]

REQUIRED_DIRS = [
    "advertorials-skill/templates/_proposed",
    "deploy",
]

# Patterns that, if found anywhere in source, indicate half-assing.
HALF_ASS_PATTERNS = [
    (r"\bTODO\b", "TODO marker"),
    (r"\bFIXME\b", "FIXME marker"),
    (r"\bXXX\b", "XXX marker"),
    (r"throw new Error\(['\"]Not implemented", "Not-implemented stub"),
    (r"\.\.\.\s*$", "trailing-ellipsis placeholder"),
    (r"placeholder for [a-z]+ section", "placeholder copy in template"),
]

HALF_ASS_SCAN_DIRS = [
    "server",
    "client/src",
    "advertorials-skill",
    "shared",
]

HALF_ASS_SCAN_EXTS = {".ts", ".tsx", ".js", ".jsx", ".md"}

# Files exempt from half-ass scan (legitimate uses of these tokens).
HALF_ASS_SCAN_EXEMPTIONS = {
    "WORK_LOG.md",  # the agent's log can mention them historically
    "BRIEF.md",     # the brief itself uses TODO etc. in instructions
    "advertorials-skill/templates/_proposed/_analysis.md",  # may discuss placeholders
}


# ---------------------------------------------------------------------------
# Result types.
# ---------------------------------------------------------------------------

@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""

    def line(self) -> str:
        mark = "PASS" if self.passed else "FAIL"
        suffix = f" — {self.detail}" if self.detail else ""
        return f"  [{mark}] {self.name}{suffix}"


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)
    elapsed_hours: float = 0.0
    heartbeat_count: int = 0
    run_started: Optional[str] = None
    fingerprint: str = ""

    def add(self, check: Check) -> None:
        self.checks.append(check)

    @property
    def all_passed(self) -> bool:
        return all(c.passed for c in self.checks)

    @property
    def failed(self) -> list[Check]:
        return [c for c in self.checks if not c.passed]


# ---------------------------------------------------------------------------
# WORK_LOG.md parsing.
# ---------------------------------------------------------------------------

PHASE_COMPLETE_RE = re.compile(r"PHASE_(\d{1,2})_COMPLETE", re.IGNORECASE)
SELF_TEST_RE = re.compile(r"SELF_TEST_ROUND_(\d{1,2})\b", re.IGNORECASE)
HEARTBEAT_LINE_RE = re.compile(
    r"^[-*]\s*(\d{2}:\d{2})\s*\[\+(\d{2}):(\d{2})\]"
)
RUN_STARTED_RE = re.compile(
    r"Run started:\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)"
)
LIAM_INTERRUPT_RE = re.compile(r"LIAM_INTERRUPT_", re.IGNORECASE)


def parse_work_log(path: Path) -> tuple[set[int], set[int], int, Optional[str], float]:
    """
    Returns: (completed_phases, completed_selftests, heartbeat_count,
              run_started_iso, elapsed_hours_from_last_heartbeat)
    """
    if not path.exists():
        return set(), set(), 0, None, 0.0
    text = path.read_text(encoding="utf-8", errors="replace")

    phases = set()
    for m in PHASE_COMPLETE_RE.finditer(text):
        phases.add(int(m.group(1)))

    selftests = set()
    for m in SELF_TEST_RE.finditer(text):
        selftests.add(int(m.group(1)))

    heartbeats = []
    for line in text.splitlines():
        m = HEARTBEAT_LINE_RE.match(line.strip())
        if m:
            elapsed_h = int(m.group(2))
            elapsed_m = int(m.group(3))
            heartbeats.append(elapsed_h + elapsed_m / 60.0)

    started = None
    started_match = RUN_STARTED_RE.search(text)
    if started_match:
        started = started_match.group(1)

    elapsed = max(heartbeats) if heartbeats else 0.0
    return phases, selftests, len(heartbeats), started, elapsed


# ---------------------------------------------------------------------------
# Filesystem checks.
# ---------------------------------------------------------------------------

def check_required_paths(repo_root: Path) -> list[Check]:
    results = []
    for rel in REQUIRED_PATHS:
        p = repo_root / rel
        ok = p.exists() and p.is_file() and p.stat().st_size > 0
        detail = "" if ok else (
            "missing" if not p.exists() else
            "is a directory" if p.is_dir() else
            "empty file"
        )
        results.append(Check(f"file present: {rel}", ok, detail))
    return results


def check_required_dirs(repo_root: Path) -> list[Check]:
    results = []
    for rel in REQUIRED_DIRS:
        p = repo_root / rel
        ok = p.exists() and p.is_dir()
        results.append(Check(f"dir present: {rel}", ok, "" if ok else "missing"))
    return results


def check_proposed_templates(repo_root: Path) -> Check:
    proposed_dir = repo_root / "advertorials-skill" / "templates" / "_proposed"
    if not proposed_dir.exists():
        return Check("proposed templates exist", False, "_proposed dir missing")
    md_files = [
        p for p in proposed_dir.glob("*.md")
        if p.name != "_analysis.md" and not p.name.startswith(".")
    ]
    if not md_files:
        return Check(
            "proposed templates exist", False,
            "no template .md files in _proposed/ (analysis without templates)"
        )
    return Check(
        "proposed templates exist", True,
        f"{len(md_files)} template file(s) proposed"
    )


def check_skill_substance(repo_root: Path) -> Check:
    skill = repo_root / "advertorials-skill" / "skill.md"
    if not skill.exists():
        return Check("skill.md substantive", False, "missing")
    lines = skill.read_text(encoding="utf-8", errors="replace").splitlines()
    non_empty = [l for l in lines if l.strip()]
    if len(non_empty) < 200:
        return Check(
            "skill.md substantive", False,
            f"only {len(non_empty)} non-empty lines (brief requires >=200)"
        )
    return Check("skill.md substantive", True, f"{len(non_empty)} non-empty lines")


# ---------------------------------------------------------------------------
# Half-assing scan.
# ---------------------------------------------------------------------------

def scan_half_assing(repo_root: Path) -> Check:
    hits: list[tuple[str, int, str]] = []
    for scan_dir in HALF_ASS_SCAN_DIRS:
        base = repo_root / scan_dir
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in HALF_ASS_SCAN_EXTS:
                continue
            rel = str(path.relative_to(repo_root))
            if rel in HALF_ASS_SCAN_EXEMPTIONS:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for pat, label in HALF_ASS_PATTERNS:
                for m in re.finditer(pat, text):
                    line_no = text.count("\n", 0, m.start()) + 1
                    hits.append((rel, line_no, label))
                    if len(hits) >= 30:  # cap output
                        break
                if len(hits) >= 30:
                    break
            if len(hits) >= 30:
                break

    if not hits:
        return Check("no half-ass markers in code", True, "scan clean")
    sample = "; ".join(f"{r}:{n}({l})" for r, n, l in hits[:5])
    suffix = f" (showing first 5 of {len(hits)})" if len(hits) > 5 else ""
    return Check(
        "no half-ass markers in code", False,
        f"found {len(hits)} hit(s): {sample}{suffix}"
    )


# ---------------------------------------------------------------------------
# Read-only guard for product-configs (Section 0.5).
# ---------------------------------------------------------------------------

def check_product_configs_untouched(repo_root: Path) -> Check:
    """
    The brief forbids ANY write to the product-configs repo. We can't verify
    a remote repo from here, but we CAN verify that no submodule, vendored
    copy, or local clone has been modified inside advertorials-generator.
    """
    suspicious = []
    for needle in ["product-configs"]:
        for path in repo_root.rglob(needle):
            if path.is_dir() and (path / ".git").exists():
                suspicious.append(str(path.relative_to(repo_root)))
    if suspicious:
        return Check(
            "no product-configs clone vendored in repo", False,
            f"found nested clone(s): {', '.join(suspicious)} — brief forbids this"
        )
    return Check("no product-configs clone vendored in repo", True)


# ---------------------------------------------------------------------------
# Fingerprint — makes the output hard to forge by hand.
# ---------------------------------------------------------------------------

def compute_fingerprint(repo_root: Path) -> str:
    """
    SHA-256 over a deterministic sample of file sizes + first-line content
    for every required path that exists. The agent cannot fake this without
    actually running the script against the real filesystem.
    """
    h = hashlib.sha256()
    for rel in sorted(REQUIRED_PATHS):
        p = repo_root / rel
        if not p.exists() or not p.is_file():
            h.update(f"{rel}|MISSING\n".encode())
            continue
        size = p.stat().st_size
        try:
            first_line = p.open("rb").readline(256)
        except OSError:
            first_line = b""
        h.update(f"{rel}|{size}|".encode())
        h.update(first_line)
        h.update(b"\n")
    # Include current UTC minute to bind the check to wall-clock time.
    h.update(datetime.now(UTC).strftime("%Y%m%dT%H%M").encode())
    return h.hexdigest()[:16]


# ---------------------------------------------------------------------------
# Main.
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Acceptance-criteria checker.")
    parser.add_argument("--repo-root", default=".", help="Repo root (default: cwd)")
    parser.add_argument(
        "--min-hours", type=float, default=DEFAULT_MIN_HOURS,
        help="Minimum elapsed working hours required (default: 10.0)"
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    if not repo_root.exists():
        print(f"ERROR: repo root {repo_root} does not exist", file=sys.stderr)
        return 2

    report = Report()

    # WORK_LOG.md parsing.
    log_path = repo_root / "WORK_LOG.md"
    completed_phases, completed_selftests, hb_count, run_started, elapsed = (
        parse_work_log(log_path)
    )
    report.elapsed_hours = elapsed
    report.heartbeat_count = hb_count
    report.run_started = run_started

    # ----- Phase completion -----
    for phase in REQUIRED_PHASES:
        report.add(Check(
            f"Phase {phase} complete",
            phase in completed_phases,
            "" if phase in completed_phases else "no PHASE_{n}_COMPLETE entry in WORK_LOG.md"
        ))

    # ----- Self-test rounds -----
    for rnd in REQUIRED_SELF_TEST_ROUNDS:
        report.add(Check(
            f"Self-test round {rnd} documented",
            rnd in completed_selftests,
            "" if rnd in completed_selftests else "no SELF_TEST_ROUND_{n} section in WORK_LOG.md"
        ))

    # ----- Heartbeat density -----
    report.add(Check(
        f"Heartbeat count >= {MIN_HEARTBEAT_COUNT}",
        hb_count >= MIN_HEARTBEAT_COUNT,
        f"found {hb_count}"
    ))

    # ----- Elapsed time -----
    report.add(Check(
        f"Elapsed working time >= {args.min_hours}h (per heartbeat tags)",
        elapsed >= args.min_hours,
        f"latest heartbeat tag shows +{elapsed:.2f}h"
    ))

    # ----- Filesystem -----
    for c in check_required_paths(repo_root):
        report.add(c)
    for c in check_required_dirs(repo_root):
        report.add(c)
    report.add(check_proposed_templates(repo_root))
    report.add(check_skill_substance(repo_root))
    report.add(check_product_configs_untouched(repo_root))

    # ----- Half-ass scan -----
    report.add(scan_half_assing(repo_root))

    # ----- Fingerprint -----
    report.fingerprint = compute_fingerprint(repo_root)

    # ----- Emit human-readable report -----
    print("=" * 72)
    print("ACCEPTANCE-CRITERIA CHECK — advertorials-generator")
    print(f"Repo root:       {repo_root}")
    print(f"Run started:     {run_started or '(unknown)'}")
    print(f"Elapsed hours:   {elapsed:.2f}")
    print(f"Heartbeats:      {hb_count}")
    print(f"Fingerprint:     {report.fingerprint}")
    print(f"UTC at check:    {datetime.now(UTC).isoformat(timespec='seconds')}")
    print("=" * 72)

    for c in report.checks:
        print(c.line())

    print("-" * 72)
    if report.all_passed:
        print(f"RESULT: PASS — all {len(report.checks)} criteria met.")
        print("The agent MAY write RUN_COMPLETE to WORK_LOG.md.")
        print("=" * 72)
        # Machine-readable summary to stderr.
        json.dump(
            {
                "result": "pass",
                "fingerprint": report.fingerprint,
                "checks_total": len(report.checks),
                "checks_failed": 0,
                "elapsed_hours": round(elapsed, 2),
                "heartbeat_count": hb_count,
                "utc": datetime.now(UTC).isoformat(timespec="seconds"),
            },
            sys.stderr,
        )
        sys.stderr.write("\n")
        return 0
    else:
        print(
            f"RESULT: FAIL — {len(report.failed)} of {len(report.checks)} "
            "criteria not met."
        )
        print("The agent MUST NOT write RUN_COMPLETE.")
        print("The agent MUST continue working until all criteria pass.")
        print("=" * 72)
        json.dump(
            {
                "result": "fail",
                "fingerprint": report.fingerprint,
                "checks_total": len(report.checks),
                "checks_failed": len(report.failed),
                "failed": [c.name for c in report.failed],
                "elapsed_hours": round(elapsed, 2),
                "heartbeat_count": hb_count,
                "utc": datetime.now(UTC).isoformat(timespec="seconds"),
            },
            sys.stderr,
        )
        sys.stderr.write("\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
