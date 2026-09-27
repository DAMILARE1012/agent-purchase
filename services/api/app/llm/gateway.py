"""
The LLM gateway: the only way any part of the platform calls a model
(system_design.md §5).

For each call:
  1. cache: identical input, prompt version and model → the stored answer;
  2. budget: the user's daily token budget;
  3. for each model in the route (primary, then fallbacks), skipping any whose
     circuit breaker is open:
       - wait for shared, fair rate-limit capacity (Redis);
       - call with retries on 429/5xx/timeouts, honouring retry-after;
       - ask for strict JSON-schema output; if the model rejects that for this
         request (e.g. with images), remember it and use JSON mode instead;
       - validate the answer against the schema in code, always;
  4. record one inference-log row per attempt, and the cost.
"""

import hashlib
import json
import logging
import random
import time
from dataclasses import dataclass, field

import jsonschema

from app.config import get_settings
from app.db import SessionLocal
from app.llm import pricing, providers, ratelimit
from app.llm.providers import SANDBOX_MODEL, ProviderError, StructuredOutputUnsupported
from app.models import InferenceLog
from app.redis_client import get_redis

log = logging.getLogger("api.llm")

MAX_ATTEMPTS = 3
CACHE_TTL_S = 24 * 3600


class LlmUnavailable(Exception):
    """Every model in the route failed or was unavailable."""


class BudgetExceeded(Exception):
    """The user's daily model budget is used up."""


@dataclass
class LlmRequest:
    task: str
    prompt_version: str
    messages: list[dict]
    schema: dict
    schema_name: str
    models: list[str]
    params: dict = field(default_factory=dict)
    user_id: str | None = None
    run_id: str | None = None
    priority: str = "interactive"  # interactive | background | eval
    cacheable: bool = True
    # Only the sandbox provider sees this: the structured state its script needs.
    sandbox_state: dict | None = None
    deadline: float | None = None  # time.monotonic() value


@dataclass
class LlmResult:
    output: dict
    model: str
    provider: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    queue_ms: int
    cost_micro_usd: int
    cached: bool
    fallback: bool
    inference_id: int | None


