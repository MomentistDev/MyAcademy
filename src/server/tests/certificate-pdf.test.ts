import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildCertificatePdfBuffer } from "../lib/certificate-pdf";

describe("buildCertificatePdfBuffer", () => {
  test("produces a PDF buffer with expected markers", async () => {
    const buf = await buildCertificatePdfBuffer({
      title: "Safety quiz",
      credentialCode: "MYA-ABCDEF012345",
      issuedAtIso: "2026-01-15T12:00:00.000Z",
      expiresAtIso: null,
      organizationName: "Acme Corp",
      recipientLine: "learner@example.com",
    });
    assert.ok(buf.length > 200);
    assert.equal(buf.subarray(0, 4).toString("utf8"), "%PDF");
    const tail = buf.subarray(Math.max(0, buf.length - 32)).toString("latin1");
    assert.ok(tail.includes("%%EOF"), "expected PDF trailer");
  });
});
