import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREDENTIAL_RE = /^[A-Za-z0-9\-]{6,80}$/;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
  const membershipId = url.searchParams.get("membershipId")?.trim() ?? "";
  const credentialCode = url.searchParams.get("credentialCode")?.trim() ?? "";

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(membershipId) || !CREDENTIAL_RE.test(credentialCode)) {
    return NextResponse.json({ error: "Invalid or missing query parameters." }, { status: 400 });
  }

  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";
  const qs = new URLSearchParams({ organizationId, membershipId, credentialCode }).toString();
  const upstream = await fetch(`${apiUrl}/api/me/certificates/pdf?${qs}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as { error?: string };
    } catch {
      parsed = null;
    }
    const message =
      parsed && typeof parsed === "object" && parsed !== null && "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : text || upstream.statusText;
    return NextResponse.json({ error: message }, { status: upstream.status });
  }

  const buf = await upstream.arrayBuffer();
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/pdf");
  const cd = upstream.headers.get("Content-Disposition");
  if (cd) headers.set("Content-Disposition", cd);
  return new NextResponse(buf, { status: 200, headers });
}
