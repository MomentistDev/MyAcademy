"use server";

import { apiPostJson, getApiSession } from "@/lib/api-server";
import { dashboardNotificationsErrorOnly, dashboardNotificationsPath } from "@/lib/dashboard-org-urls";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const notificationId = String(formData.get("notificationId") ?? "");

  if (!organizationId || !notificationId) {
    redirect(
      organizationId
        ? dashboardNotificationsPath(organizationId, "Missing fields.")
        : dashboardNotificationsErrorOnly("Missing fields."),
    );
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/me/notifications/read", {
    organizationId,
    notificationIds: [notificationId],
  });

  if (!res.ok) {
    let message = res.body;
    try {
      const j = JSON.parse(res.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep */
    }
    redirect(dashboardNotificationsPath(organizationId, message || `HTTP ${res.status}`));
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  redirect(dashboardNotificationsPath(organizationId));
}

export async function markAllNotificationsReadAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!organizationId) {
    redirect(dashboardNotificationsErrorOnly("Missing organization."));
  }

  const session = await getApiSession();
  if (!session) redirect("/login");

  const res = await apiPostJson(session, "/api/me/notifications/read-all", {
    organizationId,
  });

  if (!res.ok) {
    let message = res.body;
    try {
      const j = JSON.parse(res.body) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* keep */
    }
    redirect(dashboardNotificationsPath(organizationId, message || `HTTP ${res.status}`));
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  redirect(dashboardNotificationsPath(organizationId));
}
