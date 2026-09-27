from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Participants call the switch with this key.
    switch_api_key: str = "dev-switch-api-key"
    # The switch signs webhooks to participants with this secret (HMAC-SHA256).
    switch_webhook_secret: str = "dev-switch-webhook-secret"

    # The one real participant in the sandbox: the Scan-to-Confirm platform.
    platform_bank_code: str = "990"
    platform_bank_name: str = "Scan-to-Confirm"
    platform_events_url: str = "http://localhost:8000/v1/network"

    # Sandbox timing for delayed outcomes.
    pending_seconds: int = 30
    reversal_seconds: int = 60

    database_path: str = "/data/switch.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
