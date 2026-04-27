import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900">Page not found</h1>
      <p className="mt-3 text-sm text-zinc-600">That URL does not exist or has moved.</p>
      <nav className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm font-medium">
        <Link href="/" className="text-zinc-900 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-900">
          Home
        </Link>
        <Link
          href="/dashboard"
          className="text-zinc-900 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-900"
        >
          Dashboard
        </Link>
        <Link
          href="/login"
          className="text-zinc-900 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-900"
        >
          Sign in
        </Link>
      </nav>
    </div>
  );
}
