#!/usr/bin/env python3
"""Export n8n workflows to n8n/workflows/*.json in a form that is safe to commit.

Standard library only. Configure with two environment variables:

    N8N_URL      https://your-service.onrender.com   (https is required, except for localhost)
    N8N_API_KEY  created in n8n under Settings, n8n API

Usage:

    python scripts/export_n8n.py [--out DIR] [--skip "Workflow name"] [--dry-run]

Before writing each workflow the script
  - drops pinned test data (it can hold real email text), static data and volatile fields, and
  - scans what is left for things that look like secrets. A workflow that matches is NOT written.

Exit codes: 0 = done, 1 = setup or network problem, 2 = at least one workflow was left out because
it looked like it contained a secret (workflows left out with --skip do not count).
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DROP_KEYS = {
    "pinData", "staticData", "shared", "createdAt", "updatedAt", "versionId", "versionCounter",
    "activeVersionId", "activeVersion", "triggerCount", "isArchived", "scopes", "homeProject",
    "usedCredentials", "sharedWithProjects",
}

SECRET_PATTERNS = [
    ("ntfy access token", re.compile(r"\btk_[A-Za-z0-9]{16,}")),
    ("Google API key", re.compile(r"AIza[0-9A-Za-z_\-]{20,}")),
    ("Groq API key", re.compile(r"\bgsk_[A-Za-z0-9]{20,}")),
    ("bearer token", re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{16,}")),
    ("Telegram bot token", re.compile(r"\b\d{8,10}:[A-Za-z0-9_\-]{30,}")),
    ("Google OAuth client secret", re.compile(r"GOCSPX-[A-Za-z0-9_\-]{10,}")),
    ("long hex string (could be the Jarvis token)", re.compile(r"\b[0-9a-fA-F]{40,}\b")),
    ("ntfy topic written into a URL", re.compile(r"ntfy\.sh/[A-Za-z0-9_\-]{8,}")),
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow redirects, so the API key can't be forwarded to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def normalise_base_url(raw):
    parsed = urllib.parse.urlparse(raw.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise SystemExit("N8N_URL must look like https://your-service.onrender.com")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        raise SystemExit("N8N_URL must use https (the API key would travel unencrypted otherwise).")
    return raw.strip().rstrip("/")


def api_get(base, key, path, params=None):
    url = base + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"X-N8N-API-KEY": key, "Accept": "application/json"})
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        # Long timeout: a sleeping free Render service needs about a minute to wake up.
        with opener.open(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        hint = {
            401: "The API key was rejected. Create a new one in n8n under Settings, n8n API.",
            403: "The API key was rejected. Create a new one in n8n under Settings, n8n API.",
            404: "Not found. Check N8N_URL, and that the n8n public API is enabled.",
        }.get(err.code, "")
        raise SystemExit(f"n8n answered HTTP {err.code} for {path}. {hint}".strip())
    except urllib.error.URLError as err:
        raise SystemExit(f"Could not reach n8n: {err.reason}")


def fetch_workflows(base, key):
    workflows, cursor = [], None
    while True:
        params = {"limit": 100}
        if cursor:
            params["cursor"] = cursor
        page = api_get(base, key, "/api/v1/workflows", params)
        workflows.extend(page.get("data", []))
        cursor = page.get("nextCursor")
        if not cursor:
            break
    full = []
    for wf in workflows:
        if "nodes" not in wf:  # the list endpoint normally includes nodes; fetch one by one if not
            wf = api_get(base, key, "/api/v1/workflows/" + str(wf["id"]))
        full.append(wf)
    return full


def clean(workflow):
    out = {k: v for k, v in workflow.items() if k not in DROP_KEYS}
    meta = out.get("meta")
    if isinstance(meta, dict):
        meta = {k: v for k, v in meta.items() if k != "instanceId"}
        if meta:
            out["meta"] = meta
        else:
            out.pop("meta")
    if isinstance(out.get("tags"), list):
        out["tags"] = [{"id": t.get("id"), "name": t.get("name")} for t in out["tags"] if isinstance(t, dict)]
    return out


def find_secrets(workflow):
    """Return a list of (what it looks like, where) for anything secret-looking."""
    hits = []

    def scan(text, where):
        for label, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                hits.append((label, where))

    for node in workflow.get("nodes", []):
        scan(json.dumps(node, ensure_ascii=False), 'node "%s"' % node.get("name", "?"))
    rest = {k: v for k, v in workflow.items() if k != "nodes"}
    scan(json.dumps(rest, ensure_ascii=False), "workflow settings")
    return hits


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "workflow"


def export(base, key, out_dir, skip=(), dry_run=False):
    skip_lower = {s.lower() for s in skip}
    written, skipped = [], []
    used_names = set()
    for wf in sorted(fetch_workflows(base, key), key=lambda w: w.get("name", "")):
        name = wf.get("name", "unnamed")
        if name.lower() in skip_lower:
            skipped.append((name, "skipped on request"))
            continue
        cleaned = clean(wf)
        hits = find_secrets(cleaned)
        if hits:
            what = "; ".join(sorted({f"{where}: {label}" for label, where in hits}))
            skipped.append((name, what))
            continue
        filename = slugify(name) + ".json"
        if filename in used_names:
            filename = f"{slugify(name)}-{wf.get('id', 'dup')}.json"
        used_names.add(filename)
        if not dry_run:
            out_dir.mkdir(parents=True, exist_ok=True)
            with open(out_dir / filename, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(json.dumps(cleaned, indent=2, ensure_ascii=False) + "\n")
        written.append(filename)
    return written, skipped


def main(argv=None):
    default_out = Path(__file__).resolve().parent.parent / "n8n" / "workflows"
    parser = argparse.ArgumentParser(description="Export n8n workflows to JSON that is safe to commit.")
    parser.add_argument("--out", type=Path, default=default_out, help="output folder (default: n8n/workflows)")
    parser.add_argument("--skip", action="append", default=[], metavar="NAME",
                        help="leave this workflow out (exact name, repeatable)")
    parser.add_argument("--dry-run", action="store_true", help="check everything but write no files")
    args = parser.parse_args(argv)

    url, key = os.environ.get("N8N_URL", ""), os.environ.get("N8N_API_KEY", "")
    if not url or not key:
        print("Set N8N_URL and N8N_API_KEY first (see the top of this file).", file=sys.stderr)
        return 1

    written, skipped = export(normalise_base_url(url), key, args.out, args.skip, args.dry_run)

    verb = "Would write" if args.dry_run else "Wrote"
    print(f"{verb} {len(written)} workflow(s) to {args.out}")
    for filename in written:
        print("  ", filename)
    for name, why in skipped:
        print(f'SKIPPED "{name}": {why}')
    if any(why != "skipped on request" for _, why in skipped):
        print("Skipped workflows were not written. Move each secret into an n8n credential, "
              "or leave that workflow out of git with --skip \"<name>\".")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
