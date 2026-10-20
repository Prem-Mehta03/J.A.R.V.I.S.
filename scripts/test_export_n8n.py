#!/usr/bin/env python3
"""Tests for export_n8n.py. Run: python scripts/test_export_n8n.py

Starts a fake n8n API on localhost, so nothing real is contacted.
"""

import importlib.util
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location("export_n8n", Path(__file__).with_name("export_n8n.py"))
export_n8n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export_n8n)

FAKE_KEY = "test-key"


def workflow(wf_id, name, nodes=None, **extra):
    wf = {
        "id": wf_id, "name": name, "active": False,
        "nodes": nodes if nodes is not None else [{"name": "Start", "type": "n8n-nodes-base.manualTrigger", "parameters": {}}],
        "connections": {}, "settings": {},
        "pinData": {"Start": [{"json": {"snippet": "PRIVATE EMAIL TEXT"}}]},
        "staticData": {"lastId": "x"}, "createdAt": "2026-10-20T00:00:00Z", "updatedAt": "2026-10-20T00:00:00Z",
        "versionId": "v1", "meta": {"instanceId": "abc123"},
        "tags": [{"id": "t1", "name": "jarvis", "createdAt": "2026-10-20", "updatedAt": "2026-10-20"}],
    }
    wf.update(extra)
    return wf


LEAKY_NODE = {"name": "Send push", "type": "n8n-nodes-base.httpRequest",
              "parameters": {"url": "https://ntfy.sh/jarvis-secrettopic123",
                             "headerParameters": {"parameters": [{"name": "Authorization", "value": "Bearer tk_abcdefghijklmnopqrstuv"}]}}}

PAGES = {
    None: {"data": [workflow("1", "00 Ping"), workflow("2", "01 Push test", nodes=[LEAKY_NODE])], "nextCursor": "c2"},
    "c2": {"data": [workflow("3", "Chat Router / v2"), workflow("4", "Scratch")], "nextCursor": None},
}


class FakeN8n(BaseHTTPRequestHandler):
    seen_keys = []

    def do_GET(self):
        FakeN8n.seen_keys.append(self.headers.get("X-N8N-API-KEY"))
        if self.headers.get("X-N8N-API-KEY") != FAKE_KEY:
            self.send_response(401)
            self.end_headers()
            return
        query = dict(p.split("=", 1) for p in self.path.split("?", 1)[1].split("&")) if "?" in self.path else {}
        body = json.dumps(PAGES[query.get("cursor")]).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), FakeN8n)
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def run_export(self, **kwargs):
        out = Path(tempfile.mkdtemp())
        written, skipped = export_n8n.export(self.base, FAKE_KEY, out, **kwargs)
        return out, written, skipped

    def test_reads_all_pages_and_names_files(self):
        _, written, _ = self.run_export()
        self.assertEqual(sorted(written), ["00-ping.json", "chat-router-v2.json", "scratch.json"])

    def test_secret_bearing_workflow_is_not_written(self):
        out, written, skipped = self.run_export()
        self.assertNotIn("01-push-test.json", written)
        self.assertFalse((out / "01-push-test.json").exists())
        self.assertEqual([name for name, _ in skipped], ["01 Push test"])
        why = skipped[0][1]
        self.assertIn("bearer token", why)
        self.assertIn("ntfy access token", why)
        self.assertIn("ntfy topic", why)
        self.assertNotIn("tk_abcdefghijklmnopqrstuv", why)  # the message must not repeat the secret

    def test_pinned_data_and_volatile_fields_are_removed(self):
        out, _, _ = self.run_export()
        text = (out / "00-ping.json").read_text(encoding="utf-8")
        self.assertNotIn("PRIVATE EMAIL TEXT", text)
        data = json.loads(text)
        for key in ("pinData", "staticData", "createdAt", "updatedAt", "versionId"):
            self.assertNotIn(key, data)
        self.assertNotIn("meta", data)  # only held the instance id
        self.assertEqual(data["tags"], [{"id": "t1", "name": "jarvis"}])
        self.assertEqual(data["name"], "00 Ping")

    def test_skip_by_name_and_dry_run(self):
        _, written, skipped = self.run_export(skip=["scratch"])
        self.assertNotIn("scratch.json", written)
        self.assertIn(("Scratch", "skipped on request"), skipped)
        out, written, _ = self.run_export(dry_run=True)
        self.assertEqual(list(out.iterdir()), [])
        self.assertTrue(written)

    def test_files_use_unix_newlines(self):
        out, _, _ = self.run_export()
        self.assertNotIn(b"\r\n", (out / "00-ping.json").read_bytes())

    def test_wrong_key_stops_without_printing_it(self):
        with self.assertRaises(SystemExit) as ctx:
            export_n8n.export(self.base, "wrong-key", Path(tempfile.mkdtemp()))
        self.assertIn("401", str(ctx.exception))
        self.assertNotIn("wrong-key", str(ctx.exception))

    def test_plain_http_to_a_remote_host_is_refused(self):
        with self.assertRaises(SystemExit):
            export_n8n.normalise_base_url("http://example.com")
        self.assertEqual(export_n8n.normalise_base_url("https://x.onrender.com/"), "https://x.onrender.com")


if __name__ == "__main__":
    unittest.main()
