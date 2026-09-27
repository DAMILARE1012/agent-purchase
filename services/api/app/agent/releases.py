"""
Agent releases: prompt versions, models and settings shipped together
(system_design.md §5, "Agent versions"). A change to any part is a new release.

The prompts are files in app/agent/prompts/<task>/<version>.md, reviewed like
code. Releases are defined here and mirrored into the agent_releases table at
startup, so every run and trace can point at the exact release it used.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import AgentRelease

PROMPTS_DIR = Path(__file__).parent / "prompts"


@dataclass(frozen=True)
class Release:
    id: str
    status: str  # live | candidate | retired
    model: str
    fallback_model: str
    prompts: dict[str, str]  # task -> version
    params: dict[str, dict]  # task -> model parameters
    changelog: str
    created_at: datetime

    def route(self, task: str) -> list[str]:
        """Models to try for a task, in order. gpt-oss is text-only, so image reading has no text fallback."""
        if task == "catalog.read_image":
            return [self.model]
        return [self.model] if self.fallback_model == self.model else [self.model, self.fallback_model]

    @property
    def reads_images(self) -> bool:
        return self.model in VISION_MODELS


VISION_MODELS = {"qwen/qwen3.8-27b"}

_PARAMS = {
    "agent.step": {"temperature": 0, "max_tokens": 400, "reasoning_format": "hidden"},
    "catalog.read_image": {"temperature": 0, "max_tokens": 900},
    "intent.compile": {"temperature": 0, "max_tokens": 700, "reasoning_format": "hidden"},
}

RELEASES: tuple[Release, ...] = (
    Release(
        id="shopper-2026.09.5",
        status="live",
        model="qwen/qwen3.8-27b",
        fallback_model="openai/gpt-oss-120b",
        prompts={"intent.compile": "v1", "agent.step": "v3", "catalog.read_image": "v1"},
        params=_PARAMS,
        changelog="intent.compile v1: Qwen drafts the mandate from the shopper's sentence, quoting the words behind every field; "
                  "ungrounded fields are dropped and the stricter of the model's and the rules' values wins. Agent unchanged from .3.",
        created_at=datetime(2026, 9, 27, 18, 30, tzinfo=UTC),
    ),
    Release(
        id="shopper-2026.09.6",
        status="candidate",
        model="qwen/qwen3.8-27b",
        fallback_model="openai/gpt-oss-120b",
        prompts={"intent.compile": "v1", "agent.step": "v4", "catalog.read_image": "v1"},
        params=_PARAMS,
        changelog="As .5, with agent.step v4 (stricter handling of seller claims).",
        created_at=datetime(2026, 9, 27, 18, 31, tzinfo=UTC),
    ),
    Release(
        id="shopper-2026.09.7",
        status="candidate",
        model="qwen/qwen3.8-27b",
        fallback_model="openai/gpt-oss-120b",
        prompts={"intent.compile": "v2", "agent.step": "v3", "catalog.read_image": "v1"},
        params=_PARAMS,
        changelog="intent.compile v2: fewer empty fields for shoppers; the model fills in a typical budget, a one-week deadline and the wider "
                  "seller rule when the shopper doesn't say. Agent unchanged from .5.",
        created_at=datetime(2026, 9, 28, 9, 0, tzinfo=UTC),
    ),
    Release(
        id="shopper-2026.09.3",
        status="retired",
        model="qwen/qwen3.8-27b",
        fallback_model="openai/gpt-oss-120b",
        prompts={"agent.step": "v3", "catalog.read_image": "v1"},
        params=_PARAMS,
        changelog="agent.step v3: carts with several lines (one seller, one delivery fee); prefer one seller for multi-item mandates. "
                  "Photo catalogs are found by their caption. First release run against qwen/qwen3.8-27b on Groq.",
        created_at=datetime(2026, 9, 27, 17, 30, tzinfo=UTC),
    ),
    Release(
        id="shopper-2026.09.4",
        status="retired",
        model="qwen/qwen3.8-27b",
        fallback_model="openai/gpt-oss-120b",
        prompts={"agent.step": "v4", "catalog.read_image": "v1"},
        params=_PARAMS,
        changelog="agent.step v4: v3 plus v2's stricter handling of seller claims (verified, official, compatible).",
        created_at=datetime(2026, 9, 27, 17, 31, tzinfo=UTC),
    ),
    Release(
        id="shopper-2026.09.1",
        status="retired",
        model="qwen/qwen3.8-27b",
        fallback_model="openai/gpt-oss-120b",
        prompts={"agent.step": "v1", "catalog.read_image": "v1"},
        params=_PARAMS,
        changelog="First release with the real agent loop: strict-JSON actions, photo catalog reading, seller content marked untrusted.",
        created_at=datetime(2026, 9, 27, 12, 0, tzinfo=UTC),
    ),
    Release(
        id="shopper-2026.09.2",
        status="retired",
        model="qwen/qwen3.8-27b",
        fallback_model="openai/gpt-oss-120b",
        prompts={"agent.step": "v2", "catalog.read_image": "v1"},
        params=_PARAMS,
        changelog="agent.step v2: treats seller claims about verification, official status or compatibility as untrusted, and checks the signed cart line by line before proposing.",
        created_at=datetime(2026, 9, 27, 13, 0, tzinfo=UTC),
    ),
)

BY_ID = {r.id: r for r in RELEASES}
VARIANT_SEP = "~"


def live() -> Release:
    return next(r for r in RELEASES if r.status == "live")


def candidates() -> list[Release]:
    return [r for r in RELEASES if r.status == "candidate"]


def variant(base: Release, model: str) -> Release:
    """
    The same release on another model, with no fallback: how model comparisons are
    evaluated ("Qwen vs backups"). Variants are only for evaluation; they never serve shoppers.
    """
    if model == base.model:
        return base
    return Release(id=f"{base.id}{VARIANT_SEP}{model.split('/')[-1]}", status="variant", model=model, fallback_model=model,
                   prompts=base.prompts, params=base.params, changelog=f"{base.id} evaluated on {model} alone.", created_at=base.created_at)


def get(release_id: str) -> Release:
    """A release by ID, including evaluation variants ("<release>~<model>")."""
    if release_id in BY_ID:
        return BY_ID[release_id]
    base_id, _, model_name = release_id.partition(VARIANT_SEP)
    base = BY_ID[base_id]
    model = next((m for m in KNOWN_MODELS if m.split("/")[-1] == model_name), None)
    if model is None:
        raise KeyError(release_id)
    return variant(base, model)


KNOWN_MODELS = ("qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b")


@lru_cache
def prompt(task: str, version: str) -> str:
    return (PROMPTS_DIR / task / f"{version}.md").read_text(encoding="utf-8")


def sync(db: Session, extra: tuple[Release, ...] = ()) -> None:
    """Mirrors the release definitions (and any evaluation variants in use) into the database."""
    for r in (*RELEASES, *extra):
        row = db.get(AgentRelease, r.id) or AgentRelease(id=r.id)
        row.status, row.model, row.fallback_model = r.status, r.model, r.fallback_model
        row.prompts, row.params, row.changelog, row.created_at = r.prompts, r.params, r.changelog, r.created_at
        db.add(row)
    db.commit()
