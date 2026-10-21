#!/usr/bin/env python3
"""Build n8n/workflows/01-chat-router.json, 02-reminder-dispatcher.json and 03-items-api.json and 04-voice.json from the Code-node sources in n8n/src/.

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
OUT2 = ROOT / "n8n" / "workflows" / "02-reminder-dispatcher.json"
OUT3 = ROOT / "n8n" / "workflows" / "03-items-api.json"
OUT4 = ROOT / "n8n" / "workflows" / "04-voice.json"
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
        # The app runs on another address, so the browser needs permission to call this one. The token is sent in a header
        # (never a cookie), so allowing every origin does not expose anything the token does not already protect.
        "options": {"allowedOrigins": "*"},
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
        "options": {"timeout": 25000},
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
        "options": {"timeout": 30000},
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

CLAIM_SQL = """with roll as (
  -- A yearly date (birthday) moves to next year two days after it has passed.
  update jarvis.items
  set due_at = ((due_at at time zone 'Asia/Kolkata') + interval '1 year') at time zone 'Asia/Kolkata'
  where type = 'date' and status = 'open' and recurrence like 'FREQ=YEARLY%' and due_at is not null
    and now() >= due_at + interval '2 days'
  returning id
),
r as (
  update jarvis.items set last_notified_at = now(), next_attempt_at = null
  where id in (
    select id from jarvis.items
    where type = 'reminder' and status = 'open'
      -- The check runs once a minute and a push takes a few seconds, so it starts up to a minute early: the alert arrives on time.
      and remind_at <= now() + interval '1 minute' and remind_at > now() - interval '1 day'
      and (last_notified_at is null or last_notified_at < remind_at - interval '2 minutes')
      and (next_attempt_at is null or next_attempt_at <= now())
    order by remind_at
    limit 10
    for update skip locked
  )
  returning id, title, remind_at, recurrence
),
d as (
  select distinct i.id, i.title, i.due_at, n as adv, (i.due_at at time zone 'Asia/Kolkata')::date as occurrence
  from jarvis.items i
  cross join lateral unnest(array_append(i.advance_days, 0)) as n
  cross join lateral (
    select (((i.due_at at time zone 'Asia/Kolkata')::date - n)::timestamp + interval '9 hours') at time zone 'Asia/Kolkata' as fire
  ) f
  where i.type = 'date' and i.status = 'open' and i.due_at is not null
    and now() >= f.fire and now() < f.fire + interval '1 day'
    and f.fire >= i.created_at - interval '1 minute'
),
dl as (
  insert into jarvis.alert_log (item_id, occurrence, advance_days)
  select id, occurrence, adv from d
  on conflict (item_id, occurrence, advance_days) do update
    set ok = true, retry_at = null
    where jarvis.alert_log.ok = false and jarvis.alert_log.retry_at <= now()
  returning item_id, occurrence, advance_days
)
select 'reminder' as kind, r.id, r.title, r.remind_at, null::timestamptz as due_at, r.recurrence, null::int as advance_days,
       (select value #>> '{}' from jarvis.settings where key = 'bark_key') as bark_key
from r
union all
select 'date', d.id, d.title, null, d.due_at, null, d.adv,
       (select value #>> '{}' from jarvis.settings where key = 'bark_key')
from d join dl on dl.item_id = d.id and dl.occurrence = d.occurrence and dl.advance_days = d.adv"""

RECORD_SQL = """with a as (
  -- delivered: a repeating reminder moves to its next time
  update jarvis.items set remind_at = nullif($4, '')::timestamptz
  where id = $1::uuid and $2 = 'reminder' and $3::boolean and $4 <> ''
  returning id
),
b as (
  -- not delivered by any channel: free the reminder and try again in 5 minutes
  update jarvis.items set last_notified_at = null, next_attempt_at = now() + interval '5 minutes'
  where id = $1::uuid and $2 = 'reminder' and not $3::boolean
  returning id
),
c as (
  update jarvis.alert_log set ok = false, retry_at = now() + interval '5 minutes'
  where $2 = 'date' and not $3::boolean
    and item_id = $1::uuid and occurrence = nullif($5, '')::date and advance_days = $6::int
  returning 1
),
d as (
  -- remember why the last push failed, so it can be read in the settings table
  insert into jarvis.settings (key, value)
  select 'last_push_error', jsonb_build_object('at', now(), 'item', $1, 'error', $7::text)
  where $7 <> ''
  on conflict (key) do update set value = excluded.value
  returning 1
)
select (select count(*) from a) as rolled, (select count(*) from b) as retry_reminder, (select count(*) from c) as retry_date, (select count(*) from d) as error_saved"""

STALE_SQL = """select id, remind_at, recurrence from jarvis.items
where type = 'reminder' and status = 'open' and recurrence is not null and remind_at <= now() - interval '1 day'
order by remind_at
limit 20"""

STALE_UPDATE_SQL = """update jarvis.items i set remind_at = x.next_remind::timestamptz, last_notified_at = null
from jsonb_to_recordset($1::jsonb) as x(id uuid, next_remind text)
where i.id = x.id and x.next_remind <> ''"""

dispatcher_nodes = [
    node("Every minute", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 300], {
        "rule": {"interval": [{"field": "minutes", "minutesInterval": 1}]},
    }),

    node("Claim due alerts", "n8n-nodes-base.postgres", 2.7, [240, 200], {
        "operation": "executeQuery",
        "query": CLAIM_SQL,
        "options": {},
    }, credentials={"postgres": {"id": "", "name": "Supabase Postgres"}}),

    node("Compose", "n8n-nodes-base.code", 2, [480, 200], {"jsCode": code("dispatch-compose.js")}),

    if_node("Has key?", [700, 200], "={{ $json.key !== '' }}"),

    # Bark (iPhone app) sends the push. The device key comes from jarvis.settings, so it is never inside this file.
    node("Bark", "n8n-nodes-base.httpRequest", 4.5, [920, 120], {
        "method": "POST",
        "url": "https://api.day.app/push",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ device_key: $json.key, title: $json.title, body: $json.message, level: $json.level, group: 'Jarvis' }) }}",
        # Keep Bark's own answer (status and body) even when it refuses, so the reason can be recorded.
        "options": {"timeout": 20000, "response": {"response": {"fullResponse": True, "neverError": True}}},
    }, onError="continueRegularOutput"),

    node("Judge", "n8n-nodes-base.code", 2, [1140, 200], {"jsCode": code("dispatch-judge.js")}),

    if_node("Sent?", [1360, 200], "={{ $json.ok }}"),

    # Only when the push failed: put the alert in Google Calendar so the phone still rings once.
    node("Backup event", "n8n-nodes-base.httpRequest", 4.5, [1580, 320], {
        "method": "POST",
        "url": "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "googleCalendarOAuth2Api",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.backup_body) }}",
        "options": {"timeout": 30000},
    }, credentials={"googleCalendarOAuth2Api": {"id": "", "name": "Google Calendar"}}, onError="continueRegularOutput"),

    node("Judge backup", "n8n-nodes-base.code", 2, [1800, 320], {"jsCode": code("dispatch-judge-backup.js")}),

    node("Record outcome", "n8n-nodes-base.postgres", 2.7, [2020, 200], {
        "operation": "executeQuery",
        "query": RECORD_SQL,
        "options": {"queryReplacement": "={{ [$json.id, $json.kind, String($json.ok), $json.next_remind || '', $json.occurrence || '', String($json.adv || 0), $json.push_error || ''] }}"},
    }, credentials={"postgres": {"id": "", "name": "Supabase Postgres"}}),

    # A repeating reminder whose time passed more than a day ago (the service was asleep) is moved on without a stale alert.
    node("Find stale repeats", "n8n-nodes-base.postgres", 2.7, [240, 480], {
        "operation": "executeQuery",
        "query": STALE_SQL,
        "options": {},
    }, credentials={"postgres": {"id": "", "name": "Supabase Postgres"}}),

    node("Roll stale", "n8n-nodes-base.code", 2, [480, 480], {"jsCode": code("dispatch-stale.js")}),

    node("Save stale", "n8n-nodes-base.postgres", 2.7, [700, 480], {
        "operation": "executeQuery",
        "query": STALE_UPDATE_SQL,
        "options": {"queryReplacement": "={{ [$json.rows] }}"},
    }, credentials={"postgres": {"id": "", "name": "Supabase Postgres"}}),
]

dispatcher_connections = {
    "Every minute": link(["Claim due alerts", "Find stale repeats"]),
    "Claim due alerts": link(["Compose"]),
    "Compose": link(["Has key?"]),
    "Has key?": link(["Bark"], ["Judge"]),
    "Bark": link(["Judge"]),
    "Judge": link(["Sent?"]),
    "Sent?": link(["Record outcome"], ["Backup event"]),
    "Backup event": link(["Judge backup"]),
    "Judge backup": link(["Record outcome"]),
    "Find stale repeats": link(["Roll stale"]),
    "Roll stale": link(["Save stale"]),
}

dispatcher = {
    "name": "02 Reminder Dispatcher",
    "nodes": dispatcher_nodes,
    "connections": dispatcher_connections,
    "active": False,
    # Running every minute: do not keep a record of every successful run.
    "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none", "saveManualExecutions": False},
}


items_nodes = [
    node("Webhook", "n8n-nodes-base.webhook", 2.2, [0, 300], {
        "httpMethod": "POST",
        "path": "jarvis-items",
        "authentication": "headerAuth",
        "responseMode": "responseNode",
        "options": {"allowedOrigins": "*"},
    }, webhookId=uid("webhook path jarvis-items"), credentials={"httpHeaderAuth": {"id": "", "name": "Jarvis token"}}),

    node("Items plan", "n8n-nodes-base.code", 2, [220, 300], {"jsCode": code("items-plan.js")}),

    if_node("Needs database?", [440, 300], "={{ $json.plan.action === 'sql' }}"),

    node("Run SQL", "n8n-nodes-base.postgres", 2.7, [660, 200], {
        "operation": "executeQuery",
        "query": "={{ $json.plan.sql }}",
        "options": {"queryReplacement": "={{ $json.plan.params }}"},
    }, credentials={"postgres": {"id": "", "name": "Supabase Postgres"}}, alwaysOutputData=True, onError="continueRegularOutput"),

    node("Items reply", "n8n-nodes-base.code", 2, [880, 300], {"jsCode": code("items-reply.js")}),

    node("Respond", "n8n-nodes-base.respondToWebhook", 1.5, [1100, 300], {
        "respondWith": "firstIncomingItem",
        "options": {},
    }),
]

items_connections = {
    "Webhook": link(["Items plan"]),
    "Items plan": link(["Needs database?"]),
    "Needs database?": link(["Run SQL"], ["Items reply"]),
    "Run SQL": link(["Items reply"]),
    "Items reply": link(["Respond"]),
}

items_api = {
    "name": "03 Items API",
    "nodes": items_nodes,
    "connections": items_connections,
    "active": False,
    "settings": {"executionOrder": "v1"},
}


voice_nodes = [
    node("Webhook", "n8n-nodes-base.webhook", 2.1, [0, 300], {
        "httpMethod": "POST",
        "path": "jarvis-transcribe",
        "authentication": "headerAuth",
        "responseMode": "responseNode",
        "options": {"allowedOrigins": "*"},
    }, webhookId=uid("webhook path jarvis-transcribe"), credentials={"httpHeaderAuth": {"id": "", "name": "Jarvis token"}}),

    node("Check audio", "n8n-nodes-base.code", 2, [220, 300], {"jsCode": code("transcribe-check.js")}),

    if_node("Has audio?", [440, 300], "={{ $json.ok === true }}"),

    node("Whisper", "n8n-nodes-base.httpRequest", 4.5, [660, 200], {
        "method": "POST",
        "url": "https://api.groq.com/openai/v1/audio/transcriptions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "contentType": "multipart-form-data",
        "bodyParameters": {"parameters": [
            {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "audio"},
            {"name": "model", "value": "whisper-large-v3-turbo"},
            {"name": "language", "value": "en"},
            {"name": "temperature", "value": "0"},
            {"name": "response_format", "value": "json"},
            {"name": "prompt", "value": "Jarvis. Remind me tomorrow at 6 pm to call home. Add a task to finish the lab report by Friday. What is on my list today?"},
        ]},
        "options": {"timeout": 30000, "response": {"response": {"fullResponse": True, "neverError": True}}},
    }, credentials={"httpHeaderAuth": {"id": "", "name": "Groq key"}}, onError="continueRegularOutput"),

    node("Transcript", "n8n-nodes-base.code", 2, [880, 200], {"jsCode": code("transcribe-judge.js")}),

    node("Respond", "n8n-nodes-base.respondToWebhook", 1.5, [1100, 300], {
        "respondWith": "firstIncomingItem",
        "options": {},
    }),
]

voice_connections = {
    "Webhook": link(["Check audio"]),
    "Check audio": link(["Has audio?"]),
    "Has audio?": link(["Whisper"], ["Respond"]),
    "Whisper": link(["Transcript"]),
    "Transcript": link(["Respond"]),
}

voice = {
    "name": "04 Voice transcription",
    "nodes": voice_nodes,
    "connections": voice_connections,
    "active": False,
    "settings": {"executionOrder": "v1"},
}


def write(path, wf):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(wf, indent=2, ensure_ascii=False) + "\n")
    print("wrote", path.relative_to(ROOT))


if __name__ == "__main__":
    write(OUT, workflow)
    write(OUT2, dispatcher)
    write(OUT3, items_api)
    write(OUT4, voice)
