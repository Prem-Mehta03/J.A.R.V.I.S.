# n8n workflows

Exported workflow JSON lives here. Do not edit these files by hand: change the workflow in n8n, then export again.

Naming: `NN-name.json`, where NN groups them (`00` health checks, `01` chat router, `02` reminder engine, and so on). The file name comes from the workflow's name in n8n, so name workflows the same way.

## Exporting

Use the script, which strips pinned data and refuses files that look like they hold secrets:

```powershell
python scripts\export_n8n.py
```

See `scripts/README.md`.

## Exporting by hand (if the script is not an option)

In the workflow, use the menu, then Download. A hand-made export is not checked for you, so before committing:

- Unpin any pinned data on every node. Pinned data can be real email text.
- Search the file for `tk_`, `Bearer`, `AIza`, `gsk_` and your ntfy topic name.
- Make sure no node has a token typed into its fields. Tokens belong in n8n credentials.

## Importing

In n8n: create a new workflow, then menu, Import from file. Credentials are not included, so reconnect each credential after importing.

## Replacing a workflow with a newer version

Two active workflows cannot share a webhook path. To update `01 Chat Router`: deactivate the old one, import the new file, choose credentials, activate it, then delete the old one.
