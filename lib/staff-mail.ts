import { env } from "cloudflare:workers";

/**
 * Transactional mail adapter. Requires a verified sender domain, a restricted
 * email-sending API key, and Cloudflare Worker secret binding.
 * If not configured, reject: never claim a reset/invite email was sent.
 */
type EmailBindings = { RESEND_API_KEY?: string; STAFF_EMAIL_FROM?: string };

export function staffMailConfigured(): boolean {
  const e = env as typeof env & EmailBindings;
  return Boolean(e.RESEND_API_KEY && e.STAFF_EMAIL_FROM &&
    /^(?:[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}|[A-Za-z0-9 .'-]{1,80} <[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}>)$/.test(e.STAFF_EMAIL_FROM));
}

export async function sendStaffEmail({
  recipient, subject, text, idempotencyKey,
}: { recipient: string; subject: string; text: string; idempotencyKey: string }) {
  const e = env as typeof env & EmailBindings;
  if (!staffMailConfigured()) throw new Error("Staff email delivery not configured");
  // Do not include tokens in logs or return them to the browser.
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${e.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "User-Agent": "SohojAcademyERP/1.0",
    },
    body: JSON.stringify({
      from: e.STAFF_EMAIL_FROM,
      to: [recipient],
      subject,
      text,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Transactional mail provider rejected the request");
}
