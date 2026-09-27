"""Reports on disk (evals/reports/<release>.json) and the fingerprints that tie a result to what produced it."""

import hashlib
import json
from pathlib import Path

from app.agent import releases
from app.agent.releases import Release
from app.agent.schemas import AGENT_ACTION, CATALOG_READING, INTENT

APP = Path(__file__).resolve().parents[1]
EVALS_DIR = APP.parent / "evals"
DATASETS = EVALS_DIR / "datasets"
REPORTS = EVALS_DIR / "reports"

# The code that shapes each suite's result besides the model: a change here makes results out of date too.
SOURCES = {
    "intent_fidelity": [APP / "services" / "intent.py", APP / "services" / "mandates.py"],
    "catalog_reading": [APP / "agent" / "tools.py"],
    "shopping_tasks": [
        APP / "agent" / "runtime.py",
        APP / "agent" / "tools.py",
        APP / "agent" / "injection.py",
        APP / "services" / "gate.py",
    ],
    "gate_properties": [APP / "services" / "gate.py", APP / "services" / "merchants.py", APP.parent / "tests" / "test_gate_properties.py"],
}

SUITES = ("intent_fidelity", "catalog_reading", "shopping_tasks", "gate_properties")
# The model tasks each suite exercises, and the output schemas they're held to.
SUITE_TASKS = {
    "intent_fidelity": (("intent.compile",), (INTENT,)),
    "catalog_reading": (("catalog.read_image",), (CATALOG_READING,)),
    "shopping_tasks": (("agent.step", "catalog.read_image"), (AGENT_ACTION, CATALOG_READING)),
}
DATASET_FILE = {"intent_fidelity": "intent.json", "catalog_reading": "catalog.json", "shopping_tasks": "shopping.json"}


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def source_digest(path: Path) -> str:
    """Read as text, so Windows (CRLF) and Linux (LF) checkouts give the same fingerprint."""
    return hashlib.sha256(path.read_text(encoding="utf-8").encode()).hexdigest()


def load_dataset(suite: str) -> dict:
    return json.loads((DATASETS / DATASET_FILE[suite]).read_text(encoding="utf-8"))


def applies(suite: str, release: Release) -> bool:
    """Photo catalogs need a vision model; a text-only variant is measured on the other suites."""
    return suite != "catalog_reading" or release.reads_images


def fingerprint(suite: str, release: Release) -> str:
    """
    What a suite's result depends on: each task's prompt text, model route and settings, the output
    schemas, the test set, and the code around the model (rules, grounding, the agent loop). For the
    gate: its source and its tests.
    """
    sources = [source_digest(p) for p in SOURCES[suite]]
    if suite == "gate_properties":
        return digest({"suite": suite, "sources": sources})
    tasks, schemas = SUITE_TASKS[suite]
    parts = {
        task: {
            "version": release.prompts.get(task),
            "prompt": digest(releases.prompt(task, release.prompts[task])) if release.prompts.get(task) else None,
            "models": release.route(task),
            "params": release.params.get(task, {}),
        }
        for task in tasks
    }
    return digest(
        {
            "suite": suite,
            "tasks": parts,
            "schemas": [digest(s) for s in schemas],
            "dataset": digest(load_dataset(suite)),
            "sources": sources,
        }
    )


def path_for(release_id: str) -> Path:
    return REPORTS / f"{release_id.replace('/', '_')}.json"


def load(release_id: str) -> dict | None:
    p = path_for(release_id)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def load_all() -> dict[str, dict]:
    if not REPORTS.exists():
        return {}
    return {r["release"]: r for r in (json.loads(p.read_text(encoding="utf-8")) for p in sorted(REPORTS.glob("*.json")))}


def save_suite(release: Release, suite_result: dict) -> Path:
    REPORTS.mkdir(parents=True, exist_ok=True)
    report = load(release.id) or {"release": release.id, "model": release.model, "suites": {}}
    report["model"] = release.model
    report["suites"][suite_result["suite"]] = suite_result
    report["suites"] = dict(sorted(report["suites"].items()))
    p = path_for(release.id)
    p.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return p


def find_reusable(suite: str, fp: str) -> dict | None:
    """A result measured on the real model with exactly this fingerprint, from any release."""
    for report in load_all().values():
        result = report["suites"].get(suite)
        if (
            result
            and result["fingerprint"] == fp
            and result["provider"] == "groq"
            and not result.get("reusedFrom")
            and not result.get("partial")
        ):
            return {**result, "reusedFrom": report["release"]}
    return None
