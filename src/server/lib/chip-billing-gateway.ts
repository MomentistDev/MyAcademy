import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingPlanTier, OrganizationBillingSnapshot, PaymentGatewayPort } from "../../contracts/billing-port";

function asPlanTier(v: string | null | undefined): BillingPlanTier {
  if (v === "growth" || v === "enterprise") return v;
  return "free";
}

/**
 * Reads `organizations.plan_tier` (CHIP upgrades are applied via webhook).
 */
export function createChipCollectBillingGateway(supabase: SupabaseClient): PaymentGatewayPort {
  return {
    providerId: "chip_collect",
    async getOrganizationBilling(organizationId: string): Promise<OrganizationBillingSnapshot> {
      const { data, error } = await supabase
        .from("organizations")
        .select("plan_tier")
        .eq("id", organizationId)
        .maybeSingle();

      if (error || !data) {
        return {
          organizationId,
          planTier: "free",
          externalCustomerId: null,
          subscriptionStatus: "unknown",
        };
      }

      const planTier = asPlanTier(data.plan_tier as string | undefined);
      return {
        organizationId,
        planTier,
        externalCustomerId: null,
        subscriptionStatus: planTier === "free" ? "none" : "active",
      };
    },
  };
}
