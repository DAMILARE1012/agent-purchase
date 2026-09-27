"""
Shared, fair model rate limiting across every worker (system_design.md §5,
"Many users at once").

The account's limits are enforced with sliding 60-second windows, which is how
Groq counts: a call is admitted only if the requests and tokens of every call
in the last 60 seconds, plus this one, fit within the per-minute limits. Every
worker shares the windows through Redis, so the account is never pushed over.

Token counts are reserved up front from an estimate (prompt, images and the
maximum answer length) and then settled to what the call actually used, so an
overestimate doesn't waste capacity.

Fairness: each user also has a bucket refilled at their fair share, the request
limit divided by the users who made a call in the last 15 seconds. A user
running ten shoppers still gets one share, so they can't crowd others out; a
user alone gets everything.

Priorities: background work (standing mandates, evaluations) may only use the
capacity above a reserve kept for interactive runs.

One Lua script does all of it atomically.
"""

import random
import secrets
import time
from dataclasses import dataclass

from app.config import get_settings
from app.redis_client import get_redis

WINDOW_MS = 60_000

_ACQUIRE = """
local now = tonumber(ARGV[1])
local user = ARGV[2]
local priority = ARGV[3]
local est = tonumber(ARGV[4])
local rpm = tonumber(ARGV[5])
local tpm = tonumber(ARGV[6])
local reserve = tonumber(ARGV[7])
local reqid = ARGV[8]
local active_key, req_key, tok_key, user_key = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local window = 60000

-- Who is sharing the capacity right now.
redis.call('ZREMRANGEBYSCORE', active_key, 0, now - 15000)
redis.call('ZADD', active_key, now, user)
redis.call('PEXPIRE', active_key, 120000)
local n_active = math.max(1, redis.call('ZCARD', active_key))

-- The account's sliding windows.
redis.call('ZREMRANGEBYSCORE', req_key, 0, now - window)
redis.call('ZREMRANGEBYSCORE', tok_key, 0, now - window)
local rpm_eff, tpm_eff = rpm, tpm
if priority ~= 'interactive' then
  rpm_eff = math.max(1, math.floor(rpm * (1 - reserve)))
  tpm_eff = math.max(1, math.floor(tpm * (1 - reserve)))
end
est = math.min(est, tpm_eff)  -- A call bigger than the limit can still run, alone.

local wait = 0
local count = redis.call('ZCARD', req_key)
if count + 1 > rpm_eff then
  -- Wait until enough of the oldest calls leave the window.
  local oldest = redis.call('ZRANGE', req_key, count + 1 - rpm_eff - 1, count + 1 - rpm_eff - 1, 'WITHSCORES')
  wait = math.max(wait, tonumber(oldest[2]) + window - now)
end

local entries = redis.call('ZRANGE', tok_key, 0, -1, 'WITHSCORES')
local used = 0
for i = 1, #entries, 2 do
  used = used + tonumber(string.match(entries[i], '|(%d+)$'))
end
if used + est > tpm_eff then
  local freed = 0
  for i = 1, #entries, 2 do
    freed = freed + tonumber(string.match(entries[i], '|(%d+)$'))
    if used - freed + est <= tpm_eff then
      wait = math.max(wait, tonumber(entries[i + 1]) + window - now)
      break
    end
  end
end

-- The user's fair-share bucket (requests).
local u_rate = (rpm / n_active) / window
local u_cap = math.max(1, (rpm / n_active) / 6)
local b = redis.call('HMGET', user_key, 'level', 'ts')
local level = tonumber(b[1])
local ts = tonumber(b[2])
if level == nil then level = u_cap; ts = now end
level = math.min(u_cap, level + (now - ts) * u_rate)
if level < 1 then wait = math.max(wait, (1 - level) / u_rate) end

if wait > 0 then
  redis.call('HSET', user_key, 'level', level, 'ts', now)
  redis.call('PEXPIRE', user_key, 600000)
  return {math.ceil(wait), n_active}
end

redis.call('ZADD', req_key, now, reqid)
redis.call('ZADD', tok_key, now, reqid .. '|' .. math.floor(est))
redis.call('PEXPIRE', req_key, 120000)
redis.call('PEXPIRE', tok_key, 120000)
redis.call('HSET', user_key, 'level', level - 1, 'ts', now)
redis.call('PEXPIRE', user_key, 600000)
return {0, n_active, math.floor(est)}
"""

