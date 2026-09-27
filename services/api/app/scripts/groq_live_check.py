"""
Live check of qwen/qwen3.8-27b on Groq (M5): what the model actually supports,
before we rely on it. Needs GROQ_API_KEY in .env. Calls Groq directly (not
through the gateway), a handful of times.

    docker compose run --rm --no-deps --entrypoint "python -m app.scripts.groq_live_check" api

Checks:
  1. plain chat completion
  2. strict JSON-schema output on text (the agent's action schema)
  3. an image with strict JSON-schema output (reading a real marketplace catalog photo)
  4. the same image in JSON mode (the gateway's fallback when 3 is rejected)
  5. native tool calling
  6. reasoning_format "hidden" together with JSON output
and prints latency, tokens and what the gateway should do for each.
"""

import json
import sys
import time

import httpx
import jsonschema

from app.agent import releases, tools
from app.agent.schemas import AGENT_ACTION, CATALOG_READING
from app.config import get_settings

MODEL = "qwen/qwen3.8-27b"


def main() -> int:
    s = get_settings()
    if not s.groq_api_key:
        print("GROQ_API_KEY isn't set. Add it to .env (never paste it into chat or commit it), then:")
        print("  docker compose up -d api worker")
        print('  docker compose run --rm --no-deps --entrypoint "python -m app.scripts.groq_live_check" api')
        return 2

    client = httpx.Client(base_url=s.groq_base_url, headers={"authorization": f"Bearer {s.groq_api_key}"}, timeout=60)
    results: list[tuple[str, bool, str]] = []

    def call(name: str, body: dict, check=None) -> dict | None:
        for _ in range(4):  # The account's per-minute token limit is small: wait it out on 429.
            started = time.monotonic()
            res = client.post("/chat/completions", json={"model": MODEL, "temperature": 0, **body})
            ms = int((time.monotonic() - started) * 1000)
            if res.status_code != 429:
                break
            wait = float(res.headers.get("retry-after") or 10)
            print(f"  ({name}: rate limited, waiting {wait:.0f} s)")
            time.sleep(min(wait + 1, 65))
        if res.status_code >= 400:
            results.append((name, False, f"HTTP {res.status_code}: {res.text[:240]}"))
            return None
        data = res.json()
        usage = data.get("usage", {})
        note = f"{ms} ms, {usage.get('prompt_tokens')} in / {usage.get('completion_tokens')} out"
        try:
            detail = check(data) if check else ""
            results.append((name, True, f"{note}. {detail}".strip()))
        except Exception as exc:  # The call worked but the answer didn't meet the check.
            results.append((name, False, f"{note}. Answer failed the check: {str(exc)[:240]}"))
        return data

    def content_json(schema):
        def check(data):
            obj = json.loads(data["choices"][0]["message"]["content"])
            jsonschema.validate(obj, schema)
            return f"valid: {json.dumps(obj)[:160]}"
        return check

    system = releases.prompt("agent.step", "v1") + '\n\n<mandate>{"item": "HP 107A toner", "brand": "HP", "model": "107A", "max_total_naira_including_delivery": 40000, "seller_rule": "verified_only", "delivery_city": "Lagos"}</mandate>'
    agent_messages = [{"role": "system", "content": system}, {"role": "user", "content": "Start shopping. Reply with your first action."}]

    call("1. plain completion", {"messages": [{"role": "user", "content": "Reply with the single word: ready"}], "max_completion_tokens": 20},
         lambda d: f"said: {d['choices'][0]['message']['content'][:40]!r}")
    call("2. strict JSON schema, text", {"messages": agent_messages, "max_completion_tokens": 400,
         "response_format": {"type": "json_schema", "json_schema": {"name": "agent_action", "schema": AGENT_ACTION, "strict": True}}},
         content_json(AGENT_ACTION))

    found = tools.search("HP 107A toner")
    url = found["imageCatalogs"][0]["url"] if found["imageCatalogs"] else None
    if url:
        image = {"type": "image_url", "image_url": {"url": tools.image_data_url(url)}}
        read_messages = [{"role": "system", "content": releases.prompt("catalog.read_image", "v1")},
                         {"role": "user", "content": [{"type": "text", "text": "Read this catalog image."}, image]}]
        call("3. image + strict JSON schema", {"messages": read_messages, "max_completion_tokens": 1500,
             "response_format": {"type": "json_schema", "json_schema": {"name": "catalog_reading", "schema": CATALOG_READING, "strict": True}}},
             content_json(CATALOG_READING))
        json_mode = [dict(m) for m in read_messages]
        json_mode[0]["content"] += "\n\nAnswer with a single JSON object that matches this JSON schema exactly:\n" + json.dumps(CATALOG_READING)
        call("4. image + JSON mode", {"messages": json_mode, "max_completion_tokens": 1500, "response_format": {"type": "json_object"}},
             content_json(CATALOG_READING))
    else:
        results.append(("3/4. image checks", False, "No photo catalog found in the marketplace"))

    tool = {"type": "function", "function": {"name": "search_catalog", "description": "Search the marketplace",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}
    call("5. native tool calling", {"messages": [{"role": "user", "content": "Find HP 107A toner in the marketplace."}], "tools": [tool], "tool_choice": "auto",
         "max_completion_tokens": 300},
         lambda d: f"tool_calls: {json.dumps(d['choices'][0]['message'].get('tool_calls'))[:160]}" if d["choices"][0]["message"].get("tool_calls")
         else (_ for _ in ()).throw(ValueError("no tool call returned")))
    call("6. reasoning hidden + JSON", {"messages": agent_messages, "max_completion_tokens": 600, "reasoning_format": "hidden",
         "response_format": {"type": "json_schema", "json_schema": {"name": "agent_action", "schema": AGENT_ACTION, "strict": True}}},
         content_json(AGENT_ACTION))

    width = max(len(n) for n, _, _ in results)
    print(f"\nLive check of {MODEL} on Groq\n")
    for name, ok, note in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {note}")
    strict_images = next((ok for n, ok, _ in results if n.startswith("3.")), False)
    print("\nWhat this means for the gateway:")
    print(f"  - Image reading: {'strict JSON schema works' if strict_images else 'use JSON mode + validation in code (the gateway switches automatically)'}")
    print("  - Agent actions: strict JSON schema" + ("" if results[1][1] else " FAILED: check the schema features Groq supports"))
    print("  - Native tool calling is optional: the agent loop uses strict-JSON actions either way.")
    return 0 if all(ok for n, ok, _ in results if not n.startswith(("3.", "5."))) else 1


if __name__ == "__main__":
    sys.exit(main())
