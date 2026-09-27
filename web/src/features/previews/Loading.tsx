export function Loading() {
  return (
    <div className="flex flex-col gap-2" aria-label="Loading" role="status">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-surface-2" />
      ))}
    </div>
  );
}
