/**
 * Payment gateway abstraction — [CHIP Collect](https://www.chip-in.asia/collect) integration
 * uses `createChipCollectBillingGateway` in the API (see `src/server/lib/chip-billing-gateway.ts`).
 */

/** Aligns with `public.plan_tier` in Postgres (`free`, `growth`, `enterprise`). */
export type BillingPlanTier = "free" | "growth" | "enterprise";

export interface OrganizationBillingSnapshot {
  organizationId: string;
  planTier: BillingPlanTier;
  /** Provider-specific customer id, when known */
  externalCustomerId: string | null;
  subscriptionStatus: "none" | "active" | "past_due" | "canceled" | "trialing" | "unknown";
}

export interface PaymentGatewayPort {
  readonly providerId: string;
  getOrganizationBilling(organizationId: string): Promise<OrganizationBillingSnapshot>;
}

/** Placeholder until a real gateway is configured. */
export function createUnconfiguredBillingGateway(): PaymentGatewayPort {
  return {
    providerId: "none",
    async getOrganizationBilling(organizationId: string) {
      return {
        organizationId,
        planTier: "free",
        externalCustomerId: null,
        subscriptionStatus: "none",
      };
    },
  };
}
