import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.errors import ApiError, api_error_handler
from app.routers import banks, ledger, network, risk, sandbox, session, transfers, verification
from app.services import interbank

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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(resolve_pending_forever())
    yield
    task.cancel()


app = FastAPI(
    title="Scan-to-Confirm API",
    version="0.2.0",
    description="Payments (on-platform and inter-bank), signed receipts, verification, risk console and platform ledger. See system_design.md.",
    lifespan=lifespan,
)
app.add_exception_handler(ApiError, api_error_handler)

for module in (session, banks, transfers, verification, risk, ledger, sandbox, network):
    app.include_router(module.router, prefix="/v1")
app.include_router(verification.wellknown)


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"ok": True}
