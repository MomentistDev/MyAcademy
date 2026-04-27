import { createVerify } from "node:crypto";

const DEFAULT_GATEWAY_BASE = "https://gate.chip-in.asia/api/v1";

export function chipCollectIsConfigured(): boolean {
  return Boolean(getChipApiKey() && getChipBrandId());
}

function getChipApiKey(): string | undefined {
  const v = process.env.CHIP_COLLECT_API_KEY ?? process.env.CHIP_API_KEY;
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export function getChipBrandId(): string | undefined {
  const v = process.env.CHIP_COLLECT_BRAND_ID;
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export function getChipGatewayBaseUrl(): string {
  const raw = process.env.CHIP_COLLECT_GATEWAY_BASE_URL ?? DEFAULT_GATEWAY_BASE;
  return raw.replace(/\/+$/, "");
}

export interface ChipCreatePurchaseResult {
  id: string;
  checkoutUrl: string;
}

function parsePurchaseResponse(json: unknown): ChipCreatePurchaseResult {
  if (!json || typeof json !== "object") {
    throw new Error("CHIP purchase response was not a JSON object.");
  }
  const o = json as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const checkoutUrl = typeof o.checkout_url === "string" ? o.checkout_url : null;
  if (!id || !checkoutUrl) {
    throw new Error("CHIP purchase response missing id or checkout_url.");
  }
  return { id, checkoutUrl };
}

/**
 * Create a CHIP Collect purchase (redirect flow). See
 * https://docs.chip-in.asia/chip-collect/api-reference/purchases/create
 */
export async function chipCollectCreatePurchase(body: Record<string, unknown>): Promise<ChipCreatePurchaseResult> {
  const key = getChipApiKey();
  if (!key) {
    throw new Error("CHIP_COLLECT_API_KEY is not configured.");
  }
  const url = `${getChipGatewayBaseUrl()}/purchases/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`CHIP purchase create failed (${res.status}): ${text.slice(0, 800)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("CHIP purchase response was not valid JSON.");
  }
  return parsePurchaseResponse(parsed);
}

/**
 * Verify `X-Signature` (base64 RSA PKCS#1 v1.5 over SHA256 of the raw body).
 * https://docs.chip-in.asia/chip-collect/overview/authentication
 */
export function verifyChipCollectWebhookSignature(args: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  publicKeyPem: string;
}): boolean {
  const sigB64 = args.signatureHeader?.trim();
  if (!sigB64) return false;
  let signature: Buffer;
  try {
    signature = Buffer.from(sigB64, "base64");
  } catch {
    return false;
  }
  const verify = createVerify("RSA-SHA256");
  verify.update(args.rawBody);
  verify.end();
  return verify.verify(args.publicKeyPem, signature);
}

export function normalizeChipWebhookPublicKeyPem(raw: string): string {
  return raw.trim().replace(/\\n/g, "\n");
}