# Settle a reservation to the tokens the call actually used (same time, new count).
_SETTLE = """
local tok_key, reqid, est, actual = KEYS[1], ARGV[1], ARGV[2], ARGV[3]
local member = reqid .. '|' .. est
local score = redis.call('ZSCORE', tok_key, member)
if score then
  redis.call('ZREM', tok_key, member)
  redis.call('ZADD', tok_key, score, reqid .. '|' .. actual)
end
return 1
"""

KEYS = ("llm:rl:active", "llm:rl:win:req", "llm:rl:win:tok")
LIMITS_KEY = "llm:limits"


@dataclass(frozen=True)
class Limits:
    requests_per_minute: int
    tokens_per_minute: int
    interactive_reserve: float


@dataclass(frozen=True)
class Reservation:
    id: str
    est_tokens: int
    waited_ms: int


def current_limits() -> Limits:
    """Settings from .env, overridable at runtime by ops (POST /v1/ops/llm/limits)."""
    s = get_settings()
    override = get_redis().hgetall(LIMITS_KEY)
    return Limits(
        requests_per_minute=int(override.get("rpm", s.llm_requests_per_minute)),
        tokens_per_minute=int(override.get("tpm", s.llm_tokens_per_minute)),
        interactive_reserve=float(override.get("reserve", s.llm_interactive_reserve)),
    )


def set_limits(rpm: int | None, tpm: int | None, reserve: float | None) -> Limits:
    r = get_redis()
    fields = {k: v for k, v in (("rpm", rpm), ("tpm", tpm), ("reserve", reserve)) if v is not None}
    if fields:
        r.hset(LIMITS_KEY, mapping=fields)
    return current_limits()


def reset_limits() -> Limits:
    get_redis().delete(LIMITS_KEY)
    return current_limits()


class RateLimitTimeout(Exception):
    """Waited longer than the caller allows for model capacity."""


def acquire(user: str, priority: str, est_tokens: int, deadline: float) -> Reservation:
    """Blocks until the call may go ahead and reserves its capacity; raises RateLimitTimeout past the deadline."""
    r = get_redis()
    script = r.register_script(_ACQUIRE)
    reqid = secrets.token_hex(6)
    est = max(1, int(est_tokens))
    started = time.monotonic()
    while True:
        limits = current_limits()
        est_capped = min(est, limits.tokens_per_minute)
        result = script(
            keys=[*KEYS, f"llm:rl:user:{user}"],
            args=[int(time.time() * 1000), user, priority, est_capped, limits.requests_per_minute, limits.tokens_per_minute,
                  limits.interactive_reserve, reqid],
        )
        wait_ms = int(result[0])
        if wait_ms == 0:  # Admitted: result = [0, active users, tokens reserved]
            return Reservation(reqid, int(result[2]), int((time.monotonic() - started) * 1000))
        pause = min(wait_ms / 1000, 5.0) * random.uniform(1.0, 1.25)  # Jitter, so waiters don't stampede.
        if time.monotonic() + pause > deadline:
            raise RateLimitTimeout(f"No model capacity within the deadline (next slot in {wait_ms} ms)")
        time.sleep(pause)


def settle(reservation: Reservation, actual_tokens: int) -> None:
    """Replaces the reserved estimate with what the call used (or 0 if it never reached the model)."""
    get_redis().register_script(_SETTLE)(keys=[KEYS[2]], args=[reservation.id, reservation.est_tokens, max(0, int(actual_tokens))])


# ---- Circuit breaker: shared across workers ----------------------------------------------------

BREAKER_FAILURES = 5
BREAKER_WINDOW_S = 60
BREAKER_OPEN_S = 30


def breaker_open(model: str) -> bool:
    until = get_redis().get(f"llm:cb:{model}:open_until")
    return bool(until) and float(until) > time.time()


def breaker_record(model: str, ok: bool) -> None:
    r = get_redis()
    key = f"llm:cb:{model}:fails"
    if ok:
        r.delete(key)
        return
    fails = r.incr(key)
    r.expire(key, BREAKER_WINDOW_S)
    if fails >= BREAKER_FAILURES:
        r.set(f"llm:cb:{model}:open_until", time.time() + BREAKER_OPEN_S, ex=BREAKER_OPEN_S)
        r.delete(key)


# ---- Daily token budgets ----------------------------------------------------------------------------


def budget_key(user: str) -> str:
    return f"llm:budget:{user}:{time.strftime('%Y%m%d', time.gmtime())}"


def budget_used(user: str) -> int:
    return int(get_redis().get(budget_key(user)) or 0)


def budget_add(user: str, tokens: int) -> None:
    r = get_redis()
    key = budget_key(user)
    r.incrby(key, tokens)
    r.expire(key, 2 * 86400)
