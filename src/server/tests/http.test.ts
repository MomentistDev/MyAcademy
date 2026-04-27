import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { Server } from "node:http";
import { app } from "../app";

describe("Express HTTP (no external services required)", () => {
  let server: Server;
  let baseUrl: string;

  before(
    () =>
      new Promise<void>((resolve, reject) => {
        server = app.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (!addr || typeof addr === "string") {
            reject(new Error("Could not bind ephemeral port"));
            return;
          }
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
        server.on("error", reject);
      }),
  );

  after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  test("GET /api/public/certificates/verify without query returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/public/certificates/verify`);
    assert.equal(res.status, 400);
  });

  test("GET /api/public/certificates/verify with code returns 200 JSON", async () => {
    const qs = new URLSearchParams({ credentialCode: "MYA-ABCDEF012345" }).toString();
    const res = await fetch(`${baseUrl}/api/public/certificates/verify?${qs}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { found?: boolean };
    assert.equal(typeof body.found, "boolean");
  });

  test("GET /health returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok?: boolean; service?: string };
    assert.equal(body.ok, true);
    assert.equal(body.service, "myacademy-api");
  });

  test("GET /api/me/memberships without Authorization returns 401 (or 500 if Supabase env missing)", async () => {
    const res = await fetch(`${baseUrl}/api/me/memberships`);
    assert.ok(
      res.status === 401 || res.status === 500,
      `expected 401 Unauthorized or 500 misconfig, got ${res.status}`,
    );
  });

  test("GET /api/me/notifications without query returns 400 (validation)", async () => {
    const res = await fetch(`${baseUrl}/api/me/notifications`, {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.equal(res.status, 400);
  });

  test("GET /api/me/certificates/pdf without query returns 400 (validation)", async () => {
    const res = await fetch(`${baseUrl}/api/me/certificates/pdf`, {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.equal(res.status, 400);
  });

  test("GET /api/onboarding/progress/document-reviews/count without query returns 400 (validation)", async () => {
    const res = await fetch(`${baseUrl}/api/onboarding/progress/document-reviews/count`, {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.equal(res.status, 400);
  });

  test("GET /api/onboarding/progress/document-reviews/count with org returns 401 or 500 (auth / Supabase)", async () => {
    const qs = new URLSearchParams({
      organizationId: "00000000-0000-4000-8000-000000000001",
    }).toString();
    const res = await fetch(`${baseUrl}/api/onboarding/progress/document-reviews/count?${qs}`, {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.ok(res.status === 401 || res.status === 500, `expected 401 or 500, got ${res.status}`);
  });

  test("GET /api/me/certificates/pdf with valid query shape returns 401 or 500 (auth / Supabase)", async () => {
    const qs = new URLSearchParams({
      organizationId: "00000000-0000-4000-8000-000000000001",
      membershipId: "00000000-0000-4000-8000-000000000002",
      credentialCode: "MYA-ABCDEF012345",
    }).toString();
    const res = await fetch(`${baseUrl}/api/me/certificates/pdf?${qs}`, {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.ok(res.status === 401 || res.status === 500, `expected 401 or 500, got ${res.status}`);
  });

  test("POST /api/onboarding/progress/complete with empty body returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/onboarding/progress/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
      body: "{}",
    });
    assert.equal(res.status, 400);
  });

  test("GET /api/org/audit-logs without Authorization returns 401 or 500", async () => {
    const res = await fetch(
      `${baseUrl}/api/org/audit-logs?organizationId=00000000-0000-4000-8000-000000000001`,
    );
    assert.ok(res.status === 401 || res.status === 500, `expected 401 or 500, got ${res.status}`);
  });

  test("POST /api/me/notifications/read-all without Authorization returns 401 or 500", async () => {
    const res = await fetch(`${baseUrl}/api/me/notifications/read-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "00000000-0000-4000-8000-000000000001" }),
    });
    assert.ok(
      res.status === 401 || res.status === 500,
      `expected 401 or 500, got ${res.status}`,
    );
  });

  test("POST /api/enrollments/assign-course with empty body returns 400 (validation)", async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/assign-course`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
      body: "{}",
    });
    assert.equal(res.status, 400);
  });

  test("POST /api/enrollments/assign-learning-path with empty body returns 400 (validation)", async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/assign-learning-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer x" },
      body: "{}",
    });
    assert.equal(res.status, 400);
  });

  test("POST /api/enrollments/assign-course with valid shape but invalid JWT returns 401 or 500", async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/assign-course`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer invalid" },
      body: JSON.stringify({
        organizationId: "00000000-0000-4000-8000-000000000001",
        membershipId: "00000000-0000-4000-8000-000000000002",
        courseId: "00000000-0000-4000-8000-000000000003",
      }),
    });
    assert.ok(
      res.status === 401 || res.status === 500,
      `expected 401 Unauthorized or 500 misconfig, got ${res.status}`,
    );
  });

  test("POST /api/billing/chip/webhook without public key returns 503", async () => {
    const prevKey = process.env.CHIP_COLLECT_WEBHOOK_PUBLIC_KEY;
    const prevSkip = process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY;
    delete process.env.CHIP_COLLECT_WEBHOOK_PUBLIC_KEY;
    delete process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY;
    try {
      const res = await fetch(`${baseUrl}/api/billing/chip/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "purchase.paid",
          reference: "myacademy:00000000-0000-4000-8000-000000000000:growth",
        }),
      });
      assert.equal(res.status, 503);
    } finally {
      if (prevKey === undefined) delete process.env.CHIP_COLLECT_WEBHOOK_PUBLIC_KEY;
      else process.env.CHIP_COLLECT_WEBHOOK_PUBLIC_KEY = prevKey;
      if (prevSkip === undefined) delete process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY;
      else process.env.CHIP_COLLECT_WEBHOOK_SKIP_SIGNATURE_VERIFY = prevSkip;
    }
  });
});
