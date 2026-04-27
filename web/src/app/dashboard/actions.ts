"use server";

import { apiPostJson, getApiSession } from "@/lib/api-server";
import { redirect } from "next/navigation";

function parseApiError(body: string, status: number): string {
  try {
    const j = JSON.parse(body) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* ignore */
  }
  return body || `HTTP ${status}`;
}

export async function startChipCheckoutAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const targetPlanRaw = String(formData.get("targetPlan") ?? "growth");
  const targetPlan = targetPlanRaw === "enterprise" ? "enterprise" : "growth";

  if (!organizationId) {
    redirect("/dashboard");
  }

  const session = await getApiSession();
  if (!session) {
    redirect("/login");
  }

  const res = await apiPostJson<{ purchaseId: string; checkoutUrl: string }>(
    session,
    "/api/org/billing/chip/checkout",
    {
      organizationId,
      targetPlan,
    },
  );

  if (!res.ok) {
    const error = parseApiError(res.body, res.status);
    const q = new URLSearchParams({ organizationId, error });
    redirect(`/dashboard?${q.toString()}`);
  }

  if (!res.data.checkoutUrl) {
    const q = new URLSearchParams({ organizationId, error: "Checkout URL not returned by backend." });
    redirect(`/dashboard?${q.toString()}`);
  }

  redirect(res.data.checkoutUrl);
}
