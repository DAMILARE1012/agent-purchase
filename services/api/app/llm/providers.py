"""
Model providers behind the gateway.

- GroqProvider: Groq's OpenAI-compatible chat completions API.
- SandboxProvider: a scripted stand-in used when no GROQ_API_KEY is set. It is
  not a model: it follows a fixed shopping policy and reads catalog photos by
  looking up the marketplace's ground-truth labels. It exists so the gateway,
  queue, workers, traces and UI can be built and tested without an API key, and
  it always reports itself as model "sandbox/scripted".
"""

import json
import random
import time
from dataclasses import dataclass
from functools import lru_cache

import httpx

from app.config import get_settings

SANDBOX_MODEL = "sandbox/scripted"


class ProviderError(Exception):
    def __init__(self, message: str, *, status: int | None = None, retry_after: float | None = None, retryable: bool = False):
        super().__init__(message)
        self.status, self.retry_after, self.retryable = status, retry_after, retryable


class StructuredOutputUnsupported(ProviderError):
    """The model rejected strict JSON-schema output for this request (e.g. with images)."""


@dataclass
class Completion:
    content: str
    tokens_in: int
    tokens_out: int
    latency_ms: int


def provider_name() -> str:
    s = get_settings()
    if s.llm_provider in ("groq", "sandbox"):
        return s.llm_provider
    return "groq" if s.groq_api_key else "sandbox"


# ---- Groq ------------------------------------------------------------------------------------------


@lru_cache
def _groq_client() -> httpx.Client:
    s = get_settings()
    return httpx.Client(
        base_url=s.groq_base_url,
        headers={"authorization": f"Bearer {s.groq_api_key}"},
        timeout=httpx.Timeout(s.llm_timeout_seconds, connect=5.0),
    )


def groq_complete(model: str, messages: list[dict], *, schema: dict | None, schema_name: str, strict: bool, params: dict) -> Completion:
    body: dict = {"model": model, "messages": messages, "temperature": params.get("temperature", 0)}
    if params.get("max_tokens"):
        body["max_completion_tokens"] = params["max_tokens"]
    if params.get("reasoning_effort"):
        body["reasoning_effort"] = params["reasoning_effort"]
    if params.get("reasoning_format"):
        # "raw" isn't allowed with JSON output; the gateway only ever asks for hidden or parsed.
        body["reasoning_format"] = params["reasoning_format"]
    if schema is not None:
        if strict:
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": schema_name, "schema": schema, "strict": True}}
        else:
            body["response_format"] = {"type": "json_object"}
    started = time.monotonic()
    try:
        res = _groq_client().post("/chat/completions", json=body)
    except httpx.TimeoutException as exc:
        raise ProviderError(f"Timed out: {exc}", retryable=True) from exc
    except httpx.HTTPError as exc:
        raise ProviderError(f"Network error: {exc}", retryable=True) from exc
    latency = int((time.monotonic() - started) * 1000)

    if res.status_code == 400 and strict and ("response_format" in res.text or "json_schema" in res.text):
        raise StructuredOutputUnsupported(res.text[:300], status=400)
    if res.status_code == 429 or res.status_code >= 500:
        retry_after = res.headers.get("retry-after")
        raise ProviderError(res.text[:300], status=res.status_code, retry_after=float(retry_after) if retry_after else None, retryable=True)
    if res.status_code >= 400:
        raise ProviderError(res.text[:300], status=res.status_code)

    data = res.json()
    usage = data.get("usage") or {}
    return Completion(
        content=data["choices"][0]["message"].get("content") or "",
        tokens_in=int(usage.get("prompt_tokens", 0)),
        tokens_out=int(usage.get("completion_tokens", 0)),
        latency_ms=latency,
    )


# ---- Sandbox --------------------------------------------------------------------------------------


def _estimate_tokens(messages: list[dict]) -> int:
    total = 0
    for m in messages:
        content = m.get("content")
        if isinstance(content, str):
            total += len(content) // 4
        else:
            for part in content or []:
                total += 2048 if part.get("type") == "image_url" else len(part.get("text", "")) // 4
    return max(1, total)


def sandbox_complete(task: str, messages: list[dict], sandbox_state: dict | None) -> Completion:
    from app.agent import sandbox_policy  # Local import: the policy uses agent modules.

    started = time.monotonic()
    time.sleep(random.uniform(0.15, 0.45))  # Roughly a fast model's latency, so queues and limits behave realistically.
    if task == "agent.step":
        output = sandbox_policy.next_action(sandbox_state or {})
    elif task == "catalog.read_image":
        output = sandbox_policy.read_image(sandbox_state or {})
    elif task == "intent.compile":
        output = sandbox_policy.compile_intent(sandbox_state or {})
    else:
        raise ProviderError(f"The sandbox provider doesn't implement {task}.")
    content = json.dumps(output)
    return Completion(content=content, tokens_in=_estimate_tokens(messages), tokens_out=max(1, len(content) // 4),
                      latency_ms=int((time.monotonic() - started) * 1000))
