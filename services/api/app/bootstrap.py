"""Run once at container start, after migrations: create the signing key and demo data."""

from app.config import get_settings
from app.db import SessionLocal
from app.services import ledger, seed, signing


def main() -> None:
    with SessionLocal() as db:
        ledger.ensure_system_accounts(db)
        signing.active_key(db)
        db.commit()
        if get_settings().sandbox_mode and seed.seed_if_empty(db):
            print("Seeded demo data.")


if __name__ == "__main__":
    main()
