"""Run once at container start, after migrations: signing key, agent releases, demo data."""

from app.agent import releases
from app.config import get_settings
from app.db import SessionLocal
from app.services import ledger, seed, signing


def main() -> None:
    with SessionLocal() as db:
        ledger.ensure_system_accounts(db)
        signing.active_key(db)
        db.commit()
        releases.sync(db)
        if get_settings().sandbox_mode:
            if seed.seed_if_empty(db):
                print("Seeded demo data.")
            elif topped := seed.top_up_in_naira(db):
                db.commit()
                print(f"Topped up {topped} demo account(s) in naira.")


if __name__ == "__main__":
    main()
