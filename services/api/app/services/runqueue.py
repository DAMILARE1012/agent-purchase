"""
The run queue and live run events, in Redis (system_design.md §5, "Many users at once").

Two lists: interactive runs (a shopper is watching) are always taken before
background runs (standing mandates). Workers block on both with BRPOP, which
checks the lists in order. Run updates are published on a channel per run, so
any API instance can stream them to the browser.
"""

from sqlalchemy import event

from app.redis_client import get_redis

QUEUES = {"interactive": "runs:q:interactive", "background": "runs:q:background"}


def enqueue(run_id: str, priority: str) -> None:
    get_redis().lpush(QUEUES.get(priority, QUEUES["background"]), run_id)


def take(timeout_s: int = 5) -> str | None:
    """The next run to work on, interactive first; None if the queues stay empty for timeout_s."""
    item = get_redis().brpop([QUEUES["interactive"], QUEUES["background"]], timeout=timeout_s)
    return item[1] if item else None


def position(run_id: str, priority: str) -> int | None:
    """1 = next to be picked up. Interactive runs are ahead of every background run."""
    r = get_redis()
    key = QUEUES.get(priority, QUEUES["background"])
    idx = r.lpos(key, run_id)
    if idx is None:
        return None
    ahead = r.llen(key) - idx  # BRPOP takes from the right end.
    if priority != "interactive":
        ahead += r.llen(QUEUES["interactive"])
    return ahead


def queued_ids() -> set[str]:
    r = get_redis()
    return {rid for key in QUEUES.values() for rid in r.lrange(key, 0, -1)}


def depth() -> int:
    r = get_redis()
    return sum(r.llen(k) for k in QUEUES.values())


def channel(run_id: str) -> str:
    return f"run:{run_id}"


def publish(run_id: str) -> None:
    """Tells anyone streaming this run that it changed. Subscribers re-read it from the database."""
    get_redis().publish(channel(run_id), "changed")


def publish_after_commit(db, run_id: str) -> None:
    """
    Publishes once the session commits, so subscribers never re-read the run before
    the change is visible. Used where the commit happens elsewhere (webhooks, the resolver).
    """
    pending: set[str] = db.info.setdefault("publish_runs", set())
    if not pending:
        event.listen(db, "after_commit", _flush_publish, once=True)
    pending.add(run_id)


def _flush_publish(db) -> None:
    for run_id in db.info.pop("publish_runs", set()):
        try:
            publish(run_id)
        except Exception:  # Live updates are best effort; the page still loads the run.
            pass
