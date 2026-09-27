import type { ReactNode } from "react";
import { Badge, Card, Icon, PageHeader } from "@/components/ui";

interface PlannedPageProps {
  title: string;
  description: string;
  milestone: string;
  /** What the finished page will show (from system_design.md §6). */
  planned: string[];
  /** A live read from the (mock) API, proving the page's data is wired. */
  preview?: ReactNode;
}

/** Placeholder for a page whose design lands in a later milestone. */
export function PlannedPage({ title, description, milestone, planned, preview }: PlannedPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} actions={<Badge tone="ai">Built in {milestone}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">What this page will show</h2>
          <ul className="flex flex-col gap-2">
            {planned.map((p) => (
              <li key={p} className="flex items-start gap-2 text-ink-2">
                <Icon name="check" className="mt-0.5 size-4 text-muted" /> {p}
              </li>
            ))}
          </ul>
        </Card>
        {preview && (
          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">Data available now</h2>
            <div className="flex flex-col gap-2 text-sm">{preview}</div>
          </Card>
        )}
      </div>
    </div>
  );
}

/** One "label: value" row for a preview card. */
export function PreviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
}
