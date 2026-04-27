import { createClient } from "@/lib/supabase/server";

export type ApiSession = {
  accessToken: string;
  apiUrl: string;
  userEmail: string | null;
};

export async function getApiSession(): Promise<ApiSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";
  return { accessToken: session.access_token, apiUrl, userEmail: user.email ?? session.user.email ?? null };
}

export async function apiGetJson<T>(session: ApiSession, path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  const res = await fetch(`${session.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }
  return { ok: true, data: (await res.json()) as T };
}

export async function apiPostJson<T>(
  session: ApiSession,
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  const res = await fetch(`${session.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: text };
  }
  if (!text) {
    return { ok: true, data: {} as T };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: true, data: {} as T };
  }
}
