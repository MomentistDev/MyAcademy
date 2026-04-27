import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "../../contracts/rbac";
import { getSupabaseAdminClient } from "./supabase-admin";

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

export interface AuthContext {
  userId: string;
  role: AppRole;
  organizationId?: string;
}

function getHeader(headers: RequestLike["headers"], key: string): string | undefined {
  const raw = headers[key] ?? headers[key.toLowerCase()];
  if (!raw) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

function getBearerToken(headers: RequestLike["headers"]): string | undefined {
  const raw = headers.authorization ?? headers.Authorization;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("Bearer ")) return undefined;
  return v.slice("Bearer ".length).trim();
}

function devHeadersEnabled(): boolean {
  return process.env.ALLOW_AUTH_DEV_HEADERS === "true" || process.env.ALLOW_AUTH_DEV_HEADERS === "1";
}

/**
 * Resolves the Supabase user id from Authorization: Bearer <access_token>.
 * Optional dev override: set ALLOW_AUTH_DEV_HEADERS=1 and send x-user-id (no JWT).
 */
export async function resolveAuthUserId(req: RequestLike, supabase: SupabaseClient): Promise<string> {
  const token = getBearerToken(req.headers);
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new Error("Unauthorized: invalid or expired session.");
    }
    return data.user.id;
  }

  if (devHeadersEnabled()) {
    const userId = getHeader(req.headers, "x-user-id");
    if (userId) return userId;
  }

  throw new Error("Unauthorized: missing bearer token.");
}

const MEMBERSHIP_ROLES: readonly AppRole[] = ["org_admin", "trainer", "learner"];

function isMembershipRole(role: string): role is AppRole {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(role);
}

/**
 * Validates the JWT (or x-user-id in explicit dev mode) and loads the caller's role
 * for the target organization from public.memberships (source of truth).
 */
export async function resolveAuthContext(req: RequestLike, organizationId: string): Promise<AuthContext> {
  const supabase = getSupabaseAdminClient();

  const userId = await resolveAuthUserId(req, supabase);

  const { data: row, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Auth lookup failed: ${error.message}`);
  }

  if (!row) {
    throw new Error("Forbidden: not a member of this organization.");
  }

  const role = row.role as string;
  if (!isMembershipRole(role)) {
    throw new Error("Forbidden: unsupported membership role.");
  }

  return { userId, role, organizationId };
}

export interface MembershipSummary {
  id: string;
  organization_id: string;
  role: string;
  organizations: { slug: string; name: string } | null;
}

export async function listMembershipsForUser(req: RequestLike): Promise<MembershipSummary[]> {
  const supabase = getSupabaseAdminClient();
  const userId = await resolveAuthUserId(req, supabase);

  const { data, error } = await supabase
    .from("memberships")
    .select("id, organization_id, role, organizations ( slug, name )")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load memberships: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    organization_id: string;
    role: string;
    organizations: { slug: string; name: string } | { slug: string; name: string }[] | null;
  }>;

  return rows.map((row) => {
    const org = row.organizations;
    const organizations =
      org == null ? null : Array.isArray(org) ? (org[0] ?? null) : org;
    return {
      id: row.id,
      organization_id: row.organization_id,
      role: row.role,
      organizations,
    };
  });
}
