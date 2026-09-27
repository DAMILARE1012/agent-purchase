import type { EvidenceItem } from "@/types/api";

/** The evidence bundle. Each row has an anchor the copilot's citations link to. */
export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  return (
    <dl className="flex flex-col divide-y divide-line">
      {items.map((item) => (
        <div key={item.id} id={`evidence-${item.id}`} className="grid scroll-mt-24 gap-1 py-2.5 target:bg-crypto-bg sm:grid-cols-[180px_1fr]">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="text-sm">
            {item.value}
            <span className="ml-2 font-mono text-[11px] text-muted">{item.id}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
