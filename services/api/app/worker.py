"""
Run worker: takes AI shopping runs off the Redis queue and executes them
(system_design.md §5, "Many users at once"). Scale by adding worker containers
or raising WORKER_CONCURRENCY; model calls from every worker share the same
rate limits through the gateway.

Usage: python -m app.worker
"""

import logging
import signal
import threading
import time
from datetime import timedelta

from sqlalchemy import select

from app.agent import releases, runtime
from app.config import get_settings
from app.db import SessionLocal
from app.formatting import now
from app.llm.providers import provider_name
from app.models import AgentRun
from app.services import runqueue

log = logging.getLogger("worker")
stopping = threading.Event()


def recover() -> None:
    """After a restart: requeue runs that lost their queue entry, fail runs a dead worker left running."""
    settings = get_settings()
    with SessionLocal() as db:
        releases.sync(db)
        queued = runqueue.queued_ids()
        for run in db.scalars(select(AgentRun).where(AgentRun.status == "queued")):
            if run.id not in queued:
                runqueue.enqueue(run.id, run.priority)
                log.info("Requeued %s", run.id)
        cutoff = now() - timedelta(seconds=settings.agent_run_timeout_seconds + 60)
        for run in db.scalars(select(AgentRun).where(AgentRun.status == "running", AgentRun.began_at < cutoff)):
            run.status, run.ended_at = "failed", now()
            run.outcome_note = "The shopping run was interrupted. Nothing was paid. Start it again from the mandate."
            log.warning("Marked stale run %s as failed", run.id)
            runqueue.publish(run.id)
        db.commit()


def work(slot: int) -> None:
    while not stopping.is_set():
        try:
            run_id = runqueue.take(timeout_s=2)
        except Exception:
            log.exception("Queue unavailable; retrying")
            time.sleep(2)
            continue
        if run_id:
            started = time.monotonic()
            runtime.execute(run_id)
            log.info("slot %s finished %s in %.1fs", slot, run_id, time.monotonic() - started)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    settings = get_settings()
    recover()
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())
    threads = [threading.Thread(target=work, args=(i,), name=f"run-worker-{i}", daemon=True) for i in range(settings.worker_concurrency)]
    for t in threads:
        t.start()
    log.info("Worker started with %s slots (model provider: %s)", len(threads), provider_name())
    while not stopping.is_set():
        time.sleep(1)
    for t in threads:
        t.join(timeout=settings.agent_run_timeout_seconds)


if __name__ == "__main__":
    main()
