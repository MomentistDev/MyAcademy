import type { Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  normalizeChipWebhookPublicKeyPem,
  verifyChipCollectWebhookSignature,
} from "../lib/chip-collect";

export type RequestWithRawBody = Request & { rawBody?: Buffer };

export function getRequestRawBody(req: Request): Buffer | undefined {
  const b = (req as RequestWithRawBody).rawBody;
  return Buffer.isBuffer(b) ? b : undefined;
}

const REF_PREFIX = "myacademy:";

function deriveOrganizationIdFromReference(reference: string | undefined): string | null {
  if (!reference?.startsWith(REF_PREFIX)) return null;
  const rest = reference.slice(REF_PREFIX.length);
  const parts = rest.split(":");
  const orgId = parts[0];
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) return null;
  return orgId;
}

/**
 * CHIP Collect webhook / success-callback handler. Verifies `X-Signature` when
 * `CHIP_COLLECT_WEBHOOK_PUBLIC_KEY` is set (unless `CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY=true`).
 */
export async function handleChipCollectWebhook(req: Request, res: Response, supabase: SupabaseClient): Promise<void> {
  const rawBody = getRequestRawBody(req);
  if (!rawBody) {
    res.status(400).type("text/plain").send("Missing raw request body (JSON parser must capture buffer).");
    return;
  }

  const skipVerify =
    process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY === "true" ||
    process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY === "1";

  if (!skipVerify) {
    const pemRaw = process.env.CHIP_COLLECT_WEBHOOK_PUBLIC_KEY;
    if (!pemRaw?.trim()) {
      res.status(503).json({ error: "CHIP_COLLECT_WEBHOOK_PUBLIC_KEY is not configured." });
      return;
    }
    const pem = normalizeChipWebhookPublicKeyPem(pemRaw);
    const sigHeader = req.headers["x-signature"] ?? req.headers["X-Signature"];
    const sigStr = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!verifyChipCollectWebhookSignature({ rawBody, signatureHeader: sigStr, publicKeyPem: pem })) {
      res.status(401).type("text/plain").send("Invalid X-Signature.");
      return;
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    res.status(400).type("text/plain").send("Body is not valid JSON.");
    return;
  }

  const eventType = typeof payload.event_type === "string" ? payload.event_type : undefined;
  const reference = typeof payload.reference === "string" ? payload.reference : undefined;
  const organizationId = deriveOrganizationIdFromReference(reference);
  const dedupeKey = createHash("sha256").update(rawBody).digest("hex");

  const { data: eventRow, error: eventInsertError } = await supabase
    .from("billing_webhook_events")
    .insert({
      organization_id: organizationId,
      provider: "chip_collect",
      dedupe_key: dedupeKey,
      event_type: eventType ?? null,
      reference: reference ?? null,
      payload_json: payload,
      status: "received",
    })
    .select("id")
    .single();

  if (eventInsertError) {
    // Unique violation means duplicate delivery; treat as success for idempotency.
    if (eventInsertError.code === "23505") {
      console.info("[chip webhook] duplicate delivery ignored", { eventType: eventType ?? null, reference: reference ?? null });
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    console.error("[chip webhook] event insert failed:", eventInsertError.message);
    res.status(500).json({ error: "Could not persist webhook event." });
    return;
  }
  console.info("[chip webhook] received", { eventType: eventType ?? null, reference: reference ?? null });

  if (eventType === "purchase.paid" && reference?.startsWith(REF_PREFIX)) {
    const rest = reference.slice(REF_PREFIX.length);
    const parts = rest.split(":");
    if (parts.length >= 2) {
      const orgId = parts[0];
      const plan = parts[1];
      if (/^[0-9a-f-]{36}$/i.test(orgId) && (plan === "growth" || plan === "enterprise")) {
        const { error } = await supabase.from("organizations").update({ plan_tier: plan }).eq("id", orgId);
        if (error) {
          await supabase
            .from("billing_webhook_events")
            .update({
              status: "failed",
              error_message: error.message,
            })
            .eq("id", eventRow.id as string);
          console.error("[chip webhook] plan update failed:", error.message);
        } else {
          await supabase
            .from("billing_webhook_events")
            .update({
              status: "processed",
              processed_at: new Date().toISOString(),
              error_message: null,
            })
            .eq("id", eventRow.id as string);
          console.info("[chip webhook] plan updated", { orgId, plan, reference });
        }
      }
    }
  } else {
    await supabase
      .from("billing_webhook_events")
      .update({
        status: "ignored",
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventRow.id as string);
  }

  res.status(200).json({ ok: true });
}
