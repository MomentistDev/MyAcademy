"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    const supabase = createClient();
    if (mode === "register") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      setLoading(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setSuccess("Account created. You can sign in now.");
      setMode("signin");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
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
    <div className="min-h-screen bg-[#e7f8c9] px-4 py-10 text-zinc-900 sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border-[10px] border-[#1f3d2f] bg-white shadow-2xl lg:grid-cols-[1.1fr_1fr]">
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#d7f0ad] via-[#bde28f] to-[#90cb63] p-8 lg:block">
          <div className="absolute -left-12 -top-14 h-44 w-44 rounded-full bg-white/25 blur-2xl" />
          <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-emerald-900/20 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between rounded-3xl border border-white/35 bg-white/15 p-6 backdrop-blur-sm">
            <p className="text-sm font-semibold tracking-wide text-emerald-950/80">MYACADEMY</p>
            <div className="space-y-3">
              <p className="text-4xl leading-none">👨‍💻</p>
              <h2 className="text-3xl font-semibold leading-tight text-emerald-950">
                Build your
                <br />
                learning workspace
              </h2>
              <p className="max-w-sm text-sm text-emerald-900/80">
                Manage onboarding, courses, and progress in one operating system for your team.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-900/80">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-700" />
              Secure login with Supabase Auth
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-10">
          <div className="mx-auto max-w-sm">
            <p className="text-xs font-semibold tracking-wide text-zinc-500">Welcome back</p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Use your MyAcademy email and password. Social sign-in is intentionally disabled.
            </p>

            <div className="mt-6 grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`rounded-lg px-3 py-2 font-medium transition ${
                  mode === "signin" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`rounded-lg px-3 py-2 font-medium transition ${
                  mode === "register" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"
                }`}
              >
                Register
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {success}
                </p>
              ) : null}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-900">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="you@example.com"
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
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full justify-center rounded-lg bg-[#7bc043] px-3 py-2.5 text-sm font-semibold text-zinc-950 shadow-sm hover:bg-[#6ab036] disabled:opacity-60"
              >
                {loading ? (mode === "signin" ? "Signing in..." : "Creating account...") : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-zinc-600">
              <Link href="/" className="font-medium text-zinc-900 hover:underline">
                Back to home
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
