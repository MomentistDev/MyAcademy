import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home",
};

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-10 bg-zinc-50 px-6 py-16">
      <div className="max-w-lg text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">MyAcademy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
          Corporate learning operating system
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-600">
          Next.js app with Supabase Auth. Run the Express API separately for onboarding and LMS workflows.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/login"
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          Dashboard
        </Link>
        <Link
          href="/verify"
          className="rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          Verify credential
        </Link>
      </div>
    </div>
  );
}
