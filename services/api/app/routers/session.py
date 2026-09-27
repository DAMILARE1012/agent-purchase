from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.models import Account, User
from app.security import Viewer, get_viewer, require_viewer
from app.services.users import handle

router = APIRouter(tags=["session"])

GUEST = schemas.UserOut(id="guest", display_name="Not signed in", handle="", role="guest", account_id=None)


def user_out(viewer: Viewer) -> schemas.UserOut:
    return schemas.UserOut(
        id=viewer.user.id,
        display_name=viewer.user.display_name,
        handle=handle(viewer.user),
        role=viewer.user.role,
        account_id=viewer.account.id if viewer.account else None,
    )


@router.get("/me", response_model=schemas.SessionOut)
def me(viewer: Viewer | None = Depends(get_viewer)) -> schemas.SessionOut:
    """The signed-in user, or a guest. Signing in for the first time creates the wallet."""
    if viewer is None:
        return schemas.SessionOut(user=GUEST, authenticated=False)
    return schemas.SessionOut(user=user_out(viewer), authenticated=True)


@router.get("/users", response_model=list[schemas.PartySummary])
def people(viewer: Viewer = Depends(require_viewer), db: Session = Depends(get_db)) -> list[schemas.PartySummary]:
    """People the signed-in user can pay: everyone else with a wallet."""
    rows = db.scalars(select(User).join(Account, Account.user_id == User.id).where(User.id != viewer.user.id).order_by(User.display_name))
    return [schemas.PartySummary(user_id=u.id, display_name=u.display_name, handle=handle(u)) for u in rows]
