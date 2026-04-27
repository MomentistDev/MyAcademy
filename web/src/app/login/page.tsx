"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    const nextRaw = new URL(window.location.href).searchParams.get("next");
    let dest = "/dashboard";
    if (nextRaw != null && nextRaw.startsWith("/dashboard") && !nextRaw.startsWith("//")) {
      try {
        const resolved = new URL(nextRaw, window.location.origin);
        if (resolved.origin === window.location.origin && resolved.pathname.startsWith("/dashboard")) {
          dest = `${resolved.pathname}${resolved.search}`;
        }
      } catch {
        /* keep default */
      }
    }
    router.push(dest);
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-zinc-900">
          Sign in to MyAcademy
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-600">
          Use a seeded account (for example learner@acme.test) or your Supabase users.
        </p>
      </div>
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <form className="space-y-6" onSubmit={handleSubmit}>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-900">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-900">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-8 text-center text-sm text-zinc-600">
          <Link href="/" className="font-medium text-zinc-900 hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
