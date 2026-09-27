"""
python -m app.evals run --release shopper-2026.09.6 [--model openai/gpt-oss-120b] [--suites intent_fidelity,shopping_tasks] [--force]
python -m app.evals gate [--baseline <release>] [--candidate <release> ...]
python -m app.evals snapshot-catalog
"""

import argparse
import json
import sys
import time

from app.agent import releases
from app.db import SessionLocal
from app.evals import gate, report, suites
from app.formatting import now
from app.llm import providers


def log(line: str) -> None:
    print(line, flush=True)


def run(args) -> int:
    base = releases.get(args.release)
    release = releases.variant(base, args.model) if args.model else base
    provider = providers.provider_name()
    if provider != "groq" and not args.allow_sandbox:
        log(
            "The model provider is the scripted sandbox, whose answers don't depend on prompts or models. Set GROQ_API_KEY "
            "(or pass --allow-sandbox to test the pipeline; the release gate won't accept those results)."
        )
        return 2
    with SessionLocal() as db:
        suites.ensure_eval_user(db)
        releases.sync(db, extra=(release,) if release.status == "variant" else ())

    chosen = args.suites.split(",") if args.suites else list(report.SUITES)
    for suite in chosen:
        if not report.applies(suite, release):
            log(f"{suite}: not applicable ({release.model} can't read images)")
            continue
        fp = report.fingerprint(suite, release)
        if not args.force and provider == "groq" and not args.limit and (reused := report.find_reusable(suite, fp)):
            if reused["reusedFrom"] == release.id:
                log(f"{suite}: already measured with this fingerprint (use --force to measure again)")
            else:
                report.save_suite(release, reused)
                log(f"{suite}: same fingerprint as {reused['reusedFrom']}'s results; reused them")
            continue
        log(f"{suite}: running on {release.id} ({release.model}, {provider})")
        started = time.monotonic()
        cases, metrics = suites.RUNNERS[suite](release, log, args.limit)
        result = {
            "suite": suite,
            "fingerprint": fp,
            "provider": provider,
            "model": release.model,
            "cases": len(cases),
            "metrics": metrics,
            "caseResults": cases,
            "runAt": now().isoformat().replace("+00:00", "Z"),
            "wallMs": int((time.monotonic() - started) * 1000),
            "tokens": sum(c.get("tokens", 0) for c in cases),
            "costMicroUsd": sum(c.get("costMicroUsd", 0) for c in cases),
            "reusedFrom": None,
            "partial": bool(args.limit),
        }
        path = report.save_suite(release, result)
        for m in metrics:
            log(f"    {'PASS' if m['pass'] else 'FAIL'}  {m['name']}: {m['value']}{m['unit'] if m['unit'] == '%' else ' ' + m['unit']}")
        log(f"  saved {path.name} ({result['tokens']:,} tokens, {result['wallMs'] / 60000:.1f} min)")
    return 0


def run_gate(args) -> int:
    baseline = args.baseline or releases.live().id
    candidates = args.candidate or [r.id for r in releases.candidates()]
    if not candidates:
        log("No candidate releases.")
        return 0
    failed = False
    for cand in candidates:
        v = gate.verdict(baseline, cand)
        log(f"{cand} vs {baseline}: {'PASSES' if v['pass'] else 'BLOCKED'}")
        for reason in v["reasons"]:
            log(f"  - {reason}")
        failed |= not v["pass"]
    return 1 if failed else 0


def snapshot(_args) -> int:
    data = suites.snapshot_catalog()
    path = report.DATASETS / report.DATASET_FILE["catalog_reading"]
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Saved {len(data['images'])} catalog images to {path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.evals")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("run", help="Run the evaluation suites on a release")
    p.add_argument("--release", default=None, help="Release ID (default: the live release)")
    p.add_argument("--model", default=None, help="Evaluate the release on this model alone (model comparison)")
    p.add_argument("--suites", default=None, help=f"Comma-separated, from: {', '.join(report.SUITES)}")
    p.add_argument("--limit", type=int, default=None, help="Only the first N cases (a partial run the gate won't reuse)")
    p.add_argument("--force", action="store_true", help="Run even if a result with the same fingerprint exists")
    p.add_argument("--allow-sandbox", action="store_true")
    g = sub.add_parser("gate", help="The release gate: exit 1 if a candidate is worse than the baseline")
    g.add_argument("--baseline", default=None)
    g.add_argument("--candidate", action="append")
    sub.add_parser("snapshot-catalog", help="Refresh the catalog-reading test set from the marketplace")
    args = parser.parse_args()
    if args.command == "run":
        args.release = args.release or releases.live().id
        return run(args)
    return {"gate": run_gate, "snapshot-catalog": snapshot}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
