import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.errors import ApiError, api_error_handler
from app.db import SessionLocal
from app.routers import agent, banks, ledger, network, risk, sandbox, sellers, session, transfers, verification
from app.services import interbank, merchants

log = logging.getLogger("api")
RESOLVER_INTERVAL_SECONDS = 15


async def resolve_pending_forever() -> None:
    """Fallback for lost webhooks: ask the network about inter-bank payments still pending."""
    while True:
        await asyncio.sleep(RESOLVER_INTERVAL_SECONDS)
        try:
            changed = await asyncio.to_thread(interbank.resolve_stale_pending)
            if changed:
                log.info("Resolved %s pending inter-bank payment(s) by status query", changed)
        except Exception:
            log.exception("Pending-payment resolver failed")


def _sync_sellers() -> dict:
    with SessionLocal() as db:
        return merchants.sync_registry(db)


async def sync_sellers_on_start(attempts: int = 30, delay: float = 5.0) -> None:
    """Loads the seller directory from the sandbox marketplace, retrying until it answers."""
    for _ in range(attempts):
        try:
            result = await asyncio.to_thread(_sync_sellers)
            log.info("Seller directory synced: %s", result)
            return
        except Exception as exc:  # The marketplace or switch may still be starting.
            log.warning("Seller directory sync failed, retrying: %s", exc)
            await asyncio.sleep(delay)
    log.error("Seller directory sync gave up; call POST /v1/sandbox/sellers/sync as ops to retry")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    tasks = [asyncio.create_task(resolve_pending_forever()), asyncio.create_task(sync_sellers_on_start())]
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(
    title="Scan-to-Confirm API",
    version="0.2.0",
    description="Payments (on-platform and inter-bank), signed receipts, verification, risk console and platform ledger. See system_design.md.",
    lifespan=lifespan,
)
app.add_exception_handler(ApiError, api_error_handler)

for module in (session, banks, transfers, verification, risk, ledger, sandbox, network, sellers, agent):
    app.include_router(module.router, prefix="/v1")
app.include_router(verification.wellknown)


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"ok": True}
