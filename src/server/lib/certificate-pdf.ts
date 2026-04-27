import PDFDocument from "pdfkit";

export type CertificatePdfInput = {
  title: string;
  credentialCode: string;
  issuedAtIso: string;
  expiresAtIso: string | null;
  organizationName: string;
  recipientLine: string;
};

/**
 * Renders a simple letter-size certificate PDF (buffer) for download.
 */
export function buildCertificatePdfBuffer(input: CertificatePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).text("Certificate of completion", { align: "center" });
    doc.moveDown(0.6);
    doc.fontSize(16).text(input.title, { align: "center" });
    doc.moveDown(2);
    doc.fontSize(11).text(`Presented to: ${input.recipientLine}`);
    doc.text(`Organization: ${input.organizationName}`);
    doc.text(`Credential code: ${input.credentialCode}`);
    doc.text(`Issued: ${new Date(input.issuedAtIso).toUTCString()}`);
    if (input.expiresAtIso) {
      doc.text(`Expires: ${new Date(input.expiresAtIso).toUTCString()}`);
    }
    doc.moveDown(2);
    doc
      .fontSize(10)
      .fillColor("#555555")
      .text("Verify this credential using the code above in MyAcademy.", { align: "center" });
    doc.end();
  });
}
