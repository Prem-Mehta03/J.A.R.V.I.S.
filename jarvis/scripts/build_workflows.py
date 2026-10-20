#!/usr/bin/env python3
"""Build n8n/workflows/01-chat-router.json from the Code-node sources in n8n/src/.

Standard library only.

    python scripts/build_workflows.py

The JavaScript for each Code node lives in n8n/src/*.js so it can be read, reviewed and tested as plain files.
A line `// @include _lib.js` is replaced by the contents of that file (n8n Code nodes cannot import anything).
The output is the file you import into n8n. After importing, you pick your own credentials in the nodes.
"""

import json
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "n8n" / "src"
OUT = ROOT / "n8n" / "workflows" / "01-chat-router.json"
NAMESPACE = uuid.UUID("6f1c2a52-5d1e-4c1f-9d6b-0a4f3c1b7e10")  # fixed, so rebuilding gives identical ids


def uid(name):
    return str(uuid.uuid5(NAMESPACE, name))


def code(filename):
    text = (SRC / filename).read_text(encoding="utf-8")
    text = re.sub(
        r"^// @include (\S+)\s*$",
        lambda m: (SRC / m.group(1)).read_text(encoding="utf-8").rstrip() + "\n",
        text,
        flags=re.M,
    )
    return text.rstrip() + "\n"


def node(name, type_, version, position, parameters, **extra):
    n = {
        "parameters": parameters,
        "id": uid(name),
        "name": name,
        "type": type_,
        "typeVersion": version,
        "position": position,
    }
    n.update(extra)
    return n


def if_node(name, position, expression):
    return node(name, "n8n-nodes-base.if", 2.3, position, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 3},
            "conditions": [{
                "id": uid(name + " condition"),
                "leftValue": expression,
                "rightValue": "",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
            }],
            "combinator": "and",
        },
        "options": {},
    })


def link(*targets):
    return {"main": [[{"node": t, "type": "main", "index": 0} for t in output] for output in targets]}


CONTEXT_SQL = """select
  (select coalesce(json_agg(json_build_object('slug', slug, 'label', label) order by slug), '[]'::json) from jarvis.spaces) as spaces,
  (select value from jarvis.settings where key = 'home_location') as home_location"""

GEMINI_OK = (
    "={{ !!($json.candidates && $json.candidates[0] && $json.candidates[0].content && $json.candidates[0].content.parts"
    " && $json.candidates[0].content.parts[0] && String($json.candidates[0].content.parts[0].text || '').trim().startsWith('{')) }}"
)

nodes = [
    node("Webhook", "n8n-nodes-base.webhook", 2.2, [0, 300], {
        "httpMethod": "POST",
        "path": "jarvis",
        "authentication": "headerAuth",
        "responseMode": "responseNode",
        "options": {},
    }, webhookId=uid("webhook path jarvis"), credentials={"httpHeaderAuth": {"id": "", "name": "Jarvis token"}}),

    node("Prepare", "n8n-nodes-base.code", 2, [220, 300], {"jsCode": code("prepare.js")}),

    if_node("Valid?", [440, 300], "={{ $json.valid }}"),

    node("Load context", "n8n-nodes-base.postgres", 2.7, [660, 200], {
        "operation": "executeQuery",
        "query": CONTEXT_SQL,
        "options": {},
    }, credentials={"postgres": {"id": "", "name": "Supabase Postgres"}}, alwaysOutputData=True, onError="continueRegularOutput"),

    node("Build request", "n8n-nodes-base.code", 2, [880, 200], {"jsCode": code("build-request.js")}),

    node("Gemini", "n8n-nodes-base.httpRequest", 4.5, [1100, 200], {
        "method": "POST",
        "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.gemini_body) }}",
        "options": {"timeout": 60000},
    }, credentials={"httpHeaderAuth": {"id": "", "name": "Gemini key"}}, onError="continueRegularOutput"),

    if_node("Gemini answered?", [1320, 200], GEMINI_OK),

    node("Groq", "n8n-nodes-base.httpRequest", 4.5, [1540, 300], {
        "method": "POST",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($('Build request').first().json.groq_body) }}",
        "options": {"timeout": 60000},
    }, credentials={"httpHeaderAuth": {"id": "", "name": "Groq key"}}, onError="continueRegularOutput"),

    node("Plan", "n8n-nodes-base.code", 2, [1760, 300], {"jsCode": code("plan.js")}),

    if_node("Needs database?", [1980, 300], "={{ $json.plan.action === 'sql' }}"),

    node("Run SQL", "n8n-nodes-base.postgres", 2.7, [2200, 200], {
        "operation": "executeQuery",
        "query": "={{ $json.plan.sql }}",
        "options": {"queryReplacement": "={{ $json.plan.params }}"},
    }, credentials={"postgres": {"id": "", "name": "Supabase Postgres"}}, alwaysOutputData=True, onError="continueRegularOutput"),

    node("Reply", "n8n-nodes-base.code", 2, [2420, 300], {"jsCode": code("reply.js")}),

    node("Respond", "n8n-nodes-base.respondToWebhook", 1.5, [2640, 300], {
        "respondWith": "firstIncomingItem",
        "options": {},
    }),
]

# Prepare is only valid when the text is there; Plan handles the invalid case itself.
connections = {
    "Webhook": link(["Prepare"]),
    "Prepare": link(["Valid?"]),
    "Valid?": link(["Load context"], ["Plan"]),
    "Load context": link(["Build request"]),
    "Build request": link(["Gemini"]),
    "Gemini": link(["Gemini answered?"]),
    "Gemini answered?": link(["Plan"], ["Groq"]),
    "Groq": link(["Plan"]),
    "Plan": link(["Needs database?"]),
    "Needs database?": link(["Run SQL"], ["Reply"]),
    "Run SQL": link(["Reply"]),
    "Reply": link(["Respond"]),
}

workflow = {
    "name": "01 Chat Router",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {"executionOrder": "v1"},
}

if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(workflow, indent=2, ensure_ascii=False) + "\n")
    print("wrote", OUT.relative_to(ROOT))
