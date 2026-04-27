export default function LoginLoading() {
  return (
    <div
      className="flex min-h-[50vh] flex-1 flex-col justify-center px-6 py-12 lg:px-8"
      role="status"
      aria-live="polite"
      aria-label="Loading sign in"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="mx-auto h-9 w-56 animate-pulse rounded-md bg-zinc-200" aria-hidden />
        <div className="mx-auto mt-4 h-4 w-full animate-pulse rounded bg-zinc-100" aria-hidden />
        <p className="mt-8 text-center text-sm text-zinc-500">Loading…</p>
      </div>
    </div>
  );
}
