import nodemailer from "nodemailer";

/**
 * Optional SMTP (e.g. Supabase local Inbucket on 127.0.0.1:54325, or Mailpit on 1025). If SMTP_HOST is unset, all sends are skipped.
 */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

export async function sendOptionalSmtpMail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    return { ok: false, skipped: true };
  }

  const port = Number(process.env.SMTP_PORT ?? "1025");
  const secure = process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });

  const from = process.env.MAIL_FROM?.trim() || "MyAcademy <noreply@localhost>";

  try {
    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mail] SMTP send failed:", msg);
    return { ok: false, error: msg };
  }
}
