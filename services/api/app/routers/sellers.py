"""Seller directory, the seller's own workspace, admin tiers and cart verification (M4)."""

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.models import Merchant
from app.security import Viewer, require_role
from app.services import marketplace, merchants

router = APIRouter(tags=["sellers"])

staff = require_role("analyst", "ops", "admin")
seller_only = require_role("seller")
admin_only = require_role("admin")
ops_only = require_role("ops")


def seller_out(db: Session, m: Merchant, owner: bool = False) -> schemas.SellerOut:
    return schemas.SellerOut(
        id=m.id, display_name=m.display_name, legal_name=m.legal_name, tier=m.tier, category=m.category, city=m.city,
        catalog_kind=m.catalog_kind, joined_at=m.joined_at, adversarial=m.adversarial,
        accounts=[
            schemas.SellerAccountOut(
                bank_code=a.bank_code, bank_name=a.bank_name, account_number_masked=f"•••• {a.account_number[-4:]}",
                account_number=a.account_number if owner else None,
                name_on_account=(a.name_on_account or "").upper(), verified_at=a.verified_at,
            )
            for a in merchants.accounts_of(db, m.id)
        ],
    )


def catalog_out(items: list[dict]) -> list[schemas.CatalogItemOut]:
    return [schemas.CatalogItemOut.model_validate(i) for i in items]


# ---- Directory (support, ops, admin) -----------------------------------------------------


@router.get("/sellers", response_model=list[schemas.SellerOut])
def list_sellers(_: Viewer = Depends(staff), db: Session = Depends(get_db)) -> list[schemas.SellerOut]:
    return [seller_out(db, m) for m in db.scalars(select(Merchant).order_by(Merchant.adversarial, Merchant.joined_at))]


@router.get("/sellers/{seller_id}", response_model=schemas.SellerOut)
def get_seller(seller_id: str, _: Viewer = Depends(staff), db: Session = Depends(get_db)) -> schemas.SellerOut:
    return seller_out(db, merchants.get(db, seller_id))


@router.get("/sellers/{seller_id}/catalog", response_model=list[schemas.CatalogItemOut])
def seller_catalog(seller_id: str, _: Viewer = Depends(staff), db: Session = Depends(get_db)) -> list[schemas.CatalogItemOut]:
    return catalog_out(marketplace.seller_items(merchants.get(db, seller_id).id))


# ---- The signed-in seller's workspace ----------------------------------------------------


@router.get("/seller/profile", response_model=schemas.SellerOut)
def my_profile(viewer: Viewer = Depends(seller_only), db: Session = Depends(get_db)) -> schemas.SellerOut:
    return seller_out(db, merchants.owned_by(db, viewer.user.username), owner=True)


@router.get("/seller/catalog", response_model=list[schemas.CatalogItemOut])
def my_catalog(viewer: Viewer = Depends(seller_only), db: Session = Depends(get_db)) -> list[schemas.CatalogItemOut]:
    return catalog_out(marketplace.seller_items(merchants.owned_by(db, viewer.user.username).id))


@router.post("/seller/accounts", response_model=schemas.SellerOut)
def register_account(body: schemas.RegisterAccountIn, viewer: Viewer = Depends(seller_only), db: Session = Depends(get_db)) -> schemas.SellerOut:
    """Adds a settlement account. The bank's name enquiry decides whether it can receive payments."""
    m = merchants.owned_by(db, viewer.user.username)
    merchants.register_account(db, m, body.bank_code, body.account_number.strip())
    return seller_out(db, m, owner=True)


@router.delete("/seller/accounts/{bank_code}/{account_number}", response_model=schemas.SellerOut)
def remove_account(bank_code: str, account_number: str, viewer: Viewer = Depends(seller_only), db: Session = Depends(get_db)) -> schemas.SellerOut:
    m = merchants.owned_by(db, viewer.user.username)
    merchants.remove_account(db, m, bank_code, account_number)
    return seller_out(db, m, owner=True)


# ---- Admin -----------------------------------------------------------------------------------


@router.post("/admin/sellers/{seller_id}/tier", response_model=schemas.SellerOut)
def set_tier(seller_id: str, body: schemas.SellerTierIn, _: Viewer = Depends(admin_only), db: Session = Depends(get_db)) -> schemas.SellerOut:
    return seller_out(db, merchants.set_tier(db, merchants.get(db, seller_id), body.tier))


# ---- Carts and sandbox ------------------------------------------------------------------------


@router.post("/carts/verify", response_model=schemas.CartVerificationOut)
def verify_cart(signed: dict = Body(...), _: Viewer = Depends(staff), db: Session = Depends(get_db)) -> schemas.CartVerificationOut:
    """Checks a seller-signed cart as the gate will: signature, freshness, arithmetic, and the payee account."""
    return schemas.CartVerificationOut.model_validate(merchants.verify_cart(db, signed))


@router.post("/sandbox/sellers/sync", response_model=schemas.RegistrySyncOut)
def sync_sellers(_: Viewer = Depends(ops_only), db: Session = Depends(get_db)) -> schemas.RegistrySyncOut:
    """Re-reads the marketplace's seller registry into the directory."""
    return schemas.RegistrySyncOut.model_validate(merchants.sync_registry(db))
