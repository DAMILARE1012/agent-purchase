from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://scan:scan@localhost:5433/scan"

    # Tokens are issued for the browser-facing Keycloak URL, but the API fetches
    # signing keys over the internal network.
    oidc_issuer: str = "http://localhost:8080/realms/scan-to-confirm"
    oidc_jwks_url: str = "http://localhost:8080/realms/scan-to-confirm/protocol/openid-connect/certs"
    oidc_audience: str = "scan-api"

    public_web_url: str = "http://localhost:3000"

    # Sandbox: welcome credit for new users, rail simulation, demo scenarios, data reset.
    sandbox_mode: bool = True
    welcome_credit_minor: int = 50_000

    payee_hash_salt: str = "dev-payee-salt"

    # This platform's identity on the inter-bank network.
    platform_bank_code: str = "990"
    platform_bank_name: str = "Scan-to-Confirm"

    # The inter-bank payment switch (a sandbox network in development).
    switch_url: str = "http://localhost:8100"
    switch_api_key: str = "dev-switch-api-key"
    switch_webhook_secret: str = "dev-switch-webhook-secret"


@lru_cache
def get_settings() -> Settings:
    return Settings()
