"""Shared Redis clients: sync for workers and request handlers, async for live event streams."""

from functools import lru_cache

import redis
import redis.asyncio as aioredis

from app.config import get_settings


@lru_cache
def get_redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, decode_responses=True, health_check_interval=30)


def get_async_redis() -> aioredis.Redis:
    # Not cached: an asyncio client belongs to the event loop that created it.
    return aioredis.Redis.from_url(get_settings().redis_url, decode_responses=True)
