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
    welcome_credit_minor: int = 50_000_000  # ₦500,000 (kobo)

    payee_hash_salt: str = "dev-payee-salt"

    # This platform's identity on the inter-bank network.
    platform_bank_code: str = "990"
    platform_bank_name: str = "Scan-to-Confirm"

    # The inter-bank payment switch (a sandbox network in development).
    switch_url: str = "http://localhost:8100"
    switch_api_key: str = "dev-switch-api-key"
    switch_webhook_secret: str = "dev-switch-webhook-secret"

    # The sandbox marketplace: sellers register with the platform through its registry.
    marketplace_url: str = "http://localhost:8200"
    marketplace_api_key: str = "dev-marketplace-api-key"
    # Catalog image links use the public URL; the agent fetches them over the internal one.
    marketplace_public_url: str = "http://localhost:8200"

    # Redis: run queue, live run events, shared model rate limits, caches, circuit breakers.
    redis_url: str = "redis://localhost:6379"

    # ---- LLM gateway (system_design.md §5, M5) ----
    # "auto" uses Groq when GROQ_API_KEY is set, otherwise the scripted sandbox provider.
    llm_provider: str = "auto"
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    # Shared limits across every worker and user. Match them to your Groq account's limits.
    llm_requests_per_minute: int = 30
    llm_tokens_per_minute: int = 60_000
    # Share of the per-minute capacity only interactive runs (a shopper watching) may use.
    llm_interactive_reserve: float = 0.2
    llm_user_daily_tokens: int = 300_000
    llm_eval_daily_tokens: int = 120_000  # Under Groq's daily limit, so shoppers keep capacity
    llm_timeout_seconds: float = 30.0
    # USD per million tokens, "model=input/output;...". Check Groq's pricing page; these are placeholders.
    llm_prices: str = "qwen/qwen3.8-27b=0.30/0.60;openai/gpt-oss-120b=0.15/0.60;openai/gpt-oss-20b=0.075/0.30"

    # ---- Passkeys (WebAuthn) for signing mandates (M6) ----
    # The relying party is the web app's host; the browser enforces it.
    webauthn_rp_id: str = "localhost"
    webauthn_rp_name: str = "Mandate Gate"
    # Sandbox only: lets the scan-cli test client sign mandates with a labelled "test" signature,
    # because scripts can't use a fingerprint sensor. Browsers always need a passkey. Never enable in production.
    allow_test_signatures: bool = False

    # Email (approval codes). The sandbox sends to Mailpit; Gmail or a mail service in production (see .env.example).
    smtp_host: str = ""
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    smtp_ssl: bool = False
    mail_from: str = "Mandate Gate <no-reply@mandate-gate.local>"
    # Carts up to this amount may be approved with an email code; above it, only a passkey (kobo; ₦50,000).
    email_approval_max_minor: int = 5_000_000
    email_code_ttl_seconds: int = 300

    # ---- Agent runtime ----
    agent_max_steps: int = 12
    agent_max_tokens_per_run: int = 80_000
    agent_run_timeout_seconds: int = 300
    worker_concurrency: int = 8


@lru_cache
def get_settings() -> Settings:
    return Settings()
