from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # The platform calls the sandbox registry and label endpoints with this key.
    marketplace_api_key: str = "dev-marketplace-api-key"
    # Seller signing keys are derived from this secret, so they survive restarts
    # without a database. Sandbox only: real sellers hold their own keys.
    marketplace_key_seed: str = "dev-marketplace-key-seed"
    # Public base URL, for catalog image links the agent follows.
    marketplace_public_url: str = "http://localhost:8200"
    cart_ttl_minutes: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
