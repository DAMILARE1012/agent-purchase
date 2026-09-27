import { Card } from "@/components/ui";
import type { CopilotSummary } from "@/types/api";

/** The dispute copilot's read-only summary (§11.5). Every sentence links to its evidence. */
export function CopilotPanel({ copilot }: { copilot: CopilotSummary }) {
  return (
    <Card className="flex flex-col gap-4 border-ai">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">AI case summary</h2>
        <span className="font-mono text-[11px] text-muted">{copilot.model}</span>
      </div>
      <p className="text-sm text-ai">Check the cited evidence before acting. The summary can&apos;t change anything.</p>

      {copilot.sentences.length === 0 ? (
        <p className="text-sm text-muted">No summary: none of the draft&apos;s citations could be verified.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {copilot.sentences.map((s, i) => (
            <li key={i} className="text-[15px]">
              {s.text}{" "}
              {s.cites.map((c) => (
                <a
                  key={c}
                  href={`#evidence-${c}`}
                  className="ml-1 inline-block rounded border border-line-strong px-1 font-mono text-[11px] text-crypto hover:bg-crypto-bg"
                >
                  {c}
                </a>
              ))}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <p className="text-sm font-semibold">Suggested outcome</p>
        <p className="text-sm text-ink-2">{copilot.suggestedOutcome}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Draft message to the user</p>
        <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-ink-2">{copilot.draftReply}</blockquote>
      </div>
    </Card>
  );
}
