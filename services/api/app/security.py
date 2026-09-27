"""
Authentication: validates Keycloak access tokens (RS256 JWTs).

The web app's server (BFF) holds the user's tokens and forwards the access
token as `Authorization: Bearer …`. Browsers never see tokens.
"""

from dataclasses import dataclass, field
from functools import lru_cache

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.models import Account, User

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    sub: str
    username: str
    name: str
    email: str | None
    roles: frozenset[str] = field(default_factory=frozenset)
    # The OAuth client the token was issued to (e.g. the web app, or the scan-cli test client).
    client_id: str | None = None


@dataclass
class Viewer:
    """The signed-in user as the platform knows them."""

    user: User
    account: Account | None
    client_id: str | None = None

    @property
    def role(self) -> str:
        return self.user.role


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(get_settings().oidc_jwks_url, cache_keys=True, lifespan=300)


def decode_access_token(token: str) -> Principal:
    settings = get_settings()
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.oidc_audience,
            issuer=settings.oidc_issuer,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            leeway=10,
        )
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(401, "token_expired", "Your session has expired. Sign in again.") from exc
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise ApiError(401, "invalid_token", "Your session isn't valid. Sign in again.") from exc

    username = claims.get("preferred_username") or claims["sub"]
    name = claims.get("name") or " ".join(
        part for part in (claims.get("given_name"), claims.get("family_name")) if part
    )
    return Principal(
        sub=claims["sub"],
        username=username,
        name=name or username,
        email=claims.get("email"),
        roles=frozenset(claims.get("realm_access", {}).get("roles", [])),
        client_id=claims.get("azp"),
    )


def get_principal(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Principal | None:
    if credentials is None:
        return None
    return decode_access_token(credentials.credentials)


def get_viewer(
    principal: Principal | None = Depends(get_principal),
    db: Session = Depends(get_db),
) -> Viewer | None:
    """The signed-in user, provisioned on first sight. None for anonymous requests."""
    if principal is None:
        return None
    from app.services.users import provision  # Local import: services depend on this module.

    return provision(db, principal)


def require_viewer(viewer: Viewer | None = Depends(get_viewer)) -> Viewer:
    if viewer is None:
        raise ApiError(401, "unauthenticated", "Sign in to do this.")
    return viewer


def require_wallet(viewer: Viewer = Depends(require_viewer)) -> Viewer:
    if viewer.account is None:
        raise ApiError(403, "no_wallet", "This account doesn't have a wallet.")
    return viewer


def require_role(*roles: str):
    def dependency(viewer: Viewer = Depends(require_viewer)) -> Viewer:
        if viewer.role not in roles:
            raise ApiError(403, "forbidden", "You don't have access to this.")
        return viewer

    return dependency
