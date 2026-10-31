import { env } from "cloudflare:workers";

/** Server-only transactional email through a verified Resend sender domain. */
type EmailBindings = {
  RESEND_API_KEY?: string;
  STAFF_EMAIL_FROM?: string;
  STAFF_EMAIL_REQUIRE_ALLOWLIST?: string;
  STAFF_EMAIL_ALLOWLIST?: string;
};

const emailPattern = /^[^\\s@<>]+@[^\\s@<>]+\\.[A-Za-z]{2,}$/;
const senderPattern =
  /^(?:[^\\s@<>]+@[^\\s@<>]+\\.[A-Za-z]{2,}|[A-Za-z0-9 .'-]{1,80} <[^\\s@<>]+@[^\\s@<>]+\\.[A-Za-z]{2,}>)$/;

function bindings(): EmailBindings {
  return env as typeof env & EmailBindings;
}

function allowlistedRecipients() {
  return new Set(
    (bindings().STAFF_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter((address) => emailPattern.test(address)),
  );
}

/** Safe to show to permitted administrators: never returns a secret or address list. */
export function getStaffMailConfiguration() {
  const e = bindings();
  const apiKeyConfigured = Boolean(e.RESEND_API_KEY?.trim());
  const senderConfigured = senderPattern.test(e.STAFF_EMAIL_FROM?.trim() ?? "");
  const restrictedToTestRecipients = e.STAFF_EMAIL_REQUIRE_ALLOWLIST === "true";
  const allowlistConfigured =
    !restrictedToTestRecipients || allowlistedRecipients().size > 0;

  return {
    provider: "Resend" as const,
    apiKeyConfigured,
    senderConfigured,
    restrictedToTestRecipients,
    allowlistConfigured,
    ready: apiKeyConfigured && senderConfigured && allowlistConfigured,
  };
}

export function staffMailConfigured(): boolean {
  return getStaffMailConfiguration().ready;
}

export function staffMailRecipientAllowed(recipient: string): boolean {
  if (!emailPattern.test(recipient)) return false;
  const state = getStaffMailConfiguration();
  return !state.restrictedToTestRecipients ||
    allowlistedRecipients().has(recipient.trim().toLowerCase());
}

export async function sendStaffEmail({
  recipient, subject, text, idempotencyKey,
}: { recipient: string; subject: string; text: string; idempotencyKey: string }) {
  const e = bindings();
  if (!staffMailConfigured()) throw new Error("Staff email delivery not configured");
  if (!staffMailRecipientAllowed(recipient))
    throw new Error("Test email recipient is not allowlisted");

  // Never include tokens, API keys or email bodies in logs or API errors.
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
  if (!response.ok) throw new Error("Transactional email provider rejected the request");
}
