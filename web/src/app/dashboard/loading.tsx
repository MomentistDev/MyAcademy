export default function DashboardLoading() {
  return (
    <div
      className="mx-auto flex min-h-[40vh] max-w-3xl flex-col justify-center gap-4 px-6 py-16"
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard"
    >
      <div className="h-8 w-48 animate-pulse rounded-md bg-zinc-200" aria-hidden />
      <div className="h-4 w-full max-w-md animate-pulse rounded bg-zinc-100" aria-hidden />
      <div className="h-4 w-56 animate-pulse rounded bg-zinc-100" aria-hidden />
      <p className="text-sm text-zinc-500">Loading dashboard…</p>
    </div>
  );
}