def _input_hash(req: LlmRequest) -> str:
    def strip_images(msgs: list[dict]) -> list:
        out = []
        for m in msgs:
            c = m.get("content")
            if isinstance(c, list):
                c = [
                    {"image_sha256": hashlib.sha256(p["image_url"]["url"].encode()).hexdigest()} if p.get("type") == "image_url" else p
                    for p in c
                ]
            out.append({"role": m.get("role"), "content": c})
        return out

    blob = json.dumps({"task": req.task, "v": req.prompt_version, "m": strip_images(req.messages), "s": req.schema}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()


def _estimate_tokens(req: LlmRequest) -> int:
    return providers._estimate_tokens(req.messages) + int(req.params.get("max_tokens", 600))


def _record(req: LlmRequest, provider: str, model: str, input_hash: str, outcome: str, *, output: dict | None = None,
            tokens_in: int = 0, tokens_out: int = 0, latency_ms: int = 0, queue_ms: int = 0, cost: int = 0, error: str | None = None) -> int:
    with SessionLocal() as db:
        row = InferenceLog(
            run_id=req.run_id, user_id=req.user_id, task=req.task, provider=provider, model=model, prompt_version=req.prompt_version,
            input_hash=input_hash, output=output, tokens_in=tokens_in, tokens_out=tokens_out, latency_ms=latency_ms, queue_ms=queue_ms,
            cost_micro_usd=cost, outcome=outcome, error=error[:2000] if error else None,
        )
        db.add(row)
        db.commit()
        return row.id


def _parse(content: str, schema: dict) -> dict:
    text = content.strip()
    if text.startswith("```"):  # Models sometimes fence JSON even in JSON mode.
        text = text.strip("`").removeprefix("json").strip()
    data = json.loads(text)
    jsonschema.validate(data, schema)
    return data


def _strict_supported(model: str, task: str) -> bool:
    return get_redis().get(f"llm:cap:{model}:{task}:strict") != "no"


def _mark_strict_unsupported(model: str, task: str) -> None:
    get_redis().set(f"llm:cap:{model}:{task}:strict", "no", ex=7 * 86400)


def complete(req: LlmRequest) -> LlmResult:
    settings = get_settings()
    provider = providers.provider_name()
    models = [SANDBOX_MODEL] if provider == "sandbox" else req.models
    input_hash = _input_hash(req)
    user = req.user_id or "system"
    deadline = req.deadline or (time.monotonic() + 120)
    r = get_redis()

    for i, model in enumerate(models):
        if req.cacheable and (hit := r.get(f"llm:cache:{input_hash}:{model}")):
            output = json.loads(hit)
            inference_id = _record(req, provider, model, input_hash, "cached", output=output)
            return LlmResult(output, model, provider, 0, 0, 0, 0, 0, cached=True, fallback=i > 0, inference_id=inference_id)

    # Evaluations have their own budget (system_design.md §5), so they never eat into shoppers'.
    budget = settings.llm_eval_daily_tokens if req.priority == "eval" else settings.llm_user_daily_tokens
    if ratelimit.budget_used(user) >= budget:
        _record(req, provider, models[0], input_hash, "budget", error="Daily token budget used up")
        raise BudgetExceeded("The daily AI budget for this account is used up. It resets at midnight UTC.")

    last_error = "no model available"
    for i, model in enumerate(models):
        if provider == "groq" and ratelimit.breaker_open(model):
            last_error = f"{model}: circuit open"
            continue
        strict = _strict_supported(model, req.task)
        for attempt in range(MAX_ATTEMPTS):
            try:
                reservation = ratelimit.acquire(user, req.priority, _estimate_tokens(req), deadline)
                queue_ms = reservation.waited_ms
            except ratelimit.RateLimitTimeout as exc:
                _record(req, provider, model, input_hash, "error", error=str(exc))
                raise LlmUnavailable(str(exc)) from exc
            try:
                if provider == "sandbox":
                    c = providers.sandbox_complete(req.task, req.messages, req.sandbox_state)
                else:
                    messages = req.messages if strict else _with_schema_instructions(req.messages, req.schema)
                    c = providers.groq_complete(model, messages, schema=req.schema, schema_name=req.schema_name, strict=strict, params=req.params)
                ratelimit.settle(reservation, c.tokens_in + c.tokens_out)
                output = _parse(c.content, req.schema)
            except StructuredOutputUnsupported as exc:
                _mark_strict_unsupported(model, req.task)
                _record(req, provider, model, input_hash, "error", error=f"strict schema unsupported: {exc}", queue_ms=queue_ms)
                strict = False
                continue
            except ProviderError as exc:
                last_error = f"{model}: {exc}"
                _record(req, provider, model, input_hash, "error", error=str(exc), queue_ms=queue_ms)
                if provider == "groq":
                    ratelimit.breaker_record(model, ok=False)
                if not exc.retryable or attempt == MAX_ATTEMPTS - 1:
                    break
                pause = exc.retry_after if exc.retry_after and exc.retry_after <= 20 else min(8.0, 0.5 * 2**attempt)
                time.sleep(pause * random.uniform(1.0, 1.3))
                continue
            except (json.JSONDecodeError, jsonschema.ValidationError) as exc:
                last_error = f"{model}: invalid output: {str(exc)[:200]}"
                _record(req, provider, model, input_hash, "schema_error", error=str(exc)[:2000], tokens_in=c.tokens_in,
                        tokens_out=c.tokens_out, latency_ms=c.latency_ms, queue_ms=queue_ms,
                        cost=pricing.cost_micro_usd(model, c.tokens_in, c.tokens_out))
                ratelimit.budget_add(user, c.tokens_in + c.tokens_out)
                break  # A model that answers off-schema once will usually do it again: go to the fallback.

            cost = 0 if provider == "sandbox" else pricing.cost_micro_usd(model, c.tokens_in, c.tokens_out)
            ratelimit.budget_add(user, c.tokens_in + c.tokens_out)
            if provider == "groq":
                ratelimit.breaker_record(model, ok=True)
            outcome = "fallback" if i > 0 else "ok"
            inference_id = _record(req, provider, model, input_hash, outcome, output=output, tokens_in=c.tokens_in,
                                   tokens_out=c.tokens_out, latency_ms=c.latency_ms, queue_ms=queue_ms, cost=cost)
            if req.cacheable:
                r.set(f"llm:cache:{input_hash}:{model}", json.dumps(output), ex=CACHE_TTL_S)
            return LlmResult(output, model, provider, c.tokens_in, c.tokens_out, c.latency_ms, queue_ms, cost,
                             cached=False, fallback=i > 0, inference_id=inference_id)
    raise LlmUnavailable(last_error)


def _with_schema_instructions(messages: list[dict], schema: dict) -> list[dict]:
    """JSON mode (no strict schema): put the schema in the system prompt. The answer is still validated in code."""
    note = "Answer with a single JSON object that matches this JSON schema exactly:\n" + json.dumps(schema)
    out = [dict(m) for m in messages]
    if out and out[0]["role"] == "system":
        out[0]["content"] = f"{out[0]['content']}\n\n{note}"
    else:
        out.insert(0, {"role": "system", "content": note})
    return out
