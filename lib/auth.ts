import { betterAuth } from "better-auth";
import { env, waitUntil } from "cloudflare:workers";
import { sendStaffEmail } from "@/lib/staff-mail";

type AuthBindings = { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

function config() {
  const bindings = env as typeof env & AuthBindings;
  if (!bindings.BETTER_AUTH_SECRET || bindings.BETTER_AUTH_SECRET.length < 32 ||
      !bindings.BETTER_AUTH_URL) {
    throw new Error("Staff authentication is not configured");
  }
  const baseURL = new URL(bindings.BETTER_AUTH_URL);
  if (baseURL.pathname !== "/" || baseURL.search || baseURL.hash ||
      (baseURL.protocol !== "https:" && baseURL.hostname !== "localhost" && baseURL.hostname !== "127.0.0.1")) {
    throw new Error("Invalid staff authentication origin");
  }
  return { baseURL: baseURL.origin, secret: bindings.BETTER_AUTH_SECRET };
}

/** Only the configured staff hostname can serve auth or private CRM routes. */
export function isStaffOrigin(requestUrl: string): boolean {
  try {
    return new URL(requestUrl).origin === config().baseURL;
  } catch {
    return false;
  }
}

/**
 * Better Auth uses the existing Cloudflare D1 binding directly. Every CRM
 * request additionally checks an ACTIVE staff_memberships row server-side.
 * Never rely on this session alone to authorize access to guardian data.
 */
export function createAuth() {
  const { baseURL, secret } = config();
  return betterAuth({
    database: env.DB,
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        // Do not send recovery links to accounts with revoked staff access.
        const active = await env.DB.prepare(
          "SELECT 1 FROM staff_memberships WHERE user_id = ? AND active = 1"
        ).bind(user.id).first();
        if (!active) return;
        // Never reveal delivery status or block response duration on email.
        // Cloudflare keeps this promise alive after the response.
        waitUntil(sendStaffEmail({
          recipient: user.email,
          subject: "Sohoj Academy — secure password recovery",
          text: `A password recovery request was received for your academy staff account.\n\nOpen this single-use link within 30 minutes:\n${url}\n\nIf you did not request this, no action is required.`,
          idempotencyKey: "password-reset-" + token.slice(0, 80),
        }).catch(() => {
          // Delivery failures are deliberately not exposed to the requestor.
          console.error("Staff email delivery failed (no account data logged)");
        }));
      },
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
    },
  });
}
