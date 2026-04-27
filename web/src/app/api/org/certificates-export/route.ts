import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(organizationId)) {
    return NextResponse.json({ error: "Invalid organizationId." }, { status: 400 });
  }

  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";
  const upstream = await fetch(
    `${apiUrl}/api/org/certificates/export.csv?${new URLSearchParams({ organizationId }).toString()}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    },
  );

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json({ error: text || upstream.statusText }, { status: upstream.status });
  }

  const csv = await upstream.text();
  const headers = new Headers();
  headers.set("Content-Type", "text/csv; charset=utf-8");
  headers.set("Content-Disposition", 'attachment; filename="certificates.csv"');
  return new NextResponse(csv, { status: 200, headers });
}
