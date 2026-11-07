export default function AccountLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
      <div className="mb-6 h-10 w-48 rounded-xl bg-navy-light/50 animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-navy-border/60 bg-navy-card/40 p-4 space-y-3"
          >
            <div className="h-4 w-2/5 rounded-full bg-navy-light/60 animate-pulse" />
            <div className="h-3 w-4/5 rounded-full bg-navy-light/50 animate-pulse" />
            <div className="h-3 w-3/5 rounded-full bg-navy-light/40 animate-pulse" />
            <div className="mt-4 h-24 rounded-xl bg-navy-light/40 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
