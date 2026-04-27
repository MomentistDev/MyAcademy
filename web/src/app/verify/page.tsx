import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verify credential",
};

type Search = { credentialCode?: string; organizationSlug?: string };

type VerifyResult =
  | { found: false }
  | { found: true; valid: false; reason: "revoked" | "expired" }
  | {
      found: true;
      valid: true;
      title: string;
      organizationName: string;
      organizationSlug: string;
      issuedAt: string;
      expiresAt: string | null;
    };

type PageProps = {
  searchParams: Promise<Search>;
};

export default async function VerifyCredentialPage({ searchParams }: PageProps) {
  const q = await searchParams;
  const credentialCode = q.credentialCode?.trim() ?? "";
  const organizationSlug = q.organizationSlug?.trim() ?? "";

  let result: VerifyResult | null = null;
  let fetchError: string | null = null;

  if (credentialCode.length >= 6) {
    const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";
    const params = new URLSearchParams({ credentialCode });
    if (organizationSlug.length > 0) params.set("organizationSlug", organizationSlug);
    try {
      const res = await fetch(`${apiUrl}/api/public/certificates/verify?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        fetchError = `Verification service returned HTTP ${res.status}.`;
      } else {
        result = (await res.json()) as VerifyResult;
      }
    } catch {
      fetchError = "Could not reach the verification service. Is the API running?";
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">MyAcademy</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Verify a credential</h1>
        <p className="text-sm text-zinc-600">
          Enter the credential code from a certificate PDF or email. Optionally restrict to an organization{" "}
          <strong>slug</strong> (e.g. the short identifier shown to your team).
        </p>
      </header>

      <form method="get" className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <label className="block text-sm text-zinc-700">
          Credential code
          <input
            name="credentialCode"
            defaultValue={credentialCode}
            required
            minLength={6}
            maxLength={80}
            pattern="[A-Za-z0-9\-]+"
            placeholder="MYA-ABCDEF012345"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          Organization slug <span className="font-normal text-zinc-500">(optional)</span>
          <input
            name="organizationSlug"
            defaultValue={organizationSlug}
            maxLength={120}
            placeholder="acme"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Verify
        </button>
      </form>

      {fetchError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{fetchError}</p>
      ) : null}

      {result ? (
        <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-800">
          {!result.found ? (
            <p className="font-medium text-zinc-900">No credential matched that code (and slug, if provided).</p>
          ) : !result.valid ? (
            <div className="space-y-1">
              <p className="font-medium text-zinc-900">Credential found but not valid.</p>
              <p className="text-zinc-600">
                {result.reason === "revoked"
                  ? "It has been revoked by the issuing organization."
                  : "It has passed its expiry date."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-semibold text-emerald-800">Valid credential</p>
              <p>
                <span className="text-zinc-500">Title:</span> {result.title}
              </p>
              <p>
                <span className="text-zinc-500">Organization:</span> {result.organizationName}{" "}
                <span className="text-xs text-zinc-500">({result.organizationSlug})</span>
              </p>
              <p>
                <span className="text-zinc-500">Issued:</span> {new Date(result.issuedAt).toLocaleString()}
              </p>
              {result.expiresAt ? (
                <p>
                  <span className="text-zinc-500">Expires:</span> {new Date(result.expiresAt).toLocaleString()}
                </p>
              ) : (
                <p className="text-zinc-500">No expiry date on file.</p>
              )}
            </div>
          )}
        </section>
      ) : null}

      <p className="text-center text-sm">
        <Link href="/" className="font-medium text-zinc-900 underline">
          Home
        </Link>
        {" · "}
        <Link href="/login" className="font-medium text-zinc-900 underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
