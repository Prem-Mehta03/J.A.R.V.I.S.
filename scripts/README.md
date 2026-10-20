# Scripts

## new-token.ps1

Prints a random 64-character hex token for the Jarvis webhook.

```powershell
.\scripts\new-token.ps1 | Set-Clipboard
```

If PowerShell refuses to run it because of the execution policy, run it for this one call only:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\new-token.ps1 | Set-Clipboard
```

See `docs/api.md` for where the token goes and how to rotate it.

## export_n8n.py

Exports your n8n workflows to `n8n/workflows/` as JSON that is safe to commit. Needs Python 3 and nothing else.

```powershell
$env:N8N_URL = "https://<your-service>.onrender.com"
$env:N8N_API_KEY = "<key from n8n Settings, n8n API>"
python scripts\export_n8n.py --dry-run    # check first
python scripts\export_n8n.py              # write the files
```

The variables only exist in that PowerShell window. Do not save the API key in a file in the repo. If `python` is not found, try `py`.

What it does:

- Reads every workflow through n8n's public API.
- Removes pinned test data (which can contain real email text), static data and volatile fields.
- Scans the rest for things that look like secrets (ntfy tokens and topic names, Google and Groq keys, bearer tokens, Telegram bot tokens, long hex strings). A workflow that matches is **not written**, and the message says which node and what it looked like.
- Refuses plain `http://` addresses, and never follows redirects, so the API key can't leak.

Exit code 2 means a workflow was left out because it looked like it held a secret. Fix it by moving the secret into an n8n credential. If a workflow legitimately cannot be exported cleanly, leave it out on purpose with `--skip "Workflow name"`.

Credentials themselves are never exported by this script. A workflow only carries the credential's name and id.

The scan is a safety net, not a guarantee. Look through the files before you commit them.

I tested this against a fake n8n server (`python scripts\test_export_n8n.py`), not against your real instance, so the first run on your instance is the real test. If it fails, tell me the message.

## test_export_n8n.py

Tests for the export script against a fake local n8n. Run `python scripts\test_export_n8n.py` after changing `export_n8n.py`.
